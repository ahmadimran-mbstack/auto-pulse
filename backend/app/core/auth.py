import base64
import logging
from dataclasses import dataclass
from typing import Optional
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import Header, HTTPException, status
import jwt
import requests
from app.core.config import settings

logger = logging.getLogger(__name__)


# Small dataclass representing the authenticated user from the token payload
@dataclass
class User:
    id: str
    email: Optional[str] = None
    name: Optional[str] = None


# Helper function to raise a uniform 401 response
# The client always receives the exact same message without revealing internal check details
def _raise_unauthorized() -> None:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={
            "code": "unauthorized",
            "message": "Invalid or missing authentication token",
        },
        headers={"WWW-Authenticate": "Bearer"},
    )


# Download the JWKS from Neon Auth with a 10 second timeout
# Reference: https://neon.com/docs/auth/guides/plugins/jwt
def _fetch_jwks() -> dict:
    # DAY 6: cache the keys and refetch once if the kid is unknown
    try:
        response = requests.get(settings.jwks_url, timeout=10)
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        # Network errors or timeouts return 503 so clients are not logged out during a brief Neon outage
        logger.error(f"Failed to fetch JWKS from Neon Auth: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "auth_unavailable",
                "message": "Authentication service is temporarily unavailable",
            },
        )


# FastAPI dependency that extracts and validates the Bearer token, returning the current user
def current_user(authorization: Optional[str] = Header(None)) -> User:
    # Check that the Authorization header is present and starts with 'Bearer '
    if not authorization or not authorization.startswith("Bearer "):
        logger.warning("Authentication failed: Missing or malformed Authorization header")
        _raise_unauthorized()

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        logger.warning("Authentication failed: Empty bearer token")
        _raise_unauthorized()

    # Read the token header without verifying yet, in order to get the key id ('kid')
    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        if not kid:
            logger.warning("Authentication failed: Token header is missing 'kid'")
            _raise_unauthorized()
    except Exception as exc:
        logger.warning(f"Authentication failed: Unable to read token header ({exc})")
        _raise_unauthorized()

    # Download public keys from Neon Auth
    jwks = _fetch_jwks()

    # Find the key whose 'kid' matches the key ID in the token header
    matching_key = None
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            matching_key = key
            break

    if not matching_key:
        logger.warning("Authentication failed: No matching kid found in JWKS")
        _raise_unauthorized()

    # Build the Ed25519 public key from the base64url-encoded 'x' parameter
    try:
        raw_x = matching_key.get("x", "")
        # Add required padding for base64url decoding
        padded_x = raw_x + "=" * (-len(raw_x) % 4)
        public_key_bytes = base64.urlsafe_b64decode(padded_x)
        public_key = Ed25519PublicKey.from_public_bytes(public_key_bytes)
    except Exception as exc:
        logger.warning(f"Authentication failed: Invalid public key bytes in JWKS ({exc})")
        _raise_unauthorized()

    # Decode and verify token signature, expiration, issuer, audience, and required claims
    try:
        payload = jwt.decode(
            token,
            key=public_key,
            algorithms=["EdDSA"],
            issuer=settings.auth_origin,
            audience=settings.auth_origin,
            options={
                "require": ["exp", "iat", "sub", "iss", "aud"],
            },
        )
    except jwt.PyJWTError as exc:
        # Any verification issue (expired, bad signature, wrong issuer, etc.) is logged server-side
        # but returns a generic 401 to the client
        logger.warning(f"Authentication failed: JWT verification error ({exc})")
        _raise_unauthorized()

    user_id = payload.get("sub") or payload.get("id")
    if not user_id:
        logger.warning("Authentication failed: Token payload missing subject id")
        _raise_unauthorized()

    return User(
        id=str(user_id),
        email=payload.get("email"),
        name=payload.get("name"),
    )
