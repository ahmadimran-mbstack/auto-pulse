import datetime
import hashlib
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.approval import Approval
from app.models.post import Post
from app.models.profile import Profile
from app.schemas.post import DecisionRequest, PublicApprovalDetail
from app.services.approval import decide_approval
from app.services.image import build_image_etag, render_post_image

# DAY 6: rate limit these routes
router = APIRouter(prefix="/public/approvals", tags=["public-approvals"])


# Dependency to inject required security headers on public approval responses
def set_public_security_headers(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Robots-Tag"] = "noindex"


# Helper to lookup approval and post by raw token string
def get_approval_and_post_by_token(db: Session, token: str):
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    approval = db.query(Approval).filter(Approval.token_hash == token_hash).first()
    if not approval:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Approval token not found"},
        )
    post = db.query(Post).filter(Post.id == approval.post_id).first()
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Associated post not found"},
        )
    return approval, post, token_hash


# GET /public/approvals/{token}: returns post preview and approval state
@router.get("/{token}", response_model=PublicApprovalDetail, dependencies=[Depends(set_public_security_headers)])
def get_public_approval(
    token: str,
    db: Session = Depends(get_db),
) -> PublicApprovalDetail:
    approval, post, _ = get_approval_and_post_by_token(db, token)

    # Calculate current state
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    if approval.decision == "approved":
        state_str = "approved"
    elif approval.decision == "rejected":
        state_str = "rejected"
    elif approval.expires_at <= now_utc:
        state_str = "expired"
    else:
        state_str = "pending"

    # Load author profile for user display settings
    profile = db.query(Profile).filter(Profile.user_id == post.user_id).first()
    display_name = profile.display_name if profile and profile.display_name else "Creator"
    tz_str = profile.timezone if profile and profile.timezone else "UTC"

    return PublicApprovalDetail(
        state=state_str,
        caption=post.caption,
        hashtags=post.hashtags,
        topic_title=post.topic_title,
        topic_url=post.topic_url,
        display_name=display_name,
        timezone=tz_str,
        publish_at=post.publish_at.isoformat() if post.publish_at else None,
        expires_at=approval.expires_at.isoformat(),
    )


# GET /public/approvals/{token}/image.png: dynamically renders the post image with width validation and ETag caching
@router.get("/{token}/image.png", dependencies=[Depends(set_public_security_headers)])
def get_public_approval_image(
    token: str,
    request: Request,
    w: int = Query(default=1200),
    db: Session = Depends(get_db),
) -> Response:
    if w not in {240, 480, 1200}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_width", "message": "Width must be 240, 480, or 1200"},
        )

    _, post, _ = get_approval_and_post_by_token(db, token)
    etag = build_image_etag(post.image_spec, w)

    if_none_match = request.headers.get("if-none-match")
    if if_none_match and if_none_match.strip() == etag:
        return Response(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={
                "ETag": etag,
                "Cache-Control": "no-store",
                "Referrer-Policy": "no-referrer",
                "X-Robots-Tag": "noindex",
            },
        )

    png_bytes = render_post_image(post.image_spec, width_target=w)
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "ETag": etag,
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
            "X-Robots-Tag": "noindex",
        },
    )


# POST /public/approvals/{token}/decision: records approved or rejected decision
@router.post("/{token}/decision", dependencies=[Depends(set_public_security_headers)])
def post_public_approval_decision(
    token: str,
    payload: DecisionRequest,
    db: Session = Depends(get_db),
):
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return decide_approval(
        db=db,
        decision=payload.decision,
        decided_via="email_link",
        token_hash=token_hash,
    )
