"""Release machines that nobody came back to clear.

A machine stays occupied until a volunteer clears it, which is fine while
someone is on shift and a problem the rest of the time: a print that finished
at 2am leaves the machine showing as in use, and the next member is told
"Machine is in use" by a job that ended hours ago.

So a usage that finished more than AUTO_CLEAR_AFTER ago releases its machine
on its own. The usage itself is untouched -- it stays on the member's history
and on the charge sheet, exactly as it would after a volunteer cleared it.
Only the machine's active_usage link is dropped.

Failed usages are released too, timed from when they failed rather than when
they would have ended: a print that dies four minutes into a six-hour job
stopped occupying the machine four minutes in. The failure itself is not
erased -- failed and failed_at stay on the usage, and the member has already
been emailed -- but the machine stops advertising it once it has sat long
enough for someone to have dealt with it.
"""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from models.audit_log import AuditLog
from models.machine import Machine
from schemas.enums import LogType

# uvicorn's logger, not this module's: nothing in this app configures
# logging, so a bare module logger propagates to a root that drops INFO and
# the sweep would run and release machines without a word in the container
# log. Errors would still surface, but a silent success is no use when you
# are trying to work out why a machine freed itself.
logger = logging.getLogger("uvicorn.error")

# How long after a usage ends before its machine is released. Long enough that
# someone coming back for their print still finds the machine showing as
# theirs, short enough that an overnight job doesn't block the morning.
AUTO_CLEAR_AFTER = timedelta(minutes=30)

# The sweep is cheap -- one query over the machines that are actually busy --
# so it runs often enough that the delay a member sees is the 30 minutes
# above, not 30 minutes plus most of an interval.
SWEEP_INTERVAL = timedelta(minutes=1)

# Releasing a machine used to also end the only chance to mark its print
# failed, because /fail reaches the usage through machine.active_usage. A
# volunteer doing a morning round would find an overnight failure already
# cleared and no way to record it, which costs the member their free reprint.
# So /fail still reaches a usage this long after it finished, cleared or not.
FAIL_WINDOW = timedelta(hours=24)


def usage_finished_at(usage) -> datetime:
    """When the machine actually stopped being busy.

    A failed usage ends when it failed, which is earlier -- usually much
    earlier -- than the duration it was booked for. failed_at is nullable, so
    a failed row without one falls back to the booked end rather than being
    treated as having ended at the epoch and cleared on the spot.
    """
    if usage.failed and usage.failed_at is not None:
        return usage.failed_at
    return usage.time_started + timedelta(seconds=usage.duration_seconds)


async def sweep_finished_machines(session) -> list[tuple[str, str]]:
    """Clear every machine whose usage finished over AUTO_CLEAR_AFTER ago.

    Returns (machine name, usage id) for each one cleared. Safe to run in
    several processes at once: the release is a conditional UPDATE, so of two
    workers that both decide to clear the same machine only one changes a row,
    and only that one writes the audit entry.
    """
    now = datetime.now(UTC)

    busy = (
        await session.scalars(
            select(Machine)
            .where(Machine.active_usage_id.is_not(None))
            .options(selectinload(Machine.active_usage))
        )
    ).all()

    cleared: list[tuple[str, str]] = []
    for machine in busy:
        usage = machine.active_usage
        if usage is None:
            continue

        finished_at = usage_finished_at(usage)
        if now - finished_at < AUTO_CLEAR_AFTER:
            continue

        result = await session.execute(
            update(Machine)
            .where(Machine.id == machine.id)
            .where(Machine.active_usage_id == usage.id)
            .values(active_usage_id=None)
        )
        if result.rowcount != 1:
            # Someone -- a volunteer, or the other worker -- got there first.
            continue

        session.add(
            AuditLog(
                type=LogType.MACHINE_USAGE_CLEARED,
                content={
                    "machine_usage_id": str(usage.id),
                    # Indexed by the machine detail endpoint, so an automatic
                    # clear shows up in that machine's history like any other.
                    "machine_id": str(machine.id),
                    # No volunteer did this. Spelled out rather than left out,
                    # so reading the log never needs a guess about who acted.
                    "user_rcsid": None,
                    "automatic": True,
                    "finished_at": finished_at.isoformat(),
                    "failed": usage.failed,
                },
            )
        )
        cleared.append((machine.name, str(usage.id)))

    if cleared:
        await session.commit()
    return cleared


async def auto_clear_loop(session_factory) -> None:
    """Sweep forever. Started on app startup, cancelled on shutdown."""
    while True:
        try:
            async with session_factory() as session:
                cleared = await sweep_finished_machines(session)
            for name, usage_id in cleared:
                logger.info("Auto-cleared %s (usage %s)", name, usage_id)
        except asyncio.CancelledError:
            raise
        except Exception:
            # A sweep that fails must not take the sweeper down with it: the
            # database being briefly unreachable would otherwise leave every
            # machine stuck until the next deploy.
            logger.exception("Auto-clear sweep failed; will retry")

        await asyncio.sleep(SWEEP_INTERVAL.total_seconds())
