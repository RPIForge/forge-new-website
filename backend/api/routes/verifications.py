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
from models.role import Role
from core.security import get_password_hash
from schemas.enums import TokenType, Permissions
from schemas.requests import VerificationTokenRequest, ResetPasswordRequest, ResetPasswordTokenRequest
from schemas.responses import VerificationTokenResponse

from ..deps import DBSession, PermittedUserChecker


MACHINE_USAGE_MINIMUM = [Permissions.CAN_USE_MACHINES, Permissions.CAN_SEE_MACHINES, Permissions.CAN_SEE_RESOURCE_SLOTS, Permissions.CAN_SEE_RESOURCES, Permissions.CAN_SEE_SEMESTERS]

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

# Accent matches #d40000 in VerifyEmail.scss / ResetPassword.scss, so the email
# looks like it belongs to the page it sends people to.
_ACCENT = "#d40000"

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

    Both are sent: plain text for clients that don't render HTML, and HTML so
    the message reads as a real email from The Forge rather than an unexplained
    link. Styles are inline and there are no remote images, since blocked
    images make a message look more suspicious, not less.
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

    html = (
        '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;'
        'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
        ' style="background:#f4f4f5;padding:24px 12px;"><tr><td align="center">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
        ' style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:8px;">'
        '<tr><td style="padding:20px 28px;border-bottom:1px solid #e4e4e7;">'
        f'<span style="font-size:15px;font-weight:700;letter-spacing:0.08em;color:{_ACCENT};">THE FORGE</span>'
        '<span style="font-size:13px;color:#71717a;"> &middot; Rensselaer Polytechnic Institute</span>'
        '</td></tr>'
        '<tr><td style="padding:28px;">'
        f'<h1 style="margin:0 0 16px;font-size:19px;font-weight:600;color:#18181b;">{copy["heading"]}</h1>'
        f'<p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#3f3f46;">{greeting} {copy["lede"]}</p>'
        f'<p style="margin:0 0 24px;"><a href="{url}"'
        f' style="display:inline-block;background:{_ACCENT};color:#ffffff;text-decoration:none;'
        f'font-size:15px;font-weight:600;padding:12px 24px;border-radius:6px;">{copy["action"]}</a></p>'
        '<p style="margin:0 0 6px;font-size:13px;color:#52525b;">Or copy this link into your browser:</p>'
        f'<p style="margin:0 0 24px;font-size:12px;word-break:break-all;">'
        f'<a href="{url}" style="color:{_ACCENT};">{url}</a></p>'
        f'<p style="margin:0 0 8px;font-size:13px;color:#52525b;">This link expires in {copy["expiry"]}.</p>'
        f'<p style="margin:0;font-size:13px;color:#52525b;">{copy["ignore"]}</p>'
        '</td></tr>'
        '<tr><td style="padding:16px 28px;border-top:1px solid #e4e4e7;font-size:12px;'
        'line-height:1.5;color:#71717a;">'
        "Sent by The Forge, RPI's student-run makerspace. This is an automated message; "
        "replies to this address aren't monitored."
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

    # along with verification we also let them use machines
    role = await session.scalar(
        select(Role).where(
            Role.permissions.op("@>")(MACHINE_USAGE_MINIMUM),
            func.cardinality(Role.permissions) == len(MACHINE_USAGE_MINIMUM),
        )
    )

    if (role):
        current_user.roles.append(role)
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