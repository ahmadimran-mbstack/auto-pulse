import base64
import os
import sys
import time
from pathlib import Path
import jwt
import pytest
import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519
from fastapi.testclient import TestClient

# Ensure backend directory is in sys.path so we can import app modules directly
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Set fake environment variables BEFORE importing app configuration
os.environ["NEON_AUTH_BASE_URL"] = "https://fake-auth.neon.tech/neondb/auth"
os.environ["DATABASE_URL"] = "postgresql://fakeuser:fakepass@ep-fake-pooler.neon.tech/neondb?sslmode=require"
os.environ["DATABASE_URL_DIRECT"] = "postgresql://fakeuser:fakepass@ep-fake-direct.neon.tech/neondb?sslmode=require"
os.environ["FRONTEND_URL"] = "http://localhost:3000"
os.environ["ENV"] = "development"
os.environ["LOG_LEVEL"] = "INFO"

from app.core import auth
from app.core.config import settings
from app.main import app


# Test fixture for FastAPI TestClient
@pytest.fixture
def client():
    return TestClient(app)


# Test fixture that generates a real Ed25519 key pair and a matching JWKS response
@pytest.fixture
def ed25519_keys():
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    # Extract the raw 32-byte public key and encode it as base64url
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
    iss: str = "https://fake-auth.neon.tech",
    aud: str = "https://fake-auth.neon.tech",
    exp_delta: int = 900,
    iat_delta: int = 0,
) -> str:
    now = int(time.time())
    payload = {
        "sub": sub,
        "id": sub,
        "email": email,
        "name": name,
        "iss": iss,
        "aud": aud,
        "iat": now + iat_delta,
        "exp": now + exp_delta,
    }
    headers = {"kid": kid}
    return jwt.encode(payload, private_key, algorithm="EdDSA", headers=headers)


# Test case: GET /health returns 200 without requiring auth or database
def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert "X-Request-ID" in response.headers


# Test case: valid token returns 200 with right id, email, and name
def test_valid_token_returns_user_profile(client, monkeypatch, ed25519_keys):
    private_key, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks", lambda: jwks)

    token = create_test_token(
        private_key,
        sub="user-42",
        email="student@example.com",
        name="Alex Smith",
    )
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {
        "id": "user-42",
        "email": "student@example.com",
        "name": "Alex Smith",
    }


# Test case: missing Authorization header returns 401 with standard error shape
def test_missing_auth_header_returns_401(client):
    response = client.get("/me")
    assert response.status_code == 401
    assert response.headers.get("WWW-Authenticate") == "Bearer"
    assert response.json() == {
        "error": {
            "code": "unauthorized",
            "message": "Invalid or missing authentication token",
        }
    }


# Test case: garbage token string returns 401
def test_garbage_token_returns_401(client):
    response = client.get("/me", headers={"Authorization": "Bearer this_is_not_a_valid_token"})
    assert response.status_code == 401
    assert response.headers.get("WWW-Authenticate") == "Bearer"
    assert response.json() == {
        "error": {
            "code": "unauthorized",
            "message": "Invalid or missing authentication token",
        }
    }


# Test case: token signed with a different private key returns 401
def test_token_signed_with_different_key_returns_401(client, monkeypatch, ed25519_keys):
    _, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks", lambda: jwks)

    # Generate a different key pair not present in the JWKS
    different_private_key = ed25519.Ed25519PrivateKey.generate()
    token = create_test_token(different_private_key, kid="key-1")

    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.headers.get("WWW-Authenticate") == "Bearer"
    assert response.json()["error"]["code"] == "unauthorized"


# Test case: expired token returns 401
def test_expired_token_returns_401(client, monkeypatch, ed25519_keys):
    private_key, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks", lambda: jwks)

    # Expired 60 seconds ago
    token = create_test_token(private_key, exp_delta=-60, iat_delta=-120)

    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.headers.get("WWW-Authenticate") == "Bearer"
    assert response.json()["error"]["code"] == "unauthorized"


# Test case: token with wrong issuer returns 401
def test_wrong_issuer_returns_401(client, monkeypatch, ed25519_keys):
    private_key, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks", lambda: jwks)

    token = create_test_token(private_key, iss="https://attacker.example.com")

    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.headers.get("WWW-Authenticate") == "Bearer"
    assert response.json()["error"]["code"] == "unauthorized"


# Test case: JWKS download failure (network error/timeout) returns 503
def test_jwks_download_failure_returns_503(client, monkeypatch, ed25519_keys):
    private_key, _ = ed25519_keys

    # Simulate network failure during JWKS download
    def fake_requests_get(url, timeout=10):
        raise requests.ConnectionError("Connection timed out")

    monkeypatch.setattr(requests, "get", fake_requests_get)

    token = create_test_token(private_key)
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 503
    assert response.json() == {
        "error": {
            "code": "auth_unavailable",
            "message": "Authentication service is temporarily unavailable",
        }
    }
