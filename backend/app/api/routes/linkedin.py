import datetime
import logging
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.db.session import get_db
from app.repositories import connection as connection_repo
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
                "message": "LinkedIn access token is expired or was revoked.",
            },
        )
    except LinkedInApiError as exc:
        logger.error(f"LinkedIn publishing API call failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": "LINKEDIN_API_ERROR",
                "message": "LinkedIn API returned an error during publishing.",
            },
        )

    # Note on Rule 6: The existing posts table has unique constraint (user_id, run_date)
    # and strictly requires LLM prompt version, grounding sources, and image specs.
    # Therefore, manual instant posts skip database insertion into scheduled drafts
    # and return the published post details directly to the client.
    posted_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

    return LinkedInPostResponse(
        id=post_urn,
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
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> LinkedInPostResponse:
    return await _execute_direct_post(
        content=content,
        visibility=visibility,
        image=image,
        user=user,
        db=db,
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
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> LinkedInPostResponse:
    return await _execute_direct_post(
        content=content,
        visibility=visibility,
        image=image,
        user=user,
        db=db,
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
