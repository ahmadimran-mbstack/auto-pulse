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
    return profile_repo.format_profile_response(profile)


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
    return profile_repo.format_profile_response(profile)


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
    return profile_repo.format_profile_response(profile)


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
    return profile_repo.format_profile_response(profile)


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
    return profile_repo.format_profile_response(profile)


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

    return profile_repo.format_profile_response(profile)
