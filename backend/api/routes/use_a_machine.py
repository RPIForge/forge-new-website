from decimal import Decimal
from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status

from models.audit_log import AuditLog
from models.machine_usage import MachineUsage
from schemas.responses import MachineUsageResult, MachineUsageSchema, ResourceInfo, ResourceSlotSchema

from ..utils import has_permissions_any
from models.machine import Machine
from models.machine_type import MachineType
from models.resource_slot import ResourceSlot
from models.resource import Resource
from models.resource_usage_quantity import ResourceUsageQuantity
from models.state import State
from schemas.requests import MachineUsageRequest

from ..deps import DBSession, PermittedUserChecker
from models.user import User
from schemas.enums import LogType, Permissions

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

router = APIRouter()

# Reprint Policy

# A reprint is free only if all of these hold:

# The reprint uses Forge filament, measured in grams. Personal filament, resin, vinyl and ink never qualify.
# You have a failed print that hasn’t already been reprinted. Each failure earns one free reprint, and once claimed it’s spent.
# That failed print used Forge filament, not your own.
# That failed print used under 100g. Exactly 100g does not qualify.
# The reprint is no larger than the failed print, plus a small allowance for re-slicing, and never more than 105g.
# Free reprints stay within 25% of your Forge filament for the semester, counting this one.

GRAM_UNITS = {"g", "gram", "grams"}
FAILED_PRINT_MAX_GRAMS = Decimal("100")
RESLICE_BUFFER = Decimal("1.15")
REPRINT_MAX_GRAMS = Decimal("105")
REPRINT_SHARE_CAP = Decimal("0.25")


def _forge_gram_total(quantities: list[ResourceUsageQuantity]) -> Decimal:
    """Grams of Forge filament in a set of usage quantities.

    Personal filament is excluded: the policy only covers Forge material, both
    for what qualifies and for the 25% the cap is measured against.
    """
    return sum(
        (
            quantity.amount
            for quantity in quantities
            if quantity.resource is not None
            and not quantity.is_own_material
            and quantity.resource.units.strip().lower() in GRAM_UNITS
        ),
        Decimal(0),
    )


async def _semester_gram_totals(
    session, user_id: UUID, semester_id: UUID | None
) -> tuple[Decimal, Decimal]:
    """(Forge filament grams, free-reprint grams) for this member this semester."""

    def _sum(free_reprints_only: bool):
        query = (
            select(func.coalesce(func.sum(ResourceUsageQuantity.amount), 0))
            .join(
                MachineUsage,
                MachineUsage.id == ResourceUsageQuantity.machine_usage_id,
            )
            .join(Resource, Resource.id == ResourceUsageQuantity.resource_id)
            .where(MachineUsage.user_id == user_id)
            .where(MachineUsage.semester_id == semester_id)
            .where(ResourceUsageQuantity.is_own_material.is_(False))
            .where(func.lower(func.trim(Resource.units)).in_(GRAM_UNITS))
        )
        if free_reprints_only:
            # Only reprints that were actually granted for free. A reprint the
            # member paid for shouldn't eat into their allowance.
            query = query.where(MachineUsage.reprint_of_id.is_not(None))
        return query

    total = await session.scalar(_sum(False))
    free_reprinted = await session.scalar(_sum(True))
    return Decimal(total or 0), Decimal(free_reprinted or 0)


async def evaluate_free_reprint(
    session,
    current_user: User,
    semester_id: UUID | None,
    requested_quantities: list[ResourceUsageQuantity],
) -> tuple[MachineUsage | None, str | None]:
    """Decide whether this reprint is free.

    Returns (failed usage being claimed, None) when it is free, or
    (None, reason) when it is charged. The reason names the actual numbers so
    the form can explain the charge rather than just applying it silently.
    """
    charged = "Charged as a normal print: "
    requested_grams = _forge_gram_total(requested_quantities)

    if requested_grams <= 0:
        return None, (
            charged + "free reprints only cover Forge filament measured in grams."
        )

    # Failures that haven't already earned a free reprint.
    already_claimed = select(MachineUsage.reprint_of_id).where(
        MachineUsage.reprint_of_id.is_not(None)
    )
    candidates = (
        await session.scalars(
            select(MachineUsage)
            .where(MachineUsage.user_id == current_user.id)
            .where(MachineUsage.failed.is_(True))
            .where(MachineUsage.id.not_in(already_claimed))
            .options(
                selectinload(MachineUsage.resources_used).selectinload(
                    ResourceUsageQuantity.resource
                )
            )
            .order_by(MachineUsage.failed_at.desc().nullslast())
        )
    ).all()

    if not candidates:
        return None, (
            charged + "you have no failed print left to claim. Either nothing of "
            "yours has failed, or the failure already earned its free reprint."
        )

    # Most recent failure that used Forge filament and was small enough.
    eligible = None
    largest_seen = Decimal(0)
    any_forge_filament = False
    for candidate in candidates:
        failed_grams = _forge_gram_total(candidate.resources_used)
        if failed_grams <= 0:
            continue
        any_forge_filament = True
        largest_seen = max(largest_seen, failed_grams)
        if failed_grams < FAILED_PRINT_MAX_GRAMS:
            eligible = (candidate, failed_grams)
            break

    if not any_forge_filament:
        return None, (
            charged + "your failed print used personal filament, which the free "
            "reprint doesn't cover."
        )

    if eligible is None:
        return None, (
            charged + f"a free reprint only covers failed prints under "
            f"{FAILED_PRINT_MAX_GRAMS:.0f}g, and your most recent unclaimed "
            f"failure used {largest_seen:.1f}g."
        )

    failed_usage, failed_grams = eligible

    allowance = min(failed_grams * RESLICE_BUFFER, REPRINT_MAX_GRAMS)
    if requested_grams > allowance:
        return None, (
            charged + f"a free reprint covers up to {allowance:.1f}g based on the "
            f"{failed_grams:.1f}g that failed, and this print is "
            f"{requested_grams:.1f}g."
        )

    total_grams, free_reprinted = await _semester_gram_totals(
        session, current_user.id, semester_id
    )
    new_total = total_grams + requested_grams
    new_reprinted = free_reprinted + requested_grams
    if new_total > 0 and new_reprinted > new_total * REPRINT_SHARE_CAP:
        return None, (
            charged + f"free reprints are capped at "
            f"{REPRINT_SHARE_CAP * 100:.0f}% of your Forge filament for the "
            f"semester, and this would put you at {new_reprinted:.1f}g of "
            f"{new_total:.1f}g."
        )

    return failed_usage, None


@router.get("/use/{machine_id}/schema")
async def get_usage_schema(
    machine_id: UUID,
    session: DBSession,
    current_user: Annotated[
        User, Depends(PermittedUserChecker({Permissions.CAN_USE_MACHINES}))
    ],
):
    """Retrieve the relevant information for using the machine with the provided ID."""

    machine = await session.scalar(
        select(Machine)
        .where(Machine.id == machine_id)
        .options(selectinload(Machine.group))
        .options(
            selectinload(Machine.type)
            .selectinload(MachineType.resource_slots)
            .selectinload(ResourceSlot.valid_resources)
        )
        .options(selectinload(Machine.active_usage))
    )

    can_edit_machines_permissions = await has_permissions_any(
        session,
        current_user.id,
        {Permissions.CAN_EDIT_MACHINES, Permissions.IS_SUPERUSER},
    )

    # Disabled machines are hidden from regular users, but machine editors / superusers can still use them
    if not machine or (machine.disabled and not can_edit_machines_permissions):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Machine with provided ID not found",
        )

    return MachineUsageSchema(
        group_name=machine.group.name if machine.group else None,
        type_name=machine.type.name,
        resource_slots=[
            ResourceSlotSchema.model_validate(
                {
                    **slot.__dict__,
                    "resource_slot_id": slot.id,
                    "valid_resources": [
                        ResourceInfo.model_validate(resource.__dict__)
                        for resource in slot.valid_resources
                    ],
                }
            )
            for slot in machine.type.resource_slots
        ],
        **machine.__dict__,
    )


@router.post("/use/{machine_id}")
async def use_a_machine(
    machine_id: UUID,
    request: MachineUsageRequest,
    session: DBSession,
    current_user: Annotated[
        User, Depends(PermittedUserChecker({Permissions.CAN_USE_MACHINES}))
    ],
) -> MachineUsageResult:
    """Log a machine usage for the provided machine ID."""

    machine = await session.scalar(
        select(Machine)
        .where(Machine.id == machine_id)
        .options(
            selectinload(Machine.type)
            .selectinload(MachineType.resource_slots)
            .selectinload(ResourceSlot.valid_resources)
        )
        .options(selectinload(Machine.active_usage))
    )

    can_edit_machines_permissions = await has_permissions_any(
        session,
        current_user.id,
        {Permissions.CAN_EDIT_MACHINES, Permissions.IS_SUPERUSER},
    )

    # Disabled machines are hidden from regular users, but machine editors / superusers can still use them
    if not machine or (machine.disabled and not can_edit_machines_permissions):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Machine with provided ID not found",
        )

    if machine.active_usage:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Machine is in use",
        )

    if machine.maintenance_mode and not can_edit_machines_permissions:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Machine is under maintenance",
        )

    # Editors / superusers can see disabled machines (they get past the 404 above),
    # but nobody can log a usage on one
    if machine.disabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Machine is disabled",
        )

    state = await session.scalar(
        select(State).options(selectinload(State.active_semester))
    )
    current_semester = state.active_semester

    between_semesters_permission = await has_permissions_any(
        session=session,
        user_id=current_user.id,
        permissions={
            Permissions.CAN_USE_MACHINES_BETWEEN_SEMESTERS,
            Permissions.IS_SUPERUSER,
        },
    )
    
    if not current_semester and not between_semesters_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to log machine usages between semesters",
        )
        
    required_resource_slot_ids = {
        resource_slot.id
        for resource_slot in machine.type.resource_slots
        if not resource_slot.allow_empty
    }
    all_resource_slot_ids = {
        resource_slot.id for resource_slot in machine.type.resource_slots
    }

    # Check that required resource slot ids is subset of the provided resource slots
    if not required_resource_slot_ids <= request.resource_usages.keys():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more required resource slots not populated",
        )

    # Check that no non-existent slots were provided
    if not request.resource_usages.keys() <= all_resource_slot_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more provided resource slots not found",
        )
        
    resource_usage_quantities: list[ResourceUsageQuantity] = []
    total_cost = 0

    total_cost += round(
        Decimal(request.duration_seconds / 3600) * (machine.type.cost_per_hour), 2
    )
    
    for resource_slot_id, usage_info in request.resource_usages.items():
        resource_slot = next(
            resource_slot
            for resource_slot in machine.type.resource_slots
            if resource_slot.id == resource_slot_id
        )
        valid_resources = resource_slot.valid_resources

        resource_used = next(
            (
                resource
                for resource in valid_resources
                if resource.id == usage_info.resource_id
            ),
            None,
        )
        if not resource_used:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Resource ID {usage_info.resource_id} not found",
            )

        if usage_info.is_own_material and not resource_slot.allow_own_material:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Resource Slot {resource_slot_id} is marked as own material but cannot be",
            )

        resource_usage_quantities.append(
            ResourceUsageQuantity(
                resource=resource_used,
                is_own_material=usage_info.is_own_material,
                amount=usage_info.amount,
                cpu_at_usage=resource_used.cost,
            )
        )

        if not usage_info.is_own_material:
            total_cost += usage_info.amount * resource_used.cost

    reprint_of = None
    reprint_note = None
    if request.is_reprint:
        reprint_of, reprint_note = await evaluate_free_reprint(
            session, current_user, current_semester.id if current_semester else None,
            resource_usage_quantities,
        )
        if reprint_of is not None:
            total_cost = 0

    machine_usage = MachineUsage(
        machine=machine,
        semester=current_semester,
        user=current_user,
        duration_seconds=request.duration_seconds,
        cost=total_cost,
        is_reprint=request.is_reprint,
        reprint_of=reprint_of,
        resources_used=resource_usage_quantities,
    )
    machine.active_usage = machine_usage

    session.add(machine_usage)
    session.add(machine)
    await session.commit()
    await session.refresh(machine_usage)
    
    audit_log = AuditLog(
        type=LogType.MACHINE_USED,
        content={
            "machine_usage_id": str(machine_usage.id),
            "user_rcsid": current_user.RCSID,
            "props": request.model_dump(mode="json"),
        },
    )
    session.add(audit_log)
    await session.commit()

    return MachineUsageResult(
        cost=total_cost,
        free_reprint=reprint_of is not None,
        reprint_note=reprint_note,
    )
