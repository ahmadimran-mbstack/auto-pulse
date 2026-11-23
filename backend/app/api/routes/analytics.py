from typing import List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.db.session import get_db
from app.schemas.analytics import (
    AnalyticsDashboardResponse,
    AnalyticsFunnel,
    AnalyticsRange,
    AnalyticsSummary,
    ApprovalTurnaroundMetric,
    DailyPostBucket,
    HookStyleMetric,
    TopicMetric,
)
from app.services import analytics as analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _require_analytics_level(db: Session, user_id: str, required: str = "basic") -> str:
    """Enforce analytics_level ('none' | 'basic' | 'full') from user's plan."""
    from app.services.entitlements import get_entitlements
    from app.services.quota import raise_blocked_403

    ent = get_entitlements(db, user_id)
    level = ent["features"].get("analytics_level", "none")
    if level == "none":
        raise_blocked_403(
            "feature_locked",
            "Analytics are available on Starter, Pro, and Business plans.",
            upgrade_to="starter",
        )
    if required == "full" and level != "full":
        raise_blocked_403(
            "feature_locked",
            "Full analytics are available on Pro and Business plans.",
            upgrade_to="pro",
        )
    return level


@router.get("", response_model=AnalyticsDashboardResponse)
def get_analytics(
    range: AnalyticsRange = Query(default="30d"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> AnalyticsDashboardResponse:
    level = _require_analytics_level(db, user.id, required="basic")
    resp = analytics_service.get_analytics_dashboard(
        db=db, user_id=user.id, range_key=range
    )
    if level == "basic":
        resp.funnel = AnalyticsFunnel()
        resp.hook_styles = []
        resp.topics = []
        resp.approval_turnaround = []
    return resp


@router.get("/summary", response_model=AnalyticsSummary)
def get_analytics_summary_route(
    range: AnalyticsRange = Query(default="30d"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> AnalyticsSummary:
    _require_analytics_level(db, user.id, required="basic")
    return analytics_service.get_analytics_summary(
        db=db, user_id=user.id, range_key=range
    )


@router.get("/posts-over-time", response_model=List[DailyPostBucket])
def get_analytics_timeseries_route(
    range: AnalyticsRange = Query(default="30d"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> List[DailyPostBucket]:
    _require_analytics_level(db, user.id, required="basic")
    return analytics_service.get_analytics_timeseries(
        db=db, user_id=user.id, range_key=range
    )


@router.get("/funnel", response_model=AnalyticsFunnel)
def get_analytics_funnel_route(
    range: AnalyticsRange = Query(default="30d"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> AnalyticsFunnel:
    _require_analytics_level(db, user.id, required="full")
    return analytics_service.get_analytics_funnel(
        db=db, user_id=user.id, range_key=range
    )


@router.get("/hook-styles", response_model=List[HookStyleMetric])
def get_analytics_hooks_route(
    range: AnalyticsRange = Query(default="30d"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> List[HookStyleMetric]:
    _require_analytics_level(db, user.id, required="full")
    return analytics_service.get_analytics_hook_styles(
        db=db, user_id=user.id, range_key=range
    )


@router.get("/topics", response_model=List[TopicMetric])
def get_analytics_topics_route(
    range: AnalyticsRange = Query(default="30d"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> List[TopicMetric]:
    _require_analytics_level(db, user.id, required="full")
    return analytics_service.get_analytics_topics(
        db=db, user_id=user.id, range_key=range
    )


@router.get("/turnaround", response_model=List[ApprovalTurnaroundMetric])
def get_analytics_turnaround_route(
    range: AnalyticsRange = Query(default="30d"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> List[ApprovalTurnaroundMetric]:
    _require_analytics_level(db, user.id, required="full")
    return analytics_service.get_analytics_turnaround(
        db=db, user_id=user.id, range_key=range
    )

