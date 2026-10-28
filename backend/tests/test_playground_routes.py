import datetime
from unittest.mock import MagicMock, patch
import uuid
from sqlalchemy import text

from app.models.approval import Approval
from app.models.post import GenerationRun, PlaygroundRun, Post
from tests.conftest import create_test_token


def _auth_headers(private_key, sub: str = "user-123", name: str = "Test User") -> dict:
    token = create_test_token(private_key=private_key, sub=sub, name=name)
    return {"Authorization": f"Bearer {token}"}


def test_create_playground_run_enqueued(client, db_test_schema, ed25519_keys, monkeypatch):
    """POST /playground/runs returns 202 Accepted and creates a queued PlaygroundRun record."""
    private_key, _ = ed25519_keys
    headers = _auth_headers(private_key, sub="user-alice", name="Alice")

    # Mock Redis rate limiter so it doesn't fail if redis is not running
    monkeypatch.setattr("app.api.routes.playground.enforce_rate_limit", lambda *args, **kwargs: None)

    # Mock background pipeline task to prevent background LLM calls during endpoint test
    with patch("app.api.routes.playground.run_playground_pipeline_task") as mock_task:
        res = client.post("/playground/runs", headers=headers)
        assert res.status_code == 202
        data = res.json()
        assert "run_id" in data
        assert data["status"] == "queued"
        run_uuid = uuid.UUID(data["run_id"])

        SessionLocal = db_test_schema["SessionLocal"]
        schema_name = db_test_schema["schema_name"]
        with SessionLocal() as db:
            db.execute(text(f'SET search_path TO "{schema_name}"'))
            db_run = db.query(PlaygroundRun).filter(PlaygroundRun.id == run_uuid).first()
            assert db_run is not None
            assert db_run.user_id == "user-alice"
            assert db_run.status == "queued"


def test_get_playground_run_user_isolation(client, db_test_schema, ed25519_keys):
    """GET /playground/runs/{id} returns details for the owner and 404 for other users."""
    private_key, _ = ed25519_keys
    headers_alice = _auth_headers(private_key, sub="user-alice", name="Alice")
    headers_bob = _auth_headers(private_key, sub="user-bob", name="Bob")

    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    run_id = uuid.uuid4()
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        p_run = PlaygroundRun(
            id=run_id,
            user_id="user-alice",
            status="completed",
            current_step="completed",
            round=1,
            result={"post_text": "Alice's test playground post"},
            trace={"exit_reason": "passed", "final_score": 10},
        )
        db.add(p_run)
        db.commit()

    # Alice requests her own run -> 200 OK
    res_alice = client.get(f"/playground/runs/{run_id}", headers=headers_alice)
    assert res_alice.status_code == 200
    data_alice = res_alice.json()
    assert data_alice["id"] == str(run_id)
    assert data_alice["status"] == "completed"
    assert data_alice["result"]["post_text"] == "Alice's test playground post"
    assert data_alice["trace"]["exit_reason"] == "passed"

    # Bob requests Alice's run -> 404 Not Found (Data Isolation!)
    res_bob = client.get(f"/playground/runs/{run_id}", headers=headers_bob)
    assert res_bob.status_code == 404
    err_body = res_bob.json()
    assert err_body.get("error", {}).get("message") == "Playground run not found"


def test_playground_never_creates_post_or_approval(db_test_schema, monkeypatch):
    """Execution of playground background task NEVER writes to posts or approvals tables."""
    from app.api.routes.playground import run_playground_pipeline_task
    from app.models.profile import Profile

    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    run_id = uuid.uuid4()
    user_id = "user-alice"

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        p_run = PlaygroundRun(
            id=run_id,
            user_id=user_id,
            status="queued",
            current_step="queued",
            round=0,
        )
        db.add(p_run)

        profile = Profile(
            user_id=user_id,
            role_title="AI Engineer",
            industry="Technology",
        )
        db.add(profile)
        db.commit()

    # Mock execute_pipeline to return a successful run
    mock_pipeline_return = {
        "round": 0,
        "draft": {
            "post_text": "Sample test post caption that is long enough for testing purposes.",
            "hashtags": ["ai", "testing"],
            "image_headline": "Test AI",
        },
        "ai_score": 10,
        "needs_review": False,
        "agent_trace": {"exit_reason": "passed", "final_score": 10},
    }

    monkeypatch.setattr(
        "app.api.routes.playground.execute_pipeline",
        lambda *args, **kwargs: mock_pipeline_return,
    )
    # Mock SessionLocal in playground route module to point to test schema session
    monkeypatch.setattr("app.api.routes.playground.SessionLocal", SessionLocal)

    # Execute the playground pipeline task
    run_playground_pipeline_task(run_id, user_id)

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        # 1. Playground run is completed with results
        run = db.query(PlaygroundRun).filter(PlaygroundRun.id == run_id).first()
        assert run.status == "completed"
        assert run.result is not None
        assert run.trace is not None

        # 2. Crucial assertion: 0 Post records and 0 Approval records created!
        post_count = db.query(Post).filter(Post.user_id == user_id).count()
        approval_count = db.query(Approval).filter(Approval.user_id == user_id).count()
        assert post_count == 0, "Playground runs must NEVER create Post records"
        assert approval_count == 0, "Playground runs must NEVER create Approval records"


def test_get_post_agent_trace_isolation(client, db_test_schema, ed25519_keys):
    """GET /posts/{post_id}/agent-trace returns trace for post owner and 404 for other users."""
    private_key, _ = ed25519_keys
    headers_alice = _auth_headers(private_key, sub="user-alice", name="Alice")
    headers_bob = _auth_headers(private_key, sub="user-bob", name="Bob")

    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    post_id = uuid.uuid4()
    run_id = uuid.uuid4()
    trace_data = {
        "exit_reason": "passed",
        "final_score": 12,
        "best_round": 0,
        "gtm_review": {"hook_strength": 9},
    }

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post = Post(
            id=post_id,
            user_id="user-alice",
            run_date=datetime.date.today(),
            status="draft",
            topic_title="Kafka 3.8 Features",
            topic_url="https://example.com/kafka",
            sources=[{"title": "Kafka Blog", "url": "https://example.com/kafka"}],
            caption="Apache Kafka 3.8 introduces major storage improvements.\n\nTiered storage is now mature.",
            hashtags=["Kafka", "DataEngineering"],
            image_spec={"headline": "Kafka 3.8", "brand_name": "AutoPulse"},
            llm_model="gpt-test",
            prompt_version="v2",
            ai_score=12,
            needs_review=False,
        )
        db.add(post)

        gen_run = GenerationRun(
            id=run_id,
            user_id="user-alice",
            run_date=datetime.date.today(),
            status="succeeded",
            post_id=post_id,
            agent_trace=trace_data,
        )
        db.add(gen_run)
        db.commit()

    # Alice requests her post's agent trace -> 200 OK with trace
    res_alice = client.get(f"/posts/{post_id}/agent-trace", headers=headers_alice)
    assert res_alice.status_code == 200
    data_alice = res_alice.json()
    assert data_alice["post_id"] == str(post_id)
    assert data_alice["agent_trace"] == trace_data

    # Bob requests Alice's post's agent trace -> 404 Not Found (Data Isolation!)
    res_bob = client.get(f"/posts/{post_id}/agent-trace", headers=headers_bob)
    assert res_bob.status_code == 404


def test_get_generation_run_isolation(client, db_test_schema, ed25519_keys):
    """GET /runs/{run_id} returns run detail and trace for owner and 404 for other users."""
    private_key, _ = ed25519_keys
    headers_alice = _auth_headers(private_key, sub="user-alice", name="Alice")
    headers_bob = _auth_headers(private_key, sub="user-bob", name="Bob")

    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    run_id = uuid.uuid4()
    trace_data = {"exit_reason": "max_rounds", "final_score": 18, "best_round": 2}

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        gen_run = GenerationRun(
            id=run_id,
            user_id="user-alice",
            run_date=datetime.date.today(),
            status="succeeded",
            current_step="completed",
            round=3,
            agent_trace=trace_data,
        )
        db.add(gen_run)
        db.commit()

    # Alice requests her generation run -> 200 OK
    res_alice = client.get(f"/runs/{run_id}", headers=headers_alice)
    assert res_alice.status_code == 200
    data_alice = res_alice.json()
    assert data_alice["id"] == str(run_id)
    assert data_alice["round"] == 3
    assert data_alice["agent_trace"] == trace_data

    # Bob requests Alice's generation run -> 404 Not Found (Data Isolation!)
    res_bob = client.get(f"/runs/{run_id}", headers=headers_bob)
    assert res_bob.status_code == 404


def test_stale_playground_runs_sweeper(db_test_schema):
    """Sweeper marks runs in 'running' for > 10 minutes as 'failed'."""
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    stale_run_id = uuid.uuid4()
    fresh_run_id = uuid.uuid4()

    eleven_mins_ago = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=11)
    two_mins_ago = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=2)

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        # 1. Stale run
        stale_run = PlaygroundRun(
            id=stale_run_id,
            user_id="user-alice",
            status="running",
            current_step="drafter",
            round=1,
            started_at=eleven_mins_ago,
        )
        # 2. Fresh run
        fresh_run = PlaygroundRun(
            id=fresh_run_id,
            user_id="user-bob",
            status="running",
            current_step="drafter",
            round=0,
            started_at=two_mins_ago,
        )
        db.add_all([stale_run, fresh_run])
        db.commit()

        # Run sweeper query
        db.execute(
            text(
                "UPDATE playground_runs "
                "SET status = 'failed', finished_at = now() "
                "WHERE status = 'running' AND started_at < now() - interval '10 minutes'"
            )
        )
        db.commit()

        # Check results
        stale = db.query(PlaygroundRun).filter(PlaygroundRun.id == stale_run_id).first()
        fresh = db.query(PlaygroundRun).filter(PlaygroundRun.id == fresh_run_id).first()

        assert stale.status == "failed"
        assert stale.finished_at is not None
        assert fresh.status == "running"
