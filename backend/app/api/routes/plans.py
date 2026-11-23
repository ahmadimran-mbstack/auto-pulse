"""Public plans and authenticated user entitlements routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.db.session import get_db
from app.services.entitlements import get_entitlements, get_public_plans_payload

router = APIRouter(prefix="/api", tags=["plans"])


@router.get("/plans")
def list_public_plans():
    """Public endpoint returning available plans, pricing, and limits (no auth)."""
    return get_public_plans_payload()


@router.get("/me/entitlements")
def read_my_entitlements(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Return the authenticated user's plan, computed status, limits, features, and usage."""
    res = get_entitlements(db, user.id)
    db.commit()
    return res
