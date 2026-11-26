"""Report how roles interact, since nothing in the UI shows it.

Members hold several roles at once and their permissions are the union,
except where one role lists a permission in inverse_permissions to deny what
another grants. Role.priority decides who wins. None of that is visible when
you are ticking checkboxes on a role, so this prints it.

    docker exec forge-site-backend-1 python audit_roles.py

Roles are deliberately NOT assumed to be a hierarchy. Two roles can be
disjoint on purpose -- an accountant who may read charge sheets but not
delete machines, a hardware supervisor who may do the reverse -- so a
permission one role grants and another lacks is normal and is not reported.
Only explicit conflicts are, because those are the ones that resolve in a
way you cannot see.
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
            marks.append("superuser: bypasses every check")
        if role.display_role:
            marks.append("display")
        suffix = f"  ({', '.join(marks)})" if marks else ""
        print(f"  {role.priority:>6}  {role.name}{suffix}")
        print(f"          grants {len(role.permissions)}", end="")
        if role.inverse_permissions:
            print(f", denies {len(role.inverse_permissions)}")
        else:
            print()
    print()

    conflicts = 0
    for denier in roles:
        for denied in denier.inverse_permissions:
            granters = [
                role
                for role in roles
                if role.id != denier.id and denied in role.permissions
            ]
            if not granters:
                continue
            for granter in granters:
                conflicts += 1
                wins = "denied" if denier.priority > granter.priority else "granted"
                print(
                    f"CONFLICT  {denied}\n"
                    f"          {granter.name} (priority {granter.priority}) grants it\n"
                    f"          {denier.name} (priority {denier.priority}) denies it\n"
                    f"          -> for a member holding both, it should be {wins}"
                )
                if denier.priority > granter.priority:
                    print(
                        "          WARNING: a higher-priority denial does not"
                        " reliably apply.\n"
                        "          get_user_permissions only removes a permission"
                        " already in the set,\n"
                        "          so the denial is skipped when the denying role"
                        " is read first.\n"
                        "          Do not rely on this to keep a permission away"
                        " from anyone."
                    )
                print()

    if conflicts:
        print(f"{conflicts} conflict(s) between roles.")
    else:
        print("No role denies a permission another role grants.")


asyncio.run(main())
