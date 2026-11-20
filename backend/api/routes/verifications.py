"""Email authentication token endpoints."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from azure.communication.email import EmailClient
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func

from core.config import settings
from models.auth_token import AuthToken
from models.user import User
from core.security import get_password_hash
from schemas.enums import TokenType
from schemas.requests import VerificationTokenRequest, ResetPasswordRequest, ResetPasswordTokenRequest
from schemas.responses import VerificationTokenResponse

from ..deps import DBSession, PermittedUserChecker
from ..utils import get_base_role


router = APIRouter()


async def create_token(
    session: DBSession,
    tokenType: TokenType,
    current_user: User
):

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()

    minutes = 15 if tokenType == TokenType.PASSWORD_RESET else 60
    auth_token = AuthToken(
        user_id=current_user.id,
        token_hash=token_hash,
        token_type=tokenType,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=minutes),
    )

    session.add(auth_token)
    await session.commit()

    # The raw token is deliberately never stored (only token_hash is) so that it
    # cannot be recovered from the database. Printing it defeated that: it covers
    # password resets as well, so anyone able to read the logs could take over an
    # account within the token's validity window.
    await send_email(
        f"{current_user.RCSID}@rpi.edu",
        token,
        tokenType,
        first_name=current_user.first_name,
    )

    return VerificationTokenResponse(token_type=tokenType, success=True)


SENDER_ADDRESS = "DoNotReply@notifications.rpiforge.dev"

# Per-token-type copy. The wording matters as much as the markup here: a bare
# link with no sender, no context and no "ignore this if it wasn't you" line is
# what makes a legitimate transactional email read as phishing.
_EMAIL_CONTENT = {
    TokenType.EMAIL_VERIFICATION: {
        "subject": "Verify your Forge account",
        "path": "verify-email",
        "heading": "Verify your account",
        "lede": (
            "you're nearly set up at The Forge, RPI's student-run makerspace. "
            "Confirm this is your email address and your account will be ready "
            "to use."
        ),
        "action": "Verify my account",
        "expiry": "1 hour",
        "ignore": (
            "If you didn't create a Forge account, you can ignore this email "
            "and nothing will happen."
        ),
        "error_detail": "Failed to send email verification email.",
    },
    TokenType.PASSWORD_RESET: {
        "subject": "Reset your Forge password",
        "path": "reset",
        "heading": "Reset your password",
        "lede": (
            "we got a request to reset the password on your Forge account. "
            "You can choose a new one using the link below."
        ),
        "action": "Reset my password",
        "expiry": "15 minutes",
        "ignore": (
            "If you didn't ask to reset your password, you can ignore this "
            "email - your current password will keep working."
        ),
        "error_detail": "Failed to send password reset email.",
    },
}


def _render_email(copy, url, first_name):
    """Build the plain-text and HTML bodies for a token email.

    Kept deliberately plain: a white card on the light background, one red
    call to action, and small grey fine print. Colours come from the tokens in
    styles/globals.scss (--color-navy #111c36, --color-red #a51c1c,
    --color-slate #64748b, --color-bg-light #eef2f8, --color-border #e0e7f0,
    --color-divider #e2e8f0) so it sits with the rest of the new UI without
    trying to be a landing page.

    Styles are inline and the layout is a table because clients strip <style>
    blocks and Outlook renders through Word. There are no remote images:
    blocked images make a message look more suspicious, not less.
    """
    greeting = f"Hi {first_name}," if first_name else "Hi,"

    plain_text = (
        f"{greeting}\n\n"
        f"{copy['lede'][0].upper()}{copy['lede'][1:]}\n\n"
        f"{copy['action']}:\n"
        f"{url}\n\n"
        f"This link expires in {copy['expiry']}.\n\n"
        f"{copy['ignore']}\n\n"
        "--\n"
        "The Forge - Rensselaer Polytechnic Institute\n"
        "This is an automated message; replies to this address aren't monitored."
    )

    # Funnel Display is the new UI's body font. Most clients ignore the
    # stylesheet link, so the rules keep a Helvetica/Arial fallback.
    font = "'Funnel Display','Helvetica Neue',Helvetica,Arial,sans-serif"

    html = (
        '<!DOCTYPE html><html><head>'
        '<meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<link href="https://fonts.googleapis.com/css2?family=Funnel+Display:wght@300..800'
        '&display=swap" rel="stylesheet">'
        '</head>'
        f'<body bgcolor="#eef2f8" style="margin:0;padding:0;background-color:#eef2f8;font-family:{font};">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
        ' bgcolor="#eef2f8" style="background-color:#eef2f8;padding:32px 12px;">'
        '<tr><td align="center">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
        ' bgcolor="#ffffff" style="max-width:520px;background-color:#ffffff;'
        'border:1px solid #e0e7f0;border-radius:10px;">'
        '<tr><td style="padding:30px 32px;">'

        f'<div style="font-family:{font};font-size:14px;font-weight:700;color:#111c36;'
        'padding-bottom:22px;">The Forge</div>'

        f'<h1 style="margin:0 0 14px;font-family:{font};font-weight:700;font-size:20px;'
        f'line-height:1.3;color:#111c36;">{copy["heading"]}</h1>'

        f'<p style="margin:0 0 22px;font-family:{font};font-size:15px;line-height:1.55;'
        f'color:#3f4a60;">{greeting} {copy["lede"]}</p>'

        f'<div style="margin:0 0 22px;"><a href="{url}"'
        f' style="display:inline-block;background-color:#a51c1c;color:#ffffff;text-decoration:none;'
        f'font-family:{font};font-size:15px;font-weight:600;padding:11px 22px;'
        f'border-radius:8px;">{copy["action"]}</a></div>'

        f'<p style="margin:0 0 20px;font-family:{font};font-size:12px;line-height:1.5;'
        'color:#64748b;word-break:break-all;">Or paste this link into your browser:<br>'
        f'<a href="{url}" style="color:#2d4a80;">{url}</a></p>'

        '<div style="height:1px;line-height:1px;font-size:0;background-color:#e2e8f0;'
        'margin:0 0 18px;">&nbsp;</div>'

        f'<p style="margin:0 0 6px;font-family:{font};font-size:12px;line-height:1.5;'
        f'color:#64748b;">This link expires in {copy["expiry"]}. {copy["ignore"]}</p>'

        f'<p style="margin:0;font-family:{font};font-size:12px;line-height:1.5;color:#8d9bb0;">'
        "The Forge, RPI. Automated message — replies aren't monitored."
        '</p>'

        '</td></tr></table></td></tr></table></body></html>'
    )

    return plain_text, html


async def send_email(email, token, token_type, first_name=None):
    copy = _EMAIL_CONTENT.get(token_type)
    if copy is None:
        # Previously an unrecognised type fell through and returned None while
        # the caller still reported success, so no email was sent and nobody
        # found out.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"No email template for token type {token_type}.",
        )

    client = EmailClient.from_connection_string(
        settings.AZURE_COMMUNICATION_CONNECTION_STRING
    )

    url = f"{settings.BACKEND_CORS_ORIGINS[0]}{copy['path']}/{token}"
    plain_text, html = _render_email(copy, url, first_name)

    message = {
        "senderAddress": SENDER_ADDRESS,
        "recipients": {"to": [{"address": email}]},
        "content": {
            "subject": copy["subject"],
            "plainText": plain_text,
            "html": html,
        },
    }

    poller = client.begin_send(message)
    result = poller.result()
    if result["status"] != "Succeeded" or result["error"] is not None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=copy["error_detail"],
        )

    return VerificationTokenResponse(token_type=token_type, success=True)


async def check_token(
    session: DBSession, 
    tokenType: TokenType,
    token: str, 
    current_user: User,
    return_token: bool = False
):
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()

    auth_token = await session.scalar(
        select(AuthToken).where(
            AuthToken.token_hash == token_hash,
            AuthToken.token_type == tokenType,
            AuthToken.used_at.is_(None),
        )
    )

    if (not auth_token or (tokenType == TokenType.EMAIL_VERIFICATION and auth_token.user_id != current_user.id)):
        if (return_token):
            return VerificationTokenResponse(token_type=tokenType, success=False), None
        return VerificationTokenResponse(token_type=tokenType, success=False)

    now = datetime.now(timezone.utc)

    if not auth_token or auth_token.expires_at <= now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token.",
        )

    if (return_token):
        return VerificationTokenResponse(token_type=tokenType, success=True), auth_token
    return VerificationTokenResponse(token_type=tokenType, success=True)


@router.post("/email-verification/{token}")
async def verify_email_token(
    token: str, 
    session: DBSession,
    current_user: Annotated[User, Depends(PermittedUserChecker(set()))],
):
    """Verify an account with an email verification token."""

    response, auth_token = await check_token(session, TokenType.EMAIL_VERIFICATION, token, current_user, True)
    if (not response.success):
        return response

    current_user.is_email_verified = True

    # Along with verification we also let them use machines. A member holds
    # exactly one role, so this only applies to someone who has none yet --
    # an account that was given a role before verifying keeps it.
    if not current_user.roles:
        role = await get_base_role(session)
        if role:
            current_user.roles = [role]
            session.add(current_user)

    # TODO add something that regularly deletes old used tokens
    auth_token.used_at = datetime.now(timezone.utc)
    await session.commit()

    return VerificationTokenResponse(token_type=TokenType.EMAIL_VERIFICATION, success=True)


@router.post("/password-verification/{token}")
async def reset_password(
    token: str,
    session: DBSession,
    request: ResetPasswordRequest,
):
    """Reset a user's password with a valid password reset token."""

    response, auth_token = await check_token(session, TokenType.PASSWORD_RESET, token, None, True)
    if not response.success:
        return response

    user = await session.get(User, auth_token.user_id)
    if user is None or user.RCSID.lower() != request.rcsid.lower():
        return VerificationTokenResponse(token_type=TokenType.PASSWORD_RESET, success=False)

    user.hashed_password = get_password_hash(request.new_password)
    auth_token.used_at = datetime.now(timezone.utc)
    await session.commit()

    return VerificationTokenResponse(token_type=TokenType.PASSWORD_RESET, success=True)


@router.get("/email-verification/{token}")
async def get_email_verification(
    token: str,
    session: DBSession,
    current_user: Annotated[User, Depends(PermittedUserChecker(set()))],
):
    """Check whether an email verification token is valid."""

    return await check_token(session, TokenType.EMAIL_VERIFICATION, token, current_user)


@router.get("/password-verification/{token}")
async def get_password_verification(
    token: str,
    session: DBSession,
):
    """Check whether a reset password token is valid."""

    return await check_token(session, TokenType.PASSWORD_RESET, token, None)


@router.post("/email-verification")
async def create_email_token(
    session: DBSession,
    request: VerificationTokenRequest,
    current_user: Annotated[User, Depends(PermittedUserChecker(set()))],
):
    """Create and send an email verification token to the user's RPI email."""

    if (request.token_type != TokenType.EMAIL_VERIFICATION):
       return VerificationTokenResponse(token_type=request.token_type, success=False)
    
    return await create_token(session, request.token_type, current_user)


@router.post("/password-verification")
async def create_password_token(
    session: DBSession,
    request: ResetPasswordTokenRequest,
):
    """Create and send a password reset token to the user's RPI email."""

    current_user = await session.scalar(
        select(User).where(
            func.lower(User.RCSID) == request.rcsid.lower()
        )
    )

    if (not current_user or request.token_type != TokenType.PASSWORD_RESET):
       return VerificationTokenResponse(token_type=request.token_type, success=False)
        
    return await create_token(session, request.token_type, current_user)