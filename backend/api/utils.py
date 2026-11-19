from typing import Dict, Set
from uuid import UUID

from sqlalchemy import func, select

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.role import Role
from models.user import User
from schemas.enums import Permissions


# The permissions a member needs to use a machine at all. The role whose
# permissions are exactly this set is the base role every verified member
# gets, and the one they fall back to when a higher role is taken away.
MACHINE_USAGE_MINIMUM = [
    Permissions.CAN_USE_MACHINES,
    Permissions.CAN_SEE_MACHINES,
    Permissions.CAN_SEE_RESOURCE_SLOTS,
    Permissions.CAN_SEE_RESOURCES,
    Permissions.CAN_SEE_SEMESTERS,
]


async def get_base_role(session: AsyncSession) -> Role | None:
    """The base role, matched by its permissions rather than its name.

    Returns None if no role matches, which is possible on a fresh database
    or if someone edits the base role's permissions. Callers must handle it.
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
    permission_set: Dict[Permissions, int] = {}
    for role in user.roles:
        permissions = [Permissions(permission) for permission in role.permissions]
        for permission in permissions:
            if (
                permission not in permission_set
                or permission_set[permission] < role.priority
            ):
                permission_set[permission] = role.priority

        for inverse_permission in role.inverse_permissions:
            if (
                inverse_permission in permission_set
                and permission_set[inverse_permission] < role.priority
            ):
                del permission_set[inverse_permission]

    return set(permission_set.keys())


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
