import argparse
import datetime
import logging
import sys
from typing import List, Optional
import uuid
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.post import Post
from app.models.publication import PostPublication
from app.services.linkedin_publisher import publish_post_to_linkedin

logger = logging.getLogger(__name__)


# Clean up publications stuck in publishing for more than 10 minutes (indicates crashed process)
def fail_stuck_publications(db: Session) -> int:
    stmt = text(
        "UPDATE post_publications "
        "SET status = 'failed', error_code = 'outcome_unknown', "
        "    error_detail = 'Publishing process crashed or timed out after 10 minutes', "
        "    updated_at = now() "
        "WHERE status = 'publishing' AND claimed_at < now() - interval '10 minutes' "
        "RETURNING id, post_id"
    )
    stuck_rows = db.execute(stmt).fetchall()
    for row in stuck_rows:
        db.execute(
            text("UPDATE posts SET status = 'failed', updated_at = now() WHERE id = :post_id AND status = 'publishing'"),
            {"post_id": row.post_id},
        )
        logger.warning(f"Marked stuck publication {row.id} for post {row.post_id} as outcome_unknown")
    db.commit()
    return len(stuck_rows)


# Mark approved posts older than 6 hours as failed due to window missed
def fail_missed_window_posts(db: Session, target_post_id: Optional[uuid.UUID] = None) -> int:
    query = (
        "SELECT p.id as post_id, pub.id as pub_id "
        "FROM posts p "
        "JOIN post_publications pub ON pub.post_id = p.id AND pub.platform = 'linkedin' "
        "WHERE p.status = 'approved' AND pub.status = 'pending' "
        "  AND p.publish_at < now() - interval '6 hours'"
    )
    params = {}
    if target_post_id:
        query += " AND p.id = :post_id"
        params["post_id"] = target_post_id

    rows = db.execute(text(query), params).fetchall()
    for r in rows:
        db.execute(
            text(
                "UPDATE post_publications "
                "SET status = 'failed', error_code = 'window_missed', "
                "    error_detail = 'Publishing window expired after 6 hours', updated_at = now() "
                "WHERE id = :pub_id"
            ),
            {"pub_id": r.pub_id},
        )
        db.execute(
            text("UPDATE posts SET status = 'failed', updated_at = now() WHERE id = :post_id"),
            {"post_id": r.post_id},
        )
        logger.info(f"Marked missed window post {r.post_id} and pub {r.pub_id} as failed (window_missed)")
    db.commit()
    return len(rows)


# Find approved posts within the 6 hour window eligible for publishing
def find_eligible_publications(db: Session, target_post_id: Optional[uuid.UUID] = None) -> List[dict]:
    query = (
        "SELECT pub.id as pub_id, p.id as post_id, p.publish_at "
        "FROM posts p "
        "JOIN post_publications pub ON pub.post_id = p.id AND pub.platform = 'linkedin' "
        "WHERE p.status = 'approved' AND pub.status = 'pending' "
        "  AND p.publish_at <= now() "
        "  AND p.publish_at >= now() - interval '6 hours' "
        "  AND (pub.not_before IS NULL OR pub.not_before <= now())"
    )
    params = {}
    if target_post_id:
        query += " AND p.id = :post_id"
        params["post_id"] = target_post_id

    rows = db.execute(text(query), params).fetchall()
    return [{"pub_id": r.pub_id, "post_id": r.post_id, "publish_at": r.publish_at} for r in rows]


# Atomic claim for a publication row
def claim_publication(db: Session, pub_id: uuid.UUID) -> bool:
    stmt = text(
        "UPDATE post_publications "
        "SET status = 'publishing', attempts = attempts + 1, claimed_at = now(), "
        "    error_code = NULL, error_detail = NULL, updated_at = now() "
        "WHERE id = :id AND status = 'pending' "
        "RETURNING id, post_id"
    )
    claimed = db.execute(stmt, {"id": pub_id}).fetchone()
    if not claimed:
        return False

    # Move post to publishing as well
    db.execute(
        text("UPDATE posts SET status = 'publishing', updated_at = now() WHERE id = :post_id AND status = 'approved'"),
        {"post_id": claimed.post_id},
    )
    db.commit()
    return True


# Core publisher function
def run_publisher(
    db: Session,
    dry_run: bool = False,
    target_post_id: Optional[uuid.UUID] = None,
) -> None:
    # Exit immediately if publishing is globally disabled
    if not settings.PUBLISH_ENABLED:
        logger.info("PUBLISH_ENABLED is false; skipping publishing and exiting")
        print("PUBLISH_ENABLED is false. Exiting immediately.")
        return

    # Clean up crashed / stuck jobs first
    fail_stuck_publications(db)

    # Clean up older approved posts outside the 6 hour window
    fail_missed_window_posts(db, target_post_id=target_post_id)

    # Find publications ready to publish
    eligible = find_eligible_publications(db, target_post_id=target_post_id)

    if dry_run:
        print(f"[dry-run] Found {len(eligible)} eligible post publication(s):")
        for item in eligible:
            print(f"  Post ID: {item['post_id']}, Publication ID: {item['pub_id']}, Scheduled for: {item['publish_at']}")
        return

    # Process each publication atomically
    for item in eligible:
        pub_id = item["pub_id"]
        post_id = item["post_id"]

        # Atomic claim: Only the process that receives the row may call LinkedIn
        if not claim_publication(db, pub_id):
            continue

        post = db.query(Post).filter(Post.id == post_id).first()
        pub = db.query(PostPublication).filter(PostPublication.id == pub_id).first()

        try:
            success, external_id, err_code, err_detail = publish_post_to_linkedin(db, post)

            if success:
                # Mark publication and post published
                db.execute(
                    text(
                        "UPDATE post_publications "
                        "SET status = 'published', external_id = :ext_id, published_at = now(), updated_at = now() "
                        "WHERE id = :id"
                    ),
                    {"id": pub_id, "ext_id": external_id},
                )
                db.execute(
                    text("UPDATE posts SET status = 'published', updated_at = now() WHERE id = :id"),
                    {"id": post_id},
                )
                db.commit()
                logger.info(f"Published post_id={post_id} pub_id={pub_id} external_id={external_id}")
            else:
                # Retry rules: only rate_limited and step_failed may retry up to 3 attempts
                can_retry = err_code in ("rate_limited", "step_failed") and pub.attempts < 3
                if can_retry:
                    db.execute(
                        text(
                            "UPDATE post_publications "
                            "SET status = 'pending', not_before = now() + interval '10 minutes', "
                            "    error_code = :err_code, error_detail = :err_detail, updated_at = now() "
                            "WHERE id = :id"
                        ),
                        {"id": pub_id, "err_code": err_code, "err_detail": err_detail},
                    )
                    db.execute(
                        text("UPDATE posts SET status = 'approved', updated_at = now() WHERE id = :id"),
                        {"id": post_id},
                    )
                    db.commit()
                    logger.warning(f"Retryable error for post_id={post_id} pub_id={pub_id} code={err_code} attempt={pub.attempts}")
                else:
                    db.execute(
                        text(
                            "UPDATE post_publications "
                            "SET status = 'failed', error_code = :err_code, error_detail = :err_detail, updated_at = now() "
                            "WHERE id = :id"
                        ),
                        {"id": pub_id, "err_code": err_code, "err_detail": err_detail},
                    )
                    db.execute(
                        text("UPDATE posts SET status = 'failed', updated_at = now() WHERE id = :id"),
                        {"id": post_id},
                    )
                    db.commit()
                    logger.error(f"Failed post_id={post_id} pub_id={pub_id} code={err_code}")
                    # DAY 6: send an email when a publication fails

        except Exception as exc:
            # Catch unexpected outer errors so one failure never stops other publications
            db.execute(
                text(
                    "UPDATE post_publications "
                    "SET status = 'failed', error_code = 'step_failed', "
                    "    error_detail = :err, updated_at = now() "
                    "WHERE id = :id"
                ),
                {"id": pub_id, "err": str(exc)[:100]},
            )
            db.execute(
                text("UPDATE posts SET status = 'failed', updated_at = now() WHERE id = :id"),
                {"id": post_id},
            )
            db.commit()
            logger.error(f"Unexpected error for post_id={post_id} pub_id={pub_id} code=step_failed")
            # DAY 6: send an email when a publication fails


def main():
    parser = argparse.ArgumentParser(description="AutoPulse LinkedIn Publisher Job")
    parser.add_argument("--dry-run", action="store_true", help="List posts that would be published without making changes")
    parser.add_argument("--post-id", type=str, default=None, help="Target specific post UUID to publish")
    args = parser.parse_args()

    target_uuid = None
    if args.post_id:
        try:
            target_uuid = uuid.UUID(args.post_id)
        except ValueError:
            print(f"Invalid UUID: {args.post_id}", file=sys.stderr)
            sys.exit(1)

    db = SessionLocal()
    try:
        run_publisher(db, dry_run=args.dry_run, target_post_id=target_uuid)
    finally:
        db.close()


if __name__ == "__main__":
    main()
