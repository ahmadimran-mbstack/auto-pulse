import datetime
import subprocess
import sys
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.core import auth
from app.models.approval import Approval
from app.models.post import Post
from app.models.profile import Profile
from app.models.publication import PostPublication
from app.models.social_connection import SocialConnection
from app.services import analytics as analytics_service
from tests.conftest import create_test_token


def _auth_headers(ed25519_keys, user_id: str) -> dict:
    private_key, _ = ed25519_keys
    token = create_test_token(private_key, sub=user_id, email=f"{user_id}@test.local")
    return {"Authorization": f"Bearer {token}"}


def test_analytics_isolation_and_outcome_unknown_separation(
    client, db_test_schema, ed25519_keys, monkeypatch
):
    _, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks_network", lambda: jwks)
    auth._jwks_cache = None

    SessionLocal = db_test_schema["SessionLocal"]
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    today_date = now_utc.date()

    user_a = "user-analytics-a"
    user_b = "user-analytics-b"

    with SessionLocal() as db:
        db.add(
            Profile(
                user_id=user_a,
                display_name="User A",
                timezone="Asia/Karachi",
                onboarding_step=4,
            )
        )
        db.add(
            Profile(
                user_id=user_b,
                display_name="User B",
                timezone="UTC",
                onboarding_step=4,
            )
        )
        db.add(
            SocialConnection(
                user_id=user_a,
                provider="linkedin",
                provider_account_id="li-a",
                access_token_enc="enc",
                expires_at=now_utc + datetime.timedelta(days=30),
                scopes=["openid", "profile", "w_member_social"],
                status="active",
            )
        )

        # Post 1 for User A: Published via Slack approval (15 min turnaround)
        sent_1 = now_utc - datetime.timedelta(days=2, minutes=30)
        decided_1 = sent_1 + datetime.timedelta(minutes=15)
        post_1 = Post(
            id=uuid.uuid4(),
            user_id=user_a,
            run_date=today_date - datetime.timedelta(days=2),
            status="published",
            topic_title="Postgres Indexing Tradeoffs",
            topic_url="https://example.com/1",
            hook_style="number_result",
            ai_score=11,
            sources=[],
            image_spec={},
            llm_model="test",
            prompt_version="v1.0",
            caption="Post 1 caption",
            hashtags=["postgres"],
            approval_source="slack",
            decided_at=decided_1,
            created_at=sent_1,
            updated_at=decided_1,
        )
        db.add(post_1)
        db.flush()
        db.add(
            Approval(
                post_id=post_1.id,
                user_id=user_a,
                token_hash="hash-a-1",
                sent_at=sent_1,
                expires_at=sent_1 + datetime.timedelta(hours=8),
                decided_at=decided_1,
                decision="approved",
                decided_via="slack",
            )
        )
        db.add(
            PostPublication(
                user_id=user_a,
                post_id=post_1.id,
                platform="linkedin",
                status="published",
                attempts=1,
                external_id="urn:li:share:111111111",
                published_at=decided_1 + datetime.timedelta(minutes=5),
            )
        )

        # Post 2 for User A: Outcome unknown (must NOT be counted as failed)
        sent_2 = now_utc - datetime.timedelta(days=1, minutes=60)
        decided_2 = sent_2 + datetime.timedelta(minutes=40)
        post_2 = Post(
            id=uuid.uuid4(),
            user_id=user_a,
            run_date=today_date - datetime.timedelta(days=1),
            status="failed",
            topic_title="Queue Backpressure Patterns",
            topic_url="https://example.com/2",
            hook_style="contrarian_opinion",
            ai_score=19,
            sources=[],
            image_spec={},
            llm_model="test",
            prompt_version="v1.0",
            caption="Post 2 caption",
            hashtags=["queues"],
            approval_source="email_link",
            decided_at=decided_2,
            created_at=sent_2,
            updated_at=decided_2,
        )
        db.add(post_2)
        db.flush()
        db.add(
            Approval(
                post_id=post_2.id,
                user_id=user_a,
                token_hash="hash-a-2",
                sent_at=sent_2,
                expires_at=sent_2 + datetime.timedelta(hours=8),
                decided_at=decided_2,
                decision="approved",
                decided_via="email_link",
            )
        )
        db.add(
            PostPublication(
                user_id=user_a,
                post_id=post_2.id,
                platform="linkedin",
                status="failed",
                attempts=1,
                error_code="outcome_unknown",
                error_detail="ReadTimeout",
            )
        )

        # Post 3 for User A: Genuine failed post
        sent_3 = now_utc - datetime.timedelta(hours=5)
        decided_3 = sent_3 + datetime.timedelta(minutes=25)
        post_3 = Post(
            id=uuid.uuid4(),
            user_id=user_a,
            run_date=today_date,
            status="failed",
            topic_title="Postgres Indexing Tradeoffs",
            topic_url="https://example.com/3",
            hook_style="number_result",
            ai_score=15,
            sources=[],
            image_spec={},
            llm_model="test",
            prompt_version="v1.0",
            caption="Post 3 caption",
            hashtags=["postgres"],
            approval_source="dashboard",
            decided_at=decided_3,
            created_at=sent_3,
            updated_at=decided_3,
        )
        db.add(post_3)
        db.flush()
        db.add(
            Approval(
                post_id=post_3.id,
                user_id=user_a,
                token_hash="hash-a-3",
                sent_at=sent_3,
                expires_at=sent_3 + datetime.timedelta(hours=8),
                decided_at=decided_3,
                decision="approved",
                decided_via="dashboard",
            )
        )
        db.add(
            PostPublication(
                user_id=user_a,
                post_id=post_3.id,
                platform="linkedin",
                status="failed",
                attempts=3,
                error_code="rate_limited",
                error_detail="HTTP 429",
            )
        )

        # Noise post for User B (must never leak into User A)
        db.add(
            Post(
                id=uuid.uuid4(),
                user_id=user_b,
                run_date=today_date,
                status="published",
                topic_title="User B Private Topic",
                topic_url="https://example.com/b",
                hook_style="story",
                ai_score=40,
                sources=[],
                image_spec={},
                llm_model="test",
                prompt_version="v1.0",
                caption="User B post",
                hashtags=[],
                created_at=now_utc,
                updated_at=now_utc,
            )
        )
        db.commit()

    resp = client.get(
        "/analytics?range=7d",
        headers=_auth_headers(ed25519_keys, user_a),
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()

    summary = payload["summary"]
    assert summary["timezone"] == "Asia/Karachi"
    assert summary["metrics_available"] is False
    assert summary["all_time_posts"] == 3
    assert summary["total_generated"] == 3
    assert summary["published"] == 1
    assert summary["outcome_unknown"] == 1
    assert summary["failed"] == 1  # Strictly 1, NOT merged with outcome_unknown
    assert summary["avg_ai_score"] == 15.0  # (11 + 19 + 15) / 3

    # Continuous daily series has exactly 7 buckets for 7d
    series = payload["posts_over_time"]
    assert len(series) == 7
    assert sum(day["generated"] for day in series) == 3
    assert sum(day["outcome_unknown"] for day in series) == 1
    assert sum(day["failed"] for day in series) == 1

    # Funnel preserves outcome_unknown separately from failed
    funnel = payload["funnel"]
    assert funnel["outcome_unknown"] == 1
    assert funnel["failed"] == 1

    # Hook styles & topics mark < 5 posts as low_sample=True and exclude User B
    hook_map = {h["hook_style"]: h for h in payload["hook_styles"]}
    assert "story" not in hook_map
    assert hook_map["number_result"]["post_count"] == 2
    assert hook_map["number_result"]["low_sample"] is True
    assert hook_map["contrarian_opinion"]["outcome_unknown_count"] == 1

    topics = {t["topic"]: t for t in payload["topics"]}
    assert "User B Private Topic" not in topics
    assert topics["Postgres Indexing Tradeoffs"]["post_count"] == 2
    assert topics["Postgres Indexing Tradeoffs"]["low_sample"] is True

    # Approval turnaround grouped by source
    turnaround = {t["source"]: t for t in payload["approval_turnaround"]}
    assert turnaround["slack"]["decisions_count"] == 1
    assert turnaround["slack"]["avg_minutes"] == 15.0
    assert turnaround["slack"]["low_sample"] is True
    assert turnaround["email"]["decisions_count"] == 1
    assert turnaround["email"]["avg_minutes"] == 40.0
    assert turnaround["dashboard"]["decisions_count"] == 1
    assert turnaround["dashboard"]["avg_minutes"] == 25.0

    # Recent posts preserves outcome_unknown and builds LinkedIn URL for published URN
    recent_by_status = {r["status"]: r for r in payload["recent_posts"]}
    assert "outcome_unknown" in recent_by_status
    assert (
        recent_by_status["published"]["linkedin_url"]
        == "https://www.linkedin.com/feed/update/urn:li:share:111111111/"
    )


def test_timezone_day_bucketing_and_redis_cache_key(
    client, db_test_schema, ed25519_keys, monkeypatch
):
    _, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks_network", lambda: jwks)
    auth._jwks_cache = None

    SessionLocal = db_test_schema["SessionLocal"]
    user_tz = "user-tz-check"

    # Anchor timestamp at 21:30 UTC yesterday -> which is 02:30 PKT (+05:00) on the NEXT calendar day!
    utc_yesterday_2130 = datetime.datetime.now(datetime.timezone.utc).replace(
        hour=21, minute=30, second=0, microsecond=0
    ) - datetime.timedelta(days=1)
    expected_pkt_date = (
        utc_yesterday_2130.astimezone(datetime.timezone(datetime.timedelta(hours=5)))
        .date()
        .isoformat()
    )

    with SessionLocal() as db:
        db.add(
            Profile(
                user_id=user_tz,
                display_name="PKT User",
                timezone="Asia/Karachi",
                onboarding_step=4,
            )
        )
        db.add(
            SocialConnection(
                user_id=user_tz,
                provider="linkedin",
                provider_account_id="li-tz",
                access_token_enc="enc",
                expires_at=utc_yesterday_2130 + datetime.timedelta(days=30),
                scopes=["openid", "profile", "w_member_social", "r_member_postAnalytics"],
                status="active",
            )
        )
        db.add(
            Post(
                id=uuid.uuid4(),
                user_id=user_tz,
                run_date=utc_yesterday_2130.date(),
                status="published",
                topic_title="Timezone Boundary Test",
                topic_url="",
                hook_style="observation",
                ai_score=9,
                sources=[],
                image_spec={},
                llm_model="test",
                prompt_version="v1.0",
                caption="Testing PKT day boundary",
                hashtags=[],
                created_at=utc_yesterday_2130,
                updated_at=utc_yesterday_2130,
            )
        )
        db.commit()

    fake_store = {}
    mock_redis = MagicMock()
    mock_redis.get.side_effect = lambda k: fake_store.get(k)
    mock_redis.setex.side_effect = lambda k, ttl, val: fake_store.__setitem__(k, val)
    mock_redis.delete.side_effect = lambda *keys: [fake_store.pop(k, None) for k in keys]

    with patch.object(analytics_service, "get_redis_client", return_value=mock_redis):
        resp = client.get(
            "/analytics?range=30d",
            headers=_auth_headers(ed25519_keys, user_tz),
        )
        assert resp.status_code == 200
        data = resp.json()

        # Verify r_member_postAnalytics scope flips metrics_available to True
        assert data["summary"]["metrics_available"] is True

        # Verify SQL bucketed created_at using Asia/Karachi, not UTC
        bucket_map = {b["date"]: b["generated"] for b in data["posts_over_time"]}
        assert len(data["posts_over_time"]) == 30
        assert bucket_map[expected_pkt_date] == 1

        # Verify Redis key includes both user_id and range with short TTL
        expected_key = f"analytics:v1:dashboard:{user_tz}:30d"
        assert expected_key in fake_store
        mock_redis.setex.assert_called_once()
        assert mock_redis.setex.call_args[0][0] == expected_key
        assert mock_redis.setex.call_args[0][1] == 180

        # Verify cache invalidation deletes user keys across ranges
        analytics_service.invalidate_analytics_cache(user_tz)
        assert expected_key not in fake_store


def test_seed_analytics_refuses_production_environment():
    repo_root = Path(__file__).resolve().parent.parent.parent
    script_path = repo_root / "scripts" / "seed_analytics.py"
    env = dict(**__import__("os").environ)
    env["ENV"] = "production"

    result = subprocess.run(
        [sys.executable, str(script_path)],
        env=env,
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode != 0
    assert "production" in result.stderr.lower()
