"""Check that roles are cumulative by priority.

Members hold exactly one role, and the system assumes a higher-priority role
grants everything the roles below it do, plus more. Nothing enforces that --
the permissions are ticked by hand when a role is created -- so a role that
is missing a permission a lower role grants will silently take capabilities
away from whoever is promoted into it.

Run against a live database:

    docker exec forge-site-backend-1 python audit_roles.py
"""

import asyncio

from sqlalchemy import select

from core.session import async_session
from models.role import Role
from schemas.enums import Permissions


async def main():
    async with async_session() as session:
        roles = (
            await session.scalars(select(Role).order_by(Role.priority.desc()))
        ).all()

    if not roles:
        print("No roles defined.")
        return

    print(f"{len(roles)} roles, highest priority first:\n")
    for role in roles:
        marks = []
        if Permissions.IS_SUPERUSER in role.permissions:
            marks.append("superuser")
        if role.display_role:
            marks.append("display")
        suffix = f"  ({', '.join(marks)})" if marks else ""
        print(f"  {role.priority:>6}  {role.name}{suffix}")
    print()

    gaps = 0
    for index, higher in enumerate(roles):
        # A superuser role bypasses every permission check, so it does not
        # need to list what the roles below it grant.
        if Permissions.IS_SUPERUSER in higher.permissions:
            continue

        for lower in roles[index + 1:]:
            missing = sorted(set(lower.permissions) - set(higher.permissions))
            if not missing:
                continue
            gaps += 1
            print(
                f"GAP  {higher.name} (priority {higher.priority}) is missing "
                f"{len(missing)} permission(s) that {lower.name} "
                f"(priority {lower.priority}) grants:"
            )
            for permission in missing:
                print(f"       {permission}")
            print()

    if gaps:
        print(
            f"{gaps} gap(s). Anyone promoted into those roles loses the "
            "permissions listed. Tick them on the higher role to fix."
        )
    else:
        print("No gaps: every role grants everything the roles below it do.")


asyncio.run(main())
