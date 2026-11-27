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
# You have a failed print that hasn't already been reprinted. Each failure earns one free reprint, and once claimed it's spent.
# That failed print used Forge filament, not your own.
# That failed print used under 100g. Exactly 100g does not qualify.
# That failed print was not itself a reprint. One free reprint per original
#   print, so a free reprint that fails does not earn another one.
# The reprint is no larger than the failed print, plus a small allowance for re-slicing, and never more than 105g.
# The 25% cap is NOT checked here. It is cumulative over the semester and
#   reconciled when the charge sheet is generated, because a member whose first
#   print fails is at 100% that day and may be well under by December.

# The re-slice allowance and the 105g ceiling are deliberately absent from the
# published policy, which states only the under-100g rule, so that nobody slices
# to exactly the limit. The code being more generous here is intended, not a bug.

# Claiming a print that has already been reprinted is refused outright rather
# than charged. Every other way of missing out is still charged with an
# explanation: those are judgements about material and size the member may not
# have been able to predict, whereas claiming the same failure twice is a
# mistake about which print they meant, and silently charging for it is no help.

GRAM_UNITS = {"g", "gram", "grams"}
FAILED_PRINT_MAX_GRAMS = Decimal("100")
RESLICE_BUFFER = Decimal("1.15")
REPRINT_MAX_GRAMS = Decimal("105")
REPRINT_SHARE_CAP = Decimal("0.25")

CHARGED = "Charged as a normal print: "


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


def claimable_failures_query(user_id: UUID):
    """Select the member's failed prints that can still earn a free reprint.

    Excludes failures that have already been claimed, and failures that were
    themselves reprints: one free reprint per original print, so a reprint that
    fails does not earn another one and the member pays for the next attempt.
    """
    already_claimed = select(MachineUsage.reprint_of_id).where(
        MachineUsage.reprint_of_id.is_not(None)
    )
    return (
        select(MachineUsage)
        .where(MachineUsage.user_id == user_id)
        .where(MachineUsage.failed.is_(True))
        .where(MachineUsage.is_reprint.is_(False))
        .where(MachineUsage.id.not_in(already_claimed))
        .options(
            selectinload(MachineUsage.resources_used).selectinload(
                ResourceUsageQuantity.resource
            ),
            selectinload(MachineUsage.machine).selectinload(Machine.type),
        )
    )


def judge_failure(candidate: MachineUsage) -> tuple[Decimal, str | None]:
    """How much Forge filament a failure used, and why it cannot be claimed.

    The reason is None when the failure qualifies. The size of the *reprint* is
    not judged here, because that depends on what is being submitted.
    """
    if candidate.machine is None or not candidate.machine.type.allows_free_reprints:
        return Decimal(0), (
            "that failed print was on a kind of machine that doesn't earn "
            "free reprints."
        )

    failed_grams = forge_gram_total(candidate.resources_used)
    if failed_grams <= 0:
        return failed_grams, (
            "that failed print used personal filament, which the free reprint "
            "doesn't cover."
        )
    if failed_grams >= FAILED_PRINT_MAX_GRAMS:
        return failed_grams, (
            f"a free reprint only covers failed prints under "
            f"{FAILED_PRINT_MAX_GRAMS:.0f}g, and that failure used "
            f"{failed_grams:.1f}g."
        )
    return failed_grams, None


async def _load_named_failure(
    session, current_user: User, reprint_of_id: UUID
) -> MachineUsage:
    """Load the failure the member said they are reprinting.

    Refuses rather than charges: these are all mistakes about *which* print is
    being claimed, and the member should fix the selection instead of paying
    for a print they expected to be free.
    """
    usage = await session.scalar(
        select(MachineUsage)
        .where(MachineUsage.id == reprint_of_id)
        .options(
            selectinload(MachineUsage.resources_used).selectinload(
                ResourceUsageQuantity.resource
            ),
            selectinload(MachineUsage.machine).selectinload(Machine.type),
        )
    )

    if usage is None or usage.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That failed print isn't one of yours.",
        )

    if not usage.failed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That print didn't fail, so there's no free reprint to claim.",
        )

    claimed_by = await session.scalar(
        select(MachineUsage.id).where(MachineUsage.reprint_of_id == usage.id)
    )
    if claimed_by is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "That print has already been reprinted for free. Each failed "
                "print earns one free reprint, so pick a different failure or "
                "submit this as a normal print."
            ),
        )

    return usage


async def evaluate_free_reprint(
    session,
    current_user: User,
    semester_id: UUID | None,
    requested_quantities: list[ResourceUsageQuantity],
    machine: Machine,
    reprint_of_id: UUID | None = None,
) -> tuple[MachineUsage | None, str | None]:
    """Decide whether this reprint is free.

    Returns (failed usage being claimed, None) when it is free, or
    (None, reason) when it is charged. The reason names the actual numbers so
    the form can explain the charge rather than just applying it silently.

    Raises 400 when the member named a failure that cannot be claimed at all:
    somebody else's, one that did not fail, or one already reprinted.

    reprint_of_id is optional so a client that only sends is_reprint still
    works; the newest claimable failure is picked for it.
    """
    if not machine.type.allows_free_reprints:
        return None, (CHARGED + "free reprints don't apply to this kind of machine.")

    requested_grams = forge_gram_total(requested_quantities)

    if requested_grams <= 0:
        return None, (
            CHARGED + "free reprints only cover Forge filament measured in grams."
        )

    if reprint_of_id is not None:
        named = await _load_named_failure(session, current_user, reprint_of_id)

        # Charged, not refused: the member picked a real failure of theirs, it
        # just earns nothing. Chain-stopping is a limit of the policy, not a
        # mis-selection they should go back and correct.
        if named.is_reprint:
            return None, (
                CHARGED + "that print was itself a reprint, and only an "
                "original print earns a free reprint."
            )

        failed_grams, reason = judge_failure(named)
        if reason is not None:
            return None, CHARGED + reason
        failed_usage = named
    else:
        candidates = (
            await session.scalars(
                claimable_failures_query(current_user.id).order_by(
                    MachineUsage.failed_at.desc().nullslast()
                )
            )
        ).all()

        if not candidates:
            return None, (
                CHARGED + "you have no failed print left to claim. Either nothing "
                "of yours has failed, or the failure already earned its free "
                "reprint."
            )

        # Most recent failure that qualifies. Candidates are newest first, so
        # when none qualify we report why the newest one didn't -- that is the
        # failure the member is most likely asking about.
        failed_usage = None
        failed_grams = Decimal(0)
        first_reason = None
        for candidate in candidates:
            grams, reason = judge_failure(candidate)
            if reason is None:
                failed_usage, failed_grams = candidate, grams
                break
            first_reason = first_reason or reason

        if failed_usage is None:
            return None, CHARGED + (
                first_reason or "you have no failed print left to claim."
            )

    allowance = min(failed_grams * RESLICE_BUFFER, REPRINT_MAX_GRAMS)
    if requested_grams > allowance:
        return None, (
            CHARGED + f"a free reprint covers up to {allowance:.1f}g based on the "
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
