""" Machine Usage endpoints. """

from typing import Annotated, Literal
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import InstrumentedAttribute, selectinload

from models.machine import Machine
from models.machine_usage import MachineUsage
from schemas.responses import ClaimableFailureResponse, UsageResponse

from ..deps import DBSession, PermittedUserChecker
from ..reprint_policy import claimable_failures_query, judge_failure
from models.user import User

router = APIRouter()

@router.get("/usages/me")
async def get_my_usages(
    session: DBSession,
    current_user: Annotated[
        User, Depends(PermittedUserChecker(set()))
    ],
    limit: int = 20,
    offset: int = 0,
    order_by: Literal[
        "time_started",
        "cost",
        "name",
    ] = "time_started",
    descending: bool = False,
):
    """Fetch machine usage records for current user."""

    attr_key_map: dict[str, InstrumentedAttribute] = {
        "time_started": MachineUsage.time_started,
        "duration": MachineUsage.duration_seconds,
        "cost": MachineUsage.cost,
        "name": Machine.name,
    }
    order_determinant = attr_key_map[order_by]
    if descending:
        order_determinant = order_determinant.desc()

    machine_usages = (
        await session.scalars(
            select(MachineUsage)
            .join(MachineUsage.machine)
            .options(selectinload(MachineUsage.machine))
            .options(selectinload(MachineUsage.semester))
            .where(MachineUsage.user_id == current_user.id)
            .order_by(order_determinant)
            .offset(offset)
            .fetch(limit)
        )
    ).all()

    return [
        UsageResponse(
            machine_name=usage.machine.name,
            semester=f"{usage.semester.semester_type} {usage.semester.calendar_year}" if usage.semester else None,
            time_started=usage.time_started,
            duration=usage.duration_seconds,
            cost=usage.cost,
            is_reprint=usage.is_reprint,
        )
        for usage in machine_usages
    ]


@router.get("/usages/current/me")
async def get_my_usages(
    session: DBSession,
    current_user: Annotated[
        User, Depends(PermittedUserChecker(set()))
    ],
):
    """Fetch current machine usages for current user."""

    machine_usages = (
        await session.scalars(
            select(MachineUsage)
            .join(MachineUsage.machine)
            .options(selectinload(MachineUsage.machine))
            .options(selectinload(MachineUsage.semester))
            .where(MachineUsage.user_id == current_user.id)
            .where(Machine.active_usage)
        )
    ).all()

    return [
        UsageResponse(
            machine_name=usage.machine.name,
            semester=f"{usage.semester.semester_type} {usage.semester.calendar_year}" if usage.semester else None,
            time_started=usage.time_started,
            duration=usage.duration_seconds,
            cost=usage.cost,
            is_reprint=usage.is_reprint,
        )
        for usage in machine_usages
    ]


@router.get("/usages/me/claimable-failures")
async def get_my_claimable_failures(
    session: DBSession,
    current_user: Annotated[
        User, Depends(PermittedUserChecker(set()))
    ],
) -> list[ClaimableFailureResponse]:
    """Failed prints the member can still claim a free reprint against.

    Drives the picker on the Use a Machine form. Failures that are already
    spent, and failures that were themselves reprints, are left out entirely.
    Ones that are listed but would not be free carry the reason, so the
    member sees the charge coming instead of reading about it afterwards.
    """

    failures = (
        await session.scalars(
            claimable_failures_query(current_user.id).order_by(
                MachineUsage.failed_at.desc().nullslast()
            )
        )
    ).all()

    return [
        ClaimableFailureResponse(
            id=failure.id,
            machine_name=(
                failure.machine.name if failure.machine else "Unknown machine"
            ),
            time_started=failure.time_started,
            failed_at=failure.failed_at,
            forge_grams=grams,
            eligible=reason is None,
            reason=reason,
        )
        for failure, (grams, reason) in (
            (failure, judge_failure(failure)) for failure in failures
        )
    ]
