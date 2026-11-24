"""Business logic and atomic scheduler step execution for Test Lab."""

import datetime
import logging
from typing import Any, Dict, List, Optional, Tuple
import uuid

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.jobs.publish import claim_publication
from app.models.approval import Approval
from app.models.social_connection import SocialConnection
from app.models.post import Post
from app.models.profile import Profile
from app.models.publication import PostPublication
from app.models.slack import SlackIntegration
from app.repositories import post as post_repo
from app.services.approval import request_approval
from app.services.content_profile import get_content_profile
from app.services.linkedin_publisher import publish_post_to_linkedin
from app.services.pipeline import execute_pipeline, extract_best_draft
from app.services.prompts import PROMPT_VERSION
from app.services.search import get_search_adapter
from app.test_lab.models import TestLabRun
from app.test_lab.schemas import (
    TestLabCreateRequest,
    TestLabEvent,
    TestLabPostPreview,
    TestLabRunResponse,
    TestLabStatusResponse,
)

logger = logging.getLogger(__name__)


def _utc(dt: datetime.datetime) -> datetime.datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=datetime.timezone.utc)
    return dt.astimezone(datetime.timezone.utc)


def _append_event(
    run: TestLabRun,
    step: str,
    ev_status: str,
    message: str,
    delay_seconds: Optional[int] = None,
) -> None:
    events = list(run.events or [])
    events.append(
        {
            "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "step": step,
            "status": ev_status,
            "message": message,
            "delay_seconds": delay_seconds,
        }
    )
    run.events = events


def get_user_prechecks(db: Session, user_id: str) -> Dict[str, Any]:
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    tz_name = (profile.timezone if profile and profile.timezone else "UTC")

    slack_row = (
        db.query(SlackIntegration)
        .filter(
            SlackIntegration.user_id == user_id,
            SlackIntegration.status == "connected",
        )
        .first()
    )
    slack_connected = bool(slack_row and slack_row.bot_token_encrypted)

    li_row = (
        db.query(SocialConnection)
        .filter(
            SocialConnection.user_id == user_id,
            SocialConnection.provider == "linkedin",
            SocialConnection.status == "active",
        )
        .first()
    )
    linkedin_connected = bool(li_row)
    linkedin_valid = bool(
        li_row
        and li_row.access_token_enc
        and (li_row.expires_at is None or li_row.expires_at > now_utc)
    )

    return {
        "timezone": tz_name,
        "slack_connected": slack_connected,
        "slack_workspace": slack_row.team_name if slack_row else None,
        "linkedin_connected": linkedin_connected,
        "linkedin_valid": linkedin_valid,
        "linkedin_account_name": li_row.account_name if li_row else None,
    }


def _to_run_response(db: Session, run: TestLabRun) -> TestLabRunResponse:
    preview: Optional[TestLabPostPreview] = None
    if run.post_id:
        post = db.query(Post).filter(Post.id == run.post_id).first()
        if post:
            approval = db.query(Approval).filter(Approval.post_id == post.id).first()
            pub = (
                db.query(PostPublication)
                .filter(
                    PostPublication.post_id == post.id,
                    PostPublication.platform == "linkedin",
                )
                .first()
            )
            spec = post.image_spec or {}
            ext_url = (
                f"https://www.linkedin.com/feed/update/{pub.external_id}/"
                if pub and pub.external_id
                else None
            )
            preview = TestLabPostPreview(
                id=str(post.id),
                status=post.status,
                topic_title=post.topic_title,
                caption=post.caption,
                hashtags=list(post.hashtags or []),
                first_comment=spec.get("first_comment") if isinstance(spec, dict) else None,
                approval_decision=approval.decision if approval else None,
                external_url=ext_url,
            )

    parsed_events = [TestLabEvent.model_validate(e) for e in (run.events or [])]
    return TestLabRunResponse(
        id=str(run.id),
        user_id=run.user_id,
        status=run.status,
        topic_hint=run.topic_hint,
        dry_run=run.dry_run,
        generate_at=run.generate_at,
        approve_at=run.approve_at,
        upload_at=run.upload_at,
        generate_status=run.generate_status,
        approve_status=run.approve_status,
        upload_status=run.upload_status,
        generate_started_at=run.generate_started_at,
        generate_finished_at=run.generate_finished_at,
        approve_started_at=run.approve_started_at,
        approve_finished_at=run.approve_finished_at,
        upload_started_at=run.upload_started_at,
        upload_finished_at=run.upload_finished_at,
        generate_error=run.generate_error,
        approve_error=run.approve_error,
        upload_error=run.upload_error,
        error_details=run.error_details or {},
        post_id=str(run.post_id) if run.post_id else None,
        post_preview=preview,
        events=parsed_events,
        created_at=run.created_at,
        updated_at=run.updated_at,
    )


def get_status(db: Session, user_id: str) -> TestLabStatusResponse:
    pre = get_user_prechecks(db, user_id)
    latest = (
        db.query(TestLabRun)
        .filter(TestLabRun.user_id == user_id)
        .order_by(TestLabRun.created_at.desc())
        .first()
    )
    return TestLabStatusResponse(
        enabled=True,
        timezone=pre["timezone"],
        slack_connected=pre["slack_connected"],
        slack_workspace=pre["slack_workspace"],
        linkedin_connected=pre["linkedin_connected"],
        linkedin_valid=pre["linkedin_valid"],
        linkedin_account_name=pre["linkedin_account_name"],
        run=_to_run_response(db, latest) if latest else None,
    )


def create_run(
    db: Session, user_id: str, payload: TestLabCreateRequest
) -> TestLabRunResponse:
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    gen_at = _utc(payload.generate_at)
    app_at = _utc(payload.approve_at)
    upl_at = _utc(payload.upload_at)

    if gen_at < now_utc + datetime.timedelta(seconds=55):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_schedule",
                "message": "Generate time must be at least 1 minute from now.",
            },
        )
    if app_at < gen_at + datetime.timedelta(minutes=1):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_schedule",
                "message": "Approval time must be at least 1 minute after generate time.",
            },
        )
    if upl_at < app_at + datetime.timedelta(minutes=1):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_schedule",
                "message": "Upload time must be at least 1 minute after approval time.",
            },
        )
    if upl_at > now_utc + datetime.timedelta(days=7):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_schedule",
                "message": "Upload time cannot be more than 7 days ahead.",
            },
        )

    pre = get_user_prechecks(db, user_id)
    if not pre["slack_connected"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "slack_not_connected",
                "message": "Slack must be connected for this workspace before scheduling a test.",
            },
        )
    if not payload.dry_run and not pre["linkedin_valid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "linkedin_not_connected",
                "message": "LinkedIn must be connected with a valid token (or turn on Dry run).",
            },
        )

    existing_active = (
        db.query(TestLabRun)
        .filter(
            TestLabRun.user_id == user_id,
            TestLabRun.status.in_(["scheduled", "running"]),
        )
        .first()
    )
    if existing_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "active_test_exists",
                "message": "You already have an active test run. Cancel or wait for it to finish.",
            },
        )

    run = TestLabRun(
        user_id=user_id,
        status="scheduled",
        topic_hint=payload.topic_hint.strip() if payload.topic_hint else None,
        dry_run=payload.dry_run,
        generate_at=gen_at,
        approve_at=app_at,
        upload_at=upl_at,
        generate_status="pending",
        approve_status="pending",
        upload_status="pending",
        events=[
            {
                "ts": now_utc.isoformat(),
                "step": "schedule",
                "status": "info",
                "message": (
                    "Scheduled Test Lab run (Dry run ON)."
                    if payload.dry_run
                    else "Scheduled Test Lab run (Live LinkedIn upload)."
                ),
                "delay_seconds": None,
            }
        ],
    )
    db.add(run)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "active_test_exists",
                "message": "You already have an active test run. Cancel or wait for it to finish.",
            },
        )
    db.refresh(run)
    return _to_run_response(db, run)


def cancel_run(db: Session, user_id: str, run_id: uuid.UUID) -> TestLabRunResponse:
    run = (
        db.query(TestLabRun)
        .filter(TestLabRun.id == run_id, TestLabRun.user_id == user_id)
        .first()
    )
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Test run not found."},
        )
    if run.status not in ("scheduled", "running"):
        return _to_run_response(db, run)

    if run.generate_status == "pending":
        run.generate_status = "cancelled"
    if run.approve_status == "pending":
        run.approve_status = "cancelled"
    if run.upload_status == "pending":
        run.upload_status = "cancelled"
    run.status = "cancelled"
    _append_event(run, "cancel", "cancelled", "Test run cancelled by user.")
    db.commit()
    db.refresh(run)
    return _to_run_response(db, run)


def reset_latest_run(db: Session, user_id: str, run_id: uuid.UUID) -> None:
    run = (
        db.query(TestLabRun)
        .filter(TestLabRun.id == run_id, TestLabRun.user_id == user_id)
        .first()
    )
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Test run not found."},
        )
    if run.status in ("scheduled", "running"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "active_test", "message": "Cancel the active test before resetting."},
        )
    db.delete(run)
    db.commit()


def _claim_step(db: Session, run_id: uuid.UUID, step: str) -> Optional[datetime.datetime]:
    """Atomically claim a due Test Lab step so it can never run twice."""
    if step == "generate":
        stmt = text(
            "UPDATE test_lab_runs "
            "SET generate_status = 'running', status = 'running', generate_started_at = now(), updated_at = now() "
            "WHERE id = :id AND status IN ('scheduled', 'running') "
            "  AND generate_status = 'pending' AND generate_at <= now() "
            "RETURNING generate_started_at"
        )
    elif step == "approve":
        stmt = text(
            "UPDATE test_lab_runs "
            "SET approve_status = 'running', approve_started_at = now(), updated_at = now() "
            "WHERE id = :id AND status = 'running' AND generate_status = 'completed' "
            "  AND approve_status = 'pending' AND approve_at <= now() "
            "RETURNING approve_started_at"
        )
    elif step == "upload":
        stmt = text(
            "UPDATE test_lab_runs "
            "SET upload_status = 'running', upload_started_at = now(), updated_at = now() "
            "WHERE id = :id AND status = 'running' AND approve_status = 'completed' "
            "  AND upload_status = 'pending' AND upload_at <= now() "
            "RETURNING upload_started_at"
        )
    else:
        return None

    started_at = db.execute(stmt, {"id": run_id}).scalar_one_or_none()
    if started_at is None:
        return None
    db.commit()
    return started_at


def _save_test_post(
    db: Session,
    run: TestLabRun,
    final_state: Dict[str, Any],
) -> Tuple[Optional[Post], Optional[str]]:
    draft_dict = extract_best_draft(final_state)
    if not draft_dict or not isinstance(draft_dict, dict):
        last_node = final_state.get("last_node") or "writer"
        return None, f"The pipeline stopped at {last_node} without producing a draft."

    caption = (draft_dict.get("post_text") or draft_dict.get("caption") or "").strip()
    if not caption:
        last_node = final_state.get("last_node") or "writer"
        return None, f"The pipeline stopped at {last_node} with an empty draft."

    chosen = final_state.get("chosen") or final_state.get("chosen_topic") or {}
    finder_out = final_state.get("finder_output") or {}
    sources = final_state.get("sources") or finder_out.get("sources") or []
    topic_title = (
        chosen.get("title")
        or finder_out.get("topic_label")
        or finder_out.get("topic")
        or finder_out.get("topic_title")
        or draft_dict.get("image_headline")
        or "Test Lab Draft"
    )
    image_spec: Dict[str, Any] = {}
    if draft_dict.get("image_headline"):
        image_spec["headline"] = draft_dict["image_headline"]
    if draft_dict.get("first_comment"):
        image_spec["first_comment"] = draft_dict["first_comment"]

    post = Post(
        user_id=run.user_id,
        run_date=datetime.datetime.now(datetime.timezone.utc).date(),
        status="draft",
        approval_source="test_lab",
        publish_at=run.upload_at,
        topic_title=str(topic_title),
        topic_label=final_state.get("topic_label") or finder_out.get("topic_label"),
        topic_url=str(chosen.get("url") or ""),
        key_facts=final_state.get("key_facts") or finder_out.get("key_facts"),
        angle=final_state.get("angle") or finder_out.get("angle"),
        hook_type=final_state.get("hook_type"),
        hook_style=final_state.get("hook_style") or final_state.get("hook_type"),
        post_format=final_state.get("post_format"),
        ai_score=final_state.get("ai_score"),
        needs_review=bool(final_state.get("needs_review", False)),
        is_test=True,
        sources=sources if isinstance(sources, list) else [],
        caption=caption,
        hashtags=draft_dict.get("hashtags") if isinstance(draft_dict.get("hashtags"), list) else [],
        image_spec=image_spec,
        llm_model=settings.LLM_MODEL,
        prompt_version=PROMPT_VERSION,
    )
    db.add(post)
    db.flush()
    return post, None


class _StepFailure(RuntimeError):
    def __init__(self, code: str, message: str, node: Optional[str] = None) -> None:
        super().__init__(message)
        self.code = code
        self.node = node
        self.message = message


def _record_step_error(
    run: TestLabRun,
    step: str,
    code: str,
    node: Optional[str],
    message: str,
    stack: Optional[str] = None,
) -> None:
    details = dict(run.error_details or {})
    details[step] = {
        "code": code,
        "node": node,
        "message": message[:300],
        "stack": stack[:800] if stack else None,
    }
    run.error_details = details


def execute_generate_step(db: Session, run: TestLabRun, started_at: datetime.datetime) -> None:
    delay = max(0, int((started_at - _utc(run.generate_at)).total_seconds()))
    try:
        history = post_repo.get_user_post_history(db, run.user_id, limit=30)
        search_tool = get_search_adapter(settings.SEARCH_PROVIDER)
        profile_dict = get_content_profile(user_id=run.user_id, db=db)

        final_state = execute_pipeline(
            user_id=run.user_id,
            profile_dict=profile_dict,
            history=history,
            search_tool=search_tool,
            topic_hint=run.topic_hint,
            is_manual=True,
            run_id=str(run.id),
            entry_point="test_lab",
        )

        err_code = final_state.get("error_code")
        err_node = final_state.get("error_node") or final_state.get("last_node")
        state_status = final_state.get("status")
        if err_code in ("pipeline_error", "search_failed", "no_candidates", "no_draft_produced", "timed_out") or state_status in (
            "failed_error",
            "failed",
        ):
            raise _StepFailure(
                code=str(err_code or "pipeline_error"),
                node=str(err_node) if err_node else None,
                message=str(final_state.get("error_detail") or f"The pipeline stopped at {err_node or 'unknown'}."),
            )

        post, err_msg = _save_test_post(db, run, final_state)
        if not post:
            raise _StepFailure(
                code="no_draft_produced",
                node=str(err_node or "writer"),
                message=err_msg or f"The pipeline stopped at {err_node or 'writer'} without producing a draft.",
            )

        db.refresh(run)
        if run.status == "cancelled":
            db.rollback()
            return

        run.post_id = post.id
        run.generate_status = "completed"
        run.generate_finished_at = datetime.datetime.now(datetime.timezone.utc)
        _append_event(run, "generate", "completed", f"Generated draft: {post.topic_title}", delay)
        db.commit()
    except Exception as exc:
        import traceback
        stack_str = traceback.format_exc(limit=5)
        err_code = exc.code if isinstance(exc, _StepFailure) else "pipeline_error"
        err_node = exc.node if isinstance(exc, _StepFailure) else None
        err_msg = exc.message if isinstance(exc, _StepFailure) else str(exc)
        logger.error(
            f"[TEST_LAB] run_id={run.id} step=generate error_code={err_code} node={err_node}: {err_msg}",
            exc_info=not isinstance(exc, _StepFailure),
        )
        db.rollback()
        fresh = db.query(TestLabRun).filter(TestLabRun.id == run.id).first()
        if fresh and fresh.status != "cancelled":
            fresh.generate_status = "failed"
            fresh.generate_finished_at = datetime.datetime.now(datetime.timezone.utc)
            fresh.generate_error = err_msg[:300]
            _record_step_error(fresh, "generate", err_code, err_node, err_msg, stack=stack_str)
            fresh.approve_status = "cancelled"
            fresh.upload_status = "cancelled"
            fresh.status = "failed"
            _append_event(fresh, "generate", "failed", f"Generation failed ({err_code}): {err_msg[:160]}", delay)
            db.commit()


def prepare_retry_generate(db: Session, user_id: str, run_id: uuid.UUID) -> TestLabRunResponse:
    run = (
        db.query(TestLabRun)
        .filter(TestLabRun.id == run_id, TestLabRun.user_id == user_id)
        .first()
    )
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Test run not found."},
        )
    if run.status != "failed" or run.generate_status != "failed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "invalid_state", "message": "Only a failed Step 1 can be retried."},
        )

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    if _utc(run.approve_at) <= now_utc + datetime.timedelta(seconds=30) or _utc(run.upload_at) <= _utc(run.approve_at) + datetime.timedelta(seconds=30):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "times_expired",
                "message": "Scheduled times for steps 2 and 3 have already passed. Reset and schedule a new test.",
            },
        )

    run.status = "running"
    run.generate_status = "running"
    run.generate_started_at = now_utc
    run.generate_finished_at = None
    run.generate_error = None
    details = dict(run.error_details or {})
    details.pop("generate", None)
    run.error_details = details
    run.approve_status = "pending"
    run.upload_status = "pending"
    _append_event(run, "generate", "info", "Retrying Step 1 (Generate post).")
    db.commit()
    db.refresh(run)
    return _to_run_response(db, run)


def run_retry_generate_task(run_id: uuid.UUID) -> None:
    from app.db.session import SessionLocal

    with SessionLocal() as db:
        run = db.query(TestLabRun).filter(TestLabRun.id == run_id).first()
        if not run or run.generate_status != "running":
            return
        started = run.generate_started_at or datetime.datetime.now(datetime.timezone.utc)
        execute_generate_step(db, run, started)


def execute_approve_step(db: Session, run: TestLabRun, started_at: datetime.datetime) -> None:
    delay = max(0, int((started_at - _utc(run.approve_at)).total_seconds()))
    try:
        post = db.query(Post).filter(Post.id == run.post_id).first() if run.post_id else None
        if not post:
            raise RuntimeError("Generated test post not found.")

        ok = request_approval(db, post)
        db.refresh(run)
        if run.status == "cancelled":
            return

        if not ok:
            raise RuntimeError("Could not dispatch Slack approval message.")

        run.approve_status = "completed"
        run.approve_finished_at = datetime.datetime.now(datetime.timezone.utc)
        _append_event(run, "approve", "completed", "Sent Slack approval request.", delay)
        db.commit()
    except Exception as exc:
        logger.error(f"Test Lab approve failed for run {run.id}: {exc}", exc_info=True)
        db.rollback()
        fresh = db.query(TestLabRun).filter(TestLabRun.id == run.id).first()
        if fresh and fresh.status != "cancelled":
            fresh.approve_status = "failed"
            fresh.approve_finished_at = datetime.datetime.now(datetime.timezone.utc)
            fresh.approve_error = str(exc)[:300]
            fresh.upload_status = "cancelled"
            fresh.status = "failed"
            _append_event(fresh, "approve", "failed", f"Approval send failed: {str(exc)[:180]}", delay)
            db.commit()


def execute_upload_step(db: Session, run: TestLabRun, started_at: datetime.datetime) -> None:
    delay = max(0, int((started_at - _utc(run.upload_at)).total_seconds()))
    now_utc = datetime.datetime.now(datetime.timezone.utc)

    if run.dry_run:
        run.upload_status = "skipped_dry_run"
        run.upload_finished_at = now_utc
        run.status = "completed"
        _append_event(run, "upload", "skipped_dry_run", "Skipped (dry run).", delay)
        db.commit()
        return

    post = db.query(Post).filter(Post.id == run.post_id).first() if run.post_id else None
    if not post or post.status != "approved":
        reason = f"Post status is '{post.status}'" if post else "Post missing"
        run.upload_status = "skipped_not_approved"
        run.upload_finished_at = now_utc
        run.status = "completed"
        _append_event(run, "upload", "skipped_not_approved", f"Skipped, not approved ({reason}).", delay)
        db.commit()
        return

    pub = (
        db.query(PostPublication)
        .filter(PostPublication.post_id == post.id, PostPublication.platform == "linkedin")
        .first()
    )
    if not pub or not claim_publication(db, pub.id):
        run.upload_status = "failed"
        run.upload_finished_at = now_utc
        run.upload_error = "Could not claim LinkedIn publication record."
        run.status = "failed"
        _append_event(run, "upload", "failed", "Could not claim LinkedIn publication record.", delay)
        db.commit()
        return

    try:
        success, external_id, err_code, err_detail = publish_post_to_linkedin(db, post)
        if success:
            db.execute(
                text(
                    "UPDATE post_publications "
                    "SET status = 'published', external_id = :ext_id, published_at = now(), updated_at = now() "
                    "WHERE id = :id"
                ),
                {"id": pub.id, "ext_id": external_id},
            )
            db.execute(
                text("UPDATE posts SET status = 'published', updated_at = now() WHERE id = :id"),
                {"id": post.id},
            )
            run.upload_status = "completed"
            run.upload_finished_at = datetime.datetime.now(datetime.timezone.utc)
            run.status = "completed"
            _append_event(run, "upload", "completed", "Published test post to LinkedIn.", delay)
            db.commit()
        else:
            # Never auto-retry a publish
            db.execute(
                text(
                    "UPDATE post_publications "
                    "SET status = 'failed', error_code = :err_code, error_detail = :err_detail, updated_at = now() "
                    "WHERE id = :id"
                ),
                {"id": pub.id, "err_code": err_code, "err_detail": err_detail},
            )
            db.execute(
                text("UPDATE posts SET status = 'failed', updated_at = now() WHERE id = :id"),
                {"id": post.id},
            )
            run.upload_status = "failed"
            run.upload_finished_at = datetime.datetime.now(datetime.timezone.utc)
            run.upload_error = (err_detail or err_code or "LinkedIn publish failed.")[:300]
            run.status = "failed"
            _append_event(run, "upload", "failed", f"Publish failed: {run.upload_error}", delay)
            db.commit()
    except Exception as exc:
        logger.error(f"Test Lab upload failed for run {run.id}: {exc}", exc_info=True)
        db.rollback()
        fresh = db.query(TestLabRun).filter(TestLabRun.id == run.id).first()
        if fresh:
            fresh.upload_status = "failed"
            fresh.upload_finished_at = datetime.datetime.now(datetime.timezone.utc)
            fresh.upload_error = str(exc)[:300]
            fresh.status = "failed"
            _append_event(fresh, "upload", "failed", f"Publish error: {str(exc)[:180]}", delay)
            db.commit()


def process_due_test_lab_runs(db: Session) -> None:
    """Called by the existing 60s scheduler tick when ENABLE_TEST_LAB is true."""
    if not settings.ENABLE_TEST_LAB:
        return

    runs = (
        db.query(TestLabRun)
        .filter(TestLabRun.status.in_(["scheduled", "running"]))
        .order_by(TestLabRun.created_at.asc())
        .all()
    )
    for run in runs:
        if run.generate_status == "pending":
            started = _claim_step(db, run.id, "generate")
            if started:
                db.refresh(run)
                execute_generate_step(db, run, started)
                continue

        if run.status == "running" and run.generate_status == "completed" and run.approve_status == "pending":
            started = _claim_step(db, run.id, "approve")
            if started:
                db.refresh(run)
                execute_approve_step(db, run, started)
                continue

        if run.status == "running" and run.approve_status == "completed" and run.upload_status == "pending":
            started = _claim_step(db, run.id, "upload")
            if started:
                db.refresh(run)
                execute_upload_step(db, run, started)
