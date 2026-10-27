from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.db.session import get_db, get_readonly_db
from app.repositories import profile as profile_repo
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
    )

    if payload.approval is not None and payload.approval.slack_enabled is not None:
        profile.slack_approval_enabled = payload.approval.slack_enabled
    elif payload.slack_approval_enabled is not None:
        profile.slack_approval_enabled = payload.slack_approval_enabled

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
    if payload.timezone is not None:
        profile.timezone = payload.timezone
    if payload.post_time is not None:
        import datetime as dt_mod
        profile.post_time = dt_mod.datetime.strptime(payload.post_time, "%H:%M").time()
    if payload.post_days is not None:
        profile.post_days = payload.post_days

    db.commit()
    db.refresh(profile)
    return profile_repo.format_profile_response(profile, db=db)


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
    return profile_repo.format_profile_response(profile, db=db)


# Updates onboarding step 4: scheduling and delivery settings
@router.put("/onboarding/4", response_model=ProfileResponse)
def save_onboarding_step_4(
    payload: OnboardingStep4Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ProfileResponse:
    profile = profile_repo.update_profile_step_4(
        db=db,
        user_id=user.id,
        data=payload,
        display_name=user.name,
    )
    return profile_repo.format_profile_response(profile, db=db)


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

    return profile_repo.format_profile_response(profile, db=db)
