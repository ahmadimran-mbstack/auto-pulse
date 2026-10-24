import datetime
import zoneinfo
from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy import case, desc, func, select
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.db.session import get_db
from app.models.social_connection import SocialConnection
from app.models.post import Post
from app.models.profile import Profile
from app.repositories import connection as connection_repo
from app.repositories import profile as profile_repo
from app.api.routes.posts import calculate_next_schedule
from app.schemas.dashboard import (
    DashboardProfile,
    DashboardRecentPost,
    DashboardResponse,
    DashboardSchedule,
    DashboardStats,
    DashboardTodayPost,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


# GET /dashboard: consolidated dashboard view loaded in at most 3 database queries
@router.get("", response_model=DashboardResponse)
def get_dashboard(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> DashboardResponse:
    # Query 1: Read caller's profile and social connections in a single query with LEFT OUTER JOIN
    stmt_pc = (
        select(Profile, SocialConnection)
        .outerjoin(SocialConnection, SocialConnection.user_id == Profile.user_id)
        .where(Profile.user_id == user.id)
    )
    pc_rows = db.execute(stmt_pc).all()

    profile_row: Optional[Profile] = None
    seen_conn_ids = set()
    connections_list = []

    if pc_rows:
        profile_row = pc_rows[0][0]
        for r in pc_rows:
            conn = r[1]
            if conn is not None and conn.id not in seen_conn_ids:
                seen_conn_ids.add(conn.id)
                connections_list.append(connection_repo.format_connection_summary(conn))
    else:
        # Fallback for new user without an existing profile row
        profile_row = profile_repo.get_or_create_profile(db=db, user_id=user.id, display_name=user.name)

    # Format profile object
    profile_data: Optional[DashboardProfile] = None
    user_tz = zoneinfo.ZoneInfo("UTC")

    if profile_row:
        if profile_row.timezone:
            try:
                user_tz = zoneinfo.ZoneInfo(profile_row.timezone)
            except Exception:
                user_tz = zoneinfo.ZoneInfo("UTC")

        formatted_time = profile_row.post_time.strftime("%H:%M") if profile_row.post_time else None
        profile_data = DashboardProfile(
            display_name=profile_row.display_name,
            niche_description=profile_row.niche_description,
            tone=profile_row.tone,
            brand_name=profile_row.brand_name,
            brand_primary_hex=profile_row.brand_primary_hex,
            brand_accent_hex=profile_row.brand_accent_hex,
            timezone=profile_row.timezone,
            post_time=formatted_time,
            post_days=list(profile_row.post_days) if profile_row.post_days else [],
            onboarding_complete=bool(profile_row.onboarding_completed_at is not None),
        )

    # Calculate caller local date for today
    today_local = datetime.datetime.now(user_tz).date()

    # Query 2: Fetch caller's today post and recent 5 posts in a single round trip
    stmt_posts = (
        select(Post)
        .where(Post.user_id == user.id)
        .where(
            (Post.run_date == today_local)
            | Post.id.in_(
                select(Post.id)
                .where(Post.user_id == user.id)
                .order_by(desc(Post.created_at))
                .limit(5)
            )
        )
        .order_by(desc(Post.created_at))
    )
    post_rows: List[Post] = list(db.scalars(stmt_posts).all())

    today_item: Optional[DashboardTodayPost] = None
    for p in post_rows:
        if p.run_date == today_local:
            today_item = DashboardTodayPost(
                id=p.id,
                status=p.status,
                topic_title=p.topic_title,
                run_date=p.run_date.isoformat(),
                publish_at=p.publish_at.isoformat() if p.publish_at else None,
            )
            break

    recent_items: List[DashboardRecentPost] = [
        DashboardRecentPost(
            id=p.id,
            status=p.status,
            run_date=p.run_date.isoformat(),
            topic_title=p.topic_title,
            caption_preview=p.caption[:140] if p.caption else "",
            created_at=p.created_at.isoformat(),
        )
        for p in post_rows[:5]
    ]

    # Query 3: Compute aggregated metrics in a single grouped count query over posts
    since_30d = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=30)
    stmt_stats = (
        select(
            func.coalesce(func.sum(case((Post.status == "awaiting_approval", 1), else_=0)), 0).label("awaiting_approval"),
            func.coalesce(func.sum(case(((Post.status == "published") & (Post.created_at >= since_30d), 1), else_=0)), 0).label("published_30d"),
            func.coalesce(func.sum(case(((Post.status == "failed") & (Post.created_at >= since_30d), 1), else_=0)), 0).label("failed_30d"),
        )
        .where(Post.user_id == user.id)
    )
    stats_row = db.execute(stmt_stats).one()

    stats_data = DashboardStats(
        awaiting_approval=int(stats_row.awaiting_approval),
        published_30d=int(stats_row.published_30d),
        failed_30d=int(stats_row.failed_30d),
    )

    # Compute schedule times
    sched_resp = calculate_next_schedule(profile_row)
    schedule_data = DashboardSchedule(
        next_draft_at=sched_resp.next_draft_at,
        next_post_at=sched_resp.next_post_at,
    )

    return DashboardResponse(
        profile=profile_data,
        connections=connections_list,
        today=today_item,
        recent_posts=recent_items,
        schedule=schedule_data,
        stats=stats_data,
    )
