import datetime
from typing import Dict, Optional, Tuple
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.profile import Profile
from app.schemas.profile import (
    OnboardingStep1Request,
    OnboardingStep2Request,
    OnboardingStep3Request,
    OnboardingStep4Request,
    ProfileResponse,
)


# Converts a database Profile row into the public ProfileResponse model
# Note: user_id is deliberately excluded to protect tenant privacy
def format_profile_response(profile: Profile) -> ProfileResponse:
    formatted_time = None
    if profile.post_time is not None:
        formatted_time = profile.post_time.strftime("%H:%M")

    return ProfileResponse(
        display_name=profile.display_name,
        role_title=profile.role_title,
        industry=profile.industry,
        niche_description=profile.niche_description,
        audience=profile.audience,
        topics_include=list(profile.topics_include) if profile.topics_include else [],
        topics_avoid=list(profile.topics_avoid) if profile.topics_avoid else [],
        tone=profile.tone,
        voice_notes=profile.voice_notes,
        sample_posts=profile.sample_posts,
        brand_name=profile.brand_name,
        brand_primary_hex=profile.brand_primary_hex,
        brand_accent_hex=profile.brand_accent_hex,
        timezone=profile.timezone,
        post_time=formatted_time,
        post_days=list(profile.post_days) if profile.post_days else [],
        approval_method=profile.approval_method,
        onboarding_step=profile.onboarding_step,
        onboarding_completed_at=profile.onboarding_completed_at,
        onboarding_complete=profile.onboarding_completed_at is not None,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


# Reads the user's profile row from the database filtered strictly by user_id
def get_profile(db: Session, user_id: str) -> Optional[Profile]:
    stmt = select(Profile).where(Profile.user_id == user_id)
    return db.scalars(stmt).first()


# Ensures a profile row exists using INSERT ... ON CONFLICT DO NOTHING
# This prevents race conditions when two browser tabs open at the same time
def get_or_create_profile(
    db: Session,
    user_id: str,
    display_name: Optional[str] = None,
) -> Profile:
    clean_name = display_name[:80] if display_name else None

    # Insert a blank row if one does not already exist
    insert_stmt = (
        pg_insert(Profile)
        .values(
            user_id=user_id,
            display_name=clean_name,
        )
        .on_conflict_do_nothing(index_elements=["user_id"])
    )
    db.execute(insert_stmt)
    db.flush()

    # Query the existing or newly created row
    profile = get_profile(db, user_id=user_id)
    if profile is None:
        raise RuntimeError(f"Failed to find or create profile for user {user_id}")
    return profile


# Updates step 1 fields (niche, role, audience, topics)
# Sets onboarding_step to at least 1 and refreshes updated_at
def update_profile_step_1(
    db: Session,
    user_id: str,
    data: OnboardingStep1Request,
    display_name: Optional[str] = None,
) -> Profile:
    profile = get_or_create_profile(db, user_id=user_id, display_name=display_name)

    profile.role_title = data.role_title
    profile.industry = data.industry
    profile.niche_description = data.niche_description
    profile.audience = data.audience
    profile.topics_include = data.topics_include
    profile.topics_avoid = data.topics_avoid

    profile.onboarding_step = max(profile.onboarding_step, 1)
    profile.updated_at = datetime.datetime.now(datetime.timezone.utc)

    db.flush()
    return profile


# Updates step 2 fields (tone, voice notes, sample posts)
# Sets onboarding_step to at least 2 and refreshes updated_at
def update_profile_step_2(
    db: Session,
    user_id: str,
    data: OnboardingStep2Request,
    display_name: Optional[str] = None,
) -> Profile:
    profile = get_or_create_profile(db, user_id=user_id, display_name=display_name)

    profile.tone = data.tone
    profile.voice_notes = data.voice_notes
    profile.sample_posts = data.sample_posts

    profile.onboarding_step = max(profile.onboarding_step, 2)
    profile.updated_at = datetime.datetime.now(datetime.timezone.utc)

    db.flush()
    return profile


# Updates step 3 fields (brand name, primary and accent hex colors)
# Sets onboarding_step to at least 3 and refreshes updated_at
def update_profile_step_3(
    db: Session,
    user_id: str,
    data: OnboardingStep3Request,
    display_name: Optional[str] = None,
) -> Profile:
    profile = get_or_create_profile(db, user_id=user_id, display_name=display_name)

    profile.brand_name = data.brand_name
    profile.brand_primary_hex = data.brand_primary_hex
    profile.brand_accent_hex = data.brand_accent_hex

    profile.onboarding_step = max(profile.onboarding_step, 3)
    profile.updated_at = datetime.datetime.now(datetime.timezone.utc)

    db.flush()
    return profile


# Updates step 4 fields (timezone, post time, post days, approval method)
# Sets onboarding_step to at least 4 and refreshes updated_at
def update_profile_step_4(
    db: Session,
    user_id: str,
    data: OnboardingStep4Request,
    display_name: Optional[str] = None,
) -> Profile:
    profile = get_or_create_profile(db, user_id=user_id, display_name=display_name)

    # Convert HH:MM string to a python time object for PostgreSQL TIME column
    parsed_time = None
    if data.post_time:
        parsed_time = datetime.datetime.strptime(data.post_time, "%H:%M").time()

    profile.timezone = data.timezone
    profile.post_time = parsed_time
    profile.post_days = data.post_days
    profile.approval_method = data.approval_method

    profile.onboarding_step = max(profile.onboarding_step, 4)
    profile.updated_at = datetime.datetime.now(datetime.timezone.utc)

    db.flush()
    return profile


# Validates that all required fields for onboarding completion are present
# If all valid, records onboarding_completed_at once and keeps it on repeat calls
def complete_onboarding(
    db: Session,
    user_id: str,
    display_name: Optional[str] = None,
) -> Tuple[Optional[Profile], Dict[str, str]]:
    profile = get_or_create_profile(db, user_id=user_id, display_name=display_name)

    missing_fields: Dict[str, str] = {}
    if not profile.niche_description:
        missing_fields["niche_description"] = "Niche description is required to complete onboarding."
    if not profile.tone:
        missing_fields["tone"] = "Tone is required to complete onboarding."
    if not profile.brand_name:
        missing_fields["brand_name"] = "Brand name is required to complete onboarding."
    if not profile.brand_primary_hex:
        missing_fields["brand_primary_hex"] = "Brand primary color is required to complete onboarding."
    if not profile.brand_accent_hex:
        missing_fields["brand_accent_hex"] = "Brand accent color is required to complete onboarding."
    if not profile.timezone:
        missing_fields["timezone"] = "Timezone is required to complete onboarding."
    if not profile.post_time:
        missing_fields["post_time"] = "Post time is required to complete onboarding."
    if not profile.post_days or len(profile.post_days) == 0:
        missing_fields["post_days"] = "Select at least one post day to complete onboarding."

    if missing_fields:
        return None, missing_fields

    # Set completion timestamp only once; subsequent calls keep the original timestamp
    if profile.onboarding_completed_at is None:
        profile.onboarding_completed_at = datetime.datetime.now(datetime.timezone.utc)

    profile.onboarding_step = max(profile.onboarding_step, 4)
    profile.updated_at = datetime.datetime.now(datetime.timezone.utc)

    db.flush()
    return profile, {}
