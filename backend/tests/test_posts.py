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


# Test case: GET /posts returns paginated items and isolates across users
def test_list_posts_user_isolation(client, db_test_schema, ed25519_keys):
    private_key, _ = ed25519_keys
    headers_u1 = _auth_headers(private_key, sub="user-alice", name="Alice")
    headers_u2 = _auth_headers(private_key, sub="user-bob", name="Bob")

    # Initially empty for Alice
    res_empty = client.get("/posts", headers=headers_u1)
    assert res_empty.status_code == 200
    assert res_empty.json() == {"items": [], "next_cursor": None}

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
    assert len(data_u1["items"]) == 1
    assert data_u1["items"][0]["id"] == str(p1.id)
    assert data_u1["items"][0]["topic_title"] == "Alice Topic"
    assert data_u1["next_cursor"] is None

    # Bob only sees his own post
    res_u2 = client.get("/posts", headers=headers_u2)
    assert res_u2.status_code == 200
    data_u2 = res_u2.json()
    assert len(data_u2["items"]) == 1
    assert data_u2["items"][0]["id"] == str(p2.id)
    assert data_u2["items"][0]["topic_title"] == "Bob Topic"
    assert data_u2["next_cursor"] is None


# Test case: GET /posts keyset pagination and status filtering
def test_list_posts_cursor_pagination_and_status_filter(client, db_test_schema, ed25519_keys):
    private_key, _ = ed25519_keys
    headers = _auth_headers(private_key, sub="user-pager", name="Pager User")

    today = datetime.date.today()
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post1 = _seed_post(db, "user-pager", today - datetime.timedelta(days=2), "Post 1")
        post2 = _seed_post(db, "user-pager", today - datetime.timedelta(days=1), "Post 2")
        post3 = _seed_post(db, "user-pager", today, "Post 3")

        # Mark post2 as published
        db.query(Post).filter(Post.id == post2.id).update({"status": "published"})
        db.commit()

    # Page 1 with limit=2
    r_page1 = client.get("/posts?limit=2", headers=headers)
    assert r_page1.status_code == 200
    data1 = r_page1.json()
    assert len(data1["items"]) == 2
    assert data1["next_cursor"] is not None

    # Page 2 using next_cursor
    r_page2 = client.get(f"/posts?limit=2&cursor={data1['next_cursor']}", headers=headers)
    assert r_page2.status_code == 200
    data2 = r_page2.json()
    assert len(data2["items"]) == 1
    assert data2["next_cursor"] is None

    # Filter by status=published
    r_pub = client.get("/posts?status=published", headers=headers)
    assert r_pub.status_code == 200
    pub_data = r_pub.json()
    assert len(pub_data["items"]) == 1
    assert pub_data["items"][0]["id"] == str(post2.id)

    # Invalid cursor returns 422
    r_inv = client.get("/posts?cursor=not-a-valid-cursor", headers=headers)
    assert r_inv.status_code == 422
    assert r_inv.json()["error"]["code"] == "invalid_cursor"


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
