import base64
import datetime
from typing import Any, Dict, List, Optional
import uuid
import zoneinfo
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
http_status = status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.approval import Approval
from app.models.post import GenerationRun, Post
from app.models.publication import PostPublication
from app.repositories import post as post_repo
from app.repositories import profile as profile_repo
from app.schemas.post import (
    DecisionRequest,
    PaginatedPostsResponse,
    PostAgentTraceResponse,
    PostApprovalInfo,
    PostDetail,
    PostListItem,
    PostPublicationInfo,
    PublicationRetryRequest,
    ScheduleResponse,
)
from app.services.approval import decide_approval, request_approval
from app.services.content_profile import get_content_profile
from app.services.image import build_image_etag, render_post_image
from app.services.pipeline import execute_pipeline
from app.services.prompts import PROMPT_VERSION
from app.services.search import get_search_adapter

router = APIRouter(prefix="/posts", tags=["posts"])


# Helper to compute publish_at in UTC from user run_date, post_time, and timezone
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


# Helper to compute upcoming post and draft timestamps in user timezone
def calculate_next_schedule(profile) -> ScheduleResponse:
    if not profile or not profile.onboarding_complete or not profile.timezone or not profile.post_time or not profile.post_days:
        return ScheduleResponse(next_draft_at=None, next_post_at=None)

    try:
        user_tz = zoneinfo.ZoneInfo(profile.timezone)
    except Exception:
        user_tz = datetime.timezone.utc

    now = datetime.datetime.now(user_tz)
    lead_minutes = settings.DRAFT_LEAD_MINUTES

    # Search the next 8 days for the next active posting day
    for day_offset in range(9):
        candidate_date = (now + datetime.timedelta(days=day_offset)).date()
        # In Python weekday(): 0 is Monday, 6 is Sunday
        if candidate_date.weekday() in profile.post_days:
            post_dt = datetime.datetime.combine(candidate_date, profile.post_time, tzinfo=user_tz)
            if post_dt > now:
                draft_dt = post_dt - datetime.timedelta(minutes=lead_minutes)
                # Ensure draft timestamp is not in the past
                effective_draft_dt = max(now, draft_dt)
                return ScheduleResponse(
                    next_draft_at=effective_draft_dt.isoformat(),
                    next_post_at=post_dt.isoformat(),
                )

    return ScheduleResponse(next_draft_at=None, next_post_at=None)


# GET /posts: list caller's posts with keyset cursor pagination and optional status filter
@router.get("", response_model=PaginatedPostsResponse)
def list_posts(
    limit: int = Query(default=20, ge=1, le=50),
    cursor: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> PaginatedPostsResponse:
    cursor_dt = None
    cursor_id = None
    if cursor:
        try:
            raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
            dt_str, id_str = raw.split("|", 1)
            cursor_dt = datetime.datetime.fromisoformat(dt_str)
            cursor_id = uuid.UUID(id_str)
        except Exception:
            raise HTTPException(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "invalid_cursor", "message": "Invalid pagination cursor"},
            )

    posts, has_more = post_repo.get_caller_posts(
        db=db,
        user_id=user.id,
        limit=limit,
        cursor_dt=cursor_dt,
        cursor_id=cursor_id,
        status=status,
    )

    next_cursor = None
    if has_more and posts:
        last_item = posts[-1]
        next_raw = f"{last_item.created_at.isoformat()}|{str(last_item.id)}"
        next_cursor = base64.urlsafe_b64encode(next_raw.encode("utf-8")).decode("ascii")

    post_ids = [p.id for p in posts]
    approvals_map = {}
    if post_ids:
        appr_list = db.query(Approval).filter(Approval.post_id.in_(post_ids)).all()
        approvals_map = {a.post_id: a for a in appr_list}

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    items = []
    for p in posts:
        appr = approvals_map.get(p.id)
        appr_info = None
        if appr:
            channel = None
            if appr.decided_via == "slack":
                channel = "slack"
            elif appr.decided_via in ("email_link", "email"):
                channel = "email"
            state_str = appr.decision or ("expired" if appr.expires_at <= now_utc else "pending")
            appr_info = PostApprovalInfo(
                state=state_str,
                decision=appr.decision,
                channel=channel,
                expires_at=appr.expires_at.isoformat() if appr.expires_at else None,
                decided_at=appr.decided_at.isoformat() if appr.decided_at else None,
            )
        items.append(
            PostListItem(
                id=p.id,
                status=p.status,
                run_date=p.run_date.isoformat(),
                topic_title=p.topic_title,
                caption_preview=p.caption[:140],
                created_at=p.created_at.isoformat(),
                approval=appr_info,
                angle=p.angle,
                hook_type=p.hook_type,
                hook_style=getattr(p, "hook_style", None) or p.hook_type,
                post_format=p.post_format,
                ai_score=p.ai_score,
                needs_review=p.needs_review,
                topic=p.topic_title,
            )
        )

    return PaginatedPostsResponse(
        items=items,
        next_cursor=next_cursor,
    )


# GET /posts/schedule: caller's next draft and post time
@router.get("/schedule", response_model=ScheduleResponse)
def get_post_schedule(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ScheduleResponse:
    profile = profile_repo.get_profile(db=db, user_id=user.id)
    return calculate_next_schedule(profile)


# GET /posts/{id}: single post detail owned by caller
@router.get("/{post_id}", response_model=PostDetail)
def get_post(
    post_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> PostDetail:
    # Query post, approval, and publications in a single database round trip
    stmt = (
        select(Post, Approval, PostPublication)
        .outerjoin(Approval, Approval.post_id == Post.id)
        .outerjoin(PostPublication, PostPublication.post_id == Post.id)
        .where(Post.id == post_id, Post.user_id == user.id)
    )
    rows = db.execute(stmt).all()
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Post not found"},
        )

    p = rows[0][0]
    approval = rows[0][1]

    # Collect unique publications from joined rows
    seen_pub_ids = set()
    publication_infos = []
    for r in rows:
        pub = r[2]
        if pub is not None and pub.id not in seen_pub_ids:
            seen_pub_ids.add(pub.id)
            publication_infos.append(
                PostPublicationInfo(
                    platform=pub.platform,
                    status=pub.status,
                    external_url=f"https://www.linkedin.com/feed/update/{pub.external_id}/" if pub.external_id else None,
                    error_code=pub.error_code,
                    published_at=pub.published_at.isoformat() if pub.published_at else None,
                )
            )

    approval_info = None
    if approval:
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        if approval.decision:
            state_str = approval.decision
        elif approval.expires_at <= now_utc:
            state_str = "expired"
        else:
            state_str = "pending"

        channel = None
        if approval.decided_via == "slack":
            channel = "slack"
        elif approval.decided_via in ("email_link", "email"):
            channel = "email"

        approval_info = PostApprovalInfo(
            state=state_str,
            decision=approval.decision,
            channel=channel,
            expires_at=approval.expires_at.isoformat() if approval.expires_at else None,
            decided_at=approval.decided_at.isoformat() if approval.decided_at else None,
        )

    return PostDetail(
        id=p.id,
        status=p.status,
        run_date=p.run_date.isoformat(),
        publish_at=p.publish_at.isoformat() if p.publish_at else None,
        topic_title=p.topic_title,
        topic_url=p.topic_url,
        sources=p.sources,
        caption=p.caption,
        hashtags=p.hashtags,
        created_at=p.created_at.isoformat(),
        approval=approval_info,
        publications=publication_infos,
        angle=p.angle,
        hook_type=p.hook_type,
        hook_style=getattr(p, "hook_style", None) or p.hook_type,
        post_format=p.post_format,
        ai_score=p.ai_score,
        needs_review=p.needs_review,
        topic=p.topic_title,
    )


# GET /posts/{id}/agent-trace: agent execution trace for caller's post
@router.get("/{post_id}/agent-trace", response_model=PostAgentTraceResponse)
def get_post_agent_trace(
    post_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    p = post_repo.get_caller_post(db=db, user_id=user.id, post_id=post_id)
    if not p:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Post not found"},
        )
    gen_run = (
        db.query(GenerationRun)
        .filter(GenerationRun.post_id == post_id, GenerationRun.user_id == user.id)
        .first()
    )
    trace_data = gen_run.agent_trace if gen_run else None
    return PostAgentTraceResponse(
        post_id=post_id,
        trace=trace_data,
        agent_trace=trace_data,
    )


# POST /posts/{id}/decision: dashboard user decision route
@router.post("/{post_id}/decision")
def make_post_decision(
    post_id: uuid.UUID,
    payload: DecisionRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    # Verify post belongs to caller
    p = post_repo.get_caller_post(db=db, user_id=user.id, post_id=post_id)
    if not p:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Post not found"},
        )
    return decide_approval(
        db=db,
        decision=payload.decision,
        decided_via="dashboard",
        post_id=post_id,
        user_id=user.id,
    )


# POST /posts/{id}/publications/linkedin/retry: retry failed publication
@router.post("/{post_id}/publications/linkedin/retry")
def retry_linkedin_publication(
    post_id: uuid.UUID,
    payload: PublicationRetryRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    # Verify post belongs to caller
    p = post_repo.get_caller_post(db=db, user_id=user.id, post_id=post_id)
    if not p:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Post not found"},
        )

    pub = db.query(PostPublication).filter(
        PostPublication.post_id == post_id,
        PostPublication.platform == "linkedin",
        PostPublication.user_id == user.id,
    ).first()

    if not pub or pub.status != "failed":
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail={"code": "not_retryable", "message": "Publication is not in failed status"},
        )

    if pub.error_code == "outcome_unknown" and not payload.confirm_not_posted:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail={"code": "confirmation_required", "message": "Confirmation that post was not published is required"},
        )

    # Reset publication to pending without not_before and reset post to approved
    pub.status = "pending"
    pub.not_before = None
    pub.claimed_at = None
    pub.error_code = None
    pub.error_detail = None

    db.execute(
        text("UPDATE posts SET status = 'approved', updated_at = now() WHERE id = :id AND user_id = :user_id"),
        {"id": post_id, "user_id": user.id},
    )
    db.commit()
    db.refresh(pub)

    return {"status": "ok", "message": "Publication retry queued"}


# GET /posts/{id}/image.png: render branded PNG image with width scaling and ETag caching
@router.get("/{post_id}/image.png")
def get_post_image(
    post_id: uuid.UUID,
    request: Request,
    w: int = Query(default=1200),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if w not in {240, 480, 1200}:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_width", "message": "Width must be 240, 480, or 1200"},
        )

    p = post_repo.get_caller_post(db=db, user_id=user.id, post_id=post_id)
    if not p:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Post not found"},
        )

    etag = build_image_etag(p.image_spec, w)
    if_none_match = request.headers.get("if-none-match")
    if if_none_match and if_none_match.strip() == etag:
        return Response(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Cache-Control": "private, max-age=3600"},
        )

    try:
        png_data = render_post_image(p.image_spec, width_target=w)
        return Response(
            content=png_data,
            media_type="image/png",
            headers={"ETag": etag, "Cache-Control": "private, max-age=3600"},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "image_render_failed", "message": "Failed to render image"},
        ) from exc


# POST /posts/generate: development-only instant generation route
@router.post("/generate", response_model=PostDetail)
def generate_draft_now(
    replace: bool = Query(default=False),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> PostDetail:
    # Verify generation is enabled
    if not settings.GENERATION_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "generation_disabled", "message": "Content generation is currently disabled"},
        )

    profile = profile_repo.get_profile(db=db, user_id=user.id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "profile_not_found", "message": "Profile not found"},
        )
    if not profile.onboarding_complete:
        if profile.timezone and profile.post_time:
            profile.onboarding_completed_at = datetime.datetime.now(datetime.timezone.utc)
            db.commit()
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "onboarding_incomplete", "message": "Please finish setup before generating drafts"},
            )

    try:
        user_tz = zoneinfo.ZoneInfo(profile.timezone or "UTC")
    except Exception:
        user_tz = datetime.timezone.utc

    today_local = datetime.datetime.now(user_tz).date()

    if replace:
        post_repo.delete_draft_and_run_for_date(db=db, user_id=user.id, run_date=today_local)

    # Check if a non-playground draft or post already exists for today
    existing = post_repo.get_caller_posts(db=db, user_id=user.id, limit=50)
    for p in existing:
        if p.run_date == today_local and getattr(p, "approval_source", None) != "playground":
            return PostDetail(
                id=p.id,
                status=p.status,
                run_date=p.run_date.isoformat(),
                topic_title=p.topic_title,
                topic_url=p.topic_url,
                sources=p.sources,
                caption=p.caption,
                hashtags=p.hashtags,
                created_at=p.created_at.isoformat(),
                angle=p.angle,
                hook_type=p.hook_type,
                hook_style=getattr(p, "hook_style", None) or p.hook_type,
                post_format=p.post_format,
            )

    # Record or claim generation run safely avoiding duplicate key conflicts
    run = db.query(GenerationRun).filter(
        GenerationRun.user_id == user.id,
        GenerationRun.run_date == today_local,
    ).first()

    if run:
        run.status = "started"
        run.attempts += 1
        run.started_at = datetime.datetime.now(datetime.timezone.utc)
        run.finished_at = None
        run.error_code = None
        run.error_detail = None
        run.search_provider = settings.SEARCH_PROVIDER
    else:
        run = GenerationRun(
            user_id=user.id,
            run_date=today_local,
            status="started",
            search_provider=settings.SEARCH_PROVIDER,
        )
        db.add(run)

    db.commit()
    db.refresh(run)

    # Prepare pipeline inputs
    search_tool = get_search_adapter(settings.SEARCH_PROVIDER)
    history = post_repo.get_user_post_history(db, user.id, limit=30)
    profile_dict = get_content_profile(user_id=user.id, db=db)

    def _step_callback(step_name: str, round_num: int, state: dict):
        run.current_step = step_name
        run.round = round_num
        db.commit()

    final_state = execute_pipeline(
        user_id=user.id,
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": err_code, "message": run.error_detail or "Generation failed"},
        )

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

    publish_at = compute_publish_at(today_local, profile.post_time, profile.timezone)

    post = Post(
        user_id=user.id,
        run_date=today_local,
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

    # Trigger approval request email
    request_approval(db=db, post=post, recipient_email=user.email)
    db.refresh(post)

    return PostDetail(
        id=post.id,
        status=post.status,
        run_date=post.run_date.isoformat(),
        publish_at=post.publish_at.isoformat() if post.publish_at else None,
        topic_title=post.topic_title,
        topic_url=post.topic_url,
        sources=post.sources,
        caption=post.caption,
        hashtags=post.hashtags,
        created_at=post.created_at.isoformat(),
        angle=post.angle,
        hook_type=post.hook_type,
        hook_style=post.hook_style or post.hook_type,
        post_format=post.post_format,
        ai_score=post.ai_score,
        needs_review=post.needs_review,
    )


@router.get("/{post_id}/agent-trace", response_model=PostAgentTraceResponse)
def get_post_agent_trace(
    post_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Retrieves full multi-agent trace for a specific post.
    Strictly scoped to current_user.
    """
    post = db.query(Post).filter(Post.id == post_id, Post.user_id == user.id).first()
    if not post:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Post not found",
        )

    run = db.query(GenerationRun).filter(GenerationRun.post_id == post_id, GenerationRun.user_id == user.id).first()
    return PostAgentTraceResponse(
        post_id=post.id,
        agent_trace=run.agent_trace if run else None,
    )

