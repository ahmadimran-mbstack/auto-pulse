import datetime
from typing import Any, Dict, List, Optional
import uuid
import zoneinfo
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import text
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
    PostApprovalInfo,
    PostDetail,
    PostListItem,
    PostPublicationInfo,
    PublicationRetryRequest,
    ScheduleResponse,
)
from app.services.approval import decide_approval, request_approval
from app.services.image import render_post_image
from app.services.pipeline import build_graph, create_chat_model
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
    return local_dt.astimezone(datetime.timezone.utc)


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


# GET /posts: list caller's posts, newest first
@router.get("", response_model=List[PostListItem])
def list_posts(
    limit: int = Query(default=10, ge=1, le=50),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> List[PostListItem]:
    posts = post_repo.get_caller_posts(db=db, user_id=user.id, limit=limit)
    return [
        PostListItem(
            id=p.id,
            status=p.status,
            run_date=p.run_date.isoformat(),
            topic_title=p.topic_title,
            caption_preview=p.caption[:140],
            created_at=p.created_at.isoformat(),
        )
        for p in posts
    ]


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
    p = post_repo.get_caller_post(db=db, user_id=user.id, post_id=post_id)
    if not p:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Post not found"},
        )

    # Check for approval info
    approval = db.query(Approval).filter(Approval.post_id == p.id).first()
    approval_info = None
    if approval:
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        if approval.decision:
            state_str = approval.decision
        elif approval.expires_at <= now_utc:
            state_str = "expired"
        else:
            state_str = "pending"

        approval_info = PostApprovalInfo(
            state=state_str,
            expires_at=approval.expires_at.isoformat(),
            decided_at=approval.decided_at.isoformat() if approval.decided_at else None,
        )

    # Check for platform publications
    pubs = db.query(PostPublication).filter(PostPublication.post_id == p.id).all()
    publication_infos = [
        PostPublicationInfo(
            platform=pub.platform,
            status=pub.status,
            external_url=f"https://www.linkedin.com/feed/update/{pub.external_id}/" if pub.external_id else None,
            error_code=pub.error_code,
            published_at=pub.published_at.isoformat() if pub.published_at else None,
        )
        for pub in pubs
    ]

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
            status_code=status.HTTP_404_NOT_FOUND,
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
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Post not found"},
        )

    pub = db.query(PostPublication).filter(
        PostPublication.post_id == post_id,
        PostPublication.platform == "linkedin",
        PostPublication.user_id == user.id,
    ).first()

    if not pub or pub.status != "failed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "not_retryable", "message": "Publication is not in failed status"},
        )

    if pub.error_code == "outcome_unknown" and not payload.confirm_not_posted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
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


# GET /posts/{id}/image.png: render branded PNG image
@router.get("/{post_id}/image.png")
def get_post_image(
    post_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    p = post_repo.get_caller_post(db=db, user_id=user.id, post_id=post_id)
    if not p:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Post not found"},
        )

    try:
        png_data = render_post_image(p.image_spec)
        return Response(
            content=png_data,
            media_type="image/png",
            headers={"Cache-Control": "private, max-age=3600"},
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
    # Development only guard
    if settings.ENV != "development":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Not found in production"},
        )

    # Verify generation is enabled
    if not settings.GENERATION_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "generation_disabled", "message": "Content generation is currently disabled"},
        )

    profile = profile_repo.get_profile(db=db, user_id=user.id)
    if not profile or not profile.onboarding_complete:
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

    # Check if a draft or post already exists for today
    existing = post_repo.get_caller_posts(db=db, user_id=user.id, limit=50)
    for p in existing:
        if p.run_date == today_local:
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

    # Prepare pipeline graph inputs
    fast_model = create_chat_model(settings.LLM_MODEL_FAST)
    main_model = create_chat_model(settings.LLM_MODEL)
    search_tool = get_search_adapter(settings.SEARCH_PROVIDER)
    app = build_graph(fast_model, main_model, search_tool, partial=False)

    recent_titles, recent_captions = post_repo.get_recent_titles_and_captions(db, user.id, days=14)

    profile_dict = {
        "role_title": profile.role_title,
        "industry": profile.industry,
        "niche_description": profile.niche_description,
        "audience": profile.audience,
        "topics_include": profile.topics_include,
        "topics_avoid": profile.topics_avoid,
        "tone": profile.tone,
        "voice_notes": profile.voice_notes,
        "sample_posts": profile.sample_posts,
        "brand_name": profile.brand_name,
        "brand_primary_hex": profile.brand_primary_hex,
        "brand_accent_hex": profile.brand_accent_hex,
    }

    initial_state = {
        "profile": profile_dict,
        "recent_titles": recent_titles,
        "recent_captions": recent_captions,
        "counters": {"search_calls": 0, "llm_calls": 0, "tokens_in": 0, "tokens_out": 0},
        "seconds_per_node": {},
    }

    # Execute graph
    final_state = app.invoke(initial_state)

    counters = final_state.get("counters", {})
    run.search_calls = counters.get("search_calls", 0)
    run.llm_calls = counters.get("llm_calls", 0)
    run.tokens_in = counters.get("tokens_in", 0)
    run.tokens_out = counters.get("tokens_out", 0)

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
    )
