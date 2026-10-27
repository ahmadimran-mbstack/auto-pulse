import datetime
import hashlib
import secrets
import logging
from typing import List, Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session
from app.core.crypto import decrypt_text, encrypt_text
from app.models.social_connection import OAuthState, SocialConnection
from app.schemas.connection import ConnectionSummaryResponse
from app.services.linkedin import refresh_access_token, revoke_token_best_effort
from app.services.linkedin_publisher import (
    LinkedInNotConnectedError,
    LinkedInReconnectRequiredError,
    LinkedInTokenExpiredError,
)

logger = logging.getLogger(__name__)


def create_oauth_state(
    db: Session,
    user_id: str,
    provider: str = "linkedin",
    return_to: str = "dashboard",
) -> str:
    # return_to is strictly restricted to onboarding or dashboard
    if return_to not in ("onboarding", "dashboard"):
        raise ValueError("return_to is only allowed to be 'onboarding' or 'dashboard'")

    # Generate at least 32 bytes of cryptographically secure random state
    raw_state = secrets.token_urlsafe(32)

    # Compute SHA-256 hash of the random state (never store raw state in database)
    state_hash = hashlib.sha256(raw_state.encode("utf-8")).hexdigest()

    now = datetime.datetime.now(datetime.timezone.utc)
    expires_at = now + datetime.timedelta(minutes=10)

    # Clean up caller's previous expired or used states
    db.execute(
        delete(OAuthState).where(
            OAuthState.user_id == user_id,
            OAuthState.provider == provider,
            (OAuthState.expires_at <= now) | (OAuthState.used_at.is_not(None)),
        )
    )

    # Store state hash record with 10-minute validity
    oauth_state = OAuthState(
        state_hash=state_hash,
        user_id=user_id,
        provider=provider,
        return_to=return_to,
        created_at=now,
        expires_at=expires_at,
        used_at=None,
    )
    db.add(oauth_state)
    db.commit()

    return raw_state


def claim_oauth_state(db: Session, user_id: str, raw_state: str) -> Optional[str]:
    # Compute SHA-256 hash to look up the state in the database
    state_hash = hashlib.sha256(raw_state.encode("utf-8")).hexdigest()

    # Atomically mark the state as used in a single UPDATE statement
    # If the state was already used, expired, or belongs to another user, no row is updated
    stmt = text(
        "UPDATE oauth_states "
        "SET used_at = now() "
        "WHERE state_hash = :hash AND user_id = :user_id AND used_at IS NULL AND expires_at > now() "
        "RETURNING provider"
    )

    result = db.execute(stmt, {"hash": state_hash, "user_id": user_id}).scalar_one_or_none()
    db.commit()

    return result


def claim_public_oauth_state(db: Session, raw_state: str) -> Optional[dict]:
    # Compute SHA-256 hash to look up the state in the database
    state_hash = hashlib.sha256(raw_state.encode("utf-8")).hexdigest()

    # Atomically claim and mark the state as used in a single UPDATE statement without user_id in header
    stmt = text(
        "UPDATE oauth_states "
        "SET used_at = now() "
        "WHERE state_hash = :hash AND used_at IS NULL AND expires_at > now() "
        "RETURNING user_id, provider, return_to"
    )

    row = db.execute(stmt, {"hash": state_hash}).mappings().fetchone()
    db.commit()

    return dict(row) if row else None


def format_connection_summary(conn: SocialConnection) -> ConnectionSummaryResponse:
    # Compute remaining full days until the access token expires
    now = datetime.datetime.now(datetime.timezone.utc)
    expires_at = conn.expires_at

    # Ensure timezone awareness for safe date comparisons
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=datetime.timezone.utc)

    if expires_at <= now:
        days_left = 0
        current_status = "expired"
    else:
        diff = expires_at - now
        days_left = max(0, diff.days)
        current_status = conn.status

    return ConnectionSummaryResponse(
        provider=conn.provider,
        status=current_status,
        account_name=conn.account_name,
        connected_at=conn.connected_at,
        expires_at=conn.expires_at,
        days_left=days_left,
    )


def get_user_connections(db: Session, user_id: str) -> List[ConnectionSummaryResponse]:
    # Query all social connections belonging to the calling user
    query = (
        select(SocialConnection)
        .where(SocialConnection.user_id == user_id)
        .order_by(SocialConnection.created_at.desc())
    )
    connections = db.execute(query).scalars().all()

    now = datetime.datetime.now(datetime.timezone.utc)
    summaries: List[ConnectionSummaryResponse] = []
    has_status_updates = False

    for conn in connections:
        expires_at = conn.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=datetime.timezone.utc)

        # Automatically transition active connections to expired when past expires_at
        if expires_at <= now and conn.status == "active":
            conn.status = "expired"
            conn.updated_at = now
            has_status_updates = True

        summaries.append(format_connection_summary(conn))

    if has_status_updates:
        db.commit()

    return summaries


def save_linkedin_connection(
    db: Session,
    user_id: str,
    provider_account_id: str,
    account_name: Optional[str],
    access_token: str,
    expires_in_seconds: int,
    scopes: List[str],
) -> ConnectionSummaryResponse:
    # Check if this LinkedIn member ID is already connected to a different AutoPulse user
    conflict_query = select(SocialConnection).where(
        SocialConnection.provider == "linkedin",
        SocialConnection.provider_account_id == provider_account_id,
        SocialConnection.user_id != user_id,
    )
    existing_conflict = db.execute(conflict_query).scalar_one_or_none()
    if existing_conflict is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "account_already_connected",
                "message": "This LinkedIn account is already connected to another user.",
            },
        )

    # Encrypt the access token with Fernet before writing to database
    access_token_enc = encrypt_text(access_token)

    now = datetime.datetime.now(datetime.timezone.utc)
    expires_at = now + datetime.timedelta(seconds=expires_in_seconds)

    # Check if the caller already has a LinkedIn connection row to update
    current_conn_query = select(SocialConnection).where(
        SocialConnection.user_id == user_id,
        SocialConnection.provider == "linkedin",
    )
    conn = db.execute(current_conn_query).scalar_one_or_none()

    if conn is not None:
        # Reconnection replaces the tokens, timestamps, scopes, and marks active
        conn.provider_account_id = provider_account_id
        conn.account_name = account_name
        conn.access_token_enc = access_token_enc
        conn.refresh_token_enc = None
        conn.expires_at = expires_at
        conn.scopes = scopes
        conn.status = "active"
        conn.connected_at = now
        conn.updated_at = now
    else:
        # Create a new connection record
        conn = SocialConnection(
            user_id=user_id,
            provider="linkedin",
            provider_account_id=provider_account_id,
            account_name=account_name,
            access_token_enc=access_token_enc,
            refresh_token_enc=None,
            expires_at=expires_at,
            scopes=scopes,
            status="active",
            connected_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(conn)

    db.commit()
    db.refresh(conn)

    return format_connection_summary(conn)


def disconnect_linkedin_connection(db: Session, user_id: str) -> None:
    # Look up caller's LinkedIn connection
    query = select(SocialConnection).where(
        SocialConnection.user_id == user_id,
        SocialConnection.provider == "linkedin",
    )
    conn = db.execute(query).scalar_one_or_none()

    if conn is None:
        # Return cleanly if no connection exists
        return

    # Attempt best-effort revocation with decrypted access token
    try:
        plain_token = decrypt_text(conn.access_token_enc)
        revoke_token_best_effort(plain_token)
    except Exception:
        pass

    # Delete the caller's row in database
    db.delete(conn)
    db.commit()


def get_valid_linkedin_connection_token(
    db: Session,
    user_id: str,
) -> Tuple[str, SocialConnection]:
    # Look up the caller's LinkedIn connection row only
    query = select(SocialConnection).where(
        SocialConnection.user_id == user_id,
        SocialConnection.provider == "linkedin",
    )
    conn = db.execute(query).scalar_one_or_none()

    if conn is None:
        raise LinkedInNotConnectedError("LinkedIn account is not connected.")

    now = datetime.datetime.now(datetime.timezone.utc)
    expires_at = conn.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=datetime.timezone.utc)

    # Check if access token is near expiry (within 5 minutes) or already expired
    is_near_expiry = expires_at <= (now + datetime.timedelta(minutes=5))

    if is_near_expiry:
        # If a refresh token is stored, attempt token refresh
        if conn.refresh_token_enc:
            try:
                plain_refresh_token = decrypt_text(conn.refresh_token_enc)
            except Exception:
                conn.status = "expired"
                db.commit()
                raise LinkedInReconnectRequiredError("Could not decrypt refresh token. Please reconnect.")

            try:
                new_token, expires_in, new_refresh = refresh_access_token(plain_refresh_token)
                conn.access_token_enc = encrypt_text(new_token)
                if new_refresh:
                    conn.refresh_token_enc = encrypt_text(new_refresh)
                conn.expires_at = now + datetime.timedelta(seconds=expires_in)
                conn.status = "active"
                conn.updated_at = now
                db.commit()
                db.refresh(conn)
                return new_token, conn
            except Exception as exc:
                logger.warning(f"LinkedIn token refresh failed for user {user_id}: {exc}")
                conn.status = "expired"
                db.commit()
                raise LinkedInReconnectRequiredError("LinkedIn token refresh failed. Please reconnect.")
        else:
            # No refresh token stored and access token is already expired
            if expires_at <= now or conn.status != "active":
                conn.status = "expired"
                db.commit()
                raise LinkedInTokenExpiredError("LinkedIn access token is expired. Please reconnect.")
            # If still within 5 minutes but not yet past expires_at, allow using current access token

    if conn.status != "active" or expires_at <= now:
        conn.status = "expired"
        db.commit()
        raise LinkedInTokenExpiredError("LinkedIn access token is expired or inactive. Please reconnect.")

    if not conn.access_token_enc:
        raise LinkedInTokenExpiredError("LinkedIn connection has no access token. Please reconnect.")

    try:
        access_token = decrypt_text(conn.access_token_enc)
    except Exception:
        raise LinkedInReconnectRequiredError("Could not decrypt LinkedIn access token. Please reconnect.")

    return access_token, conn


def get_linkedin_status(
    db: Session,
    user_id: str,
) -> dict:
    # Look up the caller's LinkedIn connection row and determine connection health
    query = select(SocialConnection).where(
        SocialConnection.user_id == user_id,
        SocialConnection.provider == "linkedin",
    )
    conn = db.execute(query).scalar_one_or_none()

    if conn is None:
        return {
            "connected": False,
            "expires_at": None,
            "account_name": None,
            "status": "not_connected",
        }

    now = datetime.datetime.now(datetime.timezone.utc)
    expires_at = conn.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=datetime.timezone.utc)

    # Automatically transition to expired when past expires_at
    if expires_at <= now:
        is_connected = False
        current_status = "expired"
        if conn.status == "active":
            conn.status = "expired"
            conn.updated_at = now
            db.commit()
    else:
        is_connected = conn.status == "active"
        current_status = conn.status

    return {
        "connected": is_connected,
        "expires_at": expires_at.isoformat(),
        "account_name": conn.account_name,
        "status": current_status,
    }

