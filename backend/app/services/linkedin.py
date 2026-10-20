import logging
from typing import Dict, Optional, Tuple
from urllib.parse import urlencode
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

# Constants for LinkedIn OAuth endpoints
LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
LINKEDIN_REVOKE_URL = "https://www.linkedin.com/oauth/v2/revoke"

# Required OAuth permission scopes
LINKEDIN_SCOPES = "openid profile w_member_social"

# Request timeout in seconds as required
HTTP_TIMEOUT_SECONDS = 10.0


class LinkedInUnavailableError(Exception):
    # Raised when LinkedIn fails to answer or returns a server error
    pass


class LinkedInRejectedError(Exception):
    # Raised when LinkedIn refuses an authorization code
    pass


def build_authorization_url(state: str) -> str:
    # Construct the LinkedIn OAuth authorization redirect URL
    params = {
        "response_type": "code",
        "client_id": settings.LINKEDIN_CLIENT_ID,
        "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
        "state": state,
        "scope": LINKEDIN_SCOPES,
    }
    return f"{LINKEDIN_AUTH_URL}?{urlencode(params)}"


def exchange_code_for_token(code: str) -> Tuple[str, int]:
    # Exchange the temporary authorization code for a LinkedIn access token
    # Never log or leak secrets or codes in logs or exceptions
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
        "client_id": settings.LINKEDIN_CLIENT_ID,
        "client_secret": settings.LINKEDIN_CLIENT_SECRET,
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    try:
        with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as client:
            response = client.post(LINKEDIN_TOKEN_URL, data=data, headers=headers)
    except (httpx.TimeoutException, httpx.RequestError) as exc:
        logger.warning("LinkedIn token exchange network error")
        raise LinkedInUnavailableError() from exc

    if response.status_code in (400, 401):
        logger.warning(f"LinkedIn rejected code exchange with status {response.status_code}")
        raise LinkedInRejectedError()

    if response.status_code >= 500:
        logger.warning(f"LinkedIn service error with status {response.status_code}")
        raise LinkedInUnavailableError()

    try:
        payload = response.json()
    except Exception as exc:
        raise LinkedInUnavailableError() from exc

    access_token = payload.get("access_token")
    if not access_token:
        raise LinkedInUnavailableError()

    # Default to 60 days (5,184,000 seconds) if expires_in is omitted
    expires_in = int(payload.get("expires_in") or 5184000)
    return access_token, expires_in


def fetch_user_info(access_token: str) -> Tuple[str, Optional[str]]:
    # Retrieve user profile from the OpenID userinfo endpoint
    headers = {"Authorization": f"Bearer {access_token}"}

    try:
        with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as client:
            response = client.get(LINKEDIN_USERINFO_URL, headers=headers)
    except (httpx.TimeoutException, httpx.RequestError) as exc:
        logger.warning("LinkedIn userinfo network error")
        raise LinkedInUnavailableError() from exc

    if response.status_code != 200:
        logger.warning(f"LinkedIn userinfo returned status {response.status_code}")
        raise LinkedInUnavailableError()

    try:
        data: Dict = response.json()
    except Exception as exc:
        raise LinkedInUnavailableError() from exc

    sub = data.get("sub")
    if not sub:
        raise LinkedInUnavailableError()

    name = data.get("name")
    return str(sub), str(name) if name else None


def revoke_token_best_effort(access_token: str) -> None:
    # Best-effort attempt to revoke token at LinkedIn
    # Failure must never block local disconnection
    if not access_token:
        return

    data = {
        "token": access_token,
        "client_id": settings.LINKEDIN_CLIENT_ID,
        "client_secret": settings.LINKEDIN_CLIENT_SECRET,
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    try:
        with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as client:
            client.post(LINKEDIN_REVOKE_URL, data=data, headers=headers)
    except Exception:
        # Suppress any error because revocation is best-effort only
        pass
