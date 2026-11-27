import logging
from datetime import UTC, datetime
from typing import Annotated
from azure.communication.email import EmailClient
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import UUID4
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from core.config import settings
from models.audit_log import AuditLog
from models.machine import Machine
from models.machine_usage import MachineUsage
from models.user import User
from schemas.enums import LogType, Permissions
from schemas.requests import MachineFailRequest
from schemas.responses import FailableMachineResponse

from ..auto_clear import FAIL_WINDOW, usage_finished_at
from ..deps import DBSession, PermittedUserChecker

router = APIRouter()


async def send_failure_email(email, machine_name, percentage, error_message, noticeable_fault):
    client = EmailClient.from_connection_string(
        settings.AZURE_COMMUNICATION_CONNECTION_STRING
    )

    # A print found past its expected finish time gives no reliable signal of
    # where it actually failed, so the volunteer may not have supplied a
    # percentage. Claiming a number we cannot know would be worse than silence.
    if percentage is None:
        opening = f"Unfortunately, your machine usage on {machine_name} has failed."
    else:
        opening = (
            f"Unfortunately, your machine usage on {machine_name} "
            f"has failed at {percentage}%."
        )


    message = {
        "senderAddress": "DoNotReply@notifications.rpiforge.dev",
        "recipients": {
            "to": [{"address": email}]
        },
        "content": {
            "subject": "Your Machine Usage Failed",
            "plainText": (
                opening + "\n\n"
                f"Reason given: {error_message or 'No reason given'}\n"
                f"Noticeable faults: {noticeable_fault or 'None reported'}\n\n"
                "You may want to stop by the Forge soon. If you used Forge filament, one reprint is free."
            ),
        },
    }

    poller = client.begin_send(message)
    result = poller.result()

    if result["status"] != "Succeeded" or result["error"] is not None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send machine usage failure email.",
        )


@router.post("/clear/{machine_id}")
async def clear_machine(
    machine_id: UUID4,
    session: DBSession,
    current_user: Annotated[
        User, Depends(PermittedUserChecker({Permissions.CAN_CLEAR_MACHINES}))
    ],
):
    """Clears the active usage of the machine with the provided ID."""

    machine = await session.scalar(
        select(Machine)
        .where(Machine.id == machine_id)
        .options(selectinload(Machine.active_usage))
    )
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Could not find a machine with the provided ID",
        )

    if not machine.active_usage:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This machine does not have an active usage",
        )

    audit_log = AuditLog(
        type=LogType.MACHINE_USAGE_CLEARED,
        content={
            "machine_usage_id": str(machine.active_usage.id),
            "user_rcsid": current_user.RCSID,
        },
    )
    session.add(audit_log)

    machine.active_usage = None
    session.add(machine)
    await session.commit()


async def _failable_usage(session, machine) -> MachineUsage | None:
    """The usage a volunteer means when they fail this machine.

    Normally the active one. When the machine has already been released --
    auto-clear does that 30 minutes after a print ends -- the last thing that
    ran on it still counts, for FAIL_WINDOW afterwards, so a failure found on
    a morning round can still be recorded against the print that caused it.

    Only the most recent usage is offered, never an older one: the volunteer
    is looking at a machine, not choosing from a list, and guessing further
    back would quietly credit a free reprint to the wrong print.
    """
    if machine.active_usage is not None:
        return machine.active_usage

    latest = await session.scalar(
        select(MachineUsage)
        .where(MachineUsage.machine_id == machine.id)
        .order_by(MachineUsage.time_started.desc())
        .limit(1)
        .options(selectinload(MachineUsage.user))
    )
    if latest is None:
        return None
    if datetime.now(UTC) - usage_finished_at(latest) > FAIL_WINDOW:
        return None
    return latest


@router.get("/failable-machines")
async def get_failable_machines(
    session: DBSession,
    current_user: Annotated[
        User, Depends(PermittedUserChecker({Permissions.CAN_FAIL_MACHINES}))
    ],
) -> list[FailableMachineResponse]:
    """The machines POST /fail would accept right now, and the usage each one
    would fail.

    In use, or released within FAIL_WINDOW of finishing with the print still
    recorded as a success. The fail form offers exactly these, so a machine
    auto-clear released overnight is still on the list in the morning, and it
    reads the usage to decide whether the print is past its expected finish.
    """
    machines = (
        await session.scalars(
            select(Machine)
            .where(Machine.disabled.is_(False))
            .options(selectinload(Machine.active_usage))
        )
    ).all()

    def entry(machine_id: UUID4, usage: MachineUsage) -> FailableMachineResponse:
        return FailableMachineResponse(
            machine_id=machine_id,
            usage_start=usage.time_started,
            usage_duration=usage.duration_seconds,
        )

    failable = [
        entry(m.id, m.active_usage)
        for m in machines
        if m.active_usage is not None and not m.active_usage.failed
    ]

    idle_ids = [m.id for m in machines if m.active_usage is None]
    if idle_ids:
        # One row per machine: its most recent usage.
        latest = (
            await session.scalars(
                select(MachineUsage)
                .where(MachineUsage.machine_id.in_(idle_ids))
                .order_by(MachineUsage.machine_id, MachineUsage.time_started.desc())
                .distinct(MachineUsage.machine_id)
            )
        ).all()
        now = datetime.now(UTC)
        failable += [
            entry(usage.machine_id, usage)
            for usage in latest
            if not usage.failed and now - usage_finished_at(usage) <= FAIL_WINDOW
        ]

    return failable


@router.post("/fail")
async def fail_machine(
    request: MachineFailRequest,
    session: DBSession,
    current_user: Annotated[
        User, Depends(PermittedUserChecker({Permissions.CAN_FAIL_MACHINES}))
    ],
):
    """Fails the active usage of the machine with the provided ID.

    Or, if the machine has already been released, the last usage to run on it
    within FAIL_WINDOW. See _failable_usage.
    """

    machine = await session.scalar(
        select(Machine)
        .where(Machine.id == request.machine_id)
        .options(
            selectinload(Machine.active_usage).selectinload(MachineUsage.user)
        )
    )

    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Could not find a machine with the provided ID",
        )

    after_clear = machine.active_usage is None
    usage = await _failable_usage(session, machine)

    if usage is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This machine has no active usage, and nothing has finished on "
                "it recently enough to fail."
            ),
        )

    if usage.failed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This machine's usage has already been failed",
        )

    audit_log = AuditLog(
        type=LogType.MACHINE_USAGE_FAILED,
        content={
            "machine_usage_id": str(usage.id),
            "user_rcsid": current_user.RCSID,
            "error_message": request.error_message,
            "noticeable_fault": request.noticeable_fault,
            "percentage": (
                str(request.percentage) if request.percentage is not None else None
            ),
            # Recorded after the machine had already been released, so the
            # usage this was pinned to was a judgement rather than a given.
            "after_clear": after_clear,
        },
    )
    session.add(audit_log)

    usage.failed = True
    usage.failed_at = datetime.now(UTC)
    session.add(usage)
    await session.commit()

    try:
        await send_failure_email(
            f"{usage.user.RCSID}@rpi.edu",
            machine.name,
            request.percentage,
            request.error_message,
            request.noticeable_fault,
        )
    except Exception:
        logging.exception("Failed to send machine failure email")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The machine was marked as failed, but the email to the user could not be sent.",
        )

