import base64
from pathlib import Path
import os
import sys
import time
import uuid
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519
from dotenv import dotenv_values, load_dotenv
from fastapi.testclient import TestClient
import jwt
import pytest
from sqlalchemy import create_engine, pool, select, text
from sqlalchemy.orm import sessionmaker

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

ENV_FILE = BACKEND_DIR / ".env"
if ENV_FILE.exists():
    load_dotenv(ENV_FILE, override=False)

from app.core import auth
from app.core.config import settings
from app.db.session import Base, get_db, normalize_db_url
from app.main import app
from app.models.profile import Profile


# Shared TestClient fixture
@pytest.fixture
def client():
    return TestClient(app)


# Shared Ed25519 key pair and JWKS fixture
@pytest.fixture
def ed25519_keys():
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    x_b64 = base64.urlsafe_b64encode(public_bytes).decode("ascii").rstrip("=")

    jwks = {
        "keys": [
            {
                "kty": "OKP",
                "crv": "Ed25519",
                "kid": "key-1",
                "x": x_b64,
            }
        ]
    }
    return private_key, jwks


# Helper function to mint test JWT tokens signed with EdDSA
def create_test_token(
    private_key,
    kid: str = "key-1",
    sub: str = "user-12345",
    email: str = "student@example.com",
    name: str = "Student Engineer",
    iss: str = None,
    aud: str = None,
    exp_delta: int = 900,
    iat_delta: int = 0,
) -> str:
    now = int(time.time())
    token_iss = iss if iss is not None else settings.auth_origin
    token_aud = aud if aud is not None else settings.auth_origin
    payload = {
        "sub": sub,
        "id": sub,
        "email": email,
        "name": name,
        "iss": token_iss,
        "aud": token_aud,
        "iat": now + iat_delta,
        "exp": now + exp_delta,
    }
    headers = {"kid": kid}
    return jwt.encode(payload, private_key, algorithm="EdDSA", headers=headers)


# Temporary schema fixture for real database isolation tests
@pytest.fixture
def db_test_schema(monkeypatch, ed25519_keys):
    # Mock JWKS fetch so token validation succeeds during API calls
    _, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks", lambda: jwks)

    # Read DATABASE_URL_DIRECT from environment or .env without ever logging or printing it
    env_vals = dotenv_values(ENV_FILE) if ENV_FILE.exists() else {}
    env_direct = env_vals.get("DATABASE_URL_DIRECT") or os.environ.get("DATABASE_URL_DIRECT")

    # If DATABASE_URL_DIRECT is not explicitly defined, derive it from DATABASE_URL
    if not env_direct or "fakeuser" in env_direct:
        db_url = env_vals.get("DATABASE_URL") or os.environ.get("DATABASE_URL")
        if db_url and "fakeuser" not in db_url:
            env_direct = db_url.replace("-pooler.", ".")

    if not env_direct or "fakeuser" in env_direct:
        pytest.skip("DATABASE_URL_DIRECT is not configured or uses a dummy host; skipping database tests")

    db_url = normalize_db_url(env_direct)

    engine = create_engine(db_url, poolclass=pool.NullPool)

    # Test database connectivity
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        pytest.skip(f"Database is unreachable; skipping database tests: {exc}")

    # Generate random schema name starting with test_
    schema_name = f"test_{uuid.uuid4().hex[:12]}"
    assert schema_name.startswith("test_"), "Schema name must start with test_"

    # Create isolated schema in PostgreSQL
    with engine.connect() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema_name}"'))
        conn.commit()

    # Automatically set search_path on any connection checked out from the test engine
    from sqlalchemy import event

    @event.listens_for(engine, "connect")
    def _set_test_search_path(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute(f'SET search_path TO "{schema_name}"')
        cursor.close()

    # Create tables inside the isolated schema
    with engine.connect() as conn:
        Base.metadata.create_all(bind=conn)
        conn.commit()

    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Override get_db dependency for API routes during this test
    def override_get_db():
        db = TestingSessionLocal()
        try:
            db.execute(text(f'SET search_path TO "{schema_name}"'))
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db


    try:
        yield {
            "engine": engine,
            "schema_name": schema_name,
            "SessionLocal": TestingSessionLocal,
        }
    finally:
        app.dependency_overrides.pop(get_db, None)

        # Safety check: only ever drop schemas whose name starts with test_
        if schema_name.startswith("test_"):
            with engine.connect() as conn:
                conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE'))
                conn.commit()

        engine.dispose()
