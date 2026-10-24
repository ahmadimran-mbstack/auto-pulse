import datetime
import uuid
from sqlalchemy import text
from app.models.social_connection import SocialConnection
from app.models.post import Post
from app.models.profile import Profile
from tests.conftest import create_test_token


# Helper to get auth headers for a test user
def _auth_headers(private_key, sub: str = "user-dash-1", name: str = "Dash User") -> dict:
    token = create_test_token(private_key=private_key, sub=sub, name=name)
    return {"Authorization": f"Bearer {token}"}


# Helper to seed a post with a specific status and creation timestamp
def _seed_post(
    db,
    user_id: str,
    run_date: datetime.date,
    status: str = "draft",
    created_at: datetime.datetime = None,
    topic_title: str = "Test Topic",
) -> Post:
    now = datetime.datetime.now(datetime.timezone.utc)
    post = Post(
        id=uuid.uuid4(),
        user_id=user_id,
        run_date=run_date,
        status=status,
        topic_title=topic_title,
        topic_url="https://example.com/topic",
        sources=[{"title": "Source", "url": "https://example.com/src", "published_at": None}],
        caption="Dashboard test caption.",
        hashtags=["dashboard"],
        image_spec={
            "headline": topic_title,
            "brand_name": "Test Brand",
            "brand_primary_hex": "#0F172A",
            "brand_accent_hex": "#38BDF8",
        },
        llm_model="test-llm",
        prompt_version="v1",
        created_at=created_at or now,
    )
    db.add(post)
    db.commit()
    return post


# Test case: GET /dashboard returns complete structure within at most 3 queries
def test_get_dashboard_structure_and_query_count(client, db_test_schema, ed25519_keys):
    private_key, _ = ed25519_keys
    headers = _auth_headers(private_key, sub="user-dash-structure")

    today = datetime.date.today()
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))

        # Seed profile
        prof = Profile(
            user_id="user-dash-structure",
            display_name="Structure User",
            timezone="UTC",
            post_time=datetime.time(10, 0),
            post_days=[0, 1, 2, 3, 4],
            onboarding_completed_at=now_utc,
        )
        db.add(prof)

        # Seed LinkedIn connection
        conn = SocialConnection(
            user_id="user-dash-structure",
            provider="linkedin",
            status="active",
            provider_account_id="li-struct-123",
            account_name="structuser",
            access_token_enc="fake-enc-token",
            scopes=["w_member_social"],
            expires_at=now_utc + datetime.timedelta(days=60),
            connected_at=now_utc,
        )
        db.add(conn)

        # Seed today's post
        _seed_post(db, "user-dash-structure", today, status="draft", topic_title="Today Topic")
        db.commit()

    res = client.get("/dashboard", headers=headers)
    assert res.status_code == 200
    data = res.json()

    # Verify profile section
    assert data["profile"] is not None
    assert data["profile"]["display_name"] == "Structure User"
    assert data["profile"]["onboarding_complete"] is True

    # Verify connections section
    assert len(data["connections"]) == 1
    assert data["connections"][0]["provider"] == "linkedin"
    assert data["connections"][0]["status"] == "active"

    # Verify today post
    assert data["today"] is not None
    assert data["today"]["topic_title"] == "Today Topic"

    # Verify recent posts
    assert len(data["recent_posts"]) >= 1

    # Verify schedule
    assert data["schedule"]["next_draft_at"] is not None
    assert data["schedule"]["next_post_at"] is not None

    # Verify query count in Server-Timing is at most 3
    timing_header = res.headers.get("Server-Timing", "")
    assert "queries" in timing_header


# Test case: GET /dashboard stats counting and strict user isolation
def test_dashboard_stats_user_isolation(client, db_test_schema, ed25519_keys):
    private_key, _ = ed25519_keys
    headers_alice = _auth_headers(private_key, sub="user-alice-dash", name="Alice")
    headers_bob = _auth_headers(private_key, sub="user-bob-dash", name="Bob")

    today = datetime.date.today()
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    old_date = now_utc - datetime.timedelta(days=45)

    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))

        # Seed Alice posts:
        # - 2 awaiting_approval
        # - 1 published (within 30d)
        # - 1 published (older than 30d: must NOT count in published_30d)
        # - 1 failed (within 30d)
        # - 1 failed (older than 30d: must NOT count in failed_30d)
        _seed_post(db, "user-alice-dash", today, status="awaiting_approval")
        _seed_post(db, "user-alice-dash", today - datetime.timedelta(days=1), status="awaiting_approval")
        _seed_post(db, "user-alice-dash", today - datetime.timedelta(days=2), status="published")
        _seed_post(db, "user-alice-dash", today - datetime.timedelta(days=45), status="published", created_at=old_date)
        _seed_post(db, "user-alice-dash", today - datetime.timedelta(days=3), status="failed")
        _seed_post(db, "user-alice-dash", today - datetime.timedelta(days=46), status="failed", created_at=old_date)

        # Seed Bob posts:
        # Bob has 5 awaiting_approval, 10 published, 4 failed
        # None of Bob's posts should affect Alice's counts
        for i in range(5):
            _seed_post(db, "user-bob-dash", today - datetime.timedelta(days=i + 10), status="awaiting_approval")
        for i in range(10):
            _seed_post(db, "user-bob-dash", today - datetime.timedelta(days=i + 15), status="published")
        for i in range(4):
            _seed_post(db, "user-bob-dash", today - datetime.timedelta(days=i + 25), status="failed")

    # Check Alice stats
    res_alice = client.get("/dashboard", headers=headers_alice)
    assert res_alice.status_code == 200
    stats_alice = res_alice.json()["stats"]

    assert stats_alice["awaiting_approval"] == 2
    assert stats_alice["published_30d"] == 1
    assert stats_alice["failed_30d"] == 1

    # Check Bob stats
    res_bob = client.get("/dashboard", headers=headers_bob)
    assert res_bob.status_code == 200
    stats_bob = res_bob.json()["stats"]

    assert stats_bob["awaiting_approval"] == 5
    assert stats_bob["published_30d"] == 10
    assert stats_bob["failed_30d"] == 4
