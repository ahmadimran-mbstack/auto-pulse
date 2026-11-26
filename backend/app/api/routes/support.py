"""User-facing support ticket routes (/api/support/*)."""

import datetime
import logging
from typing import Any, Dict, Optional
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import asc, select
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.core.config import settings
from app.core.limiter import rate_limit
from app.db.session import get_db
from app.models.support import SupportTicket, SupportTicketMessage
from app.services.notifications import send_user_notification
from app.services.storage import get_storage_backend
from app.services.support import (
    attachment_mime_from_key,
    enforce_ticket_creation_rate_limit,
    enforce_ticket_reply_rate_limit,
    list_user_tickets,
    parse_message_uuid,
    parse_ticket_uuid,
    read_and_store_support_attachment,
    resolve_user_identity,
    serialize_ticket_message,
    serialize_ticket_summary,
    validate_message_body,
    validate_ticket_inputs,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/support", tags=["support"])


def _safe_send_email(**kwargs: Any) -> Optional[str]:
    try:
        res = send_user_notification(**kwargs)
        return str(res.get("status") or "sent")
    except Exception as exc:
        logger.warning(f"Support notification email failed ({kwargs.get('notification_type')}): {exc}")
        return "failed"


@router.get("/tickets", dependencies=[Depends(rate_limit("api"))])
def get_my_support_tickets(
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return list_user_tickets(
        db,
        user_id=user.id,
        status_filter=status_filter,
        page=page,
        page_size=page_size,
    )


@router.post("/tickets", status_code=status.HTTP_201_CREATED)
async def create_support_ticket(
    subject: str = Form(...),
    category: str = Form(...),
    priority: str = Form("medium"),
    description: str = Form(...),
    attachment: Optional[UploadFile] = File(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    enforce_ticket_creation_rate_limit(user.id)
    clean_subject, clean_category, clean_priority, clean_description = validate_ticket_inputs(
        subject=subject,
        category=category,
        priority=priority,
        description=description,
    )

    user_email, user_name = resolve_user_identity(
        db,
        user.id,
        fallback_email=user.email,
        fallback_name=user.name,
    )

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    ticket_id = uuid.uuid4()
    message_id = uuid.uuid4()

    attachment_key = await read_and_store_support_attachment(
        attachment=attachment,
        user_id=user.id,
        ticket_id=ticket_id,
        message_id=message_id,
    )

    ticket = SupportTicket(
        id=ticket_id,
        user_id=user.id,
        user_email=user_email,
        user_name=user_name,
        subject=clean_subject,
        category=clean_category,
        priority=clean_priority,
        status="open",
        created_at=now_utc,
        updated_at=now_utc,
        last_message_at=now_utc,
    )
    first_message = SupportTicketMessage(
        id=message_id,
        ticket_id=ticket_id,
        author_type="user",
        author_id=user.id,
        body=clean_description,
        is_internal=False,
        attachment_key=attachment_key,
        created_at=now_utc,
    )

    db.add(ticket)
    db.flush()
    db.add(first_message)
    db.commit()
    db.refresh(ticket)
    db.refresh(first_message)

    if user_email:
        _safe_send_email(
            user_id=user.id,
            to_email=user_email,
            notification_type="support_ticket_created_user",
            payload={
                "ticket_id": str(ticket.id),
                "display_name": user_name,
                "subject": clean_subject,
                "category": clean_category,
                "priority": clean_priority,
            },
            idempotency_key=f"support_ticket_created_user:{ticket.id}",
            db=db,
        )

    admin_recipient = settings.support_admin_recipient
    if admin_recipient:
        _safe_send_email(
            user_id=None,
            to_email=admin_recipient,
            notification_type="support_ticket_created_admin",
            payload={
                "ticket_id": str(ticket.id),
                "display_name": user_name,
                "user_email": user_email or user.id,
                "subject": clean_subject,
                "category": clean_category,
                "priority": clean_priority,
                "preview": clean_description[:400],
            },
            idempotency_key=f"support_ticket_created_admin:{ticket.id}",
            db=db,
        )

    return {
        "ticket": serialize_ticket_summary(ticket, message_count=1),
        "messages": [serialize_ticket_message(first_message, is_admin_view=False)],
    }


@router.get("/tickets/{ticket_id}", dependencies=[Depends(rate_limit("api"))])
def get_my_support_ticket(
    ticket_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    tid = parse_ticket_uuid(ticket_id)
    ticket = db.scalars(
        select(SupportTicket).where(SupportTicket.id == tid, SupportTicket.user_id == user.id)
    ).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Support ticket not found."},
        )

    messages = list(
        db.scalars(
            select(SupportTicketMessage)
            .where(
                SupportTicketMessage.ticket_id == tid,
                SupportTicketMessage.is_internal.is_(False),
            )
            .order_by(asc(SupportTicketMessage.created_at))
        ).all()
    )
    return {
        "ticket": serialize_ticket_summary(ticket, message_count=len(messages)),
        "messages": [serialize_ticket_message(m, is_admin_view=False) for m in messages],
    }


@router.post("/tickets/{ticket_id}/reply")
async def reply_my_support_ticket(
    ticket_id: str,
    body: str = Form(...),
    attachment: Optional[UploadFile] = File(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    enforce_ticket_reply_rate_limit(user.id)
    tid = parse_ticket_uuid(ticket_id)
    clean_body = validate_message_body(body)

    ticket = db.scalars(
        select(SupportTicket).where(SupportTicket.id == tid, SupportTicket.user_id == user.id)
    ).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Support ticket not found."},
        )

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    message_id = uuid.uuid4()
    attachment_key = await read_and_store_support_attachment(
        attachment=attachment,
        user_id=user.id,
        ticket_id=tid,
        message_id=message_id,
    )

    msg = SupportTicketMessage(
        id=message_id,
        ticket_id=tid,
        author_type="user",
        author_id=user.id,
        body=clean_body,
        is_internal=False,
        attachment_key=attachment_key,
        created_at=now_utc,
    )
    db.add(msg)

    reopened = False
    if ticket.status == "resolved":
        ticket.status = "open"
        ticket.resolved_at = None
        reopened = True
    ticket.updated_at = now_utc
    ticket.last_message_at = now_utc
    db.commit()
    db.refresh(ticket)
    db.refresh(msg)

    user_email, user_name = resolve_user_identity(
        db,
        user.id,
        fallback_email=ticket.user_email or user.email,
        fallback_name=ticket.user_name or user.name,
    )
    admin_recipient = settings.support_admin_recipient
    if admin_recipient:
        _safe_send_email(
            user_id=None,
            to_email=admin_recipient,
            notification_type="support_reply_admin",
            payload={
                "ticket_id": str(ticket.id),
                "display_name": user_name,
                "user_email": user_email or user.id,
                "subject": ticket.subject,
                "reply_body": clean_body,
            },
            idempotency_key=f"support_reply_admin:{msg.id}",
            db=db,
        )

    return {
        "ticket": serialize_ticket_summary(ticket),
        "message": serialize_ticket_message(msg, is_admin_view=False),
        "reopened": reopened,
    }


@router.get("/tickets/{ticket_id}/attachments/{message_id}", dependencies=[Depends(rate_limit("api"))])
def download_my_support_attachment(
    ticket_id: str,
    message_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Response:
    tid = parse_ticket_uuid(ticket_id)
    mid = parse_message_uuid(message_id)

    ticket = db.scalars(
        select(SupportTicket).where(SupportTicket.id == tid, SupportTicket.user_id == user.id)
    ).first()
    if not ticket:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Attachment not found."})

    msg = db.scalars(
        select(SupportTicketMessage).where(
            SupportTicketMessage.id == mid,
            SupportTicketMessage.ticket_id == tid,
            SupportTicketMessage.is_internal.is_(False),
        )
    ).first()
    if not msg or not msg.attachment_key:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Attachment not found."})

    try:
        raw = get_storage_backend().get(msg.attachment_key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Attachment file missing."})

    return Response(
        content=raw,
        media_type=attachment_mime_from_key(msg.attachment_key),
        headers={
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )
