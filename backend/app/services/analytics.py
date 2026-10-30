"""SQL-first analytics aggregation service for AutoPulse.
All bucketing uses profiles.timezone in PostgreSQL, filtered strictly by user_id,
with short-TTL Redis caching keyed by user_id and date range.
"""
import json
import logging
import time
import zoneinfo
from typing import Dict, List, Optional, Tuple
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.limiter import get_redis_client
from app.schemas.analytics import (
    AnalyticsDashboardResponse,
    AnalyticsFunnel,
    AnalyticsRange,
    AnalyticsRecentPost,
    AnalyticsSummary,
    ApprovalTurnaroundMetric,
    DailyPostBucket,
    FunnelStage,
    HookStyleMetric,
    TopicMetric,
)

logger = logging.getLogger(__name__)

ANALYTICS_CACHE_TTL_SECONDS = 180  # 3 minutes
RANGE_DAYS: Dict[str, int] = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
}

HOOK_STYLE_LABELS: Dict[str, str] = {
    "story": "Story",
    "contrarian_opinion": "Contrarian opinion",
    "number_result": "Number / result",
    "question": "Question",
    "mistake": "Mistake",
    "how_to": "How-to",
    "observation": "Observation",
    "direct_post": "Direct post",
    "unclassified": "Unclassified",
}

SOURCE_LABELS: Dict[str, str] = {
    "slack": "Slack",
    "email": "Email",
    "dashboard": "Dashboard",
}

# Short-lived in-memory fallback cache when Redis is disabled (skipped under pytest)
_IN_MEMORY_ANALYTICS_CACHE: Dict[str, Tuple[float, str]] = {}

# Shared SQL CTE normalizing post status (separating outcome_unknown from failed) and hook_style
BASE_POSTS_CTE_SQL = """
base_posts AS (
    SELECT
        p.id,
        p.topic_title,
        p.ai_score,
        p.created_at,
        CAST(p.created_at AT TIME ZONE :tz AS date) AS local_date,
        CASE
            WHEN pub.error_code = 'outcome_unknown' THEN 'outcome_unknown'
            WHEN p.status = 'failed' THEN 'failed'
            ELSE p.status
        END AS effective_status,
        (
            a.sent_at IS NOT NULL
            OR s.status = 'sent'
            OR p.status IN ('awaiting_approval', 'rejected', 'expired')
            OR a.decision IS NOT NULL
        ) AS was_sent_for_approval,
        (
            a.decision = 'approved'
            OR p.status IN ('approved', 'publishing', 'published')
            OR pub.id IS NOT NULL
        ) AS was_approved,
        (
            p.status = 'rejected'
            OR a.decision = 'rejected'
        ) AS was_rejected,
        CASE
            WHEN LOWER(TRIM(COALESCE(p.hook_style, p.hook_type, ''))) IN (
                'story', 'personal story', 'case study', 'scene opening'
            ) THEN 'story'
            WHEN LOWER(TRIM(COALESCE(p.hook_style, p.hook_type, ''))) IN (
                'contrarian_opinion', 'contrarian opinion', 'defensible contrarian claim', 'contrarian'
            ) THEN 'contrarian_opinion'
            WHEN LOWER(TRIM(COALESCE(p.hook_style, p.hook_type, ''))) IN (
                'number_result', 'number result', 'number-led specific result',
                'number led specific result', 'metrics', 'data-driven'
            ) THEN 'number_result'
            WHEN LOWER(TRIM(COALESCE(p.hook_style, p.hook_type, ''))) IN (
                'question', 'pointed specific question', 'dilemma'
            ) THEN 'question'
            WHEN LOWER(TRIM(COALESCE(p.hook_style, p.hook_type, ''))) IN (
                'mistake', 'concrete mistake', 'anti-pattern'
            ) THEN 'mistake'
            WHEN LOWER(TRIM(COALESCE(p.hook_style, p.hook_type, ''))) IN (
                'how_to', 'how to', 'small how-to', 'small how to', 'tactical guide', 'playbook'
            ) THEN 'how_to'
            WHEN LOWER(TRIM(COALESCE(p.hook_style, p.hook_type, ''))) IN (
                'observation', 'specific observation', 'industry shift', 'trend'
            ) THEN 'observation'
            WHEN LOWER(TRIM(COALESCE(p.hook_style, p.hook_type, ''))) = 'direct_post' THEN 'direct_post'
            ELSE 'unclassified'
        END AS normalized_hook_style,
        CASE
            WHEN LOWER(COALESCE(a.decided_via, p.approval_source, '')) IN ('email_link', 'email') THEN 'email'
            WHEN LOWER(COALESCE(a.decided_via, p.approval_source, '')) = 'slack' THEN 'slack'
            WHEN LOWER(COALESCE(a.decided_via, p.approval_source, '')) = 'dashboard' THEN 'dashboard'
            WHEN LOWER(COALESCE(p.approval_source, '')) = 'playground' THEN 'playground'
            ELSE NULL
        END AS normalized_source,
        pub.published_at,
        pub.external_id
    FROM posts p
    LEFT JOIN approvals a ON a.post_id = p.id
    LEFT JOIN slack_approval_messages s ON s.post_id = p.id
    LEFT JOIN post_publications pub ON pub.post_id = p.id AND pub.platform = 'linkedin'
    WHERE p.user_id = :user_id
      AND CAST(p.created_at AT TIME ZONE :tz AS date) BETWEEN CAST(:start_date AS date) AND CAST(:end_date AS date)
)
"""


def _build_cache_key(section: str, user_id: str, range_key: str) -> str:
    return f"analytics:v1:{section}:{user_id}:{range_key}"


def _cache_get(cache_key: str) -> Optional[str]:
    redis_client = get_redis_client()
    if redis_client is not None:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                return str(cached)
        except Exception as exc:
            logger.warning(f"Redis analytics get failed for {cache_key}: {exc}")

    entry = _IN_MEMORY_ANALYTICS_CACHE.get(cache_key)
    if entry is not None:
        expires_at, raw = entry
        if time.time() < expires_at:
            return raw
        _IN_MEMORY_ANALYTICS_CACHE.pop(cache_key, None)
    return None


def _cache_set(cache_key: str, payload_json: str) -> None:
    redis_client = get_redis_client()
    if redis_client is not None:
        try:
            redis_client.setex(cache_key, ANALYTICS_CACHE_TTL_SECONDS, payload_json)
        except Exception as exc:
            logger.warning(f"Redis analytics setex failed for {cache_key}: {exc}")

    import sys
    if "pytest" not in sys.modules:
        _IN_MEMORY_ANALYTICS_CACHE[cache_key] = (
            time.time() + ANALYTICS_CACHE_TTL_SECONDS,
            payload_json,
        )


def invalidate_analytics_cache(user_id: str) -> None:
    """Clears cached analytics payloads for a user across all ranges and sections."""
    sections = ("dashboard", "summary", "timeseries", "funnel", "hooks", "topics", "turnaround", "recent")
    ranges = ("7d", "30d", "90d")
    keys = [_build_cache_key(sec, user_id, rng) for sec in sections for rng in ranges]

    for k in keys:
        _IN_MEMORY_ANALYTICS_CACHE.pop(k, None)

    redis_client = get_redis_client()
    if redis_client is not None:
        try:
            redis_client.delete(*keys)
        except Exception as exc:
            logger.warning(f"Redis analytics cache invalidation failed for {user_id}: {exc}")


def _resolve_user_context(db: Session, user_id: str, range_key: AnalyticsRange) -> dict:
    """Resolves user timezone, date window in SQL, metrics_available flag, and all-time post count."""
    meta_stmt = text(
        """
        SELECT
            (SELECT timezone FROM profiles WHERE user_id = :user_id LIMIT 1) AS raw_tz,
            EXISTS (
                SELECT 1
                FROM social_connections
                WHERE user_id = :user_id
                  AND provider = 'linkedin'
                  AND status = 'active'
                  AND 'r_member_postAnalytics' = ANY(scopes)
            ) AS metrics_available,
            (SELECT COUNT(*) FROM posts WHERE user_id = :user_id) AS all_time_posts
        """
    )
    meta = db.execute(meta_stmt, {"user_id": user_id}).mappings().one()

    tz_name = "UTC"
    raw_tz = (meta["raw_tz"] or "").strip()
    if raw_tz:
        try:
            zoneinfo.ZoneInfo(raw_tz)
            tz_name = raw_tz
        except Exception:
            tz_name = "UTC"

    days = RANGE_DAYS.get(range_key, 30)
    window_stmt = text(
        """
        SELECT
            (CAST(CURRENT_TIMESTAMP AT TIME ZONE :tz AS date) - (CAST(:days AS int) - 1))::text AS start_date,
            (CAST(CURRENT_TIMESTAMP AT TIME ZONE :tz AS date))::text AS end_date
        """
    )
    win = db.execute(window_stmt, {"tz": tz_name, "days": days}).mappings().one()

    return {
        "user_id": user_id,
        "tz": tz_name,
        "range": range_key,
        "start_date": win["start_date"],
        "end_date": win["end_date"],
        "metrics_available": bool(meta["metrics_available"]),
        "all_time_posts": int(meta["all_time_posts"] or 0),
    }


def query_summary_and_funnel(
    db: Session, ctx: dict
) -> Tuple[AnalyticsSummary, AnalyticsFunnel]:
    stmt = text(
        f"""
        WITH {BASE_POSTS_CTE_SQL}
        SELECT
            COUNT(*)::int AS total_generated,
            COUNT(*) FILTER (WHERE was_sent_for_approval)::int AS sent_for_approval,
            COUNT(*) FILTER (WHERE was_approved)::int AS approved,
            COUNT(*) FILTER (WHERE was_rejected)::int AS rejected,
            COUNT(*) FILTER (WHERE effective_status = 'expired')::int AS expired,
            COUNT(*) FILTER (WHERE effective_status = 'awaiting_approval')::int AS awaiting_approval,
            COUNT(*) FILTER (WHERE effective_status = 'published')::int AS published,
            COUNT(*) FILTER (WHERE effective_status = 'failed')::int AS failed,
            COUNT(*) FILTER (WHERE effective_status = 'outcome_unknown')::int AS outcome_unknown,
            COUNT(*) FILTER (WHERE was_approved OR was_rejected)::int AS decided_count,
            ROUND(
                100.0 * COUNT(*) FILTER (WHERE was_approved) / NULLIF(COUNT(*), 0),
                1
            ) AS approval_rate,
            ROUND(AVG(ai_score)::numeric, 1) AS avg_ai_score,
            COUNT(ai_score)::int AS scored_posts_count,
            COALESCE(
                ROUND(100.0 * COUNT(*) FILTER (WHERE was_sent_for_approval) / NULLIF(COUNT(*), 0), 1),
                0.0
            ) AS sent_pct,
            COALESCE(
                ROUND(100.0 * COUNT(*) FILTER (WHERE was_approved) / NULLIF(COUNT(*), 0), 1),
                0.0
            ) AS approved_pct,
            COALESCE(
                ROUND(100.0 * COUNT(*) FILTER (WHERE effective_status = 'published') / NULLIF(COUNT(*), 0), 1),
                0.0
            ) AS published_pct,
            COALESCE(
                ROUND(100.0 * COUNT(*) FILTER (WHERE effective_status = 'outcome_unknown') / NULLIF(COUNT(*), 0), 1),
                0.0
            ) AS outcome_unknown_pct
        FROM base_posts
        """
    )
    row = db.execute(stmt, ctx).mappings().one()
    total_gen = int(row["total_generated"] or 0)

    summary = AnalyticsSummary(
        range=ctx["range"],
        timezone=ctx["tz"],
        start_date=ctx["start_date"],
        end_date=ctx["end_date"],
        all_time_posts=ctx["all_time_posts"],
        total_generated=total_gen,
        sent_for_approval=int(row["sent_for_approval"] or 0),
        approved=int(row["approved"] or 0),
        rejected=int(row["rejected"] or 0),
        expired=int(row["expired"] or 0),
        awaiting_approval=int(row["awaiting_approval"] or 0),
        published=int(row["published"] or 0),
        failed=int(row["failed"] or 0),
        outcome_unknown=int(row["outcome_unknown"] or 0),
        decided_count=int(row["decided_count"] or 0),
        approval_rate=float(row["approval_rate"]) if row["approval_rate"] is not None else None,
        avg_ai_score=float(row["avg_ai_score"]) if row["avg_ai_score"] is not None else None,
        scored_posts_count=int(row["scored_posts_count"] or 0),
        metrics_available=ctx["metrics_available"],
    )

    funnel = AnalyticsFunnel(
        stages=[
            FunnelStage(
                stage="generated",
                label="Generated",
                count=total_gen,
                pct_of_generated=100.0 if total_gen > 0 else 0.0,
            ),
            FunnelStage(
                stage="sent_for_approval",
                label="Sent for approval",
                count=summary.sent_for_approval,
                pct_of_generated=float(row["sent_pct"] or 0.0),
            ),
            FunnelStage(
                stage="approved",
                label="Approved",
                count=summary.approved,
                pct_of_generated=float(row["approved_pct"] or 0.0),
            ),
            FunnelStage(
                stage="published",
                label="Published",
                count=summary.published,
                pct_of_generated=float(row["published_pct"] or 0.0),
            ),
            FunnelStage(
                stage="outcome_unknown",
                label="Outcome unknown",
                count=summary.outcome_unknown,
                pct_of_generated=float(row["outcome_unknown_pct"] or 0.0),
            ),
        ],
        rejected=summary.rejected,
        expired=summary.expired,
        failed=summary.failed,
        outcome_unknown=summary.outcome_unknown,
    )
    return summary, funnel


def query_posts_over_time(db: Session, ctx: dict) -> List[DailyPostBucket]:
    stmt = text(
        f"""
        WITH days AS (
            SELECT CAST(d AS date) AS bucket_date
            FROM pg_catalog.generate_series(
                CAST(:start_date AS timestamp),
                CAST(:end_date AS timestamp),
                interval '1 day'
            ) AS d
        ),
        {BASE_POSTS_CTE_SQL}
        SELECT
            d.bucket_date::text AS date,
            COUNT(bp.id)::int AS generated,
            COUNT(bp.id) FILTER (WHERE bp.was_approved)::int AS approved,
            COUNT(bp.id) FILTER (WHERE bp.effective_status = 'published')::int AS published,
            COUNT(bp.id) FILTER (WHERE bp.effective_status = 'failed')::int AS failed,
            COUNT(bp.id) FILTER (WHERE bp.effective_status = 'outcome_unknown')::int AS outcome_unknown
        FROM days d
        LEFT JOIN base_posts bp ON bp.local_date = d.bucket_date
        GROUP BY d.bucket_date
        ORDER BY d.bucket_date ASC
        """
    )
    rows = db.execute(stmt, ctx).mappings().all()
    return [
        DailyPostBucket(
            date=r["date"],
            generated=int(r["generated"]),
            approved=int(r["approved"]),
            published=int(r["published"]),
            failed=int(r["failed"]),
            outcome_unknown=int(r["outcome_unknown"]),
        )
        for r in rows
    ]


def query_hook_styles(db: Session, ctx: dict) -> List[HookStyleMetric]:
    stmt = text(
        f"""
        WITH {BASE_POSTS_CTE_SQL}
        SELECT
            normalized_hook_style AS hook_style,
            COUNT(*)::int AS post_count,
            COUNT(*) FILTER (WHERE was_approved)::int AS approved_count,
            COUNT(*) FILTER (WHERE effective_status = 'published')::int AS published_count,
            COUNT(*) FILTER (WHERE effective_status = 'failed')::int AS failed_count,
            COUNT(*) FILTER (WHERE effective_status = 'outcome_unknown')::int AS outcome_unknown_count,
            COALESCE(
                ROUND(100.0 * COUNT(*) FILTER (WHERE was_approved) / NULLIF(COUNT(*), 0), 1),
                0.0
            ) AS approval_rate,
            COALESCE(
                ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1),
                0.0
            ) AS share_pct,
            ROUND(AVG(ai_score)::numeric, 1) AS avg_ai_score,
            (COUNT(*) < 5) AS low_sample
        FROM base_posts
        GROUP BY normalized_hook_style
        ORDER BY post_count DESC, normalized_hook_style ASC
        """
    )
    rows = db.execute(stmt, ctx).mappings().all()
    return [
        HookStyleMetric(
            hook_style=r["hook_style"],
            label=HOOK_STYLE_LABELS.get(r["hook_style"], r["hook_style"].replace("_", " ").title()),
            post_count=int(r["post_count"]),
            approved_count=int(r["approved_count"]),
            published_count=int(r["published_count"]),
            failed_count=int(r["failed_count"]),
            outcome_unknown_count=int(r["outcome_unknown_count"]),
            approval_rate=float(r["approval_rate"]),
            share_pct=float(r["share_pct"]),
            avg_ai_score=float(r["avg_ai_score"]) if r["avg_ai_score"] is not None else None,
            low_sample=bool(r["low_sample"]),
        )
        for r in rows
    ]


def query_topics(db: Session, ctx: dict) -> List[TopicMetric]:
    stmt = text(
        f"""
        WITH {BASE_POSTS_CTE_SQL}
        SELECT
            topic_title AS topic,
            COUNT(*)::int AS post_count,
            COUNT(*) FILTER (WHERE was_approved)::int AS approved_count,
            COUNT(*) FILTER (WHERE effective_status = 'published')::int AS published_count,
            COUNT(*) FILTER (WHERE effective_status = 'outcome_unknown')::int AS outcome_unknown_count,
            COALESCE(
                ROUND(100.0 * COUNT(*) FILTER (WHERE was_approved) / NULLIF(COUNT(*), 0), 1),
                0.0
            ) AS approval_rate,
            COALESCE(
                ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1),
                0.0
            ) AS share_pct,
            ROUND(AVG(ai_score)::numeric, 1) AS avg_ai_score,
            (COUNT(*) < 5) AS low_sample
        FROM base_posts
        GROUP BY topic_title
        ORDER BY post_count DESC, MAX(created_at) DESC
        LIMIT 15
        """
    )
    rows = db.execute(stmt, ctx).mappings().all()
    return [
        TopicMetric(
            topic=r["topic"],
            post_count=int(r["post_count"]),
            approved_count=int(r["approved_count"]),
            published_count=int(r["published_count"]),
            outcome_unknown_count=int(r["outcome_unknown_count"]),
            approval_rate=float(r["approval_rate"]),
            share_pct=float(r["share_pct"]),
            avg_ai_score=float(r["avg_ai_score"]) if r["avg_ai_score"] is not None else None,
            low_sample=bool(r["low_sample"]),
        )
        for r in rows
    ]


def query_approval_turnaround(db: Session, ctx: dict) -> List[ApprovalTurnaroundMetric]:
    stmt = text(
        """
        WITH turnaround_rows AS (
            SELECT
                CASE
                    WHEN LOWER(COALESCE(a.decided_via, p.approval_source, '')) IN ('email_link', 'email') THEN 'email'
                    WHEN LOWER(COALESCE(a.decided_via, p.approval_source, '')) = 'slack' THEN 'slack'
                    WHEN LOWER(COALESCE(a.decided_via, p.approval_source, '')) = 'dashboard' THEN 'dashboard'
                    ELSE NULL
                END AS source,
                GREATEST(
                    0.0,
                    EXTRACT(
                        EPOCH FROM (
                            COALESCE(a.decided_at, p.decided_at) - COALESCE(a.sent_at, s.created_at)
                        )
                    ) / 60.0
                ) AS turnaround_minutes
            FROM posts p
            LEFT JOIN approvals a ON a.post_id = p.id
            LEFT JOIN slack_approval_messages s ON s.post_id = p.id AND s.status = 'sent'
            WHERE p.user_id = :user_id
              AND CAST(p.created_at AT TIME ZONE :tz AS date) BETWEEN CAST(:start_date AS date) AND CAST(:end_date AS date)
              AND COALESCE(a.sent_at, s.created_at) IS NOT NULL
              AND COALESCE(a.decided_at, p.decided_at) IS NOT NULL
        )
        SELECT
            src.source,
            COUNT(tr.turnaround_minutes)::int AS decisions_count,
            ROUND(AVG(tr.turnaround_minutes)::numeric, 1) AS avg_minutes,
            ROUND(
                (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tr.turnaround_minutes))::numeric,
                1
            ) AS median_minutes,
            ROUND(MIN(tr.turnaround_minutes)::numeric, 1) AS min_minutes,
            ROUND(MAX(tr.turnaround_minutes)::numeric, 1) AS max_minutes,
            (COUNT(tr.turnaround_minutes) > 0 AND COUNT(tr.turnaround_minutes) < 5) AS low_sample
        FROM (VALUES ('slack'), ('email'), ('dashboard')) AS src(source)
        LEFT JOIN turnaround_rows tr ON tr.source = src.source
        GROUP BY src.source
        ORDER BY CASE src.source WHEN 'slack' THEN 1 WHEN 'email' THEN 2 ELSE 3 END
        """
    )
    rows = db.execute(stmt, ctx).mappings().all()
    return [
        ApprovalTurnaroundMetric(
            source=r["source"],
            label=SOURCE_LABELS.get(r["source"], r["source"].title()),
            decisions_count=int(r["decisions_count"]),
            avg_minutes=float(r["avg_minutes"]) if r["avg_minutes"] is not None else None,
            median_minutes=float(r["median_minutes"]) if r["median_minutes"] is not None else None,
            min_minutes=float(r["min_minutes"]) if r["min_minutes"] is not None else None,
            max_minutes=float(r["max_minutes"]) if r["max_minutes"] is not None else None,
            low_sample=bool(r["low_sample"]),
        )
        for r in rows
    ]


def query_recent_posts(db: Session, ctx: dict) -> List[AnalyticsRecentPost]:
    stmt = text(
        f"""
        WITH {BASE_POSTS_CTE_SQL}
        SELECT
            id,
            topic_title,
            normalized_hook_style AS hook_style,
            effective_status AS status,
            ai_score,
            normalized_source AS approval_source,
            local_date::text AS local_date,
            created_at,
            published_at,
            CASE
                WHEN external_id IS NOT NULL AND external_id <> ''
                THEN 'https://www.linkedin.com/feed/update/' || external_id || '/'
                ELSE NULL
            END AS linkedin_url
        FROM base_posts
        ORDER BY created_at DESC
        LIMIT 25
        """
    )
    rows = db.execute(stmt, ctx).mappings().all()
    return [
        AnalyticsRecentPost(
            id=r["id"],
            topic_title=r["topic_title"],
            hook_style=r["hook_style"],
            hook_label=HOOK_STYLE_LABELS.get(r["hook_style"], r["hook_style"].replace("_", " ").title()),
            status=r["status"],
            ai_score=int(r["ai_score"]) if r["ai_score"] is not None else None,
            approval_source=r["approval_source"],
            local_date=r["local_date"],
            created_at=r["created_at"].isoformat() if r["created_at"] else "",
            published_at=r["published_at"].isoformat() if r["published_at"] else None,
            linkedin_url=r["linkedin_url"],
        )
        for r in rows
    ]


def get_analytics_dashboard(
    db: Session, user_id: str, range_key: AnalyticsRange = "30d"
) -> AnalyticsDashboardResponse:
    cache_key = _build_cache_key("dashboard", user_id, range_key)
    cached_json = _cache_get(cache_key)
    if cached_json:
        return AnalyticsDashboardResponse.model_validate_json(cached_json)

    ctx = _resolve_user_context(db=db, user_id=user_id, range_key=range_key)
    summary, funnel = query_summary_and_funnel(db=db, ctx=ctx)
    posts_over_time = query_posts_over_time(db=db, ctx=ctx)
    hook_styles = query_hook_styles(db=db, ctx=ctx)
    topics = query_topics(db=db, ctx=ctx)
    approval_turnaround = query_approval_turnaround(db=db, ctx=ctx)
    recent_posts = query_recent_posts(db=db, ctx=ctx)

    response = AnalyticsDashboardResponse(
        summary=summary,
        posts_over_time=posts_over_time,
        funnel=funnel,
        hook_styles=hook_styles,
        topics=topics,
        approval_turnaround=approval_turnaround,
        recent_posts=recent_posts,
    )
    _cache_set(cache_key, response.model_dump_json())
    return response


def get_analytics_summary(
    db: Session, user_id: str, range_key: AnalyticsRange = "30d"
) -> AnalyticsSummary:
    cache_key = _build_cache_key("summary", user_id, range_key)
    cached_json = _cache_get(cache_key)
    if cached_json:
        return AnalyticsSummary.model_validate_json(cached_json)

    ctx = _resolve_user_context(db=db, user_id=user_id, range_key=range_key)
    summary, _ = query_summary_and_funnel(db=db, ctx=ctx)
    _cache_set(cache_key, summary.model_dump_json())
    return summary


def get_analytics_timeseries(
    db: Session, user_id: str, range_key: AnalyticsRange = "30d"
) -> List[DailyPostBucket]:
    cache_key = _build_cache_key("timeseries", user_id, range_key)
    cached_json = _cache_get(cache_key)
    if cached_json:
        return [DailyPostBucket.model_validate(item) for item in json.loads(cached_json)]

    ctx = _resolve_user_context(db=db, user_id=user_id, range_key=range_key)
    series = query_posts_over_time(db=db, ctx=ctx)
    _cache_set(cache_key, json.dumps([item.model_dump() for item in series]))
    return series


def get_analytics_funnel(
    db: Session, user_id: str, range_key: AnalyticsRange = "30d"
) -> AnalyticsFunnel:
    cache_key = _build_cache_key("funnel", user_id, range_key)
    cached_json = _cache_get(cache_key)
    if cached_json:
        return AnalyticsFunnel.model_validate_json(cached_json)

    ctx = _resolve_user_context(db=db, user_id=user_id, range_key=range_key)
    _, funnel = query_summary_and_funnel(db=db, ctx=ctx)
    _cache_set(cache_key, funnel.model_dump_json())
    return funnel


def get_analytics_hook_styles(
    db: Session, user_id: str, range_key: AnalyticsRange = "30d"
) -> List[HookStyleMetric]:
    cache_key = _build_cache_key("hooks", user_id, range_key)
    cached_json = _cache_get(cache_key)
    if cached_json:
        return [HookStyleMetric.model_validate(item) for item in json.loads(cached_json)]

    ctx = _resolve_user_context(db=db, user_id=user_id, range_key=range_key)
    hooks = query_hook_styles(db=db, ctx=ctx)
    _cache_set(cache_key, json.dumps([item.model_dump() for item in hooks]))
    return hooks


def get_analytics_topics(
    db: Session, user_id: str, range_key: AnalyticsRange = "30d"
) -> List[TopicMetric]:
    cache_key = _build_cache_key("topics", user_id, range_key)
    cached_json = _cache_get(cache_key)
    if cached_json:
        return [TopicMetric.model_validate(item) for item in json.loads(cached_json)]

    ctx = _resolve_user_context(db=db, user_id=user_id, range_key=range_key)
    topics = query_topics(db=db, ctx=ctx)
    _cache_set(cache_key, json.dumps([item.model_dump() for item in topics]))
    return topics


def get_analytics_turnaround(
    db: Session, user_id: str, range_key: AnalyticsRange = "30d"
) -> List[ApprovalTurnaroundMetric]:
    cache_key = _build_cache_key("turnaround", user_id, range_key)
    cached_json = _cache_get(cache_key)
    if cached_json:
        return [ApprovalTurnaroundMetric.model_validate(item) for item in json.loads(cached_json)]

    ctx = _resolve_user_context(db=db, user_id=user_id, range_key=range_key)
    turnaround = query_approval_turnaround(db=db, ctx=ctx)
    _cache_set(cache_key, json.dumps([item.model_dump() for item in turnaround]))
    return turnaround

