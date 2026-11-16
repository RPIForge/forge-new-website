"""The Forge reprint policy.

Lives in one module because it is applied at two different times: eligibility
when a usage is submitted, and the 25% cap when the semester's charge sheet is
generated.
"""

from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from models.machine import Machine
from models.machine_usage import MachineUsage
from models.resource import Resource
from models.resource_usage_quantity import ResourceUsageQuantity
from models.user import User


# Reprint Policy

# A reprint is free only if all of these hold:

# The machine is a type eboard has marked as eligible. The policy covers the
#   Prusa printers only, and gating on the material alone cannot tell a Prusa
#   from any other filament machine.
# The reprint uses Forge filament, measured in grams. Personal filament, resin, vinyl and ink never qualify.
# You have a failed print that hasn’t already been reprinted. Each failure earns one free reprint, and once claimed it’s spent.
# That failed print used Forge filament, not your own.
# That failed print used under 100g. Exactly 100g does not qualify.
# The reprint is no larger than the failed print, plus a small allowance for re-slicing, and never more than 105g.
# The 25% cap is NOT checked here. It is cumulative over the semester and
#   reconciled when the charge sheet is generated, because a member whose first
#   print fails is at 100% that day and may be well under by December.

# The re-slice allowance and the 105g ceiling are deliberately absent from the
# published policy, which states only the under-100g rule, so that nobody slices
# to exactly the limit. The code being more generous here is intended, not a bug.

GRAM_UNITS = {"g", "gram", "grams"}
FAILED_PRINT_MAX_GRAMS = Decimal("100")
RESLICE_BUFFER = Decimal("1.15")
REPRINT_MAX_GRAMS = Decimal("105")
REPRINT_SHARE_CAP = Decimal("0.25")


def forge_gram_total(quantities: list[ResourceUsageQuantity]) -> Decimal:
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


async def evaluate_free_reprint(
    session,
    current_user: User,
    semester_id: UUID | None,
    requested_quantities: list[ResourceUsageQuantity],
    machine: Machine,
) -> tuple[MachineUsage | None, str | None]:
    """Decide whether this reprint is free.

    Returns (failed usage being claimed, None) when it is free, or
    (None, reason) when it is charged. The reason names the actual numbers so
    the form can explain the charge rather than just applying it silently.
    """
    charged = "Charged as a normal print: "

    if not machine.type.allows_free_reprints:
        return None, (
            charged + "free reprints don't apply to this kind of machine."
        )

    requested_grams = forge_gram_total(requested_quantities)

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
                ),
                selectinload(MachineUsage.machine).selectinload(Machine.type),
            )
            .order_by(MachineUsage.failed_at.desc().nullslast())
        )
    ).all()

    if not candidates:
        return None, (
            charged + "you have no failed print left to claim. Either nothing of "
            "yours has failed, or the failure already earned its free reprint."
        )

    # Most recent failure that qualifies. Candidates are newest first, so when
    # none qualify we report why the newest one didn't -- that is the failure
    # the member is most likely asking about.
    eligible = None
    rejected = None  # (kind, grams) for the newest non-qualifying failure
    for candidate in candidates:
        # A failure on, say, the resin printer earns nothing anywhere. Switching
        # between eligible machines is fine, which is what #25 asked for.
        if candidate.machine is None or not candidate.machine.type.allows_free_reprints:
            rejected = rejected or ("machine", Decimal(0))
            continue
        failed_grams = forge_gram_total(candidate.resources_used)
        if failed_grams <= 0:
            rejected = rejected or ("own_material", Decimal(0))
            continue
        if failed_grams < FAILED_PRINT_MAX_GRAMS:
            eligible = (candidate, failed_grams)
            break
        rejected = rejected or ("too_large", failed_grams)

    if eligible is None:
        kind, grams = rejected or ("none", Decimal(0))
        if kind == "too_large":
            return None, (
                charged + f"a free reprint only covers failed prints under "
                f"{FAILED_PRINT_MAX_GRAMS:.0f}g, and your most recent unclaimed "
                f"failure used {grams:.1f}g."
            )
        if kind == "own_material":
            return None, (
                charged + "your failed print used personal filament, which the "
                "free reprint doesn't cover."
            )
        if kind == "machine":
            return None, (
                charged + "your failed print was on a kind of machine that "
                "doesn't earn free reprints."
            )
        return None, (
            charged + "you have no failed print left to claim."
        )

    failed_usage, failed_grams = eligible

    allowance = min(failed_grams * RESLICE_BUFFER, REPRINT_MAX_GRAMS)
    if requested_grams > allowance:
        return None, (
            charged + f"a free reprint covers up to {allowance:.1f}g based on the "
            f"{failed_grams:.1f}g that failed, and this print is "
            f"{requested_grams:.1f}g."
        )

    return failed_usage, None


async def semester_reprint_overage(
    session, user_id: UUID, semester_id: UUID
) -> Decimal:
    """Cost of free-reprint filament beyond the member's 25% allowance.

    The cap is cumulative and only meaningful once the semester is over: a
    member whose very first print fails is at 100% that day, and may be far
    under by December. So nothing is charged at submission and the excess is
    worked out here.

    Free reprints are walked oldest first and stay free until the allowance is
    used up; whatever spills past it is charged at the price recorded on that
    usage, not today's price. Only the portion over the line is charged.
    """
    gram_filter = (
        ResourceUsageQuantity.is_own_material.is_(False),
        func.lower(func.trim(Resource.units)).in_(GRAM_UNITS),
    )

    total_grams = await session.scalar(
        select(func.coalesce(func.sum(ResourceUsageQuantity.amount), 0))
        .join(MachineUsage, MachineUsage.id == ResourceUsageQuantity.machine_usage_id)
        .join(Resource, Resource.id == ResourceUsageQuantity.resource_id)
        .where(MachineUsage.user_id == user_id)
        .where(MachineUsage.semester_id == semester_id)
        .where(*gram_filter)
    )
    allowance = Decimal(total_grams or 0) * REPRINT_SHARE_CAP

    # reprint_of_id is set only on reprints that were actually granted free, so
    # a reprint the member already paid for doesn't count against them twice.
    rows = (
        await session.execute(
            select(ResourceUsageQuantity.amount, ResourceUsageQuantity.cpu_at_usage)
            .join(MachineUsage, MachineUsage.id == ResourceUsageQuantity.machine_usage_id)
            .join(Resource, Resource.id == ResourceUsageQuantity.resource_id)
            .where(MachineUsage.user_id == user_id)
            .where(MachineUsage.semester_id == semester_id)
            .where(MachineUsage.reprint_of_id.is_not(None))
            .where(*gram_filter)
            .order_by(MachineUsage.time_started)
        )
    ).all()

    used = Decimal(0)
    overage = Decimal(0)
    for amount, cpu_at_usage in rows:
        amount = Decimal(amount)
        free_remaining = allowance - used
        if free_remaining >= amount:
            used += amount
            continue
        chargeable = amount - max(free_remaining, Decimal(0))
        overage += chargeable * Decimal(cpu_at_usage)
        used += amount

    return overage
