import datetime
import hashlib
import time
from unittest.mock import MagicMock, patch
import uuid
import pytest
from sqlalchemy import text

from app.core.config import settings
from app.core.crypto import encrypt_text
from app.models.approval import Approval
from app.models.post import Post
from app.models.profile import Profile
from app.models.slack import SlackApprovalMessage, SlackIntegration
from app.services.approval import decide_approval, request_approval
from app.services.image import generate_signed_image_url
from app.services.slack import SlackApiError, SlackAuthRevokedError, notify_slack_approval


def _seed_test_post(db, user_id: str, status: str = "draft") -> Post:
    publish_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=2)
    post = Post(
        id=uuid.uuid4(),
        user_id=user_id,
        run_date=datetime.date(2026, 10, 27),
        status=status,
        publish_at=publish_at,
        topic_title="Phase 3 Slack Notifications Test",
        topic_url="https://example.com/phase3",
        sources=[{"title": "Test Source", "url": "https://example.com"}],
        caption="A test caption for Slack Block Kit notification.",
        hashtags=["#testing"],
        image_spec={
            "headline": "Phase 3 Slack Notifications Test",
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


def _seed_profile(db, user_id: str, slack_approval_enabled: bool = True) -> Profile:
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if not profile:
        profile = Profile(
            user_id=user_id,
            display_name="Test Creator",
            slack_approval_enabled=slack_approval_enabled,
        )
        db.add(profile)
    else:
        profile.slack_approval_enabled = slack_approval_enabled
    db.commit()
    db.refresh(profile)
    return profile


def _seed_slack_integration(
    db,
    user_id: str,
    status: str = "connected",
    bot_token: str = "xoxb-test-token",
) -> SlackIntegration:
    integration = db.query(SlackIntegration).filter(SlackIntegration.user_id == user_id).first()
    encrypted_token = encrypt_text(bot_token) if bot_token else ""
    if not integration:
        integration = SlackIntegration(
            user_id=user_id,
            team_id="T12345",
            team_name="Test Workspace",
            slack_user_id="U12345",
            dm_channel_id="D12345",
            bot_token_encrypted=encrypted_token,
            bot_user_id="UBOT123",
            status=status,
        )
        db.add(integration)
    else:
        integration.status = status
        integration.bot_token_encrypted = encrypted_token
    db.commit()
    db.refresh(integration)
    return integration


# 1. notify_slack_approval skips when disabled on profile or integration not connected
def test_notify_slack_skips_when_disabled_or_not_connected(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        user_id = "user-test-skip"
        post = _seed_test_post(db, user_id)

        # Profile has slack_approval_enabled = False
        _seed_profile(db, user_id, slack_approval_enabled=False)
        _seed_slack_integration(db, user_id, status="connected")

        route = notify_slack_approval(db, post)
        assert route is None

        # Check no message was created
        msg = db.query(SlackApprovalMessage).filter(SlackApprovalMessage.post_id == post.id).first()
        assert msg is None

        # Now enable profile, but integration is disconnected
        _seed_profile(db, user_id, slack_approval_enabled=True)
        _seed_slack_integration(db, user_id, status="disconnected")

        route2 = notify_slack_approval(db, post)
        assert route2 is None
        msg2 = db.query(SlackApprovalMessage).filter(SlackApprovalMessage.post_id == post.id).first()
        assert msg2 is None


# 2. Atomic claim prevents duplicate notification for the same post
def test_notify_slack_atomic_claim_dedup(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        user_id = "user-test-dedup"
        post = _seed_test_post(db, user_id)
        _seed_profile(db, user_id, slack_approval_enabled=True)
        _seed_slack_integration(db, user_id, status="connected")

        with patch("app.services.slack.post_approval_message") as mock_post:
            mock_post.return_value = ("D12345", "1700000000.000100", "slack_file")
            with patch("app.services.slack.upload_file_external", return_value="F12345"):
                route1 = notify_slack_approval(db, post)
                assert route1 == "slack_file"
                assert mock_post.call_count == 1

                # Second dispatch for the exact same post should do nothing (atomic conflict)
                route2 = notify_slack_approval(db, post)
                assert route2 is None
                assert mock_post.call_count == 1

        msg = db.query(SlackApprovalMessage).filter(SlackApprovalMessage.post_id == post.id).first()
        assert msg is not None
        assert msg.status == "sent"
        assert msg.message_ts == "1700000000.000100"


# 3. Message dispatch uses slack_file route when file upload succeeds
def test_notify_slack_file_upload_route(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        user_id = "user-test-upload"
        post = _seed_test_post(db, user_id)
        _seed_profile(db, user_id, slack_approval_enabled=True)
        _seed_slack_integration(db, user_id, status="connected")

        with patch("app.services.slack.upload_file_external", return_value="F999888"):
            with patch("app.services.slack.post_approval_message") as mock_post:
                mock_post.return_value = ("D12345", "1700000001.000200", "slack_file")
                route = notify_slack_approval(db, post)
                assert route == "slack_file"

                # Check args passed to post_approval_message
                kwargs = mock_post.call_args.kwargs
                assert kwargs["image_file_id"] == "F999888"
                assert kwargs["channel_id"] == "D12345"
                assert kwargs["post_id"] == post.id


# 4. Message dispatch falls back to signed_url when file upload returns None
def test_notify_slack_signed_url_fallback(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        user_id = "user-test-signed-url"
        post = _seed_test_post(db, user_id)
        _seed_profile(db, user_id, slack_approval_enabled=True)
        _seed_slack_integration(db, user_id, status="connected")

        with patch("app.services.slack.upload_file_external", return_value=None):
            with patch("app.services.slack.post_approval_message") as mock_post:
                mock_post.return_value = ("D12345", "1700000002.000300", "signed_url")
                route = notify_slack_approval(db, post)
                assert route == "signed_url"

                kwargs = mock_post.call_args.kwargs
                assert kwargs["image_file_id"] is None
                assert kwargs["signed_image_url"] is not None
                assert f"/public/posts/{post.id}/image.png" in kwargs["signed_image_url"]


# 5. Public signed image URL validation endpoint tests
def test_public_signed_image_endpoint(client, db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        user_id = "user-test-img-ep"
        post = _seed_test_post(db, user_id)

    # Valid signed URL
    url = generate_signed_image_url(post.id, expires_in_seconds=3600)
    # Extract path and query from full URL
    path_and_query = url.replace(settings.APP_BASE_URL.rstrip("/"), "")
    resp = client.get(path_and_query)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"
    assert "public" in resp.headers.get("cache-control", "")

    # Invalid signature -> 403
    bad_sig_url = path_and_query[:-5] + "aaaaa"
    resp_bad = client.get(bad_sig_url)
    assert resp_bad.status_code == 403

    # Expired timestamp -> 410
    expired_url = generate_signed_image_url(post.id, expires_in_seconds=-10)
    exp_path = expired_url.replace(settings.APP_BASE_URL.rstrip("/"), "")
    resp_exp = client.get(exp_path)
    assert resp_exp.status_code == 410


# 6. Auth revocation disconnects integration, disables profile, and sends alert email
def test_notify_slack_auth_revocation(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        user_id = "user-test-revocation"
        post = _seed_test_post(db, user_id)
        profile = _seed_profile(db, user_id, slack_approval_enabled=True)
        integration = _seed_slack_integration(db, user_id, status="connected")

        with patch("app.services.slack.upload_file_external", return_value=None):
            with patch(
                "app.services.slack.post_approval_message",
                side_effect=SlackAuthRevokedError("token_revoked"),
            ):
                with patch("app.services.approval.get_user_email", return_value="creator@example.com"):
                    with patch("app.services.email.send_slack_disconnect_alert_email") as mock_email:
                        route = notify_slack_approval(db, post)
                        assert route is None
                        assert mock_email.called
                        assert mock_email.call_args.kwargs["to_email"] == "creator@example.com"
                        assert mock_email.call_args.kwargs["error_reason"] == "token_revoked"

        # Verify DB updates
        db.refresh(integration)
        db.refresh(profile)
        assert integration.status == "disconnected"
        assert integration.last_error == "token_revoked"
        assert integration.bot_token_encrypted == ""
        assert profile.slack_approval_enabled is False

        msg = db.query(SlackApprovalMessage).filter(SlackApprovalMessage.post_id == post.id).first()
        assert msg is not None
        assert msg.status == "failed"


# 7. Pipeline resilience: request_approval succeeds even if Slack dispatch fails
def test_request_approval_pipeline_resilience(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        user_id = "user-test-pipeline-resilience"
        post = _seed_test_post(db, user_id)
        _seed_profile(db, user_id, slack_approval_enabled=True)
        _seed_slack_integration(db, user_id, status="connected")

        with patch("app.services.approval.send_approval_email"):
            with patch("app.services.slack.upload_file_external", return_value=None):
                with patch(
                    "app.services.slack.post_approval_message",
                    side_effect=SlackApiError("some_slack_outage"),
                ):
                    # Email succeeds, Slack fails
                    result = request_approval(db, post, recipient_email="user@example.com")
                    assert result is True

        db.refresh(post)
        assert post.status == "awaiting_approval"

        msg = db.query(SlackApprovalMessage).filter(SlackApprovalMessage.post_id == post.id).first()
        assert msg is not None
        assert msg.status == "failed"


# 8. Decision via email/dashboard updates Slack message and populates post audit columns
def test_decide_approval_updates_slack_message_and_post_audit(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        user_id = "user-test-decision-slack-update"
        post = _seed_test_post(db, user_id, status="awaiting_approval")
        _seed_profile(db, user_id, slack_approval_enabled=True)
        _seed_slack_integration(db, user_id, status="connected")

        # Create an approval record
        raw_token = "decision-token-12345"
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

        # Seed sent Slack message record
        slack_msg = SlackApprovalMessage(
            post_id=post.id,
            user_id=user_id,
            channel_id="D12345",
            message_ts="1700000003.000400",
            status="sent",
        )
        db.add(slack_msg)
        db.commit()

        with patch("app.services.slack.update_message_after_decision") as mock_update:
            mock_update.return_value = True
            decision_res = decide_approval(
                db,
                decision="approved",
                decided_via="email_link",
                token_hash=token_hash,
            )
            assert decision_res["status"] == "ok"

            # Check that update_message_after_decision was called
            assert mock_update.called
            k = mock_update.call_args.kwargs
            assert k["channel_id"] == "D12345"
            assert k["message_ts"] == "1700000003.000400"
            assert k["decision"] == "approved"
            assert k["decided_via"] == "Email"

        # Verify post audit columns
        db.refresh(post)
        assert post.status == "approved"
        assert post.approval_source == "email_link"
        assert post.decided_at is not None
