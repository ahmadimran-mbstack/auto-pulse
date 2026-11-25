"""Admin routes for Phase 4: plan changes, subscription end dates, subscribers, usage, and read-only plans."""

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.routes.admin_deps import AdminCaller, rate_limit_admin_mutation, require_admin_caller
from app.db.session import get_db
from app.services import admin_overview as overview_svc
from app.services import admin_subscribers as svc

router = APIRouter(prefix="/api/admin", tags=["admin-subscribers"])


class ChangePlanRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    plan_id: str
    billing_interval: Optional[str] = None
    expected_plan_id: str
    reset_quota_cycle: bool = False
    reason: str = Field(..., min_length=2, max_length=500)
    send_email: bool = True
    admin_message: Optional[str] = Field(default=None, max_length=1000)


class SetSubscriptionEndRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    current_period_end: str
    reason: str = Field(..., min_length=5, max_length=500)
    force: bool = False


@router.patch("/users/{user_id}/plan")
def patch_user_plan(
    user_id: str,
    payload: ChangePlanRequest,
    admin: AdminCaller = Depends(rate_limit_admin_mutation),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return svc.change_user_plan(
        db=db,
        target_user_id=user_id,
        actor_id=admin.id,
        actor_email=admin.email,
        plan_id=payload.plan_id,
        billing_interval=payload.billing_interval,
        expected_plan_id=payload.expected_plan_id,
        reset_quota_cycle=payload.reset_quota_cycle,
        reason=payload.reason,
        send_email=payload.send_email,
        admin_message=payload.admin_message,
    )


@router.post("/users/{user_id}/subscription-end")
def post_subscription_end(
    user_id: str,
    payload: SetSubscriptionEndRequest,
    admin: AdminCaller = Depends(rate_limit_admin_mutation),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return svc.set_subscription_end_date(
        db=db,
        target_user_id=user_id,
        actor_id=admin.id,
        actor_email=admin.email,
        raw_end_date=payload.current_period_end,
        reason=payload.reason,
        force=payload.force,
    )


@router.get("/subscribers")
def get_subscribers(
    search: Optional[str] = Query(None),
    plan: Optional[str] = Query(None),
    interval: Optional[str] = Query(None),
    effective_status: Optional[str] = Query(None),
    sort: str = Query("period_end"),
    order: str = Query("asc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
    admin: AdminCaller = Depends(require_admin_caller),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return svc.list_admin_subscribers(
        db=db,
        search=search,
        plan=plan,
        interval=interval,
        effective_status=effective_status,
        sort_by=sort,
        sort_dir=order,
        page=page,
        page_size=page_size,
    )


@router.get("/usage")
def get_usage(
    view: str = Query("paid"),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
    admin: AdminCaller = Depends(require_admin_caller),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return svc.list_admin_usage(
        db=db,
        view=view,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.get("/plans")
def get_plans_readonly(
    admin: AdminCaller = Depends(require_admin_caller),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return svc.get_admin_plans_overview(db=db)


@router.get("/overview")
def get_overview(
    refresh: bool = Query(False),
    admin: AdminCaller = Depends(require_admin_caller),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return overview_svc.get_admin_overview(db=db, refresh=refresh)
