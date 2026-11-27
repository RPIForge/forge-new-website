""" Machine Usage endpoints. """

from typing import Annotated, Literal, Optional
from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy import select, true as sa_true
from sqlalchemy.orm import InstrumentedAttribute, selectinload

from models.machine import Machine
from models.machine_usage import MachineUsage
from schemas.responses import UsageResponse

from ..deps import DBSession, PermittedUserChecker
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
    semester_id: Optional[UUID] = None,
):
    """Fetch machine usage records for current user.

    semester_id narrows the list to one semester. Anything reported next to
    the semester balance has to be scoped the same way, or it keeps counting
    last term after the balance has reset.
    """

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
            .where(
                MachineUsage.semester_id == semester_id
                if semester_id is not None
                else sa_true()
            )
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
