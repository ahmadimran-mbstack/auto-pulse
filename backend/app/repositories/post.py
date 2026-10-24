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
