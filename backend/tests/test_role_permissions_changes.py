"""Coverage for change_user_role, the base-role fallback and lockout.

Companion to test_role_permissions.py. These are the rules that decide who
can shut an account out of the space and who can hand out IS_SUPERUSER, and
they were previously checked only by throwaway scripts run by hand against
the dev database.
"""

from httpx import AsyncClient, codes
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from main import app
from models import Role, User
from api.utils import get_base_role, get_user_permissions
from api.routes import verifications
from schemas.enums import Permissions, TokenType

from .test_role_permissions import (
    base_role,
    fresh_role_names,
    headers_for,
    make_role,
    make_user,
)


ROLE_CHANGER = [Permissions.CAN_CHANGE_USER_ROLES]

LOCKOUT_REFUSAL = (
    "Applying or removing a role that locks an account requires canControlLockout"
)
ACCOUNT_DISABLED = "User access has been disabled by an administrator"


async def change_role(
    client: AsyncClient, actor: User, target: User, role: Role, should_have_role: bool
):
    return await client.post(
        app.url_path_for("change_user_role"),
        headers=headers_for(actor),
        json={
            "user_id": str(target.id),
            "role_id": str(role.id),
            "should_have_role": should_have_role,
        },
    )


# --------------------------------------------------------------------------
# ROLE_CHANGE_IMMUNE
# --------------------------------------------------------------------------


async def test_role_change_immune_target_refuses_another_actor(
    client: AsyncClient, session: AsyncSession
):
    changer = make_role("Changer", permissions=ROLE_CHANGER, priority=10)
    immune = make_role("Immune", permissions=[Permissions.ROLE_CHANGE_IMMUNE], priority=50)
    plain = make_role("Plain", permissions=[Permissions.CAN_SEE_MACHINES], priority=5)
    session.add_all([changer, immune, plain])
    actor = await make_user(session, "actor", roles=[changer])
    target = await make_user(session, "immuneguy", roles=[immune])

    response = await change_role(client, actor, target, plain, True)

    assert response.status_code == codes.FORBIDDEN
    assert response.json()["detail"] == (
        f"{target.first_name} {target.last_name}'s roles can only be "
        "changed by themselves or a superuser"
    )
    assert await fresh_role_names(session, target.id) == {"Immune"}


async def test_role_change_immune_target_may_change_their_own_roles(
    client: AsyncClient, session: AsyncSession
):
    immune = make_role(
        "Immune",
        permissions=[Permissions.ROLE_CHANGE_IMMUNE, *ROLE_CHANGER],
        priority=50,
    )
    plain = make_role("Plain", permissions=[Permissions.CAN_SEE_MACHINES], priority=5)
    session.add_all([immune, plain])
    target = await make_user(session, "selfserve", roles=[immune])

    response = await change_role(client, target, target, plain, True)

    assert response.status_code == codes.OK
    assert await fresh_role_names(session, target.id) == {"Immune", "Plain"}


async def test_superuser_may_change_an_immune_target(
    client: AsyncClient, session: AsyncSession
):
    god = make_role("god", permissions=[Permissions.IS_SUPERUSER], priority=100)
    immune = make_role(
        "Immune", permissions=[Permissions.ROLE_CHANGE_IMMUNE], priority=50
    )
    plain = make_role("Plain", permissions=[Permissions.CAN_SEE_MACHINES], priority=5)
    session.add_all([god, immune, plain])
    superuser = await make_user(session, "deity", roles=[god])
    target = await make_user(session, "immuneguy", roles=[immune])

    response = await change_role(client, superuser, target, plain, True)

    assert response.status_code == codes.OK
    assert await fresh_role_names(session, target.id) == {"Immune", "Plain"}


# --------------------------------------------------------------------------
# LOCKOUT needs CAN_CONTROL_LOCKOUT, in either direction
# --------------------------------------------------------------------------


async def test_applying_a_lockout_role_needs_can_control_lockout(
    client: AsyncClient, session: AsyncSession
):
    changer = make_role("Changer", permissions=ROLE_CHANGER, priority=10)
    jail = make_role("Jail", permissions=[Permissions.LOCKOUT], priority=1000)
    session.add_all([changer, jail])
    actor = await make_user(session, "actor", roles=[changer])
    target = await make_user(session, "victim")

    response = await change_role(client, actor, target, jail, True)

    assert response.status_code == codes.FORBIDDEN
    assert response.json()["detail"] == LOCKOUT_REFUSAL
    assert await fresh_role_names(session, target.id) == set()


async def test_removing_a_lockout_role_needs_can_control_lockout(
    client: AsyncClient, session: AsyncSession
):
    """Freeing an account is as privileged as locking one.

    Checking only the apply direction would let anyone with
    canChangeUserRoles undo someone else's lockout.
    """
    changer = make_role("Changer", permissions=ROLE_CHANGER, priority=10)
    jail = make_role("Jail", permissions=[Permissions.LOCKOUT], priority=1000)
    session.add_all([changer, jail])
    actor = await make_user(session, "actor", roles=[changer])
    target = await make_user(session, "jailed", roles=[jail])

    response = await change_role(client, actor, target, jail, False)

    assert response.status_code == codes.FORBIDDEN
    assert response.json()["detail"] == LOCKOUT_REFUSAL
    assert await fresh_role_names(session, target.id) == {"Jail"}


async def test_can_control_lockout_may_apply_a_lockout_role(
    client: AsyncClient, session: AsyncSession
):
    changer = make_role(
        "Changer",
        permissions=[*ROLE_CHANGER, Permissions.CAN_CONTROL_LOCKOUT],
        priority=10,
    )
    jail = make_role("Jail", permissions=[Permissions.LOCKOUT], priority=1000)
    session.add_all([changer, jail])
    actor = await make_user(session, "warden", roles=[changer])
    target = await make_user(session, "victim")

    response = await change_role(client, actor, target, jail, True)

    assert response.status_code == codes.OK
    assert await fresh_role_names(session, target.id) == {"Jail"}


# --------------------------------------------------------------------------
# IS_SUPERUSER is superuser-only, and is the refusal that gets reported
# --------------------------------------------------------------------------


async def test_assigning_a_superuser_role_is_superuser_only(
    client: AsyncClient, session: AsyncSession
):
    changer = make_role(
        "Changer",
        permissions=[*ROLE_CHANGER, Permissions.CAN_CONTROL_LOCKOUT],
        priority=10,
    )
    god = make_role("god", permissions=[Permissions.IS_SUPERUSER], priority=100)
    session.add_all([changer, god])
    actor = await make_user(session, "aspirant", roles=[changer])
    target = await make_user(session, "chosen")

    response = await change_role(client, actor, target, god, True)

    assert response.status_code == codes.FORBIDDEN
    assert response.json()["detail"] == (
        "Only a superuser can assign or remove god, "
        "because of the permissions it carries"
    )
    assert await fresh_role_names(session, target.id) == set()


async def test_super_admin_refusal_cites_superuser_not_lockout(
    client: AsyncClient, session: AsyncSession
):
    """Super Admin now carries every permission, LOCKOUT included.

    The reason it cannot be assigned is that it makes a superuser, not that
    it locks an account. The actor here deliberately lacks
    canControlLockout, so a check that looked at LOCKOUT first would report
    that instead and tell the user something untrue about what the role does.
    """
    changer = make_role("Changer", permissions=ROLE_CHANGER, priority=10)
    super_admin = make_role(
        "Super Admin",
        permissions=[
            Permissions.IS_SUPERUSER,
            Permissions.ROLE_CHANGE_IMMUNE,
            Permissions.LOCKOUT,
        ],
        priority=1000,
    )
    session.add_all([changer, super_admin])
    actor = await make_user(session, "aspirant", roles=[changer])
    target = await make_user(session, "chosen")

    response = await change_role(client, actor, target, super_admin, True)

    assert response.status_code == codes.FORBIDDEN
    assert response.json()["detail"] == (
        "Only a superuser can assign or remove Super Admin, "
        "because of the permissions it carries"
    )
    assert LOCKOUT_REFUSAL not in response.json()["detail"]


# --------------------------------------------------------------------------
# The base role, and removing it
# --------------------------------------------------------------------------


async def test_get_base_role_matches_the_exact_permission_set(
    session: AsyncSession,
):
    base = base_role()
    # A superset must not match: get_base_role checks the cardinality as well
    # as containment, so an officer role that happens to include the baseline
    # cannot be mistaken for it.
    superset = make_role(
        "Officer",
        permissions=[*base.permissions, Permissions.CAN_CLEAR_MACHINES],
        priority=20,
    )
    session.add_all([base, superset])
    await session.commit()

    found = await get_base_role(session)
    assert found is not None
    assert found.name == base.name


async def test_get_base_role_is_none_when_nothing_matches(session: AsyncSession):
    session.add(make_role("Officer", permissions=[Permissions.CAN_CLEAR_MACHINES]))
    await session.commit()

    assert await get_base_role(session) is None


async def test_removing_the_last_non_base_role_falls_back_to_the_base_role(
    client: AsyncClient, session: AsyncSession
):
    changer = make_role("Changer", permissions=ROLE_CHANGER, priority=10)
    base = base_role()
    volunteer = make_role(
        "Volunteer", permissions=[Permissions.CAN_CLEAR_MACHINES], priority=20
    )
    session.add_all([changer, base, volunteer])
    actor = await make_user(session, "actor", roles=[changer])
    target = await make_user(session, "volunteer", roles=[volunteer])

    response = await change_role(client, actor, target, volunteer, False)

    assert response.status_code == codes.OK
    # Losing a volunteer role should not cost them the baseline every verified
    # member has.
    assert await fresh_role_names(session, target.id) == {base.name}


async def test_removing_the_base_role_leaves_the_account_with_nothing(
    client: AsyncClient, session: AsyncSession
):
    """This is how an account is shut out, so it must be allowed to succeed.

    A fallback that fired here would make locking someone out by removing
    their base role impossible: they would be handed it straight back.
    """
    changer = make_role("Changer", permissions=ROLE_CHANGER, priority=10)
    base = base_role()
    session.add_all([changer, base])
    actor = await make_user(session, "actor", roles=[changer])
    target = await make_user(session, "member", roles=[base])

    response = await change_role(client, actor, target, base, False)

    assert response.status_code == codes.OK
    assert await fresh_role_names(session, target.id) == set()
    assert await get_user_permissions(session, target.id) == set()


async def test_email_verification_grants_the_base_role(
    client: AsyncClient, session: AsyncSession, monkeypatch
):
    sent = {}

    async def fake_send_email(email, token, token_type, first_name=None):
        sent["token"] = token

    monkeypatch.setattr(verifications, "send_email", fake_send_email)

    base = base_role()
    session.add(base)
    base_name = base.name
    user = await make_user(session, "newbie", is_email_verified=False)
    user_id = user.id

    response = await client.post(
        app.url_path_for("create_email_token"),
        headers=headers_for(user),
        json={"token_type": TokenType.EMAIL_VERIFICATION},
    )
    assert response.status_code == codes.OK

    response = await client.post(
        app.url_path_for("verify_email_token", token=sent["token"]),
        headers=headers_for(user),
    )
    assert response.status_code == codes.OK
    assert response.json()["success"] is True

    session.expire_all()
    verified = await session.scalar(select(User).where(User.id == user_id))
    assert verified.is_email_verified is True
    assert await fresh_role_names(session, user_id) == {base_name}


# --------------------------------------------------------------------------
# LOCKOUT is read after IS_SUPERUSER, at login and in PermittedUserChecker
# --------------------------------------------------------------------------


async def test_locked_out_user_cannot_log_in(
    client: AsyncClient, session: AsyncSession
):
    jail = make_role("Jail", permissions=[Permissions.LOCKOUT], priority=1000)
    session.add(jail)
    user = await make_user(session, "jailed", roles=[jail], password="rightpassword")

    response = await client.post(
        app.url_path_for("login_user"),
        data={"username": "jailed", "password": "rightpassword"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    # The credentials are correct; the refusal is the lockout, and it says so
    # rather than pretending the password is wrong.
    assert response.status_code == codes.FORBIDDEN
    assert response.json()["detail"] == ACCOUNT_DISABLED


async def test_locked_out_superuser_can_still_log_in(
    client: AsyncClient, session: AsyncSession
):
    """IS_SUPERUSER is read before LOCKOUT, so a superuser is never locked out.

    Load-bearing and invisible: it is what stops a superuser role, which now
    carries LOCKOUT along with every other permission, from locking its own
    holder out of the site.
    """
    super_admin = make_role(
        "Super Admin",
        permissions=[Permissions.IS_SUPERUSER, Permissions.LOCKOUT],
        priority=1000,
    )
    session.add(super_admin)
    await make_user(session, "deity", roles=[super_admin], password="rightpassword")

    response = await client.post(
        app.url_path_for("login_user"),
        data={"username": "deity", "password": "rightpassword"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    assert response.status_code == codes.OK
    assert "access_token" in response.json()


async def test_locked_out_user_is_refused_by_permitted_user_checker(
    client: AsyncClient, session: AsyncSession
):
    """An existing token must stop working too, not just new logins."""
    jail = make_role("Jail", permissions=[Permissions.LOCKOUT], priority=1000)
    session.add(jail)
    user = await make_user(session, "jailed", roles=[jail])

    response = await client.get(
        app.url_path_for("get_current_user"), headers=headers_for(user)
    )

    assert response.status_code == codes.FORBIDDEN
    assert response.json()["detail"] == ACCOUNT_DISABLED


async def test_locked_out_superuser_passes_permitted_user_checker(
    client: AsyncClient, session: AsyncSession
):
    super_admin = make_role(
        "Super Admin",
        permissions=[Permissions.IS_SUPERUSER, Permissions.LOCKOUT],
        priority=1000,
    )
    session.add(super_admin)
    user = await make_user(session, "deity", roles=[super_admin])

    response = await client.get(
        app.url_path_for("get_current_user"), headers=headers_for(user)
    )

    assert response.status_code == codes.OK
    assert response.json()["RCSID"] == "deity"


async def test_verifying_does_not_duplicate_a_base_role_already_held(
    client: AsyncClient, session: AsyncSession, monkeypatch
):
    """Verification must survive the member already having the base role.

    The grant used to be unconditional, and user_role_association has
    (user_id, role_id) as its primary key, so appending a role the member
    already held failed the insert and the whole verification 500'd.
    """
    sent = {}

    async def fake_send_email(email, token, token_type, first_name=None):
        sent["token"] = token

    monkeypatch.setattr(verifications, "send_email", fake_send_email)

    base = base_role()
    session.add(base)
    base_name = base.name
    user = await make_user(
        session, "earlybird", roles=[base], is_email_verified=False
    )
    user_id = user.id

    response = await client.post(
        app.url_path_for("create_email_token"),
        headers=headers_for(user),
        json={"token_type": TokenType.EMAIL_VERIFICATION},
    )
    assert response.status_code == codes.OK

    response = await client.post(
        app.url_path_for("verify_email_token", token=sent["token"]),
        headers=headers_for(user),
    )
    assert response.status_code == codes.OK
    assert response.json()["success"] is True
    assert await fresh_role_names(session, user_id) == {base_name}
