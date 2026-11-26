"""Admin routes for Phase 4: plan changes, subscription end dates, subscribers, usage, and read-only plans."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Body, Depends, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.routes.admin_deps import AdminCaller, rate_limit_admin_mutation, require_admin_caller
from app.db.session import get_db
from app.services import admin_overview as overview_svc
from app.services import admin_plans as plans_svc
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


class AdminPlanCreateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    is_public: bool = True
    is_active: bool = True
    is_popular: bool = False
    sort_order: int = 10
    monthly_price_cents: Optional[int] = None
    linkedin_profiles: Optional[int] = 1
    scheduled_posts_per_period: Optional[int] = None
    playground_runs_per_period: Optional[int] = None
    playground_runs_per_day: Optional[int] = None
    max_post_days_per_week: Optional[int] = None
    approval_email: bool = True
    approval_slack: bool = False
    docs_token_limit: Optional[int] = 0
    analytics_level: str = "basic"
    support_label: str = "email"
    daily_spend_limit_cents: Optional[int] = None
    rate_limit_tier: str = "starter"
    extra_features: List[str] = Field(default_factory=list)
    reason: str = Field(..., min_length=2, max_length=500)


class AdminPlanUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    expected_version: int
    reason: str = Field(..., min_length=2, max_length=500)
    id: Optional[str] = None
    is_system: Optional[bool] = None
    plan_length_days: Optional[int] = None
    name: Optional[str] = None
    is_public: Optional[bool] = None
    is_active: Optional[bool] = None
    is_popular: Optional[bool] = None
    sort_order: Optional[int] = None
    monthly_price_cents: Optional[int] = None
    linkedin_profiles: Optional[int] = None
    scheduled_posts_per_period: Optional[int] = None
    playground_runs_per_period: Optional[int] = None
    playground_runs_per_day: Optional[int] = None
    max_post_days_per_week: Optional[int] = None
    approval_email: Optional[bool] = None
    approval_slack: Optional[bool] = None
    docs_token_limit: Optional[int] = None
    analytics_level: Optional[str] = None
    support_label: Optional[str] = None
    daily_spend_limit_cents: Optional[int] = None
    rate_limit_tier: Optional[str] = None
    extra_features: Optional[List[str]] = None


class AdminPlanDeleteRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reason: str = Field(..., min_length=2, max_length=500)
    confirm_slug: Optional[str] = None
    expected_version: Optional[int] = None


@router.get("/plans")
def get_admin_plans(
    admin: AdminCaller = Depends(require_admin_caller),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return plans_svc.list_admin_plans(db=db)


@router.post("/plans", status_code=status.HTTP_201_CREATED)
def post_admin_plan(
    payload: AdminPlanCreateRequest,
    admin: AdminCaller = Depends(rate_limit_admin_mutation),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return plans_svc.create_admin_plan(
        db=db,
        actor_id=admin.id,
        actor_email=admin.email,
        data=payload.model_dump(),
    )


@router.patch("/plans/{plan_id}")
def patch_admin_plan(
    plan_id: str,
    payload: AdminPlanUpdateRequest,
    admin: AdminCaller = Depends(rate_limit_admin_mutation),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return plans_svc.update_admin_plan(
        db=db,
        plan_id=plan_id,
        actor_id=admin.id,
        actor_email=admin.email,
        data=payload.model_dump(exclude_unset=True),
    )


@router.delete("/plans/{plan_id}")
def delete_admin_plan(
    plan_id: str,
    reason: Optional[str] = Query(None),
    confirm_slug: Optional[str] = Query(None),
    expected_version: Optional[int] = Query(None),
    payload: Optional[AdminPlanDeleteRequest] = Body(default=None),
    admin: AdminCaller = Depends(rate_limit_admin_mutation),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    eff_reason = payload.reason if payload else (reason or "")
    eff_slug = payload.confirm_slug if payload else confirm_slug
    eff_ver = payload.expected_version if payload else expected_version
    return plans_svc.delete_admin_plan(
        db=db,
        plan_id=plan_id,
        actor_id=admin.id,
        actor_email=admin.email,
        reason=eff_reason,
        confirm_slug=eff_slug,
        expected_version=eff_ver,
    )


@router.get("/overview")
def get_overview(
    refresh: bool = Query(False),
    admin: AdminCaller = Depends(require_admin_caller),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return overview_svc.get_admin_overview(db=db, refresh=refresh)
