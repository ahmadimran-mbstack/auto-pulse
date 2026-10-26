import datetime
import logging
from typing import Optional, Tuple
import uuid
import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.crypto import decrypt_text
from app.models.post import Post
from app.models.publication import PostPublication
from app.models.social_connection import SocialConnection
from app.services.image import render_post_image

logger = logging.getLogger(__name__)

# List of reserved characters in LinkedIn little text format
# Backslash must always be escaped first so subsequent escape backslashes are not doubled
RESERVED_CHARS = [
    ("\\", "\\\\"),
    ("|", "\\|"),
    ("{", "\\{"),
    ("}", "\\}"),
    ("@", "\\@"),
    ("[", "\\["),
    ("]", "\\]"),
    ("(", "\\("),
    (")", "\\)"),
    ("<", "\\<"),
    (">", "\\>"),
    ("#", "\\#"),
    ("*", "\\*"),
    ("_", "\\_"),
    ("~", "\\~"),
]


# Escape reserved characters for LinkedIn little text format to prevent post truncation
def escape_little_text(text: str) -> str:
    if not text:
        return ""
    result = text
    for char, replacement in RESERVED_CHARS:
        result = result.replace(char, replacement)
    return result


# Map HTTP and network errors to domain specific error codes
def map_linkedin_error(
    status_code: Optional[int],
    is_create_post_sent: bool,
    exc: Optional[Exception] = None,
) -> Tuple[str, str]:
    if status_code == 401:
        return "token_invalid", "LinkedIn access token is invalid or expired"
    if status_code == 403:
        return "permission_denied", "LinkedIn returned 403 Forbidden"
    if status_code in (400, 422):
        return "rejected_by_linkedin", f"LinkedIn rejected post with status {status_code}"
    if status_code == 429:
        return "rate_limited", "LinkedIn rate limit exceeded"

    # Any unclear result after create-post was sent must be outcome_unknown
    if is_create_post_sent:
        return "outcome_unknown", "Network error or server error after create-post request was sent"

    # Failures before create-post was sent are safe step failures
    return "step_failed", f"Step failure before post creation: {str(exc)[:100] if exc else 'unknown'}"


# Routine to publish a post and its branded image to LinkedIn
def publish_post_to_linkedin(
    db: Session,
    post: Post,
    client: Optional[httpx.Client] = None,
) -> Tuple[bool, Optional[str], Optional[str], Optional[str]]:
    # Step 1: Load and validate caller's social connection
    conn = (
        db.query(SocialConnection)
        .filter(
            SocialConnection.user_id == post.user_id,
            SocialConnection.provider == "linkedin",
        )
        .first()
    )

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    if not conn or conn.status != "active" or not conn.access_token_enc or (conn.expires_at and conn.expires_at <= now_utc):
        logger.warning(f"Publish aborted for post {post.id}: LinkedIn connection missing or inactive")
        return False, None, "connection_inactive", "LinkedIn connection is missing or inactive"

    # Step 2: Decrypt the token only here
    try:
        access_token = decrypt_text(conn.access_token_enc)
    except Exception as exc:
        logger.error(f"Failed to decrypt LinkedIn token for user {post.user_id}: {exc}")
        return False, None, "step_failed", "Could not decrypt connection token"

    # Step 3: Render the PNG from image_spec
    try:
        png_bytes = render_post_image(post.image_spec)
    except Exception as exc:
        logger.error(f"Image rendering failed for post {post.id}: {exc}")
        return False, None, "step_failed", f"Failed to render post image: {str(exc)[:100]}"

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Linkedin-Version": settings.LINKEDIN_API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
    }

    http = client or httpx.Client(timeout=30.0)
    should_close_client = client is None

    try:
        # Step 4: initializeUpload
        init_url = "https://api.linkedin.com/rest/images?action=initializeUpload"
        init_body = {
            "initializeUploadRequest": {
                "owner": f"urn:li:person:{conn.provider_account_id}"
            }
        }

        try:
            init_res = http.post(init_url, json=init_body, headers=headers)
        except Exception as exc:
            err_code, err_detail = map_linkedin_error(None, is_create_post_sent=False, exc=exc)
            return False, None, err_code, err_detail

        if init_res.status_code != 200:
            if init_res.status_code == 401:
                conn.status = "expired"
                db.commit()
            err_code, err_detail = map_linkedin_error(init_res.status_code, is_create_post_sent=False)
            return False, None, err_code, err_detail

        init_data = init_res.json()
        upload_url = init_data.get("value", {}).get("uploadUrl")
        image_urn = init_data.get("value", {}).get("image")

        if not upload_url or not image_urn:
            return False, None, "step_failed", "Missing uploadUrl or image URN from LinkedIn initializeUpload"

        # Step 5: PUT image bytes to uploadUrl
        put_headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "image/png",
        }
        try:
            put_res = http.put(upload_url, content=png_bytes, headers=put_headers)
        except Exception as exc:
            err_code, err_detail = map_linkedin_error(None, is_create_post_sent=False, exc=exc)
            return False, None, err_code, err_detail

        if put_res.status_code not in (200, 201):
            if put_res.status_code == 401:
                conn.status = "expired"
                db.commit()
            err_code, err_detail = map_linkedin_error(put_res.status_code, is_create_post_sent=False)
            return False, None, err_code, err_detail

        # Step 6: Create the post with escaped commentary
        escaped_caption = escape_little_text(post.caption)
        raw_hashtags = post.hashtags or []
        formatted_tags = " ".join(f"#{t.lstrip('#')}" for t in raw_hashtags if t.strip())

        if formatted_tags:
            commentary = f"{escaped_caption}\n\n{formatted_tags}"
        else:
            commentary = escaped_caption

        alt_text = (post.image_spec or {}).get("headline", post.topic_title)

        post_body = {
            "author": f"urn:li:person:{conn.provider_account_id}",
            "commentary": commentary,
            "visibility": settings.LINKEDIN_VISIBILITY,
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": [],
            },
            "content": {
                "media": {
                    "id": image_urn,
                    "altText": alt_text,
                }
            },
            "lifecycleState": "PUBLISHED",
        }

        posts_url = "https://api.linkedin.com/rest/posts"
        posts_headers = dict(headers)
        posts_headers["Content-Type"] = "application/json"

        try:
            post_res = http.post(posts_url, json=post_body, headers=posts_headers)
        except Exception as exc:
            # Request was sent: outcome is unknown, never retry automatically
            err_code, err_detail = map_linkedin_error(None, is_create_post_sent=True, exc=exc)
            return False, None, err_code, err_detail

        if post_res.status_code == 201:
            external_urn = post_res.headers.get("x-restli-id") or post_res.headers.get("X-RestLi-Id")
            return True, external_urn, None, None

        if post_res.status_code == 401:
            conn.status = "expired"
            db.commit()

        err_code, err_detail = map_linkedin_error(post_res.status_code, is_create_post_sent=True)
        return False, None, err_code, err_detail

    finally:
        if should_close_client:
            http.close()


class LinkedInNotConnectedError(Exception):
    # Raised when the user has no LinkedIn connection
    pass


class LinkedInTokenExpiredError(Exception):
    # Raised when the LinkedIn token is expired and cannot be used
    pass


class LinkedInReconnectRequiredError(Exception):
    # Raised when the token refresh fails or the token cannot be decrypted
    pass


class LinkedInApiError(Exception):
    # Raised when LinkedIn returns an error during upload or post creation
    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


def publish_direct_post(
    access_token: str,
    provider_account_id: str,
    commentary: str,
    visibility: str,
    image_bytes: Optional[bytes] = None,
    image_content_type: Optional[str] = None,
    client: Optional[httpx.Client] = None,
) -> str:
    # Publishes commentary and optional image directly to LinkedIn
    # Follows the register upload, binary PUT, and create post sequence
    # Never logs raw tokens or codes
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Linkedin-Version": settings.LINKEDIN_API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
    }

    http = client or httpx.Client(timeout=30.0)
    should_close_client = client is None

    try:
        image_urn = None
        # Handle optional image upload flow
        if image_bytes is not None:
            # Step 1: initializeUpload
            init_url = "https://api.linkedin.com/rest/images?action=initializeUpload"
            init_body = {
                "initializeUploadRequest": {
                    "owner": f"urn:li:person:{provider_account_id}"
                }
            }
            try:
                init_res = http.post(init_url, json=init_body, headers=headers)
            except Exception as exc:
                logger.error(f"LinkedIn image upload initialization network error: {exc}")
                raise LinkedInApiError("LinkedIn image upload initialization failed due to network error.")

            if init_res.status_code == 401:
                logger.warning("LinkedIn image upload initialization rejected with 401 Unauthorized")
                raise LinkedInTokenExpiredError("LinkedIn access token is invalid or expired.")

            if init_res.status_code != 200:
                logger.error(
                    f"LinkedIn image upload initialization failed: status={init_res.status_code} body={init_res.text[:200]}"
                )
                raise LinkedInApiError(
                    f"LinkedIn image initialization failed with status {init_res.status_code}",
                    status_code=init_res.status_code,
                )

            init_data = init_res.json()
            upload_url = init_data.get("value", {}).get("uploadUrl")
            image_urn = init_data.get("value", {}).get("image")

            if not upload_url or not image_urn:
                logger.error("LinkedIn initializeUpload response missing uploadUrl or image URN")
                raise LinkedInApiError("LinkedIn image upload initialization returned incomplete data.")

            # Step 2: PUT image binary
            put_headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": image_content_type or "image/jpeg",
            }
            try:
                put_res = http.put(upload_url, content=image_bytes, headers=put_headers)
            except Exception as exc:
                logger.error(f"LinkedIn image binary upload network error: {exc}")
                raise LinkedInApiError("LinkedIn image upload failed due to network error.")

            if put_res.status_code == 401:
                logger.warning("LinkedIn image binary upload rejected with 401 Unauthorized")
                raise LinkedInTokenExpiredError("LinkedIn access token is invalid or expired.")

            if put_res.status_code not in (200, 201):
                logger.error(
                    f"LinkedIn image binary upload failed: status={put_res.status_code} body={put_res.text[:200]}"
                )
                raise LinkedInApiError(
                    f"LinkedIn image binary upload failed with status {put_res.status_code}",
                    status_code=put_res.status_code,
                )

        # Step 3: Create post
        post_body = {
            "author": f"urn:li:person:{provider_account_id}",
            "commentary": commentary,
            "visibility": visibility,
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": [],
            },
            "lifecycleState": "PUBLISHED",
        }

        if image_urn:
            post_body["content"] = {
                "media": {
                    "id": image_urn,
                }
            }

        posts_url = "https://api.linkedin.com/rest/posts"
        posts_headers = dict(headers)
        posts_headers["Content-Type"] = "application/json"

        try:
            post_res = http.post(posts_url, json=post_body, headers=posts_headers)
        except Exception as exc:
            logger.error(f"LinkedIn post creation network error: {exc}")
            raise LinkedInApiError("LinkedIn post creation failed due to network error.")

        if post_res.status_code == 201:
            external_urn = (
                post_res.headers.get("x-restli-id")
                or post_res.headers.get("X-RestLi-Id")
                or post_res.headers.get("Location")
                or f"urn:li:share:{uuid.uuid4()}"
            )
            return external_urn

        if post_res.status_code == 401:
            logger.warning("LinkedIn post creation rejected with 401 Unauthorized")
            raise LinkedInTokenExpiredError("LinkedIn access token is invalid or expired.")

        logger.error(
            f"LinkedIn post creation failed: status={post_res.status_code} body={post_res.text[:200]}"
        )
        raise LinkedInApiError(
            f"LinkedIn post creation failed with status {post_res.status_code}",
            status_code=post_res.status_code,
        )

    finally:
        if should_close_client:
            http.close()

