import logging
from typing import Any, Dict, List, Optional, Tuple
import uuid
from urllib.parse import urlencode
import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

SLACK_OAUTH_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize"
SLACK_OAUTH_ACCESS_URL = "https://slack.com/api/oauth.v2.access"
SLACK_CONVERSATIONS_OPEN_URL = "https://slack.com/api/conversations.open"
SLACK_CHAT_POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage"
SLACK_CHAT_UPDATE_URL = "https://slack.com/api/chat.update"
SLACK_AUTH_REVOKE_URL = "https://slack.com/api/auth.revoke"
SLACK_FILES_GET_UPLOAD_URL = "https://slack.com/api/files.getUploadURLExternal"
SLACK_FILES_COMPLETE_UPLOAD = "https://slack.com/api/files.completeUploadExternal"


class SlackError(Exception):
    """Base exception for Slack integration errors."""
    pass


class SlackOAuthError(SlackError):
    """Raised when Slack OAuth code exchange fails."""
    def __init__(self, error_code: str):
        super().__init__(f"Slack OAuth error: {error_code}")
        self.error_code = error_code


class SlackApiError(SlackError):
    """Raised when a Slack Web API call fails."""
    def __init__(self, error_code: str):
        super().__init__(f"Slack API error: {error_code}")
        self.error_code = error_code


class SlackAuthRevokedError(SlackError):
    """Raised when Slack token is revoked or auth is invalid."""
    def __init__(self, error_code: str):
        super().__init__(f"Slack token invalid or revoked: {error_code}")
        self.error_code = error_code



def get_slack_redirect_uri() -> str:
    """Returns the configured or default Slack OAuth redirect URI."""
    if settings.SLACK_REDIRECT_URI:
        return settings.SLACK_REDIRECT_URI
    return f"{settings.APP_BASE_URL.rstrip('/')}/connections/slack/callback"


def build_authorization_url(raw_state: str) -> str:
    """Builds the Slack OAuth v2 authorization URL with required scopes."""
    params = {
        "client_id": settings.SLACK_CLIENT_ID or "",
        "scope": settings.SLACK_SCOPES,
        "redirect_uri": get_slack_redirect_uri(),
        "state": raw_state,
    }
    return f"{SLACK_OAUTH_AUTHORIZE_URL}?{urlencode(params)}"


def exchange_code_for_token(code: str, redirect_uri: Optional[str] = None) -> Dict[str, Any]:
    """
    Exchanges authorization code at oauth.v2.access.
    Never logs the token, code, or raw response body.
    """
    effective_redirect_uri = redirect_uri or get_slack_redirect_uri()
    payload = {
        "client_id": settings.SLACK_CLIENT_ID or "",
        "client_secret": settings.SLACK_CLIENT_SECRET or "",
        "code": code,
        "redirect_uri": effective_redirect_uri,
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(SLACK_OAUTH_ACCESS_URL, data=payload)
            data = resp.json()
    except Exception as exc:
        logger.error("Failed to connect to Slack oauth.v2.access")
        raise SlackOAuthError("network_error") from exc

    if not data.get("ok"):
        err = data.get("error", "unknown_error")
        logger.warning(f"Slack OAuth exchange rejected with error code: {err}")
        raise SlackOAuthError(err)

    # Extract required fields without logging any secrets
    team_data = data.get("team") or {}
    authed_user = data.get("authed_user") or {}

    return {
        "access_token": data.get("access_token"),
        "bot_user_id": data.get("bot_user_id"),
        "team_id": team_data.get("id"),
        "team_name": team_data.get("name"),
        "slack_user_id": authed_user.get("id"),
    }


def open_dm_channel(bot_token: str, slack_user_id: str) -> str:
    """
    Opens a 1-to-1 direct message conversation with the user and returns channel ID.
    Never logs the bot token or response body.
    """
    headers = {
        "Authorization": f"Bearer {bot_token}",
        "Content-Type": "application/json",
    }
    payload = {"users": slack_user_id}

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(SLACK_CONVERSATIONS_OPEN_URL, json=payload, headers=headers)
            data = resp.json()
    except Exception as exc:
        logger.error("Failed to connect to Slack conversations.open")
        raise SlackApiError("network_error") from exc

    if not data.get("ok"):
        err = data.get("error", "unknown_error")
        logger.warning(f"Slack conversations.open failed with error code: {err}")
        raise SlackApiError(err)

    channel = data.get("channel") or {}
    channel_id = channel.get("id")
    if not channel_id:
        raise SlackApiError("channel_id_missing")
    return channel_id


def send_test_message(bot_token: str, channel_id: str) -> None:
    """
    Sends a test confirmation DM to verify channel posting permissions.
    """
    headers = {
        "Authorization": f"Bearer {bot_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "channel": channel_id,
        "text": "AutoPulse Slack integration is connected and working! 🎉 You will receive post approval notifications here.",
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(SLACK_CHAT_POST_MESSAGE_URL, json=payload, headers=headers)
            data = resp.json()
    except Exception as exc:
        logger.error("Failed to send test message via Slack chat.postMessage")
        raise SlackApiError("network_error") from exc

    if not data.get("ok"):
        err = data.get("error", "unknown_error")
        logger.warning(f"Slack chat.postMessage test failed with error code: {err}")
        raise SlackApiError(err)


def revoke_token_best_effort(bot_token: str) -> None:
    """
    Attempts best-effort token revocation at Slack auth.revoke.
    Never blocks or raises on failure.
    """
    if not bot_token:
        return
    headers = {
        "Authorization": f"Bearer {bot_token}",
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            client.post(SLACK_AUTH_REVOKE_URL, headers=headers)
    except Exception as exc:
        logger.debug(f"Slack auth.revoke best-effort call encountered exception: {exc}")


def upload_file_external(
    bot_token: str,
    file_bytes: bytes,
    filename: str = "post_preview.png",
) -> Optional[str]:
    """
    Uploads a file to Slack using the external upload flow:
    1. files.getUploadURLExternal to get upload_url and file_id
    2. POST raw bytes to upload_url
    3. files.completeUploadExternal to finalize upload
    Returns file_id (e.g. F...) on success, None on error.
    """
    if not file_bytes:
        return None

    headers = {"Authorization": f"Bearer {bot_token}"}
    params = {"filename": filename, "length": len(file_bytes)}

    try:
        with httpx.Client(timeout=20.0) as client:
            # 1. Get upload URL
            step1_resp = client.get(SLACK_FILES_GET_UPLOAD_URL, headers=headers, params=params)
            step1_data = step1_resp.json()
            if not step1_data.get("ok"):
                logger.warning(f"files.getUploadURLExternal error: {step1_data.get('error')}")
                return None

            upload_url = step1_data.get("upload_url")
            file_id = step1_data.get("file_id")
            if not upload_url or not file_id:
                return None

            # 2. Upload bytes
            upload_resp = client.post(
                upload_url,
                content=file_bytes,
                headers={"Content-Type": "image/png"},
            )
            if upload_resp.status_code != 200:
                logger.warning(f"Slack external upload storage error: HTTP {upload_resp.status_code}")
                return None

            # 3. Complete upload
            step3_payload = {"files": [{"id": file_id, "title": "Post Graphic Preview"}]}
            step3_resp = client.post(
                SLACK_FILES_COMPLETE_UPLOAD,
                headers={"Authorization": f"Bearer {bot_token}", "Content-Type": "application/json"},
                json=step3_payload,
            )
            step3_data = step3_resp.json()
            if not step3_data.get("ok"):
                logger.warning(f"files.completeUploadExternal error: {step3_data.get('error')}")
                return None

            return file_id
    except Exception as exc:
        logger.warning(f"External file upload to Slack failed: {exc}")
        return None


def build_approval_blocks(
    post_id: uuid.UUID,
    caption: str,
    topic_title: str,
    image_file_id: Optional[str] = None,
    signed_image_url: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Builds the Block Kit message layout:
    - Header
    - Plain_text post caption (truncated at 2900 with dashboard link if needed)
    - Image block (using slack_file or signed_image_url)
    - Action buttons with confirm dialog on Approve
    """
    blocks: List[Dict[str, Any]] = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "New Post Ready for Approval",
                "emoji": True,
            },
        }
    ]

    dashboard_url = f"{settings.APP_BASE_URL.rstrip('/')}/posts/{post_id}"

    # Handle text length (max 2900 chars in section plain_text)
    is_truncated = len(caption) > 2900
    display_caption = caption[:2900] + "..." if is_truncated else caption

    blocks.append({
        "type": "section",
        "text": {
            "type": "plain_text",
            "text": display_caption,
        },
    })

    if is_truncated:
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"Post caption was truncated. <{dashboard_url}|View full post in dashboard>",
            },
            "accessory": {
                "type": "button",
                "text": {"type": "plain_text", "text": "Open Dashboard"},
                "url": dashboard_url,
                "action_id": "open_dashboard",
            },
        })

    # Image block
    if image_file_id:
        blocks.append({
            "type": "image",
            "slack_file": {"id": image_file_id},
            "alt_text": "Post image preview",
        })
    elif signed_image_url:
        blocks.append({
            "type": "image",
            "image_url": signed_image_url,
            "alt_text": "Post image preview",
        })

    # Actions: Approve & Reject buttons
    blocks.append({
        "type": "actions",
        "elements": [
            {
                "type": "button",
                "text": {"type": "plain_text", "text": "Approve", "emoji": True},
                "style": "primary",
                "action_id": "approve_post",
                "value": str(post_id),
                "confirm": {
                    "title": {"type": "plain_text", "text": "Approve Post?"},
                    "text": {
                        "type": "plain_text",
                        "text": "Are you sure you want to approve this post for scheduled publication to LinkedIn?",
                    },
                    "confirm": {"type": "plain_text", "text": "Yes, Approve"},
                    "deny": {"type": "plain_text", "text": "Cancel"},
                },
            },
            {
                "type": "button",
                "text": {"type": "plain_text", "text": "Reject", "emoji": True},
                "style": "danger",
                "action_id": "reject_post",
                "value": str(post_id),
            },
        ],
    })

    return blocks


def post_approval_message(
    bot_token: str,
    channel_id: str,
    post_id: uuid.UUID,
    caption: str,
    topic_title: str,
    image_file_id: Optional[str] = None,
    signed_image_url: Optional[str] = None,
) -> Tuple[str, str, str]:
    """
    Posts the approval message to Slack with retries and graceful image fallbacks.
    Returns (channel_id, message_ts, route_used).
    Raises SlackAuthRevokedError if auth error encountered.
    Raises SlackApiError on failure after retries.
    """
    headers = {
        "Authorization": f"Bearer {bot_token}",
        "Content-Type": "application/json",
    }

    # Attempt 1: Try with slack_file if available
    # Attempt 2: Try with signed_image_url if slack_file fails or wasn't available
    # Attempt 3: Try without image block
    candidate_strategies = []
    if image_file_id:
        candidate_strategies.append(("slack_file", image_file_id, None))
    if signed_image_url:
        candidate_strategies.append(("signed_url", None, signed_image_url))
    candidate_strategies.append(("no_image", None, None))

    auth_errors = {"token_revoked", "account_inactive", "invalid_auth"}

    for route_name, f_id, s_url in candidate_strategies:
        blocks = build_approval_blocks(
            post_id=post_id,
            caption=caption,
            topic_title=topic_title,
            image_file_id=f_id,
            signed_image_url=s_url,
        )
        payload = {
            "channel": channel_id,
            "text": f"New post ready for review: {topic_title}",
            "blocks": blocks,
        }

        # Try up to 2 retries (3 total attempts) for network errors
        for attempt in range(3):
            try:
                with httpx.Client(timeout=15.0) as client:
                    resp = client.post(SLACK_CHAT_POST_MESSAGE_URL, json=payload, headers=headers)
                    data = resp.json()
            except Exception as exc:
                if attempt < 2:
                    logger.warning(f"Slack postMessage network retry {attempt + 1}: {exc}")
                    continue
                logger.error(f"Slack postMessage network error after retries: {exc}")
                raise SlackApiError("network_error") from exc

            if data.get("ok"):
                msg_ts = data.get("ts")
                resp_channel = data.get("channel") or channel_id
                return resp_channel, msg_ts, route_name

            err = data.get("error", "unknown_error")
            if err in auth_errors:
                raise SlackAuthRevokedError(err)

            # If error is related to blocks/image, break inner loop to try next fallback strategy
            if "invalid_blocks" in err or "cannot_find_service" in err or "file_not_found" in err:
                logger.warning(f"Slack rejected message with {route_name} ({err}), trying fallback layout")
                break

            # Other API error
            logger.warning(f"Slack postMessage error: {err}")
            raise SlackApiError(err)

    raise SlackApiError("all_message_strategies_failed")


def update_message_after_decision(
    bot_token: str,
    channel_id: str,
    message_ts: str,
    decision: str,
    decided_via: str = "Slack",
) -> bool:
    """
    Updates the Slack message to disable buttons and show the final decision.
    Best effort, never raises.
    """
    if not bot_token or not channel_id or not message_ts:
        return False

    headers = {
        "Authorization": f"Bearer {bot_token}",
        "Content-Type": "application/json",
    }
    action_text = "Approved" if decision == "approved" else "Rejected"
    emoji = "✅" if decision == "approved" else "🚫"

    payload = {
        "channel": channel_id,
        "ts": message_ts,
        "text": f"{emoji} {action_text} via {decided_via}",
        "blocks": [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"{emoji} *{action_text} via {decided_via}*",
                },
            }
        ],
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(SLACK_CHAT_UPDATE_URL, json=payload, headers=headers)
            data = resp.json()
            return bool(data.get("ok"))
    except Exception as exc:
        logger.debug(f"Slack chat.update error: {exc}")
        return False


def notify_slack_approval(db: Any, post: Any) -> Optional[str]:
    """
    Dispatches a Slack Block Kit DM approval message for a post if the user
    has Slack integration connected and slack_approval_enabled is True on their profile.

    Returns the route used ('slack_file', 'signed_url', 'no_image') or None if not sent.

    Atomic guarantees & safety:
    - Atomically claims the dispatch via INSERT INTO slack_approval_messages ... ON CONFLICT DO NOTHING RETURNING id.
    - If already claimed/sent, returns None immediately.
    - If Slack token is revoked or auth invalid (token_revoked, account_inactive, invalid_auth),
      disconnects the integration, disables profile.slack_approval_enabled, updates message status to 'failed',
      and sends an alert email to the user.
    - Never throws; failures log warnings without secrets and return None. Email remains the primary fallback.
    """
    try:
        from app.models.profile import Profile
        from app.models.slack import SlackIntegration, SlackApprovalMessage
        from app.core.crypto import decrypt_text
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        from sqlalchemy import text

        # 1. Verify profile has Slack approval enabled
        profile = db.query(Profile).filter(Profile.user_id == post.user_id).first()
        if not profile or not profile.slack_approval_enabled:
            return None

        # 2. Verify Slack integration is connected
        integration = db.query(SlackIntegration).filter(
            SlackIntegration.user_id == post.user_id,
            SlackIntegration.status == "connected",
        ).first()
        if not integration or not integration.dm_channel_id or not integration.bot_token_encrypted:
            return None

        # 3. Atomically claim the dispatch
        insert_stmt = (
            pg_insert(SlackApprovalMessage)
            .values(
                post_id=post.id,
                user_id=post.user_id,
                channel_id=integration.dm_channel_id,
                status="sending",
            )
            .on_conflict_do_nothing(index_elements=["post_id"])
            .returning(SlackApprovalMessage.id)
        )
        claimed_id = db.execute(insert_stmt).scalar_one_or_none()
        db.commit()

        if not claimed_id:
            logger.debug(f"Slack approval message for post {post.id} already claimed or sent")
            return None

        # 4. Decrypt bot token
        try:
            bot_token = decrypt_text(integration.bot_token_encrypted)
        except Exception as exc:
            logger.warning(f"Failed to decrypt bot token for user {post.user_id}: {exc}")
            db.execute(
                text("UPDATE slack_approval_messages SET status = 'failed', updated_at = now() WHERE id = :id"),
                {"id": claimed_id},
            )
            db.commit()
            return None

        # 5. Render image bytes
        image_bytes = None
        if post.image_spec:
            try:
                from app.services.image import render_post_image
                image_bytes = render_post_image(post.image_spec, width_target=1200)
            except Exception as exc:
                logger.warning(f"Could not render image for post {post.id}: {exc}")

        # 6. Upload image to Slack (external upload)
        image_file_id = None
        if image_bytes:
            try:
                image_file_id = upload_file_external(bot_token, image_bytes)
            except Exception as exc:
                logger.warning(f"Slack external image upload failed: {exc}")

        # 7. Generate signed image URL fallback
        signed_image_url = None
        try:
            from app.services.image import generate_signed_image_url
            signed_image_url = generate_signed_image_url(post.id)
        except Exception as exc:
            logger.warning(f"Failed to generate signed image URL: {exc}")

        # 8. Post approval message with retries and fallback
        try:
            resp_channel, msg_ts, route_used = post_approval_message(
                bot_token=bot_token,
                channel_id=integration.dm_channel_id,
                post_id=post.id,
                caption=post.caption,
                topic_title=post.topic_title,
                image_file_id=image_file_id,
                signed_image_url=signed_image_url,
            )
            db.execute(
                text(
                    "UPDATE slack_approval_messages "
                    "SET message_ts = :ts, channel_id = :channel_id, status = 'sent', updated_at = now() "
                    "WHERE id = :id"
                ),
                {"ts": msg_ts, "channel_id": resp_channel, "id": claimed_id},
            )
            db.commit()
            logger.info(f"Dispatched Slack approval message for post {post.id} via {route_used} (ts={msg_ts})")
            return route_used

        except SlackAuthRevokedError as auth_err:
            logger.warning(f"Slack auth revoked during approval send for post {post.id}: {auth_err.error_code}")
            integration.bot_token_encrypted = ""
            integration.status = "disconnected"
            integration.last_error = auth_err.error_code
            db.execute(
                text("UPDATE profiles SET slack_approval_enabled = false, updated_at = now() WHERE user_id = :user_id"),
                {"user_id": post.user_id},
            )
            db.execute(
                text("UPDATE slack_approval_messages SET status = 'failed', updated_at = now() WHERE id = :id"),
                {"id": claimed_id},
            )
            db.commit()

            # Send disconnect alert email
            try:
                from app.services.email import send_slack_disconnect_alert_email
                from app.services.approval import get_user_email
                user_email = get_user_email(db, post.user_id)
                if user_email:
                    d_name = profile.display_name if profile and profile.display_name else "Creator"
                    send_slack_disconnect_alert_email(
                        to_email=user_email,
                        display_name=d_name,
                        error_reason=auth_err.error_code,
                    )
            except Exception as email_exc:
                logger.warning(f"Failed to send Slack disconnect alert email: {email_exc}")
            return None

        except Exception as exc:
            logger.warning(f"Failed to post Slack approval message for post {post.id}: {exc}")
            try:
                db.execute(
                    text("UPDATE slack_approval_messages SET status = 'failed', updated_at = now() WHERE id = :id"),
                    {"id": claimed_id},
                )
                db.commit()
            except Exception:
                pass
            return None

    except Exception as exc:
        logger.warning(f"Unexpected error in notify_slack_approval for post {getattr(post, 'id', None)}: {exc}")
        return None


def send_ephemeral_response(response_url: Optional[str], text: str) -> None:
    """
    Sends an ephemeral message back to the clicking Slack user via response_url.
    Never logs response_url or secrets.
    """
    if not response_url:
        return
    try:
        with httpx.Client(timeout=10.0) as client:
            client.post(
                response_url,
                json={"response_type": "ephemeral", "replace_original": False, "text": text},
            )
    except Exception as exc:
        logger.warning(f"Failed to send ephemeral response to Slack: {exc}")


def handle_block_action(payload: Dict[str, Any], db: Optional[Any] = None) -> Dict[str, Any]:
    """
    Core transport-agnostic handler for Slack interactive block actions (e.g. button clicks).
    Processes approve_post and reject_post actions:
    1. Extracts action details (user, team, post_id, action_id, response_url).
    2. Enforces rate limits (30 req/min per Slack user ID).
    3. Verifies authorization: only the connecting Slack user ID for this workspace can decide.
    4. Invokes centralized decide_approval atomic claim.
    5. Updates Slack DM message (disables buttons, shows status).
    6. Sends ephemeral notification if expired, already decided, or unauthorized.
    """
    actions = payload.get("actions") or []
    if not actions:
        return {"status": "no_actions"}

    action = actions[0]
    action_id = action.get("action_id")
    action_value = action.get("value")

    if action_id not in ("approve_post", "reject_post"):
        return {"status": "ignored", "action_id": action_id}

    user_data = payload.get("user") or {}
    slack_user_id = user_data.get("id")
    team_data = payload.get("team") or {}
    team_id = team_data.get("id")
    channel_data = payload.get("channel") or {}
    channel_id = channel_data.get("id")
    container_data = payload.get("container") or {}
    message_data = payload.get("message") or {}
    message_ts = container_data.get("message_ts") or message_data.get("ts")
    response_url = payload.get("response_url")

    # 1. Enforce rate limiting (30 requests/min per Slack user)
    from app.core.limiter import is_rate_limited
    if slack_user_id and is_rate_limited(f"slack_action:{slack_user_id}", max_requests=30, window_seconds=60):
        send_ephemeral_response(response_url, "You are making requests too quickly. Please wait a moment.")
        return {"status": "rate_limited"}

    # 2. Parse post_id
    try:
        post_id = uuid.UUID(str(action_value))
    except (ValueError, TypeError):
        send_ephemeral_response(response_url, "Invalid post identifier.")
        return {"status": "invalid_post_id"}

    # 3. Database session management
    created_session = False
    if db is None:
        from app.db.session import SessionLocal
        db = SessionLocal()
        created_session = True

    try:
        from fastapi import HTTPException
        from app.models.slack import SlackApprovalMessage, SlackIntegration
        from app.models.post import Post
        from app.core.crypto import decrypt_text
        from app.services.approval import decide_approval

        # 4. Lookup message record
        slack_msg = db.query(SlackApprovalMessage).filter(
            SlackApprovalMessage.post_id == post_id
        ).first()

        if not slack_msg:
            send_ephemeral_response(response_url, "Approval message record not found.")
            return {"status": "not_found"}

        target_channel = channel_id or slack_msg.channel_id
        target_message_ts = message_ts or slack_msg.message_ts

        # 5. Verify authorization
        integration = db.query(SlackIntegration).filter(
            SlackIntegration.user_id == slack_msg.user_id
        ).first()

        if (
            not integration
            or integration.status != "connected"
            or (team_id and integration.team_id != team_id)
            or (slack_user_id and integration.slack_user_id != slack_user_id)
        ):
            logger.warning(
                f"Unauthorized Slack action attempt on post {post_id} by user {slack_user_id}"
            )
            send_ephemeral_response(
                response_url,
                "You are not authorized to make decisions on this post."
            )
            return {"status": "unauthorized"}

        # 6. Verify post
        post = db.query(Post).filter(
            Post.id == post_id,
            Post.user_id == slack_msg.user_id,
        ).first()
        if not post:
            send_ephemeral_response(response_url, "Post not found.")
            return {"status": "not_found"}

        decision = "approved" if action_id == "approve_post" else "rejected"

        # 7. Perform atomic decision claim
        try:
            decide_approval(
                db=db,
                decision=decision,
                decided_via="slack",
                post_id=post_id,
                user_id=slack_msg.user_id,
            )
        except HTTPException as exc:
            code = exc.detail.get("code") if isinstance(exc.detail, dict) else str(exc.detail)
            if exc.status_code == 409 and code == "already_decided":
                state = exc.detail.get("state", "decided") if isinstance(exc.detail, dict) else "decided"
                send_ephemeral_response(response_url, f"This post has already been decided ({state}).")

                # Best effort update message to reflect state
                if integration.bot_token_encrypted and target_message_ts:
                    try:
                        bot_token = decrypt_text(integration.bot_token_encrypted)
                        update_message_after_decision(
                            bot_token=bot_token,
                            channel_id=target_channel,
                            message_ts=target_message_ts,
                            decision=state,
                            decided_via="Slack",
                        )
                    except Exception:
                        pass
                return {"status": "already_decided", "state": state}

            elif exc.status_code == 410 and code == "expired":
                send_ephemeral_response(response_url, "The approval deadline for this post has expired.")
                return {"status": "expired"}

            else:
                msg = exc.detail.get("message", "Approval failed") if isinstance(exc.detail, dict) else str(exc.detail)
                send_ephemeral_response(response_url, f"Could not complete decision: {msg}")
                return {"status": "error", "detail": code}

        # 8. Update Slack message to show decision and remove buttons
        if integration.bot_token_encrypted and target_message_ts:
            try:
                bot_token = decrypt_text(integration.bot_token_encrypted)
                update_message_after_decision(
                    bot_token=bot_token,
                    channel_id=target_channel,
                    message_ts=target_message_ts,
                    decision=decision,
                    decided_via="Slack",
                )
            except Exception as exc:
                logger.debug(f"Slack chat.update error in handle_block_action: {exc}")

        # 9. Send ephemeral confirmation
        action_label = "approved" if decision == "approved" else "rejected"
        send_ephemeral_response(response_url, f"Post successfully {action_label}.")
        return {"status": "ok", "decision": decision}

    finally:
        if created_session and db is not None:
            db.close()



