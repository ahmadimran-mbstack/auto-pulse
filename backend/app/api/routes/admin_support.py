"""Admin support ticket management and sidebar badge counts (/api/admin/*)."""

import datetime
import logging
from typing import Any, Dict, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import asc, func, select, text
from sqlalchemy.orm import Session

from app.api.routes.admin_deps import AdminCaller, rate_limit_admin_mutation, require_admin_caller
from app.db.session import get_db
from app.models.admin import AdminAuditLog
from app.models.support import SupportTicket, SupportTicketMessage
from app.services.admin_overview import invalidate_admin_overview_cache
from app.services.notifications import send_user_notification
from app.services.storage import get_storage_backend
from app.services.support import (
    VALID_SUPPORT_STATUSES,
    attachment_mime_from_key,
    fetch_ticket_email_logs,
    list_admin_tickets,
    parse_message_uuid,
    parse_ticket_uuid,
    resolve_user_identity,
    serialize_ticket_message,
    serialize_ticket_summary,
    validate_message_body,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin-support"])


class AdminSupportReplyRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    body: str = Field(..., min_length=1, max_length=5000)
    is_internal: bool = False


class AdminSupportStatusRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: str
    send_email: bool = True


def _safe_send_email(**kwargs: Any) -> Dict[str, Any]:
    try:
        return send_user_notification(**kwargs)
    except Exception as exc:
        logger.warning(f"Admin support email failed ({kwargs.get('notification_type')}): {exc}")
        return {"status": "failed", "error": str(exc)[:300]}


@router.get("/badge-counts")
def get_admin_badge_counts(
    admin: AdminCaller = Depends(require_admin_caller),
    db: Session = Depends(get_db),
) -> Dict[str, int]:
    """Return live pending payments and open support ticket counts for admin sidebar badges."""
    pending_payments = int(
        db.execute(text("SELECT COUNT(*)::int FROM payments WHERE status = 'pending'")).scalar() or 0
    )
    open_tickets = int(
        db.scalar(
            select(func.count(SupportTicket.id)).where(
                SupportTicket.status.in_(("open", "in_progress"))
            )
        )
        or 0
    )
    return {
        "pending_payments": pending_payments,
        "open_tickets": open_tickets,
    }


@router.get("/support/tickets")
def admin_list_support_tickets(
    status_filter: Optional[str] = Query("all", alias="status"),
    priority: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: AdminCaller = Depends(require_admin_caller),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return list_admin_tickets(
        db,
        status_filter=status_filter,
        priority_filter=priority,
        category_filter=category,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.get("/support/tickets/{ticket_id}")
def admin_get_support_ticket(
    ticket_id: str,
    admin: AdminCaller = Depends(require_admin_caller),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    tid = parse_ticket_uuid(ticket_id)
    ticket = db.scalars(select(SupportTicket).where(SupportTicket.id == tid)).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Support ticket not found."},
        )

    messages = list(
        db.scalars(
            select(SupportTicketMessage)
            .where(SupportTicketMessage.ticket_id == tid)
            .order_by(asc(SupportTicketMessage.created_at))
        ).all()
    )
    email_logs = fetch_ticket_email_logs(db, str(ticket.id))
    return {
        "ticket": serialize_ticket_summary(ticket, message_count=len(messages)),
        "messages": [serialize_ticket_message(m, is_admin_view=True) for m in messages],
        "email_logs": email_logs,
    }


@router.post("/support/tickets/{ticket_id}/reply")
def admin_reply_support_ticket(
    ticket_id: str,
    payload: AdminSupportReplyRequest,
    admin: AdminCaller = Depends(rate_limit_admin_mutation),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    tid = parse_ticket_uuid(ticket_id)
    clean_body = validate_message_body(payload.body)

    ticket = db.scalars(select(SupportTicket).where(SupportTicket.id == tid)).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Support ticket not found."},
        )

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    before_status = ticket.status
    msg = SupportTicketMessage(
        id=uuid.uuid4(),
        ticket_id=tid,
        author_type="admin",
        author_id=admin.email,
        body=clean_body,
        is_internal=bool(payload.is_internal),
        attachment_key=None,
        created_at=now_utc,
    )
    db.add(msg)

    if not payload.is_internal:
        if ticket.status == "open":
            ticket.status = "in_progress"
        ticket.last_message_at = now_utc
    ticket.updated_at = now_utc

    user_email, user_name = resolve_user_identity(
        db,
        ticket.user_id,
        fallback_email=ticket.user_email,
        fallback_name=ticket.user_name,
    )
    will_email = bool((not payload.is_internal) and user_email)

    audit = AdminAuditLog(
        actor_id=admin.id,
        actor_email=admin.email,
        action="support.internal_note" if payload.is_internal else "support.replied",
        target_type="support_ticket",
        target_id=str(ticket.id),
        target_email=user_email,
        reason="Internal support note" if payload.is_internal else "Replied to support ticket",
        before_state={"status": before_status},
        after_state={"status": ticket.status, "is_internal": bool(payload.is_internal)},
        email_status="pending" if will_email else "not_sent",
    )
    db.add(audit)
    db.commit()
    db.refresh(ticket)
    db.refresh(msg)
    db.refresh(audit)

    invalidate_admin_overview_cache()

    email_status = "not_sent"
    email_error: Optional[str] = None
    # Never email internal notes
    if will_email and user_email:
        email_res = _safe_send_email(
            user_id=ticket.user_id,
            to_email=user_email,
            notification_type="support_reply_user",
            payload={
                "ticket_id": str(ticket.id),
                "display_name": user_name,
                "subject": ticket.subject,
                "reply_body": clean_body,
            },
            idempotency_key=f"support_reply_user:{msg.id}",
            db=db,
        )
        email_status = str(email_res.get("status") or "sent")
        email_error = email_res.get("error")
        audit.email_status = email_status
        db.commit()

    return {
        "ticket": serialize_ticket_summary(ticket),
        "message": serialize_ticket_message(msg, is_admin_view=True),
        "email_status": email_status,
        "email_error": email_error,
    }


@router.patch("/support/tickets/{ticket_id}/status")
def admin_update_support_ticket_status(
    ticket_id: str,
    payload: AdminSupportStatusRequest,
    admin: AdminCaller = Depends(rate_limit_admin_mutation),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    tid = parse_ticket_uuid(ticket_id)
    new_status = (payload.status or "").strip().lower()
    if new_status not in VALID_SUPPORT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "invalid_status",
                "message": "Status must be open, in_progress, or resolved.",
            },
        )

    ticket = db.scalars(select(SupportTicket).where(SupportTicket.id == tid)).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Support ticket not found."},
        )

    before_status = ticket.status
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    changed = before_status != new_status

    ticket.status = new_status
    ticket.resolved_at = now_utc if new_status == "resolved" else None
    ticket.updated_at = now_utc

    user_email, user_name = resolve_user_identity(
        db,
        ticket.user_id,
        fallback_email=ticket.user_email,
        fallback_name=ticket.user_name,
    )
    will_email = bool(changed and payload.send_email and user_email)

    audit = AdminAuditLog(
        actor_id=admin.id,
        actor_email=admin.email,
        action="support.status_changed",
        target_type="support_ticket",
        target_id=str(ticket.id),
        target_email=user_email,
        reason=f"Changed ticket status from {before_status} to {new_status}",
        before_state={"status": before_status},
        after_state={"status": new_status},
        email_status="pending" if will_email else "not_sent",
    )
    db.add(audit)
    db.commit()
    db.refresh(ticket)
    db.refresh(audit)

    invalidate_admin_overview_cache()

    email_status = "not_sent"
    email_error: Optional[str] = None
    if will_email and user_email:
        email_res = _safe_send_email(
            user_id=ticket.user_id,
            to_email=user_email,
            notification_type="support_status_changed_user",
            payload={
                "ticket_id": str(ticket.id),
                "display_name": user_name,
                "subject": ticket.subject,
                "status": new_status,
            },
            idempotency_key=f"support_status_changed:{ticket.id}:{new_status}:{int(now_utc.timestamp() * 1000)}",
            db=db,
        )
        email_status = str(email_res.get("status") or "sent")
        email_error = email_res.get("error")
        audit.email_status = email_status
        db.commit()

    return {
        "ticket": serialize_ticket_summary(ticket),
        "email_status": email_status,
        "email_error": email_error,
    }


@router.get("/support/tickets/{ticket_id}/attachments/{message_id}")
def admin_download_support_attachment(
    ticket_id: str,
    message_id: str,
    admin: AdminCaller = Depends(require_admin_caller),
    db: Session = Depends(get_db),
) -> Response:
    tid = parse_ticket_uuid(ticket_id)
    mid = parse_message_uuid(message_id)

    msg = db.scalars(
        select(SupportTicketMessage).where(
            SupportTicketMessage.id == mid,
            SupportTicketMessage.ticket_id == tid,
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
