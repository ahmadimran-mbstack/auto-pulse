import datetime
import hashlib
import logging
import secrets
from typing import Any, Dict, Optional, Tuple
import uuid
import zoneinfo
from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.approval import Approval
from app.models.post import Post
from app.models.profile import Profile
from app.models.publication import PostPublication
from app.services.email import send_approval_email

logger = logging.getLogger(__name__)


# Fetch the user email address from neon_auth.user table
def get_user_email(db: Session, user_id: str) -> Optional[str]:
    try:
        stmt = text("SELECT email FROM neon_auth.user WHERE id::text = :user_id LIMIT 1")
        result = db.execute(stmt, {"user_id": user_id}).scalar()
        if result:
            return str(result)
    except Exception as exc:
        logger.warning(f"Could not retrieve email from neon_auth.user: {exc}")
    return None


# Helper to create a new approval record or rotate the token on retry
def create_or_rotate_approval(db: Session, post: Post) -> Tuple[Approval, str]:
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    # Rotate token on retry using UPDATE ... WHERE sent_at IS NULL
    stmt = text(
        "UPDATE approvals "
        "SET token_hash = :token_hash "
        "WHERE post_id = :post_id AND sent_at IS NULL "
        "RETURNING id"
    )
    res = db.execute(stmt, {"token_hash": token_hash, "post_id": post.id}).fetchone()
    if res:
        db.commit()
        existing = db.query(Approval).filter(Approval.id == res.id).first()
        return existing, raw_token

    # Create fresh approval record
    approval = Approval(
        user_id=post.user_id,
        post_id=post.id,
        channel="email",
        token_hash=token_hash,
        expires_at=post.publish_at,
        send_attempts=0,
    )
    db.add(approval)
    db.commit()
    db.refresh(approval)
    return approval, raw_token


# Request user approval by email for a draft post
def request_approval(
    db: Session,
    post: Post,
    recipient_email: Optional[str] = None,
) -> bool:
    now_utc = datetime.datetime.now(datetime.timezone.utc)

    # If post has no publish_at or it has already passed, expire the post
    if not post.publish_at or post.publish_at <= now_utc:
        db.execute(
            text("UPDATE posts SET status = 'expired', updated_at = now() WHERE id = :id AND status IN ('draft', 'awaiting_approval')"),
            {"id": post.id},
        )
        db.commit()
        return False

    # Do not attempt send if less than 10 minutes remain before publish_at
    ten_minutes = datetime.timedelta(minutes=10)
    if post.publish_at - now_utc < ten_minutes:
        logger.info(f"Skipping approval send for post {post.id}: less than 10 minutes before publish deadline")
        return False

    # Check existing approval status and attempts
    approval = db.query(Approval).filter(Approval.post_id == post.id).first()
    if approval and approval.sent_at is not None:
        return True
    if approval and approval.send_attempts >= 3:
        logger.warning(f"Max email send attempts reached for post {post.id}")
        return False

    # Create new approval or rotate token for retry
    approval, raw_token = create_or_rotate_approval(db, post)

    # Determine destination email address
    to_email = recipient_email or get_user_email(db, post.user_id)
    if not to_email:
        approval.send_attempts += 1
        approval.send_error = "Recipient email address not found"
        db.commit()
        logger.error(f"Cannot send approval email: No email address for user {post.user_id}")
        return False

    # Load profile details for display formatting
    profile = db.query(Profile).filter(Profile.user_id == post.user_id).first()
    display_name = (profile.display_name if profile and profile.display_name else "Creator")
    tz_str = profile.timezone if profile and profile.timezone else "UTC"

    try:
        user_tz = zoneinfo.ZoneInfo(tz_str)
    except Exception:
        user_tz = datetime.timezone.utc

    local_publish = post.publish_at.astimezone(user_tz)
    weekday = local_publish.strftime("%A")
    time_str = local_publish.strftime("%H:%M")
    local_deadline = local_publish.strftime("%A at %H:%M %Z")

    idempotency_key = f"{approval.id}-{approval.send_attempts + 1}"

    try:
        send_approval_email(
            to_email=to_email,
            display_name=display_name,
            weekday=weekday,
            time_str=time_str,
            local_deadline=local_deadline,
            topic_title=post.topic_title,
            caption=post.caption,
            raw_token=raw_token,
            idempotency_key=idempotency_key,
        )

        # Record successful dispatch and advance post status
        approval.sent_at = datetime.datetime.now(datetime.timezone.utc)
        approval.send_attempts += 1
        approval.send_error = None

        db.execute(
            text("UPDATE posts SET status = 'awaiting_approval', updated_at = now() WHERE id = :id AND status = 'draft'"),
            {"id": post.id},
        )
        db.commit()
        return True

    except Exception as exc:
        approval.send_attempts += 1
        approval.send_error = str(exc)[:200]
        db.commit()
        logger.warning(f"Approval email dispatch failed for post {post.id}: {exc}")
        return False


# Centralized decision function shared by public link and dashboard routes
def decide_approval(
    db: Session,
    decision: str,
    decided_via: str,
    token_hash: Optional[str] = None,
    post_id: Optional[uuid.UUID] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    # Atomically claim the approval where no decision has been recorded yet and deadline is active
    if token_hash:
        claim_stmt = text(
            "UPDATE approvals "
            "SET decision = :decision, decided_at = now(), decided_via = :decided_via "
            "WHERE token_hash = :token_hash AND decision IS NULL AND expires_at > now() "
            "RETURNING id, post_id, user_id"
        )
        params = {"decision": decision, "decided_via": decided_via, "token_hash": token_hash}
    elif post_id and user_id:
        claim_stmt = text(
            "UPDATE approvals "
            "SET decision = :decision, decided_at = now(), decided_via = :decided_via "
            "WHERE post_id = :post_id AND user_id = :user_id AND decision IS NULL AND expires_at > now() "
            "RETURNING id, post_id, user_id"
        )
        params = {"decision": decision, "decided_via": decided_via, "post_id": post_id, "user_id": user_id}
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "bad_request", "message": "Missing token or post identifier"},
        )

    result = db.execute(claim_stmt, params).fetchone()

    if result:
        claimed_post_id = result.post_id
        claimed_user_id = result.user_id

        # Update post state and create publication row on approval
        if decision == "approved":
            db.execute(
                text("UPDATE posts SET status = 'approved', updated_at = now() WHERE id = :id AND status = 'awaiting_approval'"),
                {"id": claimed_post_id},
            )
            # Create exactly one pending publication record for LinkedIn
            pub = PostPublication(
                user_id=claimed_user_id,
                post_id=claimed_post_id,
                platform="linkedin",
                status="pending",
                attempts=0,
            )
            db.add(pub)
        elif decision == "rejected":
            db.execute(
                text("UPDATE posts SET status = 'rejected', updated_at = now() WHERE id = :id AND status = 'awaiting_approval'"),
                {"id": claimed_post_id},
            )

        db.commit()
        return {"status": "ok", "decision": decision}

    # If atomic update returned nothing, determine the exact failure reason
    query = db.query(Approval)
    if token_hash:
        query = query.filter(Approval.token_hash == token_hash)
    elif post_id and user_id:
        query = query.filter(Approval.post_id == post_id, Approval.user_id == user_id)

    approval_record = query.first()

    if not approval_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Approval not found"},
        )

    # Already decided conflict
    if approval_record.decision is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "already_decided",
                "message": "Post has already been decided",
                "state": approval_record.decision,
            },
        )

    # Deadline has expired
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    if approval_record.expires_at <= now_utc:
        # Mark post as expired if still in draft or awaiting_approval
        db.execute(
            text("UPDATE posts SET status = 'expired', updated_at = now() WHERE id = :id AND status IN ('draft', 'awaiting_approval')"),
            {"id": approval_record.post_id},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "expired", "message": "Approval deadline has passed"},
        )

    # Default fallback if state changed concurrently
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "conflict", "message": "Could not complete approval decision"},
    )
