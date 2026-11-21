from typing import Dict, Set
from uuid import UUID

from sqlalchemy import func, select

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.role import Role
from models.user import User
from schemas.enums import Permissions


# The permissions a member needs to use a machine at all. The role whose
# permissions are exactly this set is the base role: every verified member
# has it, and it is what someone falls back to when a role is taken away.
# Matched on permissions rather than name so renaming the role is safe --
# initial_data.py renames it in place for the same reason.
MACHINE_USAGE_MINIMUM = [
    Permissions.CAN_USE_MACHINES,
    Permissions.CAN_SEE_MACHINES,
    Permissions.CAN_SEE_RESOURCE_SLOTS,
    Permissions.CAN_SEE_RESOURCES,
    Permissions.CAN_SEE_SEMESTERS,
]


async def get_base_role(session: AsyncSession) -> Role | None:
    """The base role every member holds, or None if no role matches.

    None is possible on an empty database, or if someone edits the base
    role's permissions so it no longer matches. Callers must handle it:
    there is no sensible role to invent in its place.
    """
    return await session.scalar(
        select(Role).where(
            Role.permissions.op("@>")(MACHINE_USAGE_MINIMUM),
            func.cardinality(Role.permissions) == len(MACHINE_USAGE_MINIMUM),
        )
    )


def highest_priority_display_role(roles: list[Role]) -> str:
    """Name of the highest-priority role marked as a display role, or "".

    models/role.py defines the displayed role as "the highest priority role
    with display_role set". Lives here because both /me in auth.py and the
    user endpoints need it, and they were previously out of step.
    """
    display_roles = [role for role in roles if role.display_role]
    if not display_roles:
        return ""
    return max(display_roles, key=lambda role: role.priority).name


async def get_user_permissions(session: AsyncSession, user_id: UUID):
    user = (
        await session.scalars(
            select(User).where(User.id == user_id).options(selectinload(User.roles))
        )
    ).one()
    # Resolved in two passes. A single pass deleted a denied permission only
    # if it was already in the set, so a denial was silently skipped whenever
    # the denying role happened to be read before the granting one -- and the
    # order roles come back in is arbitrary. Collecting every grant and every
    # denial first makes the result depend on priority alone.
    granted: Dict[Permissions, int] = {}
    denied: Dict[Permissions, int] = {}

    for role in user.roles:
        for permission in role.permissions:
            permission = Permissions(permission)
            if permission not in granted or granted[permission] < role.priority:
                granted[permission] = role.priority

        for inverse_permission in role.inverse_permissions:
            inverse_permission = Permissions(inverse_permission)
            if (
                inverse_permission not in denied
                or denied[inverse_permission] < role.priority
            ):
                denied[inverse_permission] = role.priority

    # A denial has to outrank the grant to take effect. Equal priority leaves
    # the permission in place, which is what the previous implementation did
    # when it worked, including for a role that both grants and denies one.
    return {
        permission
        for permission, priority in granted.items()
        if permission not in denied or denied[permission] <= priority
    }


async def has_permission(
    session: AsyncSession, user_id: UUID, permission: Permissions
) -> bool:
    return permission in await get_user_permissions(session, user_id)


async def has_permissions_all(
    session: AsyncSession, user_id: UUID, permissions: Set[Permissions]
) -> bool:
    return permissions.issubset(await get_user_permissions(session, user_id))


async def has_permissions_any(
    session: AsyncSession, user_id: UUID, permissions: Set[Permissions]
) -> bool:
    user_permissions = await get_user_permissions(session, user_id)
    return any(permission in user_permissions for permission in permissions)
