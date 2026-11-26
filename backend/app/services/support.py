"""Support ticket validation, storage, rate limits, and query helpers."""

import datetime
import logging
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import uuid

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import and_, desc, func, or_, select, text
from sqlalchemy.orm import Session

from app.core.limiter import enforce_rate_limit
from app.models.admin import EmailLog
from app.models.support import SupportTicket, SupportTicketMessage
from app.services.storage import get_storage_backend

logger = logging.getLogger(__name__)

VALID_SUPPORT_CATEGORIES = (
    "bug",
    "billing",
    "linkedin_account",
    "posts",
    "feature_request",
    "other",
)
VALID_SUPPORT_PRIORITIES = ("low", "medium", "high", "urgent")
VALID_SUPPORT_STATUSES = ("open", "in_progress", "resolved")

MAX_SUPPORT_ATTACHMENT_BYTES = 5 * 1024 * 1024  # 5 MB

_EXT_MIME_MAP = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}

_FORMAT_EXT_MAP = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}


def validate_ticket_inputs(
    subject: str,
    category: str,
    priority: str,
    description: str,
) -> Tuple[str, str, str, str]:
    clean_subject = (subject or "").strip()
    if not clean_subject or len(clean_subject) > 150:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "invalid_subject",
                "message": "Subject is required and must be 150 characters or fewer.",
            },
        )

    clean_category = (category or "").strip().lower()
    if clean_category not in VALID_SUPPORT_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "invalid_category",
                "message": "Select a valid support category.",
            },
        )

    clean_priority = (priority or "medium").strip().lower()
    if clean_priority not in VALID_SUPPORT_PRIORITIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "invalid_priority",
                "message": "Select a valid priority (low, medium, high, or urgent).",
            },
        )

    clean_description = (description or "").strip()
    if not clean_description or len(clean_description) > 5000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "invalid_description",
                "message": "Description is required and must be 5,000 characters or fewer.",
            },
        )

    return clean_subject, clean_category, clean_priority, clean_description


def validate_message_body(body: str) -> str:
    clean_body = (body or "").strip()
    if not clean_body or len(clean_body) > 5000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "invalid_message",
                "message": "Message is required and must be 5,000 characters or fewer.",
            },
        )
    return clean_body


def validate_support_image_bytes(
    raw_bytes: bytes,
    filename: Optional[str] = None,
) -> Tuple[str, str]:
    """Validate image upload strictly via magic bytes and matching extension (png/jpg/webp, <=5 MB)."""
    if not raw_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_attachment", "message": "Attached image file is empty."},
        )
    if len(raw_bytes) > MAX_SUPPORT_ATTACHMENT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "code": "attachment_too_large",
                "message": "Attachment must be 5 MB or smaller.",
            },
        )

    detected_mime: Optional[str] = None
    if raw_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        detected_mime = "image/png"
    elif raw_bytes.startswith(b"\xff\xd8\xff"):
        detected_mime = "image/jpeg"
    elif len(raw_bytes) >= 12 and raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WEBP":
        detected_mime = "image/webp"

    if not detected_mime:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "invalid_attachment",
                "message": "Only PNG, JPG, or WebP images are supported.",
            },
        )

    if filename:
        ext = Path(filename).suffix.lower()
        if ext:
            expected_mime = _EXT_MIME_MAP.get(ext)
            if expected_mime != detected_mime:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "invalid_attachment",
                        "message": "Attachment file extension does not match image content.",
                    },
                )

    return detected_mime, _FORMAT_EXT_MAP[detected_mime]


async def read_and_store_support_attachment(
    attachment: Optional[UploadFile],
    user_id: str,
    ticket_id: uuid.UUID,
    message_id: uuid.UUID,
) -> Optional[str]:
    """Read an uploaded image up to 5 MB, validate magic bytes, and write to storage backend."""
    if attachment is None or not (attachment.filename or "").strip():
        return None

    chunks: List[bytes] = []
    total = 0
    while True:
        chunk = await attachment.read(256 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_SUPPORT_ATTACHMENT_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail={
                    "code": "attachment_too_large",
                    "message": "Attachment must be 5 MB or smaller.",
                },
            )
        chunks.append(chunk)

    raw_bytes = b"".join(chunks)
    if total == 0:
        return None

    mime, ext = validate_support_image_bytes(raw_bytes, filename=attachment.filename)
    key = f"support/{user_id}/{ticket_id}/{message_id}.{ext}"
    get_storage_backend().put(key, raw_bytes, content_type=mime)
    return key


def attachment_mime_from_key(storage_key: str) -> str:
    ext = Path(storage_key).suffix.lower()
    return _EXT_MIME_MAP.get(ext, "application/octet-stream")


def enforce_ticket_creation_rate_limit(user_id: str) -> None:
    enforce_rate_limit(
        key=f"support:create:1h:{user_id}",
        max_requests=5,
        window_seconds=3600,
        error_message="You can submit at most 5 support tickets per hour.",
    )
    enforce_rate_limit(
        key=f"support:create:24h:{user_id}",
        max_requests=20,
        window_seconds=86400,
        error_message="Daily support ticket limit (20 per day) reached.",
    )


def enforce_ticket_reply_rate_limit(user_id: str) -> None:
    enforce_rate_limit(
        key=f"support:reply:1h:{user_id}",
        max_requests=30,
        window_seconds=3600,
        error_message="Too many replies sent. Please wait before sending another reply.",
    )


def resolve_user_identity(
    db: Session,
    user_id: str,
    fallback_email: Optional[str] = None,
    fallback_name: Optional[str] = None,
) -> Tuple[Optional[str], str]:
    row = db.execute(
        text(
            'SELECT u.email, COALESCE(NULLIF(TRIM(pr.display_name), \'\'), u.name) AS display_name '
            'FROM neon_auth."user" u '
            'LEFT JOIN profiles pr ON pr.user_id = u.id::text '
            'WHERE u.id::text = :uid LIMIT 1'
        ),
        {"uid": user_id},
    ).fetchone()
    if row:
        email = str(row.email).strip() if row.email else fallback_email
        name = str(row.display_name).strip() if row.display_name else None
        if not name and email:
            name = email.split("@")[0]
        return email, name or (fallback_name or "Creator")
    clean_fallback = (fallback_email or "").strip() or None
    return clean_fallback, fallback_name or (clean_fallback.split("@")[0] if clean_fallback else "Creator")


def parse_ticket_uuid(raw_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Support ticket not found."},
        )


def parse_message_uuid(raw_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Attachment not found."},
        )


def serialize_ticket_summary(ticket: SupportTicket, message_count: Optional[int] = None) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "id": str(ticket.id),
        "user_id": ticket.user_id,
        "user_email": ticket.user_email,
        "user_name": ticket.user_name,
        "subject": ticket.subject,
        "category": ticket.category,
        "priority": ticket.priority,
        "status": ticket.status,
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
        "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else None,
        "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
        "last_message_at": ticket.last_message_at.isoformat() if ticket.last_message_at else None,
    }
    if message_count is not None:
        out["message_count"] = int(message_count)
    return out


def serialize_ticket_message(
    msg: SupportTicketMessage,
    *,
    is_admin_view: bool = False,
) -> Dict[str, Any]:
    attachment_url: Optional[str] = None
    if msg.attachment_key:
        prefix = "/api/admin/support/tickets" if is_admin_view else "/api/support/tickets"
        attachment_url = f"{prefix}/{msg.ticket_id}/attachments/{msg.id}"
    data: Dict[str, Any] = {
        "id": str(msg.id),
        "ticket_id": str(msg.ticket_id),
        "author_type": msg.author_type,
        "author_id": msg.author_id,
        "body": msg.body,
        "has_attachment": bool(msg.attachment_key),
        "attachment_url": attachment_url,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }
    if is_admin_view:
        data["is_internal"] = bool(msg.is_internal)
    return data


def list_user_tickets(
    db: Session,
    user_id: str,
    status_filter: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    conds = [SupportTicket.user_id == user_id]
    if status_filter and status_filter != "all":
        clean_status = status_filter.strip().lower()
        if clean_status not in VALID_SUPPORT_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invalid_status", "message": "Invalid status filter."},
            )
        conds.append(SupportTicket.status == clean_status)

    where_clause = and_(*conds)
    total = int(db.scalar(select(func.count(SupportTicket.id)).where(where_clause)) or 0)
    total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1
    offset = (page - 1) * page_size

    rows = list(
        db.scalars(
            select(SupportTicket)
            .where(where_clause)
            .order_by(desc(SupportTicket.last_message_at), desc(SupportTicket.created_at))
            .limit(page_size)
            .offset(offset)
        ).all()
    )

    msg_counts: Dict[uuid.UUID, int] = {}
    if rows:
        ticket_ids = [r.id for r in rows]
        cnt_rows = db.execute(
            select(SupportTicketMessage.ticket_id, func.count(SupportTicketMessage.id))
            .where(
                SupportTicketMessage.ticket_id.in_(ticket_ids),
                SupportTicketMessage.is_internal.is_(False),
            )
            .group_by(SupportTicketMessage.ticket_id)
        ).all()
        msg_counts = {tid: int(cnt) for tid, cnt in cnt_rows}

    return {
        "items": [serialize_ticket_summary(r, msg_counts.get(r.id, 0)) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


def list_admin_tickets(
    db: Session,
    *,
    status_filter: Optional[str] = None,
    priority_filter: Optional[str] = None,
    category_filter: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    conds = []
    if status_filter and status_filter != "all":
        clean_status = status_filter.strip().lower()
        if clean_status not in VALID_SUPPORT_STATUSES:
            raise HTTPException(status_code=400, detail={"code": "invalid_status", "message": "Invalid status filter."})
        conds.append(SupportTicket.status == clean_status)

    if priority_filter and priority_filter != "all":
        clean_priority = priority_filter.strip().lower()
        if clean_priority not in VALID_SUPPORT_PRIORITIES:
            raise HTTPException(status_code=400, detail={"code": "invalid_priority", "message": "Invalid priority filter."})
        conds.append(SupportTicket.priority == clean_priority)

    if category_filter and category_filter != "all":
        clean_cat = category_filter.strip().lower()
        if clean_cat not in VALID_SUPPORT_CATEGORIES:
            raise HTTPException(status_code=400, detail={"code": "invalid_category", "message": "Invalid category filter."})
        conds.append(SupportTicket.category == clean_cat)

    if search and search.strip():
        pattern = f"%{search.strip()}%"
        conds.append(
            or_(
                SupportTicket.subject.ilike(pattern),
                SupportTicket.user_email.ilike(pattern),
                SupportTicket.user_name.ilike(pattern),
                SupportTicket.user_id.ilike(pattern),
            )
        )

    where_clause = and_(*conds) if conds else text("TRUE")
    total = int(db.scalar(select(func.count(SupportTicket.id)).where(where_clause)) or 0)
    total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1
    offset = (page - 1) * page_size

    rows = list(
        db.scalars(
            select(SupportTicket)
            .where(where_clause)
            .order_by(desc(SupportTicket.last_message_at), desc(SupportTicket.created_at))
            .limit(page_size)
            .offset(offset)
        ).all()
    )

    msg_counts: Dict[uuid.UUID, int] = {}
    if rows:
        ticket_ids = [r.id for r in rows]
        cnt_rows = db.execute(
            select(SupportTicketMessage.ticket_id, func.count(SupportTicketMessage.id))
            .where(SupportTicketMessage.ticket_id.in_(ticket_ids))
            .group_by(SupportTicketMessage.ticket_id)
        ).all()
        msg_counts = {tid: int(cnt) for tid, cnt in cnt_rows}

    summary_rows = db.execute(
        select(SupportTicket.status, func.count(SupportTicket.id)).group_by(SupportTicket.status)
    ).all()
    summary = {"open": 0, "in_progress": 0, "resolved": 0}
    for st, cnt in summary_rows:
        if st in summary:
            summary[st] = int(cnt)

    return {
        "items": [serialize_ticket_summary(r, msg_counts.get(r.id, 0)) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "summary": summary,
    }


def fetch_ticket_email_logs(db: Session, ticket_id: str) -> List[Dict[str, Any]]:
    rows = list(
        db.scalars(
            select(EmailLog)
            .where(EmailLog.payload["ticket_id"].astext == ticket_id)
            .order_by(desc(EmailLog.created_at))
            .limit(50)
        ).all()
    )
    return [
        {
            "id": str(r.id),
            "to_email": r.to_email,
            "type": r.type,
            "status": r.status,
            "error": r.error,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
