"""The Forge reprint policy.

Lives in one module because it is applied at two different times: eligibility
when a usage is submitted, and the 25% cap when the semester's charge sheet is
generated.
"""

from collections.abc import Sequence
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
# That failed print did not itself get a free reprint. One free reprint per
#   original print, so a free reprint that fails does not earn another one.
#   A reprint the member was charged full price for is an ordinary paid print
#   and earns one like any other: they paid for it, and ticking the box is not
#   something they should be out of pocket for later.
# The reprint is no larger than the failed print, plus a small allowance for re-slicing, and never more than 105g.
# The failure happened this semester. Past usage is kept but does not carry
#   into the current term, so a failure from last semester earns nothing now.
# The 25% cap is NOT checked here. It is cumulative over the semester and
#   reconciled when the charge sheet is generated, because a member whose first
#   print fails is at 100% that day and may be well under by December.

# The re-slice allowance and the 105g ceiling are deliberately absent from the
# published policy, which states only the under-100g rule, so that nobody slices
# to exactly the limit. The code being more generous here is intended, not a bug.

# The member does not say which failure they are claiming. Ticking the reprint
# box is the whole of it, and the newest failure that qualifies is claimed for
# them. Missing out is charged with an explanation rather than refused: the
# judgements about material and size are ones the member could not have been
# expected to make, so the usage is logged and the reason comes back with it.

GRAM_UNITS = {"g", "gram", "grams"}
FAILED_PRINT_MAX_GRAMS = Decimal("100")
RESLICE_BUFFER = Decimal("1.15")
REPRINT_MAX_GRAMS = Decimal("105")
REPRINT_SHARE_CAP = Decimal("0.25")

CHARGED = "Charged as a normal print: "

# Said by the unique index on reprint_of_id, which is the only thing that can
# catch this: the failure is chosen from the unclaimed ones a moment earlier,
# so getting here means another submission took it in between.
ALREADY_CLAIMED = (
    "The failed print this would have claimed was just claimed by another "
    "submission. Nothing was logged -- submit again and the next failure will "
    "be used."
)


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


def claimable_failures_query(user_id: UUID, semester_id: UUID | None):
    """Select the member's failed prints that can still earn a free reprint.

    Bounded to one semester. Past usage is kept, but it does not reach into
    the current term: a print that failed last semester earns nothing now,
    the same way last semester's cost does not show up in this balance.
    Between semesters there is no active semester, and usages logged then
    have no semester either, so those match each other.

    Excludes failures that have already been claimed, and failures that were
    themselves granted free: one free reprint per original print, so a free
    reprint that fails does not earn another one and the member pays for the
    next attempt.

    The test for that is reprint_of_id, not is_reprint. is_reprint only says
    the member ticked the box; it is still set when the claim was refused and
    they were charged full price. Such a print is paid for like any other and
    earns its own free reprint if it fails.
    """
    already_claimed = select(MachineUsage.reprint_of_id).where(
        MachineUsage.reprint_of_id.is_not(None)
    )
    return (
        select(MachineUsage)
        .where(MachineUsage.user_id == user_id)
        .where(MachineUsage.semester_id == semester_id)
        .where(MachineUsage.failed.is_(True))
        .where(MachineUsage.reprint_of_id.is_(None))
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


async def evaluate_free_reprint(
    session,
    current_user: User,
    semester_id: UUID | None,
    requested_quantities: list[ResourceUsageQuantity],
    machine: Machine,
) -> tuple[MachineUsage | None, str | None]:
    """Decide whether this reprint is free, and against which failure.

    Returns (failed usage being claimed, None) when it is free, or
    (None, reason) when it is charged. The reason names the actual numbers so
    the form can explain the charge rather than just applying it silently.

    The member does not choose the failure. Theirs are walked newest first and
    the first that qualifies is claimed, so the usual case -- a print failed,
    they ran it again -- needs nothing from them but the tick.
    """
    if not machine.type.allows_free_reprints:
        return None, (CHARGED + "free reprints don't apply to this kind of machine.")

    requested_grams = forge_gram_total(requested_quantities)

    if requested_grams <= 0:
        return None, (
            CHARGED + "free reprints only cover Forge filament measured in grams."
        )

    candidates = (
        await session.scalars(
            claimable_failures_query(current_user.id, semester_id).order_by(
                MachineUsage.failed_at.desc().nullslast()
            )
        )
    ).all()

    if not candidates:
        return None, (
            CHARGED + "you have no failed print left to claim this semester. "
            "Either nothing of yours has failed, or the failure already "
            "earned its free reprint."
        )

    # Most recent failure that qualifies. Candidates are newest first, so when
    # none qualify we report why the newest one didn't -- that is the failure
    # the member is most likely asking about.
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
            first_reason or "you have no failed print left to claim this semester."
        )

    allowance = min(failed_grams * RESLICE_BUFFER, REPRINT_MAX_GRAMS)
    if requested_grams > allowance:
        return None, (
            CHARGED + f"a free reprint covers up to {allowance:.1f}g based on the "
            f"{failed_grams:.1f}g that failed, and this print is "
            f"{requested_grams:.1f}g."
        )

    return failed_usage, None


async def semester_reprint_overages(
    session, user_ids: Sequence[UUID], semester_id: UUID | None
) -> dict[UUID, Decimal]:
    """Cost of free-reprint filament beyond each member's 25% allowance.

    The cap is cumulative and only meaningful once the semester is over: a
    member whose very first print fails is at 100% that day, and may be far
    under by December. So nothing is charged at submission and the excess is
    worked out here.

    Free reprints are walked oldest first and stay free until the allowance is
    used up; whatever spills past it is charged at the price recorded on that
    usage, not today's price. Only the portion over the line is charged.

    Batched deliberately: every member who is listed anywhere alongside a
    balance needs this, so it is two queries for the whole set rather than two
    per row. Every id asked for comes back, zero included, so callers can index
    the result without checking.
    """
    if semester_id is None:
        return {}

    user_ids = list(dict.fromkeys(user_ids))
    if not user_ids:
        return {}

    gram_filter = (
        ResourceUsageQuantity.is_own_material.is_(False),
        func.lower(func.trim(Resource.units)).in_(GRAM_UNITS),
    )

    total_rows = (
        await session.execute(
            select(
                MachineUsage.user_id,
                func.coalesce(func.sum(ResourceUsageQuantity.amount), 0),
            )
            .join(MachineUsage, MachineUsage.id == ResourceUsageQuantity.machine_usage_id)
            .join(Resource, Resource.id == ResourceUsageQuantity.resource_id)
            .where(MachineUsage.user_id.in_(user_ids))
            .where(MachineUsage.semester_id == semester_id)
            .where(*gram_filter)
            .group_by(MachineUsage.user_id)
        )
    ).all()
    allowances = {
        user_id: Decimal(total or 0) * REPRINT_SHARE_CAP
        for user_id, total in total_rows
    }

    # reprint_of_id is set only on reprints that were actually granted free, so
    # a reprint the member already paid for doesn't count against them twice.
    rows = (
        await session.execute(
            select(
                MachineUsage.user_id,
                ResourceUsageQuantity.amount,
                ResourceUsageQuantity.cpu_at_usage,
            )
            .join(MachineUsage, MachineUsage.id == ResourceUsageQuantity.machine_usage_id)
            .join(Resource, Resource.id == ResourceUsageQuantity.resource_id)
            .where(MachineUsage.user_id.in_(user_ids))
            .where(MachineUsage.semester_id == semester_id)
            .where(MachineUsage.reprint_of_id.is_not(None))
            .where(*gram_filter)
            .order_by(MachineUsage.user_id, MachineUsage.time_started)
        )
    ).all()

    used: dict[UUID, Decimal] = {}
    overages: dict[UUID, Decimal] = {}
    for user_id, amount, cpu_at_usage in rows:
        amount = Decimal(amount)
        consumed = used.get(user_id, Decimal(0))
        free_remaining = allowances.get(user_id, Decimal(0)) - consumed
        if free_remaining < amount:
            chargeable = amount - max(free_remaining, Decimal(0))
            overages[user_id] = overages.get(user_id, Decimal(0)) + chargeable * Decimal(
                cpu_at_usage
            )
        used[user_id] = consumed + amount

    return {user_id: overages.get(user_id, Decimal(0)) for user_id in user_ids}


async def semester_reprint_overage(
    session, user_id: UUID, semester_id: UUID | None
) -> Decimal:
    """The overage for one member. See semester_reprint_overages."""
    overages = await semester_reprint_overages(session, [user_id], semester_id)
    return overages.get(user_id, Decimal(0))
