import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.core.config import settings
from app.core.crypto import decrypt_text
from app.core.limiter import enforce_rate_limit
from app.db.session import get_db
from app.models.profile import Profile
from app.repositories import connection as connection_repo
from app.repositories import slack as slack_repo
from app.schemas.connection import OAuthStartResponse
from app.schemas.slack import (
    SlackConnectRequest,
    SlackDisconnectResponse,
    SlackStatusResponse,
    SlackTestResponse,
)
from app.services import slack as slack_service
from app.services.slack import SlackApiError, SlackOAuthError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/connections/slack", tags=["slack-connection"])
integrations_router = APIRouter(prefix="/integrations/slack", tags=["slack-integrations"])
api_router = APIRouter(prefix="/api/connections/slack", tags=["slack-connection"])
api_integrations_router = APIRouter(prefix="/api/integrations/slack", tags=["slack-integrations"])


# Helper to build clean frontend redirect target
def _build_frontend_redirect(return_to: str, param: str) -> str:
    target_path = "app/onboarding/4" if return_to == "onboarding" else "dashboard"
    base = settings.FRONTEND_URL.rstrip("/")
    return f"{base}/{target_path}?{param}"



# 1. Connect / Start: initiates single-use OAuth state and returns Slack authorize URL
@router.post("/connect", response_model=OAuthStartResponse)
@router.post("/start", response_model=OAuthStartResponse)
@integrations_router.post("/connect", response_model=OAuthStartResponse)
@integrations_router.post("/start", response_model=OAuthStartResponse)
@api_router.post("/connect", response_model=OAuthStartResponse)
@api_router.post("/start", response_model=OAuthStartResponse)
@api_integrations_router.post("/connect", response_model=OAuthStartResponse)
@api_integrations_router.post("/start", response_model=OAuthStartResponse)
def start_slack_connect(
    payload: Optional[SlackConnectRequest] = None,
    return_to: str = Query(default="dashboard"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> OAuthStartResponse:
    # Rate limit connect requests per user (10 per minute)
    enforce_rate_limit(
        key=f"rate_limit:slack_connect:{user.id}",
        max_requests=10,
        window_seconds=60,
        error_message="Too many Slack connection attempts. Please wait a minute.",
    )

    # Determine return_to destination strictly as onboarding or dashboard
    chosen_return_to = payload.return_to if payload else return_to
    if chosen_return_to not in ("onboarding", "dashboard"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_return_to", "message": "return_to must be 'onboarding' or 'dashboard'"},
        )

    # Create single-use state (10 minute expiry, tied to user)
    raw_state = connection_repo.create_oauth_state(
        db,
        user_id=user.id,
        provider="slack",
        return_to=chosen_return_to,
    )

    authorization_url = slack_service.build_authorization_url(raw_state)
    return OAuthStartResponse(
        authorization_url=authorization_url,
        authorize_url=authorization_url,
    )


# 2. Callback: public endpoint handling redirect from Slack
@router.get("/callback")
@integrations_router.get("/callback")
@api_router.get("/callback")
@api_integrations_router.get("/callback")
def slack_oauth_callback(
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    redirect_uri: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    if not state:
        logger.warning("Slack callback received without state parameter")
        return RedirectResponse(
            url=_build_frontend_redirect("dashboard", "slack=invalid_state"),
            status_code=status.HTTP_302_FOUND,
        )

    # 1. Validate and burn the state atomically
    claimed = connection_repo.claim_public_oauth_state(db, raw_state=state)
    if not claimed:
        logger.warning("Slack callback state is invalid, expired, or already used")
        return RedirectResponse(
            url=_build_frontend_redirect("dashboard", "slack=invalid_state"),
            status_code=status.HTTP_302_FOUND,
        )

    user_id = claimed["user_id"]
    return_to = claimed.get("return_to") or "dashboard"

    # 2. Check for user cancellation or Slack error
    if error == "access_denied":
        logger.info("User denied Slack app authorization")
        return RedirectResponse(
            url=_build_frontend_redirect(return_to, "slack=denied"),
            status_code=status.HTTP_302_FOUND,
        )

    if not code:
        logger.warning(f"Slack callback missing code parameter. Error: {error}")
        return RedirectResponse(
            url=_build_frontend_redirect(return_to, "slack=error"),
            status_code=status.HTTP_302_FOUND,
        )

    # 3. Exchange code for access token at oauth.v2.access
    try:
        if redirect_uri:
            token_info = slack_service.exchange_code_for_token(code, redirect_uri=redirect_uri)
        else:
            token_info = slack_service.exchange_code_for_token(code)
    except SlackOAuthError as exc:
        logger.warning(f"Slack OAuth token exchange failed: {exc.error_code}")
        return RedirectResponse(
            url=_build_frontend_redirect(return_to, f"slack={exc.error_code}"),
            status_code=status.HTTP_302_FOUND,
        )
    except Exception as exc:
        logger.error(f"Unexpected error during Slack token exchange: {exc}")
        return RedirectResponse(
            url=_build_frontend_redirect(return_to, "slack=error"),
            status_code=status.HTTP_302_FOUND,
        )

    access_token = token_info["access_token"]
    bot_user_id = token_info["bot_user_id"]
    team_id = token_info["team_id"]
    team_name = token_info["team_name"]
    slack_user_id = token_info["slack_user_id"]

    if not access_token or not slack_user_id or not team_id or not bot_user_id:
        logger.error("Slack OAuth response missing required fields")
        return RedirectResponse(
            url=_build_frontend_redirect(return_to, "slack=incomplete_response"),
            status_code=status.HTTP_302_FOUND,
        )

    # 4. Open 1-to-1 DM with installing user via conversations.open
    try:
        dm_channel_id = slack_service.open_dm_channel(
            bot_token=access_token,
            slack_user_id=slack_user_id,
        )
    except SlackApiError as exc:
        logger.warning(f"Failed to open Slack DM channel: {exc.error_code}")
        return RedirectResponse(
            url=_build_frontend_redirect(return_to, "slack=dm_failed"),
            status_code=status.HTTP_302_FOUND,
        )
    except Exception as exc:
        logger.error(f"Unexpected error opening Slack DM: {exc}")
        return RedirectResponse(
            url=_build_frontend_redirect(return_to, "slack=error"),
            status_code=status.HTTP_302_FOUND,
        )

    # 5. Encrypt token with Fernet and atomically upsert row by user_id
    # Sets profiles.slack_approval_enabled to true on first connect
    slack_repo.upsert_slack_integration(
        db=db,
        user_id=user_id,
        team_id=team_id,
        team_name=team_name,
        slack_user_id=slack_user_id,
        dm_channel_id=dm_channel_id,
        bot_token=access_token,
        bot_user_id=bot_user_id,
    )

    # 6. Redirect to frontend using return_to
    return RedirectResponse(
        url=_build_frontend_redirect(return_to, "slack=connected"),
        status_code=status.HTTP_302_FOUND,
    )


# 3. Status: returns current Slack integration status for authenticated caller
@router.get("/status", response_model=SlackStatusResponse)
@integrations_router.get("/status", response_model=SlackStatusResponse)
def get_slack_status(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> SlackStatusResponse:
    integration = slack_repo.get_slack_integration(db, user_id=user.id)
    profile = db.query(Profile).filter(Profile.user_id == user.id).first()
    slack_enabled = profile.slack_approval_enabled if profile else False

    if not integration:
        return SlackStatusResponse(
            connected=False,
            status="disconnected",
            team_id=None,
            team_name=None,
            connected_at=None,
            last_error=None,
            slack_user_id=None,
            dm_channel_id=None,
            slack_approval_enabled=slack_enabled,
        )

    is_connected = integration.status == "connected"
    return SlackStatusResponse(
        connected=is_connected,
        status="connected" if is_connected else "disconnected",
        team_id=integration.team_id,
        team_name=integration.team_name,
        connected_at=integration.created_at.isoformat() if getattr(integration, "created_at", None) else None,
        last_error=integration.last_error,
        slack_user_id=integration.slack_user_id,
        dm_channel_id=integration.dm_channel_id,
        slack_approval_enabled=slack_enabled,
    )


# 4. Test: sends a test DM notification to verify delivery
@router.post("/test", response_model=SlackTestResponse)
@integrations_router.post("/test", response_model=SlackTestResponse)
def test_slack_connection(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> SlackTestResponse:
    # Rate limit test attempts per user (5 per minute)
    enforce_rate_limit(
        key=f"rate_limit:slack_test:{user.id}",
        max_requests=5,
        window_seconds=60,
        error_message="Too many test messages. Please wait a minute before trying again.",
    )

    integration = slack_repo.get_slack_integration(db, user_id=user.id)
    if not integration or integration.status != "connected" or not integration.bot_token_encrypted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "slack_not_connected", "message": "Slack is not connected. Please connect Slack first."},
        )

    try:
        plain_token = decrypt_text(integration.bot_token_encrypted)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "decryption_failed", "message": "Could not decrypt Slack token. Please reconnect."},
        )

    try:
        slack_service.send_test_message(
            bot_token=plain_token,
            channel_id=integration.dm_channel_id,
        )
    except SlackApiError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "slack_send_failed", "message": f"Slack API error: {exc.error_code}"},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "slack_send_failed", "message": "Failed to send test message to Slack."},
        )

    return SlackTestResponse(
        sent=True,
        status="ok",
        message="Test message sent to your Slack direct messages",
    )


# 5. Disconnect: best-effort revocation, deletes encrypted token, sets status disconnected
@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
@integrations_router.delete("", status_code=status.HTTP_204_NO_CONTENT)
@api_router.delete("", status_code=status.HTTP_204_NO_CONTENT)
@api_integrations_router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def disconnect_slack(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Response:
    slack_repo.disconnect_slack_integration(db, user_id=user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


