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


@router.get("", response_model=AnalyticsDashboardResponse)
def get_analytics(
    range: AnalyticsRange = Query(default="30d"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> AnalyticsDashboardResponse:
    return analytics_service.get_analytics_dashboard(
        db=db, user_id=user.id, range_key=range
    )


@router.get("/summary", response_model=AnalyticsSummary)
def get_analytics_summary_route(
    range: AnalyticsRange = Query(default="30d"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> AnalyticsSummary:
    return analytics_service.get_analytics_summary(
        db=db, user_id=user.id, range_key=range
    )


@router.get("/posts-over-time", response_model=List[DailyPostBucket])
def get_analytics_timeseries_route(
    range: AnalyticsRange = Query(default="30d"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> List[DailyPostBucket]:
    return analytics_service.get_analytics_timeseries(
        db=db, user_id=user.id, range_key=range
    )


@router.get("/funnel", response_model=AnalyticsFunnel)
def get_analytics_funnel_route(
    range: AnalyticsRange = Query(default="30d"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> AnalyticsFunnel:
    return analytics_service.get_analytics_funnel(
        db=db, user_id=user.id, range_key=range
    )


@router.get("/hook-styles", response_model=List[HookStyleMetric])
def get_analytics_hooks_route(
    range: AnalyticsRange = Query(default="30d"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> List[HookStyleMetric]:
    return analytics_service.get_analytics_hook_styles(
        db=db, user_id=user.id, range_key=range
    )


@router.get("/topics", response_model=List[TopicMetric])
def get_analytics_topics_route(
    range: AnalyticsRange = Query(default="30d"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> List[TopicMetric]:
    return analytics_service.get_analytics_topics(
        db=db, user_id=user.id, range_key=range
    )


@router.get("/turnaround", response_model=List[ApprovalTurnaroundMetric])
def get_analytics_turnaround_route(
    range: AnalyticsRange = Query(default="30d"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> List[ApprovalTurnaroundMetric]:
    return analytics_service.get_analytics_turnaround(
        db=db, user_id=user.id, range_key=range
    )

