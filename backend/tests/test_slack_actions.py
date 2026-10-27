import datetime
import hashlib
from unittest.mock import MagicMock, patch
import uuid
import pytest
from sqlalchemy import text

from app.core.config import settings
from app.core.crypto import encrypt_text
from app.models.approval import Approval
from app.models.post import Post
from app.models.profile import Profile
from app.models.publication import PostPublication
from app.models.slack import SlackApprovalMessage, SlackIntegration
from app.services.slack import handle_block_action


def _seed_test_post(
    db,
    user_id: str,
    status: str = "awaiting_approval",
    publish_at: datetime.datetime = None,
) -> Post:
    if not publish_at:
        publish_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=2)

    post = Post(
        id=uuid.uuid4(),
        user_id=user_id,
        run_date=datetime.date(2026, 10, 27),
        status=status,
        publish_at=publish_at,
        topic_title="Phase 4 Socket Mode Action Test",
        topic_url="https://example.com/phase4",
        sources=[{"title": "Test Source", "url": "https://example.com"}],
        caption="Action button test caption.",
        hashtags=["#testing"],
        image_spec={
            "headline": "Phase 4 Action Test",
            "brand_name": "AutoPulse",
            "brand_primary_hex": "#0F172A",
            "brand_accent_hex": "#38BDF8",
            "template_version": "v1",
        },
        llm_model="test-llm",
        prompt_version="v1",
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


def _seed_setup(
    db,
    user_id: str = "user-action-test",
    slack_user_id: str = "U12345",
    team_id: str = "T12345",
    channel_id: str = "D12345",
    message_ts: str = "1700000010.000100",
    post_status: str = "awaiting_approval",
    publish_at: datetime.datetime = None,
):
    profile = Profile(user_id=user_id, display_name="Creator", slack_approval_enabled=True)
    db.add(profile)

    integration = SlackIntegration(
        user_id=user_id,
        team_id=team_id,
        team_name="Workspace",
        slack_user_id=slack_user_id,
        dm_channel_id=channel_id,
        bot_token_encrypted=encrypt_text("xoxb-dummy-test-token"),
        bot_user_id="UBOT123",
        status="connected",
    )
    db.add(integration)

    post = _seed_test_post(db, user_id=user_id, status=post_status, publish_at=publish_at)

    raw_token = f"raw-{post.id}"
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    approval = Approval(
        user_id=user_id,
        post_id=post.id,
        channel="email",
        token_hash=token_hash,
        expires_at=post.publish_at,
        sent_at=datetime.datetime.now(datetime.timezone.utc),
    )
    db.add(approval)

    msg = SlackApprovalMessage(
        post_id=post.id,
        user_id=user_id,
        channel_id=channel_id,
        message_ts=message_ts,
        status="sent",
    )
    db.add(msg)
    db.commit()

    return post, integration, msg


def _build_slack_payload(
    action_id: str,
    post_id: uuid.UUID,
    slack_user_id: str = "U12345",
    team_id: str = "T12345",
    channel_id: str = "D12345",
    message_ts: str = "1700000010.000100",
    response_url: str = "https://hooks.slack.com/actions/dummy",
) -> dict:
    return {
        "type": "block_actions",
        "user": {"id": slack_user_id, "username": "alice", "name": "Alice", "team_id": team_id},
        "team": {"id": team_id, "domain": "workspace"},
        "channel": {"id": channel_id, "name": "directmessage"},
        "container": {"type": "message", "message_ts": message_ts, "channel_id": channel_id},
        "message": {"ts": message_ts},
        "response_url": response_url,
        "actions": [
            {
                "action_id": action_id,
                "value": str(post_id),
                "type": "button",
            }
        ],
    }


# 1. Successful Approve click marks post approved, enqueues publication, and updates Slack message
def test_handle_block_action_approve_success(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post, _, _ = _seed_setup(db)
        payload = _build_slack_payload(action_id="approve_post", post_id=post.id)

        with patch("app.services.slack.update_message_after_decision") as mock_update:
            mock_update.return_value = True
            with patch("app.services.slack.send_ephemeral_response") as mock_ephemeral:
                result = handle_block_action(payload, db=db)
                assert result["status"] == "ok"
                assert result["decision"] == "approved"

                # Check update_message_after_decision was called
                assert mock_update.called
                assert mock_update.call_args.kwargs["decision"] == "approved"
                assert mock_update.call_args.kwargs["decided_via"] == "Slack"

                # Check ephemeral response sent to clicking user
                assert mock_ephemeral.called
                assert "approved" in mock_ephemeral.call_args.args[1]

        # Verify DB updates
        db.refresh(post)
        assert post.status == "approved"
        assert post.approval_source == "slack"
        assert post.decided_at is not None

        # Verify exactly one pending publication record was created for LinkedIn
        pub = db.query(PostPublication).filter(PostPublication.post_id == post.id).first()
        assert pub is not None
        assert pub.platform == "linkedin"
        assert pub.status == "pending"


# 2. Successful Reject click marks post rejected with no publication row
def test_handle_block_action_reject_success(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post, _, _ = _seed_setup(db, user_id="user-reject-test")
        payload = _build_slack_payload(action_id="reject_post", post_id=post.id)

        with patch("app.services.slack.update_message_after_decision") as mock_update:
            mock_update.return_value = True
            with patch("app.services.slack.send_ephemeral_response") as mock_ephemeral:
                result = handle_block_action(payload, db=db)
                assert result["status"] == "ok"
                assert result["decision"] == "rejected"

                assert mock_update.called
                assert mock_update.call_args.kwargs["decision"] == "rejected"

                assert mock_ephemeral.called
                assert "rejected" in mock_ephemeral.call_args.args[1]

        # Verify DB updates
        db.refresh(post)
        assert post.status == "rejected"
        assert post.approval_source == "slack"
        assert post.decided_at is not None

        # Verify NO publication row
        pub = db.query(PostPublication).filter(PostPublication.post_id == post.id).first()
        assert pub is None


# 3. Double click race condition: second click gets already_decided
def test_handle_block_action_double_click_already_decided(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post, _, _ = _seed_setup(db, user_id="user-double-click")
        payload = _build_slack_payload(action_id="approve_post", post_id=post.id)

        with patch("app.services.slack.update_message_after_decision"):
            with patch("app.services.slack.send_ephemeral_response"):
                # First click succeeds
                r1 = handle_block_action(payload, db=db)
                assert r1["status"] == "ok"

                # Second click returns already_decided
                r2 = handle_block_action(payload, db=db)
                assert r2["status"] == "already_decided"
                assert r2["state"] == "approved"

        # Exactly 1 publication record exists
        pubs = db.query(PostPublication).filter(PostPublication.post_id == post.id).all()
        assert len(pubs) == 1


# 4. Unauthorized Slack user click is rejected with ephemeral warning
def test_handle_block_action_unauthorized_user(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post, _, _ = _seed_setup(db, user_id="user-auth-check", slack_user_id="U_OWNER")

        # Click comes from a different Slack user ID
        payload = _build_slack_payload(
            action_id="approve_post",
            post_id=post.id,
            slack_user_id="U_INTRUDER",
        )

        with patch("app.services.slack.send_ephemeral_response") as mock_ephemeral:
            result = handle_block_action(payload, db=db)
            assert result["status"] == "unauthorized"

            assert mock_ephemeral.called
            assert "not authorized" in mock_ephemeral.call_args.args[1]

        # Post status is unaffected
        db.refresh(post)
        assert post.status == "awaiting_approval"


# 5. Expired post click returns expired message and marks post expired
def test_handle_block_action_expired_post(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        past_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=15)
        post, _, _ = _seed_setup(db, user_id="user-expired-action", publish_at=past_time)

        payload = _build_slack_payload(action_id="approve_post", post_id=post.id)

        with patch("app.services.slack.send_ephemeral_response") as mock_ephemeral:
            result = handle_block_action(payload, db=db)
            assert result["status"] == "expired"

            assert mock_ephemeral.called
            assert "expired" in mock_ephemeral.call_args.args[1]

        # Post is marked expired
        db.refresh(post)
        assert post.status == "expired"


# 6. Rate limited user receives rate limited ephemeral response
def test_handle_block_action_rate_limited(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post, _, _ = _seed_setup(db, user_id="user-rate-limit")
        payload = _build_slack_payload(action_id="approve_post", post_id=post.id)

        with patch("app.core.limiter.is_rate_limited", return_value=True):
            with patch("app.services.slack.send_ephemeral_response") as mock_ephemeral:
                result = handle_block_action(payload, db=db)
                assert result["status"] == "rate_limited"
                assert mock_ephemeral.called
                assert "too quickly" in mock_ephemeral.call_args.args[1]

        # Post status untouched
        db.refresh(post)
        assert post.status == "awaiting_approval"


# 7. Socket Mode client registers request listener and sends instant ACK (< 3 seconds rule)
def test_socket_mode_client_ack_and_dispatch():
    with patch.object(settings, "SLACK_APP_TOKEN", "xapp-test-app-token-123"):
        from app.slack_listener import create_socket_mode_client
        from slack_sdk.socket_mode.request import SocketModeRequest

        client = create_socket_mode_client()
        assert len(client.socket_mode_request_listeners) == 1
        listener = client.socket_mode_request_listeners[0]

        # Create mock interactive request
        dummy_req = SocketModeRequest(
            type="interactive",
            envelope_id="env-test-9999",
            payload={
                "type": "block_actions",
                "actions": [{"action_id": "approve_post", "value": str(uuid.uuid4())}],
            },
        )

        mock_client = MagicMock()
        with patch("app.slack_listener.handle_block_action") as mock_handler:
            mock_handler.return_value = {"status": "ok"}
            listener(mock_client, dummy_req)

            # 1. Verified immediate ACK sent with envelope_id
            assert mock_client.send_socket_mode_response.called
            resp_arg = mock_client.send_socket_mode_response.call_args[0][0]
            assert resp_arg.envelope_id == "env-test-9999"

            # 2. Verified dispatched to handle_block_action
            assert mock_handler.called
            assert mock_handler.call_args[0][0]["type"] == "block_actions"
