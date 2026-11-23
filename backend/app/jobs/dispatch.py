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


# Marks posts in draft or awaiting_approval whose publish_at has passed as expired (never expires playground drafts)
def expire_passed_posts(db: Session) -> int:
    stmt = text(
        "UPDATE posts "
        "SET status = 'expired', updated_at = now() "
        "WHERE status IN ('draft', 'awaiting_approval') "
        "  AND is_test IS FALSE "  # TEST_LAB_REMOVE
        "  AND (approval_source IS NULL OR approval_source != 'playground') "
        "  AND (publish_at IS NULL OR publish_at <= now()) "
        "RETURNING id, user_id, publish_at, scheduled_skipped_notified_at"
    )
    rows = db.execute(stmt).fetchall()
    db.commit()
    for r in rows:
        if r.scheduled_skipped_notified_at is None and r.publish_at is not None:
            _send_skipped_notice_once(db, r.id, r.user_id, r.publish_at)
    if rows:
        logger.info(f"Marked {len(rows)} draft/awaiting_approval posts as expired")
    return len(rows)


def _send_skipped_notice_once(
    db: Session,
    post_id,
    user_id: str,
    publish_at: datetime.datetime,
) -> None:
    claimed = db.execute(
        text(
            "UPDATE posts SET scheduled_skipped_notified_at = now() "
            "WHERE id = :id AND scheduled_skipped_notified_at IS NULL "
            "RETURNING id"
        ),
        {"id": post_id},
    ).fetchone()
    if not claimed:
        return
    db.commit()

    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    from app.services.schedule_timeline import compute_post_timeline

    tl = compute_post_timeline(
        publish_at_utc=publish_at,
        approval_lead_minutes=getattr(profile, "approval_lead_minutes", 180) if profile else 180,
        tz_name=profile.timezone if profile else "UTC",
    )
    try:
        from app.services.slack import send_slack_skipped_notice
        if send_slack_skipped_notice(db, user_id, str(post_id), tl.publish_time_str):
            return
    except Exception as exc:
        logger.debug(f"Slack skipped notice skipped for post {post_id}: {exc}")

    try:
        from app.services.approval import get_user_email
        from app.services.email import send_skipped_notice_email
        to_email = get_user_email(db, user_id)
        if to_email:
            display_name = profile.display_name if profile and profile.display_name else "Creator"
            send_skipped_notice_email(to_email, display_name, tl.publish_time_str, str(post_id))
    except Exception as exc:
        logger.debug(f"Email skipped notice skipped for post {post_id}: {exc}")


def send_due_approvals(db: Session) -> int:
    """Send approval requests for scheduled drafts whose approval_send_at has arrived."""
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    due_posts = (
        db.query(Post)
        .filter(
            Post.status == "draft",
            Post.is_test.is_(False),
            (Post.approval_source.is_(None)) | (Post.approval_source != "playground"),
            Post.approval_send_at.is_not(None),
            Post.approval_send_at <= now_utc,
            Post.publish_at > now_utc,
        )
        .all()
    )
    sent = 0
    for p in due_posts:
        if request_approval(db, p):
            sent += 1
    return sent


def send_due_reminders(db: Session) -> int:
    """Send at most one reminder 30 minutes before publish_at if still awaiting approval."""
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    window_end = now_utc + datetime.timedelta(minutes=30)
    rows = (
        db.query(Approval, Post, Profile)
        .join(Post, Approval.post_id == Post.id)
        .outerjoin(Profile, Profile.user_id == Post.user_id)
        .filter(
            Post.status == "awaiting_approval",
            Post.is_test.is_(False),
            Approval.decision.is_(None),
            Approval.sent_at.is_not(None),
            Approval.reminder_sent_at.is_(None),
            Post.publish_at > now_utc,
            Post.publish_at <= window_end,
        )
        .all()
    )
    reminded = 0
    for approval, post, profile in rows:
        lead = getattr(profile, "approval_lead_minutes", 180) if profile else 180
        if (lead or 180) < 60:
            continue
        claimed = db.execute(
            text(
                "UPDATE approvals SET reminder_sent_at = now() "
                "WHERE id = :id AND reminder_sent_at IS NULL AND decision IS NULL "
                "RETURNING id"
            ),
            {"id": approval.id},
        ).fetchone()
        if not claimed:
            continue
        db.commit()

        from app.services.schedule_timeline import compute_post_timeline
        tl = compute_post_timeline(
            publish_at_utc=post.publish_at,
            approval_lead_minutes=lead,
            tz_name=profile.timezone if profile else "UTC",
        )
        sent_ok = False
        try:
            from app.services.slack import send_slack_reminder
            sent_ok = send_slack_reminder(db, post, tl.publish_date_str, tl.publish_time_str, f"{tl.timezone} ({tl.timezone_offset})")
        except Exception as exc:
            logger.debug(f"Slack reminder failed for post {post.id}: {exc}")

        if not sent_ok:
            try:
                from app.services.approval import create_or_rotate_approval, get_user_email
                from app.services.email import send_reminder_email
                to_email = get_user_email(db, post.user_id)
                if to_email:
                    # Rotate token only if needed? No, create_or_rotate_approval only rotates when sent_at IS NULL.
                    # For reminders, direct user to dashboard post detail so existing email link stays valid.
                    display_name = profile.display_name if profile and profile.display_name else "Creator"
                    send_reminder_email(
                        to_email=to_email,
                        display_name=display_name,
                        publish_date_str=tl.publish_date_str,
                        publish_time_str=tl.publish_time_str,
                        tz_label=f"{tl.timezone} ({tl.timezone_offset})",
                        topic_title=post.topic_title,
                        post_id=str(post.id),
                    )
                    sent_ok = True
            except Exception as exc:
                logger.debug(f"Email reminder failed for post {post.id}: {exc}")
        if sent_ok:
            reminded += 1
    return reminded


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
            GenerationRun.run_type == "scheduled",
        )
        .first()
    )

    if not existing:
        run = GenerationRun(
            user_id=user_id,
            run_date=run_date,
            run_type="scheduled",
            status="started",
            attempts=1,
            boot_id=settings.BOOT_ID,
            current_node="plan",
            last_progress_at=datetime.datetime.now(datetime.timezone.utc),
            search_provider=settings.SEARCH_PROVIDER,
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run

    claim_stmt = text(
        "UPDATE generation_runs "
        "SET status = 'started', attempts = attempts + 1, started_at = now(), last_progress_at = now(), "
        "    boot_id = :boot_id, current_node = 'plan', "
        "    finished_at = NULL, error_code = NULL, error_detail = NULL, error_reason = NULL "
        "WHERE user_id = :user_id AND run_date = :run_date AND run_type = 'scheduled' AND attempts < 2 "
        "  AND (status IN ('failed', 'failed_error', 'interrupted') OR (status = 'started' AND started_at < now() - interval '15 minutes')) "
        "RETURNING id"
    )
    res = db.execute(claim_stmt, {"user_id": user_id, "run_date": run_date, "boot_id": settings.BOOT_ID}).fetchone()
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
        state_status = final_state.get("status")

        # Handle hard errors or failed quality without draft
        if err_code in ("pipeline_error", "search_failed", "no_candidates") or state_status in ("failed_error", "failed"):
            run.status = "failed_error"
            run.current_step = "failed_error"
            run.error_code = err_code or "pipeline_error"
            run.error_detail = final_state.get("error_detail") or "Pipeline encountered an error"
            run.finished_at = datetime.datetime.now(datetime.timezone.utc)
            if run.started_at:
                run.duration = round((run.finished_at - run.started_at).total_seconds(), 2)
            db.commit()
            elapsed = run.duration or (run.finished_at - run.started_at).total_seconds()
            logger.warning(f"Generation run {run.id} failed after {elapsed:.2f}s: {run.error_code} - {run.error_detail}")
            return None

        # Handle needs_review: save best draft, do NOT queue approval or publish automatically
        if state_status == "needs_review" or err_code == "needs_review":
            chosen = final_state.get("chosen", {})
            draft = final_state.get("best_draft") or final_state.get("draft") or {}
            candidates = final_state.get("candidates", [])

            sources_list = [
                {
                    "title": c.get("title"),
                    "url": c.get("url"),
                    "published_at": c.get("published_at"),
                }
                for c in candidates[:5]
            ]
            from app.services.image import build_post_image_spec
            image_spec = build_post_image_spec(
                draft=draft,
                chosen=chosen,
                profile=profile,
                auto_image_enabled=settings.AUTO_IMAGE_ENABLED,
            )
            publish_at = compute_publish_at(run_date, profile.post_time, profile.timezone)

            post = Post(
                user_id=profile.user_id,
                run_date=run_date,
                status="draft",
                publish_at=publish_at,
                topic_title=chosen.get("title") or "Industry Update",
                topic_label=final_state.get("topic_label") or (final_state.get("finder_output") or {}).get("topic_label"),
                topic_url=chosen.get("url") or "",
                key_facts=final_state.get("key_facts") or (final_state.get("finder_output") or {}).get("key_facts"),
                angle=final_state.get("angle"),
                hook_type=final_state.get("hook_type"),
                hook_style=final_state.get("hook_style") or final_state.get("hook_type"),
                post_format=final_state.get("post_format"),
                ai_score=final_state.get("ai_score"),
                needs_review=True,
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

            run.status = "needs_review"
            run.current_step = "needs_review"
            run.post_id = post.id
            run.best_draft = draft
            run.error_code = "needs_review"
            run.error_detail = final_state.get("error_detail") or "Post needs manual review"
            run.finished_at = datetime.datetime.now(datetime.timezone.utc)
            if run.started_at:
                run.duration = round((run.finished_at - run.started_at).total_seconds(), 2)
            db.commit()

            # Dispatch Slack and email approval notifications for needs_review posts too
            request_approval(db, post)
            db.refresh(post)

            return post

        if err_code or state_status == "failed_quality":
            is_quality_failure = (state_status == "failed_quality" or err_code == "failed_quality")
            run.status = "failed_quality" if is_quality_failure else "failed"
            run.current_step = "failed_quality" if is_quality_failure else "failed"
            run.error_code = err_code or "failed_quality"
            run.error_detail = final_state.get("error_detail") or "Post failed quality validation"
            run.finished_at = datetime.datetime.now(datetime.timezone.utc)
            if run.started_at:
                run.duration = round((run.finished_at - run.started_at).total_seconds(), 2)
            db.commit()
            elapsed = run.duration or (run.finished_at - run.started_at).total_seconds()
            logger.warning(f"Generation run {run.id} terminated with {run.status} after {elapsed:.2f}s: {run.error_code} - {run.error_detail}")
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

        from app.services.image import build_post_image_spec
        image_spec = build_post_image_spec(
            draft=draft,
            chosen=chosen,
            profile=profile,
            auto_image_enabled=settings.AUTO_IMAGE_ENABLED,
        )

        publish_at = compute_publish_at(run_date, profile.post_time, profile.timezone)
        from app.services.schedule_timeline import compute_post_timeline
        tl = compute_post_timeline(
            publish_at_utc=publish_at,
            approval_lead_minutes=getattr(profile, "approval_lead_minutes", 180) or 180,
            tz_name=profile.timezone,
        )

        post = Post(
            user_id=profile.user_id,
            run_date=run_date,
            status="draft",
            publish_at=publish_at,
            approval_send_at=tl.effective_approval_at_utc,
            topic_title=chosen.get("title") or "Industry Update",
            topic_label=final_state.get("topic_label") or (final_state.get("finder_output") or {}).get("topic_label"),
            topic_url=chosen.get("url") or "",
            key_facts=final_state.get("key_facts") or (final_state.get("finder_output") or {}).get("key_facts"),
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
        if run.started_at:
            run.duration = round((run.finished_at - run.started_at).total_seconds(), 2)
        db.commit()

        elapsed = run.duration or (run.finished_at - run.started_at).total_seconds()
        logger.info(
            f"Generation run {run.id} for user {profile.user_id} succeeded in {elapsed:.2f}s "
            f"(ai_score={post.ai_score}, needs_review={post.needs_review})"
        )

        # Send approval immediately only if publish time is closer than lead time; otherwise wait for approval_send_at
        if tl.too_close or tl.effective_approval_at_utc <= datetime.datetime.now(datetime.timezone.utc):
            request_approval(db, post)
            db.refresh(post)

        return post

    except Exception as exc:
        import traceback
        tb_summary = traceback.format_exc(limit=4)
        run.status = "failed_error"
        run.current_step = "failed_error"
        run.error_code = "generation_exception"
        run.error_detail = str(exc)[:200]
        run.error_reason = f"{exc}\n{tb_summary}"
        run.finished_at = datetime.datetime.now(datetime.timezone.utc)
        if run.started_at:
            run.duration = round((run.finished_at - run.started_at).total_seconds(), 2)
        db.commit()
        logger.error(f"Generation run failed for user {profile.user_id}: {exc}", exc_info=True)
        return None


# Main dispatch runner function
def run_dispatch(db: Session) -> None:
    # 1. Mark expired drafts & send skipped notices
    expire_passed_posts(db)

    # 2. Send scheduled approvals whose approval_send_at has arrived
    send_due_approvals(db)

    # 3. Retry unsent approvals
    retry_unsent_approvals(db)

    # 4. Send 30-minute reminders for unapproved posts
    send_due_reminders(db)

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
        # Skip users pending deletion or with an empty niche description
        from app.api.routes.account import is_user_deletion_pending
        if getattr(profile, "deletion_pending", False) or is_user_deletion_pending(profile.user_id):
            continue
        if not (profile.niche_description or "").strip():
            logger.info(f"Skipping scheduled draft for user {profile.user_id}: niche_description is empty")
            continue
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

        from app.services.schedule_timeline import DRAFT_GENERATION_BUFFER_MINUTES

        target_post_dt = datetime.datetime.combine(today_local, profile.post_time, tzinfo=user_tz)
        approval_lead = getattr(profile, "approval_lead_minutes", 180) or 180
        lead_minutes = approval_lead + DRAFT_GENERATION_BUFFER_MINUTES
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
                    Post.is_test.is_(False),  # TEST_LAB_REMOVE
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
