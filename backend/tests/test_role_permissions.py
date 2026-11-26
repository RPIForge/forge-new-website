"""Coverage for the role and permission rules.

All of this was previously verified only by throwaway scripts run by hand
against the dev database.

The resolution rules in api/utils.py, the restricted-permission guards in
api/routes/roles.py, the damage-control checks in change_user_role and the
base-role fallback are each load-bearing for who can lock an account out and
who can hand themselves IS_SUPERUSER, and none of them are visible from the
outside when they silently stop working.
"""

from typing import Dict, Iterable

import pytest
from httpx import AsyncClient, codes
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from main import app
from core import security
from models import Role, User
from api.utils import MACHINE_USAGE_MINIMUM, get_user_permissions
from schemas.enums import GenderStatsType, Permissions, PronounType


def make_role(
    name: str,
    *,
    permissions: Iterable[Permissions] = (),
    inverse_permissions: Iterable[Permissions] = (),
    priority: int = 0,
    display_role: bool = False,
) -> Role:
    return Role(
        name=name,
        permissions=[Permissions(p) for p in permissions],
        inverse_permissions=[Permissions(p) for p in inverse_permissions],
        display_role=display_role,
        role_icon_name=None,
        priority=priority,
    )


def base_role() -> Role:
    """A role whose permissions are exactly MACHINE_USAGE_MINIMUM.

    get_base_role finds the base role by that permission set rather than by
    name, so the name here is deliberately not "Member": a test that passed
    only because of the name would not be testing the lookup.
    """
    return make_role("Baseline", permissions=MACHINE_USAGE_MINIMUM, priority=1)


_rin_counter = iter(range(100000000, 100001000))


async def make_user(
    session: AsyncSession,
    rcsid: str,
    *,
    roles: Iterable[Role] = (),
    is_email_verified: bool = True,
    password: str = "forgepassword",
) -> User:
    user = User(
        RCSID=rcsid,
        RIN=str(next(_rin_counter)),
        first_name="Test",
        last_name=rcsid.capitalize(),
        major="Computer Science",
        gender_identity=GenderStatsType.NOTDISCLOSED,
        pronouns=PronounType.THEY_THEM,
        hashed_password=security.get_password_hash(SecretStr(password)),
        is_rpi_staff=False,
        is_email_verified=is_email_verified,
        is_graduating=False,
        checked_graduating=None,
    )
    user.roles = list(roles)
    session.add(user)
    await session.commit()
    return user


def headers_for(user: User) -> Dict[str, str]:
    token = security.create_jwt_token(str(user.RCSID), 60 * 60)[0]
    return {"Authorization": f"Bearer {token}"}


async def fresh_role_names(session: AsyncSession, user_id) -> set:
    """Role names as they are in the database right now.

    change_user_role and create_role commit on their own connection, and
    async_session is built with expire_on_commit=False, so anything already
    loaded in this session is stale after a request.
    """
    session.expire_all()
    user = (
        await session.scalars(
            select(User).where(User.id == user_id).options(selectinload(User.roles))
        )
    ).one()
    return {role.name for role in user.roles}


# --------------------------------------------------------------------------
# get_user_permissions: inverse permissions resolve by priority
# --------------------------------------------------------------------------


async def test_higher_priority_denial_beats_lower_priority_grant(
    session: AsyncSession,
):
    grant = make_role("Granter", permissions=[Permissions.CAN_USE_MACHINES], priority=1)
    deny = make_role(
        "Denier", inverse_permissions=[Permissions.CAN_USE_MACHINES], priority=100
    )
    session.add_all([grant, deny])
    user = await make_user(session, "denyme", roles=[grant, deny])

    assert Permissions.CAN_USE_MACHINES not in await get_user_permissions(
        session, user.id
    )


async def test_denial_does_not_depend_on_the_order_roles_are_visited(
    session: AsyncSession,
):
    """The same two roles, attached in both orders, must give the same answer.

    A single-pass resolver that deletes a denied permission only when it is
    already in the set gets this right by luck for one order and wrong for
    the other, and the order roles come back from the database is arbitrary.
    """
    grant_a = make_role(
        "Granter A", permissions=[Permissions.CAN_USE_MACHINES], priority=1
    )
    deny_a = make_role(
        "Denier A", inverse_permissions=[Permissions.CAN_USE_MACHINES], priority=100
    )
    grant_b = make_role(
        "Granter B", permissions=[Permissions.CAN_USE_MACHINES], priority=1
    )
    deny_b = make_role(
        "Denier B", inverse_permissions=[Permissions.CAN_USE_MACHINES], priority=100
    )
    session.add_all([grant_a, deny_a, grant_b, deny_b])

    grant_first = await make_user(session, "grantfirst", roles=[grant_a, deny_a])
    deny_first = await make_user(session, "denyfirst", roles=[deny_b, grant_b])

    assert Permissions.CAN_USE_MACHINES not in await get_user_permissions(
        session, grant_first.id
    )
    assert Permissions.CAN_USE_MACHINES not in await get_user_permissions(
        session, deny_first.id
    )


async def test_lower_priority_denial_does_not_remove_a_higher_priority_grant(
    session: AsyncSession,
):
    grant = make_role(
        "Granter", permissions=[Permissions.CAN_USE_MACHINES], priority=100
    )
    deny = make_role(
        "Denier", inverse_permissions=[Permissions.CAN_USE_MACHINES], priority=1
    )
    session.add_all([grant, deny])
    user = await make_user(session, "keepit", roles=[grant, deny])

    assert Permissions.CAN_USE_MACHINES in await get_user_permissions(session, user.id)


async def test_equal_priority_leaves_the_permission_in_place(session: AsyncSession):
    """A denial has to outrank the grant; a tie keeps the permission.

    This is what the previous implementation did when it happened to work,
    including for a single role that both grants and denies one.
    """
    grant = make_role("Granter", permissions=[Permissions.CAN_USE_MACHINES], priority=5)
    deny = make_role(
        "Denier", inverse_permissions=[Permissions.CAN_USE_MACHINES], priority=5
    )
    both = make_role(
        "Both",
        permissions=[Permissions.CAN_CLEAR_MACHINES],
        inverse_permissions=[Permissions.CAN_CLEAR_MACHINES],
        priority=7,
    )
    session.add_all([grant, deny, both])
    user = await make_user(session, "tiebreak", roles=[grant, deny, both])

    permissions = await get_user_permissions(session, user.id)
    assert Permissions.CAN_USE_MACHINES in permissions
    assert Permissions.CAN_CLEAR_MACHINES in permissions


# --------------------------------------------------------------------------
# create_role / edit_role: only superusers may touch restricted permissions
# --------------------------------------------------------------------------


RESTRICTED_REFUSAL_CREATE = (
    "Only superusers can create roles with "
    "IS_SUPERUSER, ROLE_CHANGE_IMMUNE, and LOCKOUT"
)
RESTRICTED_REFUSAL_EDIT = (
    "Only superusers can edit roles with "
    "IS_SUPERUSER, ROLE_CHANGE_IMMUNE, and LOCKOUT"
)


@pytest.mark.parametrize(
    "restricted",
    [Permissions.IS_SUPERUSER, Permissions.ROLE_CHANGE_IMMUNE, Permissions.LOCKOUT],
)
async def test_create_role_refuses_restricted_permission(
    client: AsyncClient, session: AsyncSession, restricted: Permissions
):
    creator_role = make_role(
        "Role Creator", permissions=[Permissions.CAN_CREATE_ROLES], priority=10
    )
    session.add(creator_role)
    creator = await make_user(session, "creator", roles=[creator_role])

    response = await client.post(
        app.url_path_for("create_role"),
        headers=headers_for(creator),
        json={
            "name": "Sneaky",
            "permissions": [restricted],
            "inverse_permissions": [],
            "display_role": False,
            "priority": 1000,
        },
    )
    assert response.status_code == codes.FORBIDDEN
    assert response.json()["detail"] == RESTRICTED_REFUSAL_CREATE
    assert (
        await session.scalar(
            select(func.count()).select_from(Role).where(Role.name == "Sneaky")
        )
    ) == 0


async def test_create_role_checks_inverse_permissions_too(
    client: AsyncClient, session: AsyncSession
):
    """A restricted permission is restricted on either side of the role.

    Only checking `permissions` would let anyone with canCreateRoles build a
    high-priority role that strips IS_SUPERUSER from whoever holds it.
    """
    creator_role = make_role(
        "Role Creator", permissions=[Permissions.CAN_CREATE_ROLES], priority=10
    )
    session.add(creator_role)
    creator = await make_user(session, "inverse", roles=[creator_role])

    response = await client.post(
        app.url_path_for("create_role"),
        headers=headers_for(creator),
        json={
            "name": "Superjail",
            "permissions": [],
            "inverse_permissions": [Permissions.IS_SUPERUSER],
            "display_role": False,
            "priority": 10000,
        },
    )
    assert response.status_code == codes.FORBIDDEN
    assert response.json()["detail"] == RESTRICTED_REFUSAL_CREATE


async def test_superuser_may_create_restricted_role(
    client: AsyncClient, session: AsyncSession
):
    god = make_role("god", permissions=[Permissions.IS_SUPERUSER], priority=100)
    session.add(god)
    superuser = await make_user(session, "deity", roles=[god])

    response = await client.post(
        app.url_path_for("create_role"),
        headers=headers_for(superuser),
        json={
            "name": "Jail",
            "permissions": [Permissions.LOCKOUT],
            "inverse_permissions": [],
            "display_role": False,
            "priority": 1000,
        },
    )
    assert response.status_code == codes.OK
    assert (await session.scalar(select(Role.name).where(Role.name == "Jail"))) == "Jail"


async def test_edit_role_refuses_adding_a_restricted_permission(
    client: AsyncClient, session: AsyncSession
):
    editor_role = make_role(
        "Role Editor", permissions=[Permissions.CAN_EDIT_ROLES], priority=10
    )
    plain = make_role("Plain", permissions=[Permissions.CAN_SEE_MACHINES], priority=5)
    session.add_all([editor_role, plain])
    editor = await make_user(session, "editor", roles=[editor_role])
    plain_id = plain.id

    response = await client.post(
        app.url_path_for("edit_role", role_id=plain_id),
        headers=headers_for(editor),
        json={
            "role_id": str(plain.id),
            "name": "Plain",
            "permissions": [Permissions.CAN_SEE_MACHINES, Permissions.LOCKOUT],
            "inverse_permissions": [],
            "display_role": False,
            "priority": 5,
        },
    )
    assert response.status_code == codes.FORBIDDEN
    assert response.json()["detail"] == RESTRICTED_REFUSAL_EDIT

    session.expire_all()
    unchanged = await session.scalar(select(Role).where(Role.id == plain_id))
    assert Permissions.LOCKOUT not in unchanged.permissions


async def test_edit_role_refuses_editing_an_already_restricted_role(
    client: AsyncClient, session: AsyncSession
):
    """The role's current permissions count as well as the submitted ones.

    Otherwise a non-superuser could take LOCKOUT off a role, or rename and
    re-point an existing superuser role, without ever submitting a restricted
    permission themselves.
    """
    editor_role = make_role(
        "Role Editor", permissions=[Permissions.CAN_EDIT_ROLES], priority=10
    )
    jail = make_role("Jail", permissions=[Permissions.LOCKOUT], priority=1000)
    session.add_all([editor_role, jail])
    editor = await make_user(session, "declawer", roles=[editor_role])
    jail_id = jail.id

    response = await client.post(
        app.url_path_for("edit_role", role_id=jail_id),
        headers=headers_for(editor),
        json={
            "role_id": str(jail.id),
            "name": "Jail",
            "permissions": [],
            "inverse_permissions": [],
            "display_role": False,
            "priority": 1000,
        },
    )
    assert response.status_code == codes.FORBIDDEN
    assert response.json()["detail"] == RESTRICTED_REFUSAL_EDIT

    session.expire_all()
    unchanged = await session.scalar(select(Role).where(Role.id == jail_id))
    assert Permissions.LOCKOUT in unchanged.permissions


async def test_superuser_may_edit_restricted_role(
    client: AsyncClient, session: AsyncSession
):
    god = make_role("god", permissions=[Permissions.IS_SUPERUSER], priority=100)
    jail = make_role("Jail", permissions=[Permissions.LOCKOUT], priority=1000)
    session.add_all([god, jail])
    superuser = await make_user(session, "deity", roles=[god])
    jail_id = jail.id

    response = await client.post(
        app.url_path_for("edit_role", role_id=jail_id),
        headers=headers_for(superuser),
        json={
            "role_id": str(jail.id),
            "name": "Jail",
            "permissions": [Permissions.LOCKOUT, Permissions.ROLE_CHANGE_IMMUNE],
            "inverse_permissions": [],
            "display_role": False,
            "priority": 1000,
        },
    )
    assert response.status_code == codes.OK

    session.expire_all()
    edited = await session.scalar(select(Role).where(Role.id == jail_id))
    assert Permissions.ROLE_CHANGE_IMMUNE in edited.permissions
