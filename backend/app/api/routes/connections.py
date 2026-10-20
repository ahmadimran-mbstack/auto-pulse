from typing import List
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
from app.core.auth import User, current_user
from app.db.session import get_db
from app.repositories import connection as connection_repo
from app.schemas.connection import (
    ConnectionSummaryResponse,
    OAuthCallbackRequest,
    OAuthStartResponse,
)
from app.services import linkedin as linkedin_service
from app.services.linkedin import (
    LinkedInRejectedError,
    LinkedInUnavailableError,
)

router = APIRouter(prefix="/connections", tags=["connections"])


@router.get("", response_model=List[ConnectionSummaryResponse])
def list_connections(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> List[ConnectionSummaryResponse]:
    # Returns all social account connections for the authenticated caller
    # Expired connections are automatically detected and transitioned
    return connection_repo.get_user_connections(db, user_id=user.id)


@router.post("/linkedin/start", response_model=OAuthStartResponse)
def start_linkedin_oauth(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> OAuthStartResponse:
    # Generate a cryptographically secure random state, store its SHA-256 hash, and clean up expired states
    raw_state = connection_repo.create_oauth_state(db, user_id=user.id, provider="linkedin")

    # Build the authorization URL for LinkedIn with the unhashed state parameter
    authorization_url = linkedin_service.build_authorization_url(raw_state)
    return OAuthStartResponse(authorization_url=authorization_url)


@router.post("/linkedin/callback", response_model=ConnectionSummaryResponse)
def linkedin_oauth_callback(
    payload: OAuthCallbackRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ConnectionSummaryResponse:
    # 1. Atomically claim the state before any external network calls to prevent replay attacks
    claimed_provider = connection_repo.claim_oauth_state(
        db, user_id=user.id, raw_state=payload.state
    )
    if not claimed_provider:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "invalid_state",
                "message": "This connection link is no longer valid. Start again.",
            },
        )

    # 2. Exchange authorization code for LinkedIn access token
    try:
        access_token, expires_in = linkedin_service.exchange_code_for_token(payload.code)
    except LinkedInRejectedError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "linkedin_rejected",
                "message": "LinkedIn refused the code (expired or already used).",
            },
        )
    except LinkedInUnavailableError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "linkedin_unavailable",
                "message": "LinkedIn did not answer or returned an error.",
            },
        )

    # 3. Retrieve user identity from LinkedIn OpenID userinfo endpoint
    try:
        sub, name = linkedin_service.fetch_user_info(access_token)
    except LinkedInUnavailableError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "linkedin_unavailable",
                "message": "LinkedIn did not answer or returned an error.",
            },
        )

    # 4. Store encrypted connection record and return connection summary
    scopes = ["openid", "profile", "w_member_social"]
    summary = connection_repo.save_linkedin_connection(
        db=db,
        user_id=user.id,
        provider_account_id=sub,
        account_name=name,
        access_token=access_token,
        expires_in_seconds=expires_in,
        scopes=scopes,
    )
    return summary


@router.delete("/linkedin", status_code=status.HTTP_204_NO_CONTENT)
def disconnect_linkedin(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Response:
    # Attempt best-effort revocation at LinkedIn, then remove caller's connection row
    connection_repo.disconnect_linkedin_connection(db, user_id=user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
