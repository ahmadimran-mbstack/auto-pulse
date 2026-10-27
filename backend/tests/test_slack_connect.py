import datetime
import hashlib
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch
import pytest
from sqlalchemy import text

from app.core.config import settings
from app.core.crypto import decrypt_text, encrypt_text
from app.models.profile import Profile
from app.models.slack import SlackIntegration
from app.models.social_connection import OAuthState
from app.repositories import connection as connection_repo
from tests.conftest import create_test_token


@pytest.fixture
def auth_headers_user_a(ed25519_keys):
    private_key, _ = ed25519_keys
    token = create_test_token(
        private_key,
        sub="user-slack-a",
        email="slack_a@example.com",
        name="Slack User A",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers_user_b(ed25519_keys):
    private_key, _ = ed25519_keys
    token = create_test_token(
        private_key,
        sub="user-slack-b",
        email="slack_b@example.com",
        name="Slack User B",
    )
    return {"Authorization": f"Bearer {token}"}


# 1. Connect generates single-use state and returns Slack authorize URL
def test_slack_connect_generates_valid_url_and_state(client, db_test_schema, auth_headers_user_a):
    response = client.post("/connections/slack/connect?return_to=dashboard", headers=auth_headers_user_a)
    assert response.status_code == 200
    data = response.json()
    assert "authorization_url" in data

    url = data["authorization_url"]
    parsed = urlparse(url)
    params = parse_qs(parsed.query)

    assert "state" in params
    raw_state = params["state"][0]
    expected_hash = hashlib.sha256(raw_state.encode("utf-8")).hexdigest()

    # Verify state is saved in DB with provider='slack' and return_to='dashboard'
    SessionLocal = db_test_schema["SessionLocal"]
    with SessionLocal() as db:
        state_row = db.query(OAuthState).filter(OAuthState.state_hash == expected_hash).first()
        assert state_row is not None
        assert state_row.user_id == "user-slack-a"
        assert state_row.provider == "slack"
        assert state_row.return_to == "dashboard"
        assert state_row.used_at is None


# 2. Callback with access_denied redirects with ?slack=denied
def test_slack_callback_access_denied_redirects_cleanly(client, db_test_schema, auth_headers_user_a):
    # Initiate state
    resp = client.post("/connections/slack/connect?return_to=onboarding", headers=auth_headers_user_a)
    raw_state = parse_qs(urlparse(resp.json()["authorization_url"]).query)["state"][0]

    # Callback with access_denied
    callback_resp = client.get(
        f"/connections/slack/callback?error=access_denied&state={raw_state}",
        follow_redirects=False,
    )
    assert callback_resp.status_code == 302
    location = callback_resp.headers["Location"]
    assert "onboarding" in location
    assert "slack=denied" in location

    # State must be burned
    SessionLocal = db_test_schema["SessionLocal"]
    with SessionLocal() as db:
        state_hash = hashlib.sha256(raw_state.encode("utf-8")).hexdigest()
        state_row = db.query(OAuthState).filter(OAuthState.state_hash == state_hash).first()
        assert state_row.used_at is not None


# 3. Callback succeeds: exchanges code, opens DM, encrypts token, upserts integration
def test_slack_callback_success_flow(client, db_test_schema, auth_headers_user_a):
    # Create profile first
    SessionLocal = db_test_schema["SessionLocal"]
    with SessionLocal() as db:
        p = Profile(user_id="user-slack-a", display_name="Test User", slack_approval_enabled=False)
        db.add(p)
        db.commit()

    resp = client.post("/connections/slack/connect?return_to=dashboard", headers=auth_headers_user_a)
    raw_state = parse_qs(urlparse(resp.json()["authorization_url"]).query)["state"][0]

    fake_token_data = {
        "access_token": "xoxb-fake-bot-token-12345",
        "bot_user_id": "U_BOT_123",
        "team_id": "T_TEAM_999",
        "team_name": "Acme Corp",
        "slack_user_id": "U_USER_888",
    }

    with patch("app.services.slack.exchange_code_for_token", return_value=fake_token_data) as mock_exchange, \
         patch("app.services.slack.open_dm_channel", return_value="D_CHANNEL_777") as mock_open_dm:

        callback_resp = client.get(
            f"/connections/slack/callback?code=mock_code&state={raw_state}",
            follow_redirects=False,
        )

        assert callback_resp.status_code == 302
        location = callback_resp.headers["Location"]
        assert "dashboard" in location
        assert "slack=connected" in location
        mock_exchange.assert_called_once_with("mock_code")
        mock_open_dm.assert_called_once_with(
            bot_token="xoxb-fake-bot-token-12345",
            slack_user_id="U_USER_888",
        )

    # Verify DB state
    with SessionLocal() as db:
        integration = db.query(SlackIntegration).filter(SlackIntegration.user_id == "user-slack-a").first()
        assert integration is not None
        assert integration.team_id == "T_TEAM_999"
        assert integration.team_name == "Acme Corp"
        assert integration.slack_user_id == "U_USER_888"
        assert integration.dm_channel_id == "D_CHANNEL_777"
        assert integration.bot_user_id == "U_BOT_123"
        assert integration.status == "connected"

        # Verify token is encrypted with Fernet
        assert integration.bot_token_encrypted != "xoxb-fake-bot-token-12345"
        decrypted = decrypt_text(integration.bot_token_encrypted)
        assert decrypted == "xoxb-fake-bot-token-12345"

        # Verify profile has slack_approval_enabled=True
        profile = db.query(Profile).filter(Profile.user_id == "user-slack-a").first()
        assert profile.slack_approval_enabled is True


# 4. State replay / double callback is rejected
def test_slack_callback_replay_rejected(client, db_test_schema, auth_headers_user_a):
    resp = client.post("/connections/slack/connect", headers=auth_headers_user_a)
    raw_state = parse_qs(urlparse(resp.json()["authorization_url"]).query)["state"][0]

    fake_token_data = {
        "access_token": "xoxb-token-replay",
        "bot_user_id": "U_BOT",
        "team_id": "T_TEAM",
        "team_name": "Team",
        "slack_user_id": "U_USER",
    }

    with patch("app.services.slack.exchange_code_for_token", return_value=fake_token_data), \
         patch("app.services.slack.open_dm_channel", return_value="D_CHANNEL"):
        # First call burns state
        client.get(f"/connections/slack/callback?code=c1&state={raw_state}", follow_redirects=False)

        # Second call with same state must fail with invalid_state
        r2 = client.get(f"/connections/slack/callback?code=c2&state={raw_state}", follow_redirects=False)
        assert r2.status_code == 302
        assert "slack=invalid_state" in r2.headers["Location"]


# 5. Status endpoint reflects connection state
def test_slack_status_endpoint(client, db_test_schema, auth_headers_user_a):
    # Initially disconnected
    res = client.get("/connections/slack/status", headers=auth_headers_user_a)
    assert res.status_code == 200
    assert res.json()["connected"] is False
    assert res.json()["status"] == "disconnected"

    # Insert connected row
    SessionLocal = db_test_schema["SessionLocal"]
    with SessionLocal() as db:
        integ = SlackIntegration(
            user_id="user-slack-a",
            team_id="T123",
            team_name="My Team",
            slack_user_id="U123",
            dm_channel_id="D123",
            bot_token_encrypted=encrypt_text("xoxb-test"),
            bot_user_id="UBOT",
            status="connected",
        )
        db.add(integ)
        p = Profile(user_id="user-slack-a", slack_approval_enabled=True)
        db.add(p)
        db.commit()

    res2 = client.get("/connections/slack/status", headers=auth_headers_user_a)
    assert res2.status_code == 200
    data = res2.json()
    assert data["connected"] is True
    assert data["team_name"] == "My Team"
    assert data["slack_approval_enabled"] is True


# 6. Test endpoint sends DM
def test_slack_test_notification_endpoint(client, db_test_schema, auth_headers_user_a):
    SessionLocal = db_test_schema["SessionLocal"]
    with SessionLocal() as db:
        integ = SlackIntegration(
            user_id="user-slack-a",
            team_id="T123",
            slack_user_id="U123",
            dm_channel_id="D123",
            bot_token_encrypted=encrypt_text("xoxb-test"),
            bot_user_id="UBOT",
            status="connected",
        )
        db.add(integ)
        db.commit()

    with patch("app.services.slack.send_test_message") as mock_send:
        res = client.post("/connections/slack/test", headers=auth_headers_user_a)
        assert res.status_code == 200
        assert res.json()["status"] == "ok"
        mock_send.assert_called_once_with(bot_token="xoxb-test", channel_id="D123")


# 7. Disconnect revokes token and clears status
def test_slack_disconnect_endpoint(client, db_test_schema, auth_headers_user_a):
    SessionLocal = db_test_schema["SessionLocal"]
    with SessionLocal() as db:
        integ = SlackIntegration(
            user_id="user-slack-a",
            team_id="T123",
            slack_user_id="U123",
            dm_channel_id="D123",
            bot_token_encrypted=encrypt_text("xoxb-test"),
            bot_user_id="UBOT",
            status="connected",
        )
        db.add(integ)
        p = Profile(user_id="user-slack-a", slack_approval_enabled=True)
        db.add(p)
        db.commit()

    with patch("app.services.slack.revoke_token_best_effort") as mock_revoke:
        res = client.delete("/connections/slack", headers=auth_headers_user_a)
        assert res.status_code == 204
        mock_revoke.assert_called_once_with("xoxb-test")

    with SessionLocal() as db:
        integ = db.query(SlackIntegration).filter(SlackIntegration.user_id == "user-slack-a").first()
        assert integ.status == "disconnected"
        assert integ.bot_token_encrypted == ""

        profile = db.query(Profile).filter(Profile.user_id == "user-slack-a").first()
        assert profile.slack_approval_enabled is False


# 8. User isolation: User B cannot see or disconnect User A's integration
def test_slack_user_isolation(client, db_test_schema, auth_headers_user_a, auth_headers_user_b):
    SessionLocal = db_test_schema["SessionLocal"]
    with SessionLocal() as db:
        integ_a = SlackIntegration(
            user_id="user-slack-a",
            team_id="T_A",
            team_name="Team A",
            slack_user_id="U_A",
            dm_channel_id="D_A",
            bot_token_encrypted=encrypt_text("token-a"),
            bot_user_id="UBOT_A",
            status="connected",
        )
        db.add(integ_a)
        db.commit()

    # User B checks status
    res_b = client.get("/connections/slack/status", headers=auth_headers_user_b)
    assert res_b.json()["connected"] is False
    assert res_b.json()["team_name"] is None

    # User B calls disconnect
    res_disc_b = client.delete("/connections/slack", headers=auth_headers_user_b)
    assert res_disc_b.status_code == 204

    # User A's integration remains connected and untouched
    with SessionLocal() as db:
        integ_a_check = db.query(SlackIntegration).filter(SlackIntegration.user_id == "user-slack-a").first()
        assert integ_a_check.status == "connected"
        assert integ_a_check.bot_token_encrypted != ""
