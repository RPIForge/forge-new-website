"""
Put here any Python code that must be runned before application startup.
It is included in `init.sh` script.

By default `main` create a superuser if not exists
"""

import asyncio
import logging
from pydantic import SecretStr

from sqlalchemy import func, select
from tenacity import after_log, before_log, retry, stop_after_attempt, wait_fixed

from core import security
from core.session import async_session
from models.role import Role
from models.state import State
from models.user import User
from schemas.enums import GenderStatsType, PronounType, Permissions

# Rename the base role by changing this: the role is matched on its
# permissions, so an existing one is renamed rather than duplicated.
BASE_ROLE_NAME = "Member"

# Holding this role disables an account. Nothing assigns it automatically.
LOCKOUT_ROLE_NAME = "Lockout"


async def main() -> None:
    print("Start initial data")
    async with async_session() as session:
        superuser_role = await session.scalar(
            select(Role).where(Role.name == "Super Admin")
        )

        if not superuser_role:
            superuser_role = Role(
                name="Super Admin",
                permissions=[Permissions.IS_SUPERUSER],
                inverse_permissions=[],
                display_role=False,
                priority=10000,
            )

            session.add(superuser_role)
            await session.commit()
            await session.refresh(superuser_role)

            print("Superuser role was created")
        else:
            print("Superuser role already exists in database")

        MACHINE_USAGE_MINIMUM = [Permissions.CAN_USE_MACHINES, Permissions.CAN_SEE_MACHINES, Permissions.CAN_SEE_RESOURCE_SLOTS, Permissions.CAN_SEE_RESOURCES, Permissions.CAN_SEE_SEMESTERS]

        # The base role is identified by its permissions, not its name --
        # verifications.py finds it the same way when it grants the role on
        # email verification. Matching on name alone meant renaming it here
        # created a second role instead of renaming the existing one, and
        # left the exact-permissions lookup matching two rows.
        base_role_query = select(Role).where(
            Role.permissions.op("@>")(MACHINE_USAGE_MINIMUM),
            func.cardinality(Role.permissions) == len(MACHINE_USAGE_MINIMUM),
        )
        by_permissions = (await session.scalars(base_role_query)).all()

        if len(by_permissions) > 1:
            names = ", ".join(repr(role.name) for role in by_permissions)
            print(
                f"WARNING: {len(by_permissions)} roles have exactly the base "
                f"permissions ({names}). Whichever one a newly verified member "
                "gets is arbitrary. Merge them by hand, then re-run this."
            )

        user_role = await session.scalar(select(Role).where(Role.name == BASE_ROLE_NAME))

        if not user_role and len(by_permissions) == 1:
            # It exists under an older name: rename rather than duplicate.
            user_role = by_permissions[0]
            print(f"Renaming base role {user_role.name!r} to {BASE_ROLE_NAME!r}")
            user_role.name = BASE_ROLE_NAME
            session.add(user_role)
            await session.commit()
            await session.refresh(user_role)

        if not user_role:
            user_role = Role(
                name=BASE_ROLE_NAME,
                permissions=MACHINE_USAGE_MINIMUM,
                inverse_permissions=[],
                display_role=True,
                priority=0,
            )

            session.add(user_role)
            await session.commit()
            await session.refresh(user_role)

            print("User role was created")
        else:
            print("User role already exists in database")

        lockout_role = await session.scalar(
            select(Role).where(Role.name == LOCKOUT_ROLE_NAME)
        )

        if not lockout_role:
            # Inert until someone is given it. Holding it refuses the account
            # at login (auth.py) and on every permission check (deps.py), and
            # only someone with CAN_CONTROL_LOCKOUT may apply or remove it --
            # no role carries that yet, so for now it is superusers only.
            lockout_role = Role(
                name=LOCKOUT_ROLE_NAME,
                permissions=[Permissions.LOCKOUT],
                inverse_permissions=[],
                display_role=False,
                priority=9000,
            )

            session.add(lockout_role)
            await session.commit()

            print("Lockout role was created")
        else:
            print("Lockout role already exists in database")

        user = await session.scalar(select(User).where(User.RCSID == "haddlg"))

        if not user:

            new_superuser = User(
                RCSID="haddlg",
                RIN="662012578",
                first_name="Gwen",
                last_name="Haddleton",
                major="Computer Science",
                gender_identity=GenderStatsType.FEMALE,
                pronouns=PronounType.SHE_HER,
                hashed_password=security.get_password_hash(SecretStr("12345")),
                roles=[superuser_role],
                is_rpi_staff=False,
                is_graduating=False,
                is_email_verified=True,
                checked_graduating=None,
            )

            session.add(new_superuser)
            await session.commit()
            print("Superuser was created")
        else:
            print("Superuser already exists in database")

        user = await session.scalar(select(User).where(User.RCSID == "byrnet2"))

        if not user:

            new_superuser = User(
                RCSID="byrnet2",
                RIN="662029936",
                first_name="Thomas",
                last_name="Byrne",
                major="Computer Science",
                gender_identity=GenderStatsType.MALE,
                pronouns=PronounType.HE_HIM,
                hashed_password=security.get_password_hash(SecretStr("password")),
                roles=[superuser_role],
                is_rpi_staff=False,
                is_graduating=False,
                is_email_verified=True,
                checked_graduating=None,
            )

            session.add(new_superuser)
            await session.commit()
            print("Thomas Superuser was created")
        else:
            print("Thomas Superuser already exists in database")

        user = await session.scalar(select(User).where(User.RCSID == "khusix"))

        if not user:

            new_superuser = User(
                RCSID="khusix",
                RIN="662000000",
                first_name="Xenia",
                last_name="Khusid",
                major="Computer Science",
                gender_identity=GenderStatsType.FEMALE,
                pronouns=PronounType.SHE_HER,
                hashed_password=security.get_password_hash(SecretStr("abcde")),
                roles=[superuser_role],
                is_rpi_staff=False,
                is_graduating=False,
                is_email_verified=True,
                checked_graduating=None,
            )

            session.add(new_superuser)
            await session.commit()
            print("Xenia Superuser was created")
        else:
            print("Xenia Superuser already exists in database")

        state = await session.scalar(select(State))
        if not state:
            new_state = State()
            session.add(new_state)
            await session.commit()

        print("Initial data created")


if __name__ == "__main__":
    asyncio.run(main())
