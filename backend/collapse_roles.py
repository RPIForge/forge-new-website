"""Collapse members who hold several roles down to their highest-priority one.

Members now hold exactly one role, but accounts created before that change
can still have several attached. This reports them, and with --apply keeps
only the highest-priority role for each.

    docker exec forge-site-backend-1 python collapse_roles.py
    docker exec forge-site-backend-1 python collapse_roles.py --apply

Run audit_roles.py first. Roles are assumed to be cumulative by priority, so
if a higher role is missing a permission a lower one grants, collapsing takes
that permission away from everyone who held both.
"""

import asyncio
import sys

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from core.session import async_session
from models.audit_log import AuditLog
from models.user import User
from schemas.enums import LogType


async def main(apply_changes: bool):
    async with async_session() as session:
        users = (
            await session.scalars(
                select(User).options(selectinload(User.roles)).order_by(User.RCSID)
            )
        ).all()

        affected = [user for user in users if len(user.roles) > 1]

        if not affected:
            print(f"{len(users)} members checked, none hold more than one role.")
            return

        print(f"{len(affected)} of {len(users)} members hold more than one role:\n")
        for user in affected:
            keep = max(user.roles, key=lambda role: role.priority)
            drop = [role for role in user.roles if role.id != keep.id]
            print(f"  {user.RCSID}")
            print(f"      keep {keep.name} (priority {keep.priority})")
            for role in drop:
                print(f"      drop {role.name} (priority {role.priority})")

        if not apply_changes:
            print("\nNothing changed. Re-run with --apply to collapse these.")
            return

        for user in affected:
            keep = max(user.roles, key=lambda role: role.priority)
            drop = [role for role in user.roles if role.id != keep.id]
            user.roles = [keep]
            session.add(user)
            session.add(
                AuditLog(
                    type=LogType.USER_EDITED,
                    content={
                        "user_rcsid": user.RCSID,
                        "changed_by_rcsid": "collapse_roles.py",
                        "role_granted": keep.name,
                        "roles_removed": [role.name for role in drop],
                    },
                )
            )

        await session.commit()
        print(f"\nCollapsed {len(affected)} members. Each change is in the audit log.")


asyncio.run(main("--apply" in sys.argv[1:]))
