from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.db.session import get_db, get_readonly_db
from app.repositories import profile as profile_repo
from app.services.content_profile import invalidate_content_profile_cache
from app.schemas.profile import (
    OnboardingStep1Request,
    OnboardingStep2Request,
    OnboardingStep3Request,
    OnboardingStep4Request,
    PatchProfileRequest,
    ProfileResponse,
)

router = APIRouter(prefix="/profile", tags=["profile"])


# Retrieves current user's profile, creating a default blank one if missing
@router.get("", response_model=ProfileResponse)
def get_caller_profile(
    user: User = Depends(current_user),
    db: Session = Depends(get_readonly_db),
) -> ProfileResponse:
    profile = profile_repo.get_or_create_profile(
        db=db,
        user_id=user.id,
        display_name=user.name,
        email=user.email,
    )
    return profile_repo.format_profile_response(profile, db=db)


# Updates specific fields on the profile (such as slack approval settings)
@router.patch("", response_model=ProfileResponse)
def patch_caller_profile(
    payload: PatchProfileRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ProfileResponse:
    profile = profile_repo.get_or_create_profile(
        db=db,
        user_id=user.id,
        display_name=user.name,
        email=user.email,
    )

    if payload.approval is not None and payload.approval.slack_enabled is not None:
        profile.slack_approval_enabled = payload.approval.slack_enabled
    elif payload.slack_approval_enabled is not None:
        profile.slack_approval_enabled = payload.slack_approval_enabled

    if payload.approval_method is not None:
        profile.approval_method = payload.approval_method

    if payload.display_name is not None:
        profile.display_name = payload.display_name
    if payload.role_title is not None:
        profile.role_title = payload.role_title
    if payload.industry is not None:
        profile.industry = payload.industry
    if payload.niche_description is not None:
        profile.niche_description = payload.niche_description
    if payload.audience is not None:
        profile.audience = payload.audience
    if payload.topics_include is not None:
        profile.topics_include = payload.topics_include
    if payload.topics_avoid is not None:
        profile.topics_avoid = payload.topics_avoid
    if payload.tone is not None:
        profile.tone = payload.tone
    if payload.voice_notes is not None:
        profile.voice_notes = payload.voice_notes
    if payload.sample_posts is not None:
        profile.sample_posts = payload.sample_posts
    if payload.brand_name is not None:
        profile.brand_name = payload.brand_name
    if payload.brand_primary_hex is not None:
        profile.brand_primary_hex = payload.brand_primary_hex
    if payload.brand_accent_hex is not None:
        profile.brand_accent_hex = payload.brand_accent_hex
    schedule_changed = any(
        x is not None
        for x in (payload.timezone, payload.post_time, payload.post_days, payload.approval_lead_minutes)
    )
    if payload.timezone is not None:
        profile.timezone = payload.timezone
    if payload.post_time is not None:
        import datetime as dt_mod
        profile.post_time = dt_mod.datetime.strptime(payload.post_time, "%H:%M").time()
    if payload.post_days is not None:
        from app.services.entitlements import get_entitlements
        from app.services.quota import raise_blocked_403
        ent = get_entitlements(db, user.id)
        max_days = ent["limits"].get("max_post_days_per_week")
        if max_days is not None and len(payload.post_days) > max_days:
            upgrade = "pro" if ent["plan_id"] in ("trial", "starter") else "business"
            raise_blocked_403(
                "feature_locked",
                f"Your plan allows up to {max_days} posting days per week.",
                upgrade_to=upgrade,
            )
        profile.post_days = payload.post_days
    if payload.approval_lead_minutes is not None:
        profile.approval_lead_minutes = payload.approval_lead_minutes

    # Ensure profile is marked active for scheduled generation if scheduling parameters are present
    if profile.timezone and profile.post_time and profile.post_days and profile.onboarding_completed_at is None:
        from app.services.entitlements import mark_onboarding_completed
        mark_onboarding_completed(db, profile)

    schedule_notice = None
    if schedule_changed:
        # Atomically invalidate any pending scheduled draft/awaiting_approval post so old jobs/links cannot fire
        from sqlalchemy import text
        from app.services.schedule_timeline import compute_next_schedule_timeline

        db.execute(
            text(
                "UPDATE approvals "
                "SET expires_at = now() "
                "WHERE user_id = :uid AND decision IS NULL "
                "  AND post_id IN ("
                "    SELECT id FROM posts "
                "    WHERE user_id = :uid AND is_test IS FALSE "
                "      AND (approval_source IS NULL OR approval_source != 'playground') "
                "      AND status IN ('draft', 'awaiting_approval')"
                "  )"
            ),
            {"uid": user.id},
        )
        db.execute(
            text(
                "UPDATE posts "
                "SET status = 'expired', updated_at = now() "
                "WHERE user_id = :uid AND is_test IS FALSE "
                "  AND (approval_source IS NULL OR approval_source != 'playground') "
                "  AND status IN ('draft', 'awaiting_approval')"
            ),
            {"uid": user.id},
        )
        next_tl = compute_next_schedule_timeline(profile)
        if next_tl and next_tl.too_close:
            schedule_notice = (
                f"Your approval request will be sent right after the draft is written, "
                f"about {next_tl.minutes_before_publish} minutes before publishing."
            )

    db.commit()
    db.refresh(profile)
    invalidate_content_profile_cache(user.id)
    return profile_repo.format_profile_response(profile, db=db, schedule_notice=schedule_notice)


# Updates onboarding step 1: niche, role, audience, topics
@router.put("/onboarding/1", response_model=ProfileResponse)
def save_onboarding_step_1(
    payload: OnboardingStep1Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ProfileResponse:
    profile = profile_repo.update_profile_step_1(
        db=db,
        user_id=user.id,
        data=payload,
        display_name=user.name,
    )
    invalidate_content_profile_cache(user.id)
    return profile_repo.format_profile_response(profile, db=db)


# Updates onboarding step 2: voice and writing style
@router.put("/onboarding/2", response_model=ProfileResponse)
def save_onboarding_step_2(
    payload: OnboardingStep2Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ProfileResponse:
    profile = profile_repo.update_profile_step_2(
        db=db,
        user_id=user.id,
        data=payload,
        display_name=user.name,
    )
    invalidate_content_profile_cache(user.id)
    return profile_repo.format_profile_response(profile, db=db)


# Updates onboarding step 3: visual branding colors and name
@router.put("/onboarding/3", response_model=ProfileResponse)
def save_onboarding_step_3(
    payload: OnboardingStep3Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ProfileResponse:
    profile = profile_repo.update_profile_step_3(
        db=db,
        user_id=user.id,
        data=payload,
        display_name=user.name,
    )
    invalidate_content_profile_cache(user.id)
    return profile_repo.format_profile_response(profile, db=db)


# Updates onboarding step 4: scheduling and delivery settings
@router.put("/onboarding/4", response_model=ProfileResponse)
def save_onboarding_step_4(
    payload: OnboardingStep4Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ProfileResponse:
    from app.services.entitlements import get_entitlements
    from app.services.quota import raise_blocked_403
    from app.services.schedule_timeline import compute_next_schedule_timeline

    ent = get_entitlements(db, user.id)
    max_days = ent["limits"].get("max_post_days_per_week")
    if max_days is not None and len(payload.post_days) > max_days:
        upgrade = "pro" if ent["plan_id"] in ("trial", "starter") else "business"
        raise_blocked_403(
            "feature_locked",
            f"Your plan allows up to {max_days} posting days per week.",
            upgrade_to=upgrade,
        )

    profile = profile_repo.update_profile_step_4(
        db=db,
        user_id=user.id,
        data=payload,
        display_name=user.name,
    )
    schedule_notice = None
    next_tl = compute_next_schedule_timeline(profile)
    if next_tl and next_tl.too_close:
        schedule_notice = (
            f"Your approval request will be sent right after the draft is written, "
            f"about {next_tl.minutes_before_publish} minutes before publishing."
        )
    invalidate_content_profile_cache(user.id)
    return profile_repo.format_profile_response(profile, db=db, schedule_notice=schedule_notice)


# Validates that all required fields are set and marks onboarding complete
@router.post("/onboarding/complete", response_model=ProfileResponse)
def finish_onboarding(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ProfileResponse:
    profile, missing_fields = profile_repo.complete_onboarding(
        db=db,
        user_id=user.id,
        display_name=user.name,
    )

    if missing_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "validation_error",
                "message": "Some fields need fixing.",
                "fields": missing_fields,
            },
        )

    invalidate_content_profile_cache(user.id)
    return profile_repo.format_profile_response(profile, db=db)
