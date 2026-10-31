import datetime
from typing import List, Optional, Tuple
import uuid
from sqlalchemy import delete, desc, select
from sqlalchemy.orm import Session

from app.models.post import GenerationRun, Post


# Retrieve paginated list of posts owned by user using keyset pagination on (created_at, id)
def get_caller_posts(
    db: Session,
    user_id: str,
    limit: int = 20,
    cursor_dt: Optional[datetime.datetime] = None,
    cursor_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
) -> Tuple[List[Post], bool]:
    safe_limit = max(1, min(limit, 50))
    stmt = select(Post).where(Post.user_id == user_id)

    if status:
        stmt = stmt.where(Post.status == status)

    if cursor_dt is not None and cursor_id is not None:
        stmt = stmt.where(
            (Post.created_at < cursor_dt)
            | ((Post.created_at == cursor_dt) & (Post.id < cursor_id))
        )

    stmt = stmt.order_by(desc(Post.created_at), desc(Post.id)).limit(safe_limit + 1)
    rows = list(db.scalars(stmt).all())
    has_more = len(rows) > safe_limit
    return rows[:safe_limit], has_more


# Retrieve a single post strictly isolated by user ID
def get_caller_post(db: Session, user_id: str, post_id: uuid.UUID) -> Optional[Post]:
    stmt = select(Post).where(Post.user_id == user_id, Post.id == post_id)
    return db.scalars(stmt).first()


# Retrieve titles and captions from the caller's last 14 days of posts
def get_recent_titles_and_captions(
    db: Session, user_id: str, days: int = 14
) -> Tuple[List[str], List[str]]:
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)
    stmt = (
        select(Post.topic_title, Post.caption)
        .where(Post.user_id == user_id, Post.created_at >= cutoff)
        .order_by(desc(Post.created_at))
    )
    rows = db.execute(stmt).all()
    titles = [r[0] for r in rows if r[0]]
    captions = [r[1] for r in rows if r[1]]
    return titles, captions


# Retrieve last 30 posts and recent manual runs for caller once per run for the Post Finder agent
def get_user_post_history(
    db: Session, user_id: str, limit: int = 30
) -> List[dict]:
    stmt = (
        select(Post)
        .where(Post.user_id == user_id)
        .order_by(desc(Post.created_at))
        .limit(limit)
    )
    posts = list(db.scalars(stmt).all())
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    cutoff_14d = now_utc - datetime.timedelta(days=14)

    history = []
    for p in posts:
        is_recent = p.created_at >= cutoff_14d if p.created_at else False
        history.append({
            "id": str(p.id),
            "created_at_dt": p.created_at or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
            "run_date": p.run_date.isoformat() if p.run_date else None,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "is_last_14_days": is_recent,
            "topic_title": p.topic_title,
            "topic_url": p.topic_url,
            "sources": p.sources or [],
            "angle": p.angle,
            "hook_type": p.hook_type,
            "hook_style": getattr(p, "hook_style", None) or p.hook_type,
            "post_format": p.post_format,
            "caption_preview": (p.caption[:200] if p.caption else ""),
        })

    # Include recent completed manual GenerationRuns so previous manual runs aren't repeated
    try:
        from app.models.post import GenerationRun
        gen_runs = (
            db.query(GenerationRun)
            .filter(
                GenerationRun.user_id == user_id,
                GenerationRun.run_type == "manual",
                GenerationRun.status.in_(["completed", "succeeded"]),
            )
            .order_by(desc(GenerationRun.started_at))
            .limit(limit)
            .all()
        )
        for gr in gen_runs:
            trace = gr.agent_trace or {}
            finder_info = trace.get("finder") or {}
            gtm_info = trace.get("gtm_brief") or {}
            topic_title = finder_info.get("topic") or (gr.result or {}).get("topic_title") or (gr.result or {}).get("title")
            if topic_title:
                gr_time = gr.finished_at or gr.started_at or now_utc
                is_recent = gr_time >= cutoff_14d
                history.append({
                    "id": str(gr.id),
                    "created_at_dt": gr_time,
                    "run_date": gr.run_date.isoformat() if gr.run_date else None,
                    "created_at": gr_time.isoformat() if hasattr(gr_time, "isoformat") else str(gr_time),
                    "is_last_14_days": is_recent,
                    "topic_title": topic_title,
                    "topic_url": (finder_info.get("sources") or [{}])[0].get("url") if finder_info.get("sources") else None,
                    "sources": finder_info.get("sources") or [],
                    "angle": finder_info.get("angle"),
                    "hook_type": finder_info.get("hook_type"),
                    "hook_style": gtm_info.get("hook_style") or finder_info.get("hook_type"),
                    "post_format": finder_info.get("post_format"),
                    "caption_preview": ((gr.result or {}).get("post_text") or "")[:200],
                })
    except Exception as exc:
        logger.debug(f"Could not load generation_runs history: {exc}")

    # Also include completed PlaygroundRuns
    try:
        from app.models.post import PlaygroundRun
        p_runs = (
            db.query(PlaygroundRun)
            .filter(
                PlaygroundRun.user_id == user_id,
                PlaygroundRun.status == "completed",
            )
            .order_by(desc(PlaygroundRun.created_at))
            .limit(limit)
            .all()
        )
        existing_ids = {h["id"] for h in history}
        for pr in p_runs:
            if str(pr.id) in existing_ids:
                continue
            trace = pr.trace or {}
            finder_info = trace.get("finder") or {}
            gtm_info = trace.get("gtm_brief") or {}
            topic_title = finder_info.get("topic") or (pr.result or {}).get("topic_title") or (pr.result or {}).get("title")
            if topic_title:
                pr_time = pr.finished_at or pr.created_at or now_utc
                is_recent = pr_time >= cutoff_14d
                history.append({
                    "id": str(pr.id),
                    "created_at_dt": pr_time,
                    "run_date": None,
                    "created_at": pr_time.isoformat() if hasattr(pr_time, "isoformat") else str(pr_time),
                    "is_last_14_days": is_recent,
                    "topic_title": topic_title,
                    "topic_url": (finder_info.get("sources") or [{}])[0].get("url") if finder_info.get("sources") else None,
                    "sources": finder_info.get("sources") or [],
                    "angle": finder_info.get("angle"),
                    "hook_type": finder_info.get("hook_type"),
                    "hook_style": gtm_info.get("hook_style") or finder_info.get("hook_type"),
                    "post_format": finder_info.get("post_format"),
                    "caption_preview": ((pr.result or {}).get("post_text") or (pr.result or {}).get("text") or "")[:200],
                })
    except Exception as exc:
        logger.debug(f"Could not load playground_runs history: {exc}")

    # Sort merged history strictly by execution timestamp descending
    history.sort(key=lambda x: x.get("created_at_dt", now_utc), reverse=True)
    for h in history:
        h.pop("created_at_dt", None)

    return history[:limit]


# Delete draft and associated generation run for a specific date if status is draft
def delete_draft_and_run_for_date(
    db: Session, user_id: str, run_date: datetime.date
) -> bool:
    # Verify post exists and is in draft status
    stmt = select(Post).where(
        Post.user_id == user_id,
        Post.run_date == run_date,
    )
    post = db.scalars(stmt).first()
    if post:
        if post.status != "draft":
            return False
        db.delete(post)

    # Delete existing generation run for this date
    run_stmt = select(GenerationRun).where(
        GenerationRun.user_id == user_id,
        GenerationRun.run_date == run_date,
    )
    existing_run = db.scalars(run_stmt).first()
    if existing_run:
        db.delete(existing_run)

    db.commit()
    return True
