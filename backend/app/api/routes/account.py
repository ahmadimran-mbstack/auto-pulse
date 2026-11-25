import logging
from typing import Set
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.core.limiter import get_redis_client
from app.db.session import get_db
from app.services.account_deletion import delete_user_account

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


# Permanently delete the signed-in user's account, tokens, app data, and auth record
@router.delete("/account")
def delete_my_account(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    try:
        delete_user_account(
            db=db,
            user_id=user.id,
            user_email=user.email,
            deleted_by=user.email or user.id,
            reason="self_delete",
            record_deleted_account=False,
        )
        _clear_deletion_pending(user.id)
        return {"deleted": True}
    except Exception:
        _mark_deletion_pending(user.id)
        raise
