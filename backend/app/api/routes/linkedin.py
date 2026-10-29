import datetime
import json
import logging
import re
from typing import Optional
import zoneinfo
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.db.session import get_db
from app.models.post import Post
from app.models.publication import PostPublication
from app.repositories import connection as connection_repo
from app.repositories import profile as profile_repo
from app.schemas.linkedin import LinkedInPostResponse, LinkedInStatusResponse
from app.services import linkedin_publisher
from app.services.content_sanitizer import sanitize_linkedin_content
from app.services.linkedin_publisher import (
    LinkedInApiError,
    LinkedInNotConnectedError,
    LinkedInReconnectRequiredError,
    LinkedInTokenExpiredError,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["linkedin"])

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
}
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


# Helper function to validate and execute direct post publishing
async def _execute_direct_post(
    content: str,
    visibility: str,
    image: Optional[UploadFile],
    user: User,
    db: Session,
    topic_title: Optional[str] = None,
    angle: Optional[str] = None,
    ai_score: Optional[int] = None,
    image_headline: Optional[str] = None,
    sources_json: Optional[str] = None,
) -> LinkedInPostResponse:
    # 1. Validate content presence
    if not content or not content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "validation_error", "message": "Content is required."},
        )

    # 2. Sanitize content and enforce max 3000 character limit
    try:
        sanitized_content = sanitize_linkedin_content(content)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "validation_error", "message": str(exc)},
        )

    # 3. Validate visibility parameter
    normalized_visibility = visibility.strip().upper() if visibility else ""
    if normalized_visibility not in ("PUBLIC", "CONNECTIONS"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "validation_error",
                "message": "Visibility must be PUBLIC or CONNECTIONS.",
            },
        )

    # 4. Validate optional image type and size
    image_bytes = None
    image_content_type = None
    if image is not None and image.filename:
        content_type = (image.content_type or "").lower()
        # Treat image/jpg as image/jpeg
        if content_type == "image/jpg":
            content_type = "image/jpeg"

        if content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "validation_error",
                    "message": "Invalid image type. Allowed types are JPEG, PNG, GIF, and WebP.",
                },
            )

        try:
            image_bytes = await image.read()
        except Exception as exc:
            logger.error(f"Failed to read uploaded image file: {exc}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "validation_error", "message": "Failed to read image file."},
            )

        if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "validation_error",
                    "message": "Image size exceeds 5 MB limit.",
                },
            )

        if len(image_bytes) == 0:
            image_bytes = None
        else:
            image_content_type = content_type

    # 5. Retrieve valid access token or trigger token refresh
    try:
        access_token, conn = connection_repo.get_valid_linkedin_connection_token(
            db=db, user_id=user.id
        )
    except LinkedInNotConnectedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "LINKEDIN_NOT_CONNECTED",
                "message": "LinkedIn account is not connected. Please connect LinkedIn to publish.",
            },
        )
    except LinkedInTokenExpiredError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "LINKEDIN_TOKEN_EXPIRED",
                "message": "LinkedIn token is expired. Please reconnect your account.",
            },
        )
    except LinkedInReconnectRequiredError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "LINKEDIN_RECONNECT_REQUIRED",
                "message": "LinkedIn token refresh failed. Please reconnect your account.",
            },
        )

    # 6. Publish immediately to LinkedIn
    post_urn = None
    publish_error_msg = None
    publish_status_code = None

    try:
        post_urn = linkedin_publisher.publish_direct_post(
            access_token=access_token,
            provider_account_id=conn.provider_account_id,
            commentary=sanitized_content,
            visibility=normalized_visibility,
            image_bytes=image_bytes,
            image_content_type=image_content_type,
        )
    except LinkedInTokenExpiredError:
        conn.status = "expired"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "LINKEDIN_TOKEN_EXPIRED",
                "message": "LinkedIn access token is expired or was revoked. Please reconnect your account.",
            },
        )
    except LinkedInApiError as exc:
        logger.error(f"LinkedIn publishing API call failed: {exc}")
        if exc.status_code == 429:
            publish_status_code = status.HTTP_429_TOO_MANY_REQUESTS
            publish_error_msg = (
                "LinkedIn share limit reached: LinkedIn blocked posting because the share limit for unverified member accounts has been reached. "
                "Your post has been saved as a draft in AutoPulse."
            )
        elif exc.status_code == 403:
            publish_status_code = status.HTTP_403_FORBIDDEN
            publish_error_msg = "LinkedIn permissions error: Your LinkedIn account does not have permission to publish posts. Please reconnect LinkedIn."
        else:
            publish_status_code = status.HTTP_502_BAD_GATEWAY
            publish_error_msg = f"LinkedIn API returned an error: {str(exc)}"

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    posted_at = now_utc.isoformat()

    # Determine topic title
    clean_title = (topic_title or "").strip()
    if not clean_title:
        # Extract first non-empty line of content as the title/hook
        lines = [line.strip() for line in sanitized_content.splitlines() if line.strip()]
        if lines:
            first_line = lines[0]
            # Strip leading markdown headers, bullet symbols, quotes
            first_line = re.sub(r'^[#*>\-\s"]+|["]+$', '', first_line).strip()
            clean_title = first_line[:120].strip() if first_line else "LinkedIn Post"
        else:
            clean_title = "LinkedIn Post"

    # Extract hashtags
    tags = re.findall(r"#(\w+)", sanitized_content)
    seen_tags = set()
    deduped_tags = []
    for tag in tags:
        lower = tag.lower()
        if lower not in seen_tags:
            seen_tags.add(lower)
            deduped_tags.append(tag)
        if len(deduped_tags) >= 3:
            break

    # Parse sources if provided
    sources_list = []
    if sources_json:
        try:
            parsed = json.loads(sources_json)
            if isinstance(parsed, list):
                sources_list = parsed
        except Exception:
            pass

    # Read profile for branding specs and local run date
    profile = profile_repo.get_profile(db=db, user_id=user.id)
    today_local = now_utc.date()
    if profile and profile.timezone:
        try:
            user_tz = zoneinfo.ZoneInfo(profile.timezone)
            today_local = datetime.datetime.now(user_tz).date()
        except Exception:
            pass

    brand_name = (profile.brand_name if profile and profile.brand_name else "AutoPulse")
    brand_primary_hex = (profile.brand_primary_hex if profile and profile.brand_primary_hex else "#0F172A")
    brand_accent_hex = (profile.brand_accent_hex if profile and profile.brand_accent_hex else "#38BDF8")

    image_spec = {
        "headline": (image_headline or clean_title)[:120],
        "brand_name": brand_name,
        "brand_primary_hex": brand_primary_hex,
        "brand_accent_hex": brand_accent_hex,
        "template_version": "v1",
    }

    # Persist post: published if LinkedIn succeeded, or draft if LinkedIn rejected
    post_status = "published" if post_urn else "draft"
    post_topic_url = f"https://www.linkedin.com/feed/update/{post_urn}/" if post_urn else ""

    post = Post(
        user_id=user.id,
        run_date=today_local,
        status=post_status,
        topic_title=clean_title,
        topic_url=post_topic_url,
        angle=angle,
        hook_type="direct_post",
        post_format="image" if image_bytes else "text",
        ai_score=ai_score,
        needs_review=False,
        sources=sources_list,
        caption=sanitized_content,
        hashtags=deduped_tags,
        image_spec=image_spec,
        publish_at=now_utc,
        llm_model="playground",
        prompt_version="v1.0",
        approval_source="playground",
        decided_at=now_utc,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(post)
    db.flush()

    # Persist publication record
    pub_status = "published" if post_urn else "failed"
    err_code = None
    if not post_urn:
        err_code = "rate_limited" if publish_status_code == status.HTTP_429_TOO_MANY_REQUESTS else "api_error"

    publication = PostPublication(
        user_id=user.id,
        post_id=post.id,
        platform="linkedin",
        status=pub_status,
        attempts=1,
        external_id=post_urn,
        error_code=err_code,
        error_detail=publish_error_msg,
        published_at=now_utc if post_urn else None,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(publication)
    db.commit()
    db.refresh(post)

    # If publishing failed, raise with preserved draft id and clear message
    if publish_error_msg:
        raise HTTPException(
            status_code=publish_status_code or status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": "LINKEDIN_API_ERROR",
                "message": publish_error_msg,
                "post_id": str(post.id),
            },
        )

    return LinkedInPostResponse(
        id=post_urn,
        post_id=str(post.id),
        linkedin_post_id=post_urn,
        posted_at=posted_at,
        visibility=normalized_visibility,
    )


# POST /api/linkedin/post: published immediately to caller's LinkedIn
@router.post(
    "/api/linkedin/post",
    response_model=LinkedInPostResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_to_linkedin_api(
    content: str = Form(...),
    visibility: str = Form(...),
    image: Optional[UploadFile] = File(None),
    topic_title: Optional[str] = Form(None),
    angle: Optional[str] = Form(None),
    ai_score: Optional[int] = Form(None),
    image_headline: Optional[str] = Form(None),
    sources_json: Optional[str] = Form(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> LinkedInPostResponse:
    return await _execute_direct_post(
        content=content,
        visibility=visibility,
        image=image,
        user=user,
        db=db,
        topic_title=topic_title,
        angle=angle,
        ai_score=ai_score,
        image_headline=image_headline,
        sources_json=sources_json,
    )


# Alias route: POST /connections/linkedin/post matching project style
@router.post(
    "/connections/linkedin/post",
    response_model=LinkedInPostResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_to_linkedin_connections(
    content: str = Form(...),
    visibility: str = Form(...),
    image: Optional[UploadFile] = File(None),
    topic_title: Optional[str] = Form(None),
    angle: Optional[str] = Form(None),
    ai_score: Optional[int] = Form(None),
    image_headline: Optional[str] = Form(None),
    sources_json: Optional[str] = Form(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> LinkedInPostResponse:
    return await _execute_direct_post(
        content=content,
        visibility=visibility,
        image=image,
        user=user,
        db=db,
        topic_title=topic_title,
        angle=angle,
        ai_score=ai_score,
        image_headline=image_headline,
        sources_json=sources_json,
    )


# GET /api/linkedin/status: check caller's LinkedIn connection state
@router.get("/api/linkedin/status", response_model=LinkedInStatusResponse)
def get_linkedin_status_api(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> LinkedInStatusResponse:
    status_data = connection_repo.get_linkedin_status(db=db, user_id=user.id)
    return LinkedInStatusResponse(**status_data)


# Alias route: GET /connections/linkedin/status matching project style
@router.get("/connections/linkedin/status", response_model=LinkedInStatusResponse)
def get_linkedin_status_connections(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> LinkedInStatusResponse:
    status_data = connection_repo.get_linkedin_status(db=db, user_id=user.id)
    return LinkedInStatusResponse(**status_data)
