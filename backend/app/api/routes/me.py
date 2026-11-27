from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.admin_deps import resolve_user_email_and_verified
from app.core.auth import User, current_user
from app.core.config import settings
from app.db.session import get_db

router = APIRouter(tags=["auth"])


# Protected route returning current user's profile, admin, status, and onboarding state
@router.get("/me")
def get_me(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    resolved_email, _email_verified = resolve_user_email_and_verified(db, user)
    is_admin = bool(
        resolved_email
        and resolved_email in settings.admin_email_set
    )

    onboarding_completed = bool(
        db.execute(
            text("SELECT onboarding_completed_at IS NOT NULL FROM profiles WHERE user_id = :uid LIMIT 1"),
            {"uid": user.id},
        ).scalar()
        or False
    )

    return {
        "id": user.id,
        "email": resolved_email or user.email,
        "name": user.name,
        "is_admin": is_admin,
        "status": "active",
        "onboarding_completed": onboarding_completed,
        "customization_enabled": settings.is_customization_enabled_for(user.id),
    }
