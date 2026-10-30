import datetime
import logging
from typing import Optional
import zoneinfo
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.approval import Approval
from app.models.post import GenerationRun, Post
from app.models.profile import Profile
from app.repositories import post as post_repo
from app.services.approval import request_approval
from app.services.content_profile import get_content_profile
from app.services.pipeline import build_graph, create_chat_model
from app.services.prompts import PROMPT_VERSION
from app.services.search import get_search_adapter

logger = logging.getLogger(__name__)


# Helper to compute publish_at in UTC
def compute_publish_at(
    run_date: datetime.date,
    post_time: Optional[datetime.time],
    tz_name: Optional[str],
) -> datetime.datetime:
    target_time = post_time or datetime.time(9, 0)
    try:
        user_tz = zoneinfo.ZoneInfo(tz_name or "UTC")
    except Exception:
        user_tz = datetime.timezone.utc
    local_dt = datetime.datetime.combine(run_date, target_time, tzinfo=user_tz)
    publish_dt = local_dt.astimezone(datetime.timezone.utc)
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    # If the scheduled time for today has already passed, give a 30-minute review window from now
    if publish_dt <= now_utc:
        publish_dt = now_utc + datetime.timedelta(minutes=30)
    return publish_dt


# Marks posts in draft or awaiting_approval whose publish_at has passed as expired
def expire_passed_posts(db: Session) -> int:
    stmt = text(
        "UPDATE posts "
        "SET status = 'expired', updated_at = now() "
        "WHERE status IN ('draft', 'awaiting_approval') "
        "  AND (publish_at IS NULL OR publish_at <= now()) "
        "RETURNING id"
    )
    result = db.execute(stmt)
    expired_ids = result.fetchall()
    db.commit()
    if expired_ids:
        logger.info(f"Marked {len(expired_ids)} draft/awaiting_approval posts as expired")
    return len(expired_ids)


# Retries sending approval emails for drafts whose approval has no sent_at yet
def retry_unsent_approvals(db: Session) -> int:
    now_plus_ten = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=10)
    unsent_approvals = (
        db.query(Approval)
        .filter(
            Approval.sent_at.is_(None),
            Approval.send_attempts < 3,
            Approval.expires_at > now_plus_ten,
        )
        .all()
    )

    retried_count = 0
    for approval in unsent_approvals:
        post = db.query(Post).filter(Post.id == approval.post_id).first()
        if post and post.status == "draft":
            success = request_approval(db, post)
            if success:
                retried_count += 1

    return retried_count


# Atomic claim for generation run matching Day 4 requirement
def claim_generation_run(db: Session, user_id: str, run_date: datetime.date) -> Optional[GenerationRun]:
    existing = (
        db.query(GenerationRun)
        .filter(
            GenerationRun.user_id == user_id,
            GenerationRun.run_date == run_date,
        )
        .first()
    )

    if not existing:
        run = GenerationRun(
            user_id=user_id,
            run_date=run_date,
            status="started",
            attempts=1,
            search_provider=settings.SEARCH_PROVIDER,
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run

    claim_stmt = text(
        "UPDATE generation_runs "
        "SET status = 'started', attempts = attempts + 1, started_at = now(), "
        "    finished_at = NULL, error_code = NULL, error_detail = NULL "
        "WHERE user_id = :user_id AND run_date = :run_date AND attempts < 2 "
        "  AND (status = 'failed' OR (status = 'started' AND started_at < now() - interval '15 minutes')) "
        "RETURNING id"
    )
    res = db.execute(claim_stmt, {"user_id": user_id, "run_date": run_date}).fetchone()
    if not res:
        return None

    db.commit()
    db.refresh(existing)
    return existing


# Generate a draft post for a claimed generation run
def generate_draft_for_user(db: Session, profile: Profile, run_date: datetime.date) -> Optional[Post]:
    run = claim_generation_run(db, profile.user_id, run_date)
    if not run:
        return None

    try:
        from app.services.pipeline import execute_pipeline
        search_tool = get_search_adapter(settings.SEARCH_PROVIDER)
        history = post_repo.get_user_post_history(db, profile.user_id, limit=30)

        profile_dict = get_content_profile(user_id=profile.user_id, db=db)

        def _step_callback(step_name: str, round_num: int, state: dict):
            run.current_step = step_name
            run.round = round_num
            live_trace = dict(run.agent_trace or {})
            if state.get("finder_output"):
                live_trace["finder"] = state.get("finder_output")
            if state.get("gtm_brief"):
                live_trace["gtm_brief"] = state.get("gtm_brief")
            if state.get("rounds_history"):
                live_trace["rounds"] = state.get("rounds_history")
            if live_trace:
                run.agent_trace = live_trace
            db.commit()

        final_state = execute_pipeline(
            user_id=profile.user_id,
            profile_dict=profile_dict,
            history=history,
            search_tool=search_tool,
            step_callback=_step_callback,
        )

        counters = final_state.get("counters", {})
        run.search_calls = counters.get("search_calls", 0)
        run.llm_calls = counters.get("llm_calls", 0)
        run.tokens_in = counters.get("tokens_in", 0)
        run.tokens_out = counters.get("tokens_out", 0)
        run.agent_trace = final_state.get("agent_trace")
        run.round = final_state.get("round", 0)
        run.current_step = "completed"

        err_code = final_state.get("error_code")
        if err_code:
            run.status = "failed"
            run.error_code = err_code
            run.error_detail = final_state.get("error_detail")
            run.finished_at = datetime.datetime.now(datetime.timezone.utc)
            db.commit()
            elapsed = (run.finished_at - run.started_at).total_seconds()
            logger.warning(f"Generation run {run.id} failed after {elapsed:.2f}s: {err_code} - {run.error_detail}")
            return None

        chosen = final_state.get("chosen", {})
        draft = final_state.get("draft", {})
        candidates = final_state.get("candidates", [])

        sources_list = [
            {
                "title": c.get("title"),
                "url": c.get("url"),
                "published_at": c.get("published_at"),
            }
            for c in candidates[:5]
        ]

        image_spec = {
            "headline": draft.get("image_headline", chosen.get("title", "")),
            "brand_name": profile.brand_name or "AutoPulse",
            "brand_primary_hex": profile.brand_primary_hex or "#0F172A",
            "brand_accent_hex": profile.brand_accent_hex or "#38BDF8",
            "template_version": "v1",
        }

        publish_at = compute_publish_at(run_date, profile.post_time, profile.timezone)

        post = Post(
            user_id=profile.user_id,
            run_date=run_date,
            status="draft",
            publish_at=publish_at,
            topic_title=chosen.get("title") or "Industry Update",
            topic_url=chosen.get("url") or "",
            angle=final_state.get("angle"),
            hook_type=final_state.get("hook_type"),
            hook_style=final_state.get("hook_style") or final_state.get("hook_type"),
            post_format=final_state.get("post_format"),
            ai_score=final_state.get("ai_score"),
            needs_review=final_state.get("needs_review", False),
            sources=sources_list,
            caption=draft.get("post_text", ""),
            hashtags=draft.get("hashtags", []),
            image_spec=image_spec,
            llm_model=settings.LLM_MODEL,
            prompt_version=PROMPT_VERSION,
        )
        db.add(post)
        db.commit()
        db.refresh(post)

        run.status = "succeeded"
        run.post_id = post.id
        run.finished_at = datetime.datetime.now(datetime.timezone.utc)
        db.commit()

        elapsed = (run.finished_at - run.started_at).total_seconds()
        logger.info(
            f"Generation run {run.id} for user {profile.user_id} succeeded in {elapsed:.2f}s "
            f"(ai_score={post.ai_score}, needs_review={post.needs_review})"
        )

        # Call request_approval after draft is saved
        request_approval(db, post)
        db.refresh(post)

        return post

    except Exception as exc:
        run.status = "failed"
        run.error_code = "generation_exception"
        run.error_detail = str(exc)[:200]
        run.finished_at = datetime.datetime.now(datetime.timezone.utc)
        db.commit()
        logger.error(f"Generation run failed for user {profile.user_id}: {exc}")
        return None


# Main dispatch runner function
def run_dispatch(db: Session) -> None:
    # 1. Mark expired drafts
    expire_passed_posts(db)

    # 2. Retry unsent approvals
    retry_unsent_approvals(db)

    # 3. Schedule generation for active users if generation enabled
    if not settings.GENERATION_ENABLED:
        logger.info("GENERATION_ENABLED is false; skipping scheduled post creation")
        return

    active_profiles = (
        db.query(Profile)
        .filter(
            Profile.timezone.is_not(None),
            Profile.post_time.is_not(None),
        )
        .all()
    )

    for profile in active_profiles:
        if not profile.timezone or not profile.post_time or not profile.post_days:
            continue

        if profile.onboarding_completed_at is None:
            profile.onboarding_completed_at = datetime.datetime.now(datetime.timezone.utc)
            db.commit()

        try:
            user_tz = zoneinfo.ZoneInfo(profile.timezone)
        except Exception:
            user_tz = datetime.timezone.utc

        now_user = datetime.datetime.now(user_tz)
        today_local = now_user.date()

        if today_local.weekday() not in profile.post_days:
            continue

        target_post_dt = datetime.datetime.combine(today_local, profile.post_time, tzinfo=user_tz)
        lead_minutes = settings.DRAFT_LEAD_MINUTES
        draft_window = target_post_dt - datetime.timedelta(minutes=lead_minutes)

        # Trigger draft if within draft window, OR if post time passed today within 4 hours and no post exists yet
        should_generate = False
        if now_user >= draft_window and now_user < target_post_dt:
            should_generate = True
        elif now_user >= target_post_dt and now_user < target_post_dt + datetime.timedelta(hours=4):
            should_generate = True

        if should_generate:
            # Check if post already created for today (excluding manual playground test posts)
            existing_post = (
                db.query(Post)
                .filter(
                    Post.user_id == profile.user_id,
                    Post.run_date == today_local,
                    Post.approval_source != "playground",
                )
                .first()
            )
            if not existing_post:
                logger.info(
                    f"Triggering scheduled draft for user {profile.user_id} "
                    f"(target={target_post_dt}, now={now_user}, timezone={profile.timezone})"
                )
                generate_draft_for_user(db, profile, today_local)


if __name__ == "__main__":
    db = SessionLocal()
    try:
        run_dispatch(db)
    finally:
        db.close()
