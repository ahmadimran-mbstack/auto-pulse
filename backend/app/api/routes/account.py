import datetime
import logging
from typing import Set
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.core.limiter import get_redis_client
from app.db.session import get_db
from app.models.approval import Approval
from app.models.post import GenerationRun, PlaygroundRun, Post, RunEvent
from app.models.profile import Profile
from app.models.publication import PostPublication
from app.models.slack import SlackApprovalMessage, SlackIntegration
from app.models.social_connection import OAuthState, SocialConnection
from app.repositories import connection as connection_repo
from app.repositories import slack as slack_repo
from app.services.analytics import invalidate_analytics_cache
from app.services.content_profile import invalidate_content_profile_cache
from app.services.run_lock import force_release_manual_run_lock

logger = logging.getLogger(__name__)

router = APIRouter(tags=["account"])

# In-memory fallback set of user IDs whose auth deletion failed after data removal
_deletion_pending_users: Set[str] = set()


# Record a user ID as pending deletion so scheduled jobs skip them on retry
def _mark_deletion_pending(user_id: str) -> None:
    _deletion_pending_users.add(user_id)
    client = get_redis_client()
    if client is not None:
        try:
            client.setex(f"deletion_pending:{user_id}", 86400, "1")
        except Exception:
            pass


# Remove the deletion pending flag once auth user removal succeeds
def _clear_deletion_pending(user_id: str) -> None:
    _deletion_pending_users.discard(user_id)
    client = get_redis_client()
    if client is not None:
        try:
            client.delete(f"deletion_pending:{user_id}")
        except Exception:
            pass


# Check whether a user is marked deletion_pending so the daily loop skips them
def is_user_deletion_pending(user_id: str) -> bool:
    if user_id in _deletion_pending_users:
        return True
    client = get_redis_client()
    if client is not None:
        try:
            return bool(client.get(f"deletion_pending:{user_id}"))
        except Exception:
            pass
    return False


# Clear all per-user Redis keys and in-memory caches
def _clear_user_redis_keys(user_id: str) -> None:
    invalidate_content_profile_cache(user_id)
    invalidate_analytics_cache(user_id)
    client = get_redis_client()
    if client is None:
        return
    try:
        exact_keys = [
            f"rate_limit:slack_connect:{user_id}",
            f"rate_limit:slack_test:{user_id}",
            f"playground:{user_id}",
            f"manual_run_lock:{user_id}",
            f"content_profile:{user_id}",
        ]
        # Remove any analytics range keys for this user
        for key in client.scan_iter(match=f"analytics:{user_id}:*"):
            exact_keys.append(key)
        if exact_keys:
            client.delete(*exact_keys)
    except Exception as exc:
        logger.warning(f"Redis cleanup warning during account deletion: {exc}")


# Permanently delete the signed-in user's account, tokens, app data, and auth record
@router.delete("/account")
def delete_my_account(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    uid = user.id
    now_utc = datetime.datetime.now(datetime.timezone.utc)

    # 1. Stop any running or queued jobs for this user
    try:
        db.query(GenerationRun).filter(
            GenerationRun.user_id == uid,
            GenerationRun.status.in_(["queued", "running", "started"]),
        ).update(
            {
                "status": "cancelled",
                "cancel_requested": True,
                "finished_at": now_utc,
            },
            synchronize_session=False,
        )
        db.query(PlaygroundRun).filter(
            PlaygroundRun.user_id == uid,
            PlaygroundRun.status.in_(["queued", "running", "started"]),
        ).update(
            {
                "status": "cancelled",
                "cancel_requested": True,
                "finished_at": now_utc,
            },
            synchronize_session=False,
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning(f"Failed stopping active runs during account delete: {exc}")
    force_release_manual_run_lock(uid)

    # 2. Best-effort revoke and delete Slack and LinkedIn tokens
    try:
        slack_repo.disconnect_slack_integration(db, user_id=uid)
    except Exception as exc:
        db.rollback()
        logger.warning(f"Best-effort Slack revoke failed during account delete: {exc}")

    try:
        connection_repo.disconnect_linkedin_connection(db, user_id=uid)
    except Exception as exc:
        db.rollback()
        logger.warning(f"Best-effort LinkedIn revoke failed during account delete: {exc}")

    # 3. Delete all app data for this user in one transaction
    try:
        db.query(SlackApprovalMessage).filter(SlackApprovalMessage.user_id == uid).delete(synchronize_session=False)
        db.query(SlackIntegration).filter(SlackIntegration.user_id == uid).delete(synchronize_session=False)
        db.query(OAuthState).filter(OAuthState.user_id == uid).delete(synchronize_session=False)
        db.query(SocialConnection).filter(SocialConnection.user_id == uid).delete(synchronize_session=False)
        db.query(PostPublication).filter(PostPublication.user_id == uid).delete(synchronize_session=False)
        db.query(Approval).filter(Approval.user_id == uid).delete(synchronize_session=False)
        db.query(RunEvent).filter(RunEvent.user_id == uid).delete(synchronize_session=False)
        db.query(PlaygroundRun).filter(PlaygroundRun.user_id == uid).delete(synchronize_session=False)
        db.query(GenerationRun).filter(GenerationRun.user_id == uid).delete(synchronize_session=False)
        db.query(Post).filter(Post.user_id == uid).delete(synchronize_session=False)
        db.query(Profile).filter(Profile.user_id == uid).delete(synchronize_session=False)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error(f"Failed deleting app data during account delete: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "delete_data_failed",
                "message": "Could not delete your account data. Please try again.",
            },
        )

    # 4. Clear Redis keys and in-memory caches
    _clear_user_redis_keys(uid)

    # 5. Delete the Neon Auth user, sessions, accounts, and verification records
    try:
        if user.email:
            db.execute(
                text("DELETE FROM neon_auth.verification WHERE identifier LIKE :pat"),
                {"pat": f"%{user.email.strip().lower()}%"},
            )
        db.execute(text('DELETE FROM neon_auth.session WHERE "userId"::text = :uid'), {"uid": uid})
        db.execute(text('DELETE FROM neon_auth.account WHERE "userId"::text = :uid'), {"uid": uid})
        db.execute(text('DELETE FROM neon_auth."user" WHERE id::text = :uid'), {"uid": uid})
        db.commit()
        _clear_deletion_pending(uid)
    except Exception as exc:
        db.rollback()
        _mark_deletion_pending(uid)
        logger.error(f"Failed deleting auth user after app data removal: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "auth_delete_failed",
                "message": "Your app data was removed, but we could not finish deleting your sign-in record. Please click Delete account again to retry.",
            },
        )

    return {"deleted": True}

