import datetime
import uuid
from sqlalchemy import text
from app.models.post import GenerationRun, Post
from app.models.profile import Profile
from tests.conftest import create_test_token


# Helper to get standard auth headers for a given user sub
def _auth_headers(private_key, sub: str = "user-123", name: str = "Test User") -> dict:
    token = create_test_token(private_key=private_key, sub=sub, name=name)
    return {"Authorization": f"Bearer {token}"}


# Helper to seed a valid post in the database
def _seed_post(db, user_id: str, run_date: datetime.date, topic_title: str = "Test Topic") -> Post:
    post = Post(
        id=uuid.uuid4(),
        user_id=user_id,
        run_date=run_date,
        status="draft",
        topic_title=topic_title,
        topic_url="https://example.com/topic",
        sources=[{"title": "Source 1", "url": "https://example.com/s1", "published_at": None}],
        caption="Sample LinkedIn caption test paragraph.\n\nSecond line here.",
        hashtags=["tech", "saas"],
        image_spec={
            "headline": topic_title,
            "brand_name": "Test Brand",
            "brand_primary_hex": "#0B7F70",
            "brand_accent_hex": "#14B8A6",
        },
        llm_model="gemini-test",
        prompt_version="2026-10-v2",
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    db.expunge(post)
    return post


# Test case: GET /posts returns list of caller's posts and isolates across users
def test_list_posts_user_isolation(client, db_test_schema, ed25519_keys):
    private_key, _ = ed25519_keys
    headers_u1 = _auth_headers(private_key, sub="user-alice", name="Alice")
    headers_u2 = _auth_headers(private_key, sub="user-bob", name="Bob")

    # Initially empty for Alice
    res_empty = client.get("/posts", headers=headers_u1)
    assert res_empty.status_code == 200
    assert res_empty.json() == []

    # Seed one post for Alice and one for Bob
    today = datetime.date.today()
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        p1 = _seed_post(db, "user-alice", today, "Alice Topic")
        p2 = _seed_post(db, "user-bob", today, "Bob Topic")

    # Alice only sees her own post
    res_u1 = client.get("/posts", headers=headers_u1)
    assert res_u1.status_code == 200
    data_u1 = res_u1.json()
    assert len(data_u1) == 1
    assert data_u1[0]["id"] == str(p1.id)
    assert data_u1[0]["topic_title"] == "Alice Topic"

    # Bob only sees his own post
    res_u2 = client.get("/posts", headers=headers_u2)
    assert res_u2.status_code == 200
    data_u2 = res_u2.json()
    assert len(data_u2) == 1
    assert data_u2[0]["id"] == str(p2.id)
    assert data_u2[0]["topic_title"] == "Bob Topic"


# Test case: GET /posts/schedule returns nulls before onboarding, valid times after
def test_get_post_schedule_lifecycle(client, db_test_schema, ed25519_keys):
    private_key, _ = ed25519_keys
    headers = _auth_headers(private_key, sub="user-sched", name="Sched User")

    # Incomplete onboarding: returns nulls
    r_empty = client.get("/posts/schedule", headers=headers)
    assert r_empty.status_code == 200
    assert r_empty.json() == {"next_draft_at": None, "next_post_at": None}

    # Complete onboarding with schedule settings
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        prof = Profile(
            user_id="user-sched",
            display_name="Sched User",
            timezone="UTC",
            post_time=datetime.time(15, 0),
            post_days=[0, 1, 2, 3, 4, 5, 6],
            onboarding_completed_at=datetime.datetime.now(datetime.timezone.utc),
        )
        db.add(prof)
        db.commit()

    r_active = client.get("/posts/schedule", headers=headers)
    assert r_active.status_code == 200
    data = r_active.json()
    assert data["next_draft_at"] is not None
    assert data["next_post_at"] is not None


# Test case: GET /posts/{id} returns details and blocks access from other tenants
def test_get_single_post_tenant_isolation(client, db_test_schema, ed25519_keys):
    private_key, _ = ed25519_keys
    headers_owner = _auth_headers(private_key, sub="user-owner", name="Owner")
    headers_intruder = _auth_headers(private_key, sub="user-intruder", name="Intruder")

    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post = _seed_post(db, "user-owner", datetime.date.today(), "Secret Topic")

    # Owner can read
    r_owner = client.get(f"/posts/{post.id}", headers=headers_owner)
    assert r_owner.status_code == 200
    assert r_owner.json()["topic_title"] == "Secret Topic"

    # Other tenant gets strict 404
    r_intruder = client.get(f"/posts/{post.id}", headers=headers_intruder)
    assert r_intruder.status_code == 404
    assert r_intruder.json()["error"]["code"] == "not_found"

    # Random UUID gets 404
    r_rand = client.get(f"/posts/{uuid.uuid4()}", headers=headers_owner)
    assert r_rand.status_code == 404


# Test case: GET /posts/{id}/image.png renders PNG and isolates across users
def test_get_post_image_rendering(client, db_test_schema, ed25519_keys):
    private_key, _ = ed25519_keys
    headers_owner = _auth_headers(private_key, sub="user-artist", name="Artist")
    headers_other = _auth_headers(private_key, sub="user-other", name="Other")

    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post = _seed_post(db, "user-artist", datetime.date.today(), "Visual Post")

    # Owner receives image/png
    r_img = client.get(f"/posts/{post.id}/image.png", headers=headers_owner)
    assert r_img.status_code == 200
    assert r_img.headers["content-type"] == "image/png"
    assert "max-age=3600" in r_img.headers.get("cache-control", "")
    assert len(r_img.content) > 100

    # Other user receives 404
    r_other = client.get(f"/posts/{post.id}/image.png", headers=headers_other)
    assert r_other.status_code == 404


# Test case: Repeat generation claims update the existing run row without duplicate key collisions
def test_generation_run_repeat_claim(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]
    today = datetime.date.today()

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))

        # First run attempt
        run1 = GenerationRun(
            user_id="user-runner",
            run_date=today,
            status="started",
            attempts=1,
        )
        db.add(run1)
        db.commit()

        # Simulated second attempt on same day: should update existing run without constraint violation
        existing = db.query(GenerationRun).filter(
            GenerationRun.user_id == "user-runner",
            GenerationRun.run_date == today,
        ).first()

        assert existing is not None
        existing.status = "started"
        existing.attempts += 1
        db.commit()

        # Verify only one row exists and attempts was incremented
        all_runs = db.query(GenerationRun).filter(GenerationRun.user_id == "user-runner").all()
        assert len(all_runs) == 1
        assert all_runs[0].attempts == 2
