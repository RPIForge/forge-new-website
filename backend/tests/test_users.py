from httpx import AsyncClient, codes
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from main import app
from models import User
from .conftest import default_user_object, default_user_password
from api.routes import verifications
from schemas.enums import TokenType


async def test_read_current_user(client: AsyncClient, default_user_headers):
    response = await client.get(
        app.url_path_for("get_current_user"), headers=default_user_headers
    )
    assert response.status_code == codes.OK

    # /me used to return just the three identity fields this test compared the
    # whole body against. It now returns the full UserNoHash, including the
    # resolved permission set and the display role, so the fields are checked
    # individually rather than by equality.
    body = response.json()
    assert body["RCSID"] == default_user_object.RCSID
    assert body["first_name"] == default_user_object.first_name
    assert body["last_name"] == default_user_object.last_name
    assert body["permissions"] == []
    assert body["display_role"] == ""


async def test_reset_password_with_token(
    client: AsyncClient, default_user: User, session: AsyncSession, monkeypatch
):
    """Replaces test_reset_current_user_password.

    That test posted to `reset_current_user_password`, an endpoint which does
    not exist and has no equivalent: a logged-in user cannot set their own
    password directly any more. Password resets go through an emailed token,
    so the same user-facing behaviour is covered here through that flow, with
    the Azure email send stubbed out.
    """

    sent = {}

    async def fake_send_email(email, token, token_type, first_name=None):
        sent["email"] = email
        sent["token"] = token

    monkeypatch.setattr(verifications, "send_email", fake_send_email)

    response = await client.post(
        app.url_path_for("create_password_token"),
        json={
            "token_type": TokenType.PASSWORD_RESET,
            "rcsid": default_user_object.RCSID,
        },
    )
    assert response.status_code == codes.OK
    assert response.json()["success"] is True
    assert sent["email"] == f"{default_user_object.RCSID}@rpi.edu"

    new_password = "testxxxxxx"
    response = await client.post(
        app.url_path_for("reset_password", token=sent["token"]),
        json={"rcsid": default_user_object.RCSID, "new_password": new_password},
    )
    assert response.status_code == codes.OK
    assert response.json()["success"] is True

    user = await session.scalar(
        select(User).where(User.RCSID == default_user_object.RCSID)
    )
    assert user is not None
    assert user.hashed_password != default_user_object.hashed_password

    response = await client.post(
        app.url_path_for("login_user"),
        data={
            "username": default_user_object.RCSID,
            "password": new_password,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code == codes.OK

    response = await client.post(
        app.url_path_for("login_user"),
        data={
            "username": default_user_object.RCSID,
            "password": default_user_password,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code == codes.UNAUTHORIZED


async def test_register_new_user(
    client: AsyncClient, default_user_headers, session: AsyncSession
):
    # Signup takes snake_case keys (the request models have no camelCase
    # aliases), gender_identity is a string enum rather than an int, and
    # is_graduating is required.
    response = await client.post(
        app.url_path_for("register_user"),
        headers=default_user_headers,
        json={
            "RCSID": "obamab",
            "RIN": "123456789",
            "first_name": "Barack",
            "last_name": "Obama",
            "major": "Political Science",
            "gender_identity": "male",
            "pronouns": "he_him",
            "password": "BarackObama",
            "is_graduating": False,
        },
    )
    assert response.status_code == codes.OK
    user = await session.scalar(select(User).where(User.RCSID == "obamab"))
    assert user is not None
    # New accounts start unverified and with no roles; the base role is only
    # granted once the email verification token is used.
    assert user.is_email_verified is False
