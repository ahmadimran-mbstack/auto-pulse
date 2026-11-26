"""Public plans and authenticated user entitlements routes."""

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.core.limiter import public_rate_limit, rate_limit
from app.db.session import get_db
from app.services.entitlements import get_entitlements, get_public_plans_payload

router = APIRouter(prefix="/api", tags=["plans"])


@router.get("/plans", dependencies=[Depends(public_rate_limit("public"))])
def list_public_plans(response: Response):
    """Public endpoint returning available plans, pricing, and limits (no auth)."""
    response.headers["Cache-Control"] = "public, max-age=15, stale-while-revalidate=30"
    return get_public_plans_payload()


@router.get("/me/entitlements", dependencies=[Depends(rate_limit("api"))])
def read_my_entitlements(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Return the authenticated user's plan, computed status, limits, features, and usage."""
    res = get_entitlements(db, user.id)
    db.commit()
    return res
