"""Admin CSV streaming exports and single-user JSON export routes (/api/admin/*)."""

import csv
import datetime
import io
import json
import logging
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.routes.admin_deps import AdminCaller, require_admin_caller
from app.api.routes.admin_payments import list_admin_payments
from app.core.limiter import enforce_rate_limit
from app.db.session import get_db
from app.models.admin import AdminAuditLog
from app.services import admin_subscribers as admin_sub_svc
from app.services import admin_users as admin_users_svc
from app.services import support as support_svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin-export"])

MAX_EXPORT_ROWS = 50000
_VALID_EXPORT_KINDS = ("users", "payments", "subscribers", "usage", "support-tickets")
_INJECTION_PREFIXES = ("=", "+", "-", "@")


def csv_safe_cell(val: Any) -> str:
    """Format a CSV cell and prefix formula triggers (=, +, -, @) with a single quote."""
    if val is None:
        return ""
    text_val = str(val)
    if text_val and text_val[0] in _INJECTION_PREFIXES:
        return "'" + text_val
    return text_val


def _enforce_export_rate_limit(admin: AdminCaller) -> None:
    enforce_rate_limit(
        key=f"admin_export:{admin.id}",
        max_requests=10,
        window_seconds=60,
        error_message="Too many exports requested. Please wait a minute before exporting again.",
    )


def _collect_pages(
    fetch_page: Callable[[int], Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], bool]:
    """Collect rows across server-side pages up to MAX_EXPORT_ROWS and detect truncation."""
    collected: List[Dict[str, Any]] = []
    page = 1
    while True:
        res = fetch_page(page)
        items = list(res.get("items") or [])
        total_pages = int(res.get("total_pages") or 1)
        for item in items:
            collected.append(item)
            if len(collected) > MAX_EXPORT_ROWS:
                return collected[:MAX_EXPORT_ROWS], True
        if page >= total_pages or not items:
            break
        page += 1
    return collected, False


def _iter_csv_utf8_bom(headers: List[str], rows: List[List[Any]]) -> Iterable[bytes]:
    """Yield UTF-8 BOM followed by RFC-4180 CSV rows with formula-injection protection."""
    yield b"\xef\xbb\xbf"
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    yield buf.getvalue().encode("utf-8")
    buf.seek(0)
    buf.truncate(0)

    for row in rows:
        writer.writerow([csv_safe_cell(cell) for cell in row])
        yield buf.getvalue().encode("utf-8")
        buf.seek(0)
        buf.truncate(0)


@router.get("/export/{kind}.csv")
def export_admin_csv(
    kind: str,
    search: Optional[str] = Query(None),
    plan: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    payment_state: Optional[str] = Query(None),
    method: Optional[str] = Query(None),
    interval: Optional[str] = Query(None),
    effective_status: Optional[str] = Query(None),
    view: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    sort: Optional[str] = Query(None),
    order: Optional[str] = Query(None),
    admin: AdminCaller = Depends(require_admin_caller),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    if kind not in _VALID_EXPORT_KINDS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Unknown export dataset."},
        )

    _enforce_export_rate_limit(admin)

    headers_row: List[str]
    data_rows: List[List[Any]]

    if kind == "users":
        items, truncated = _collect_pages(
            lambda p: admin_users_svc.list_admin_users(
                db=db,
                search=search,
                plan=plan,
                account_status=status_filter,
                payment_state=payment_state,
                sort_by=sort or "created_at",
                sort_dir=order or "desc",
                page=p,
                page_size=50,
            )
        )
        headers_row = [
            "User ID",
            "Name",
            "Email",
            "Account Status",
            "Plan",
            "Interval",
            "Payment State",
            "Posts Used",
            "Posts Limit",
            "Created At",
        ]
        data_rows = [
            [
                r.get("id"),
                r.get("name"),
                r.get("email"),
                r.get("account_status"),
                r.get("plan_name") or r.get("plan_id"),
                r.get("billing_interval"),
                r.get("payment_state"),
                r.get("posts_used"),
                r.get("posts_limit"),
                r.get("created_at"),
            ]
            for r in items
        ]

    elif kind == "payments":
        eff_status = status_filter or "all"
        items, truncated = _collect_pages(
            lambda p: list_admin_payments(
                status_filter=eff_status,
                search=search,
                method=method,
                plan=plan,
                page=p,
                page_size=100,
                admin=admin,
                db=db,
            )
        )
        headers_row = [
            "Payment ID",
            "User ID",
            "User Email",
            "Plan",
            "Interval",
            "Amount USD",
            "Amount PKR",
            "Method",
            "Transaction ID",
            "Source",
            "Status",
            "Submitted At",
            "Reviewed By",
            "Reviewed At",
            "Voided By",
            "Void Reason",
            "Note",
        ]
        data_rows = [
            [
                r.get("id"),
                r.get("user_id"),
                r.get("user_email"),
                r.get("plan_name") or r.get("plan_id"),
                r.get("billing_interval"),
                r.get("amount_usd"),
                r.get("amount_pkr"),
                r.get("method"),
                r.get("transaction_id"),
                r.get("source"),
                r.get("status"),
                r.get("submitted_at"),
                r.get("reviewed_by"),
                r.get("reviewed_at"),
                r.get("voided_by"),
                r.get("void_reason"),
                r.get("note"),
            ]
            for r in items
        ]

    elif kind == "subscribers":
        items, truncated = _collect_pages(
            lambda p: admin_sub_svc.list_admin_subscribers(
                db=db,
                search=search,
                plan=plan,
                interval=interval,
                effective_status=effective_status,
                sort_by=sort or "period_end",
                sort_dir=order or "asc",
                page=p,
                page_size=50,
            )
        )
        headers_row = [
            "User ID",
            "Name",
            "Email",
            "Account Status",
            "Plan",
            "Interval",
            "Effective Status",
            "MRR USD",
            "Period End",
            "Days Left",
            "Quota Used",
            "Quota Limit",
        ]
        data_rows = [
            [
                r.get("id"),
                r.get("name"),
                r.get("email"),
                r.get("account_status"),
                r.get("plan_name") or r.get("plan_id"),
                r.get("billing_interval"),
                r.get("effective_status"),
                r.get("monthly_rate_usd"),
                r.get("current_period_end"),
                r.get("days_left"),
                r.get("quota_used"),
                r.get("quota_limit"),
            ]
            for r in items
        ]

    elif kind == "usage":
        eff_view = view if view in ("paid", "trial") else "paid"
        items, truncated = _collect_pages(
            lambda p: admin_sub_svc.list_admin_usage(
                db=db,
                view=eff_view,
                search=search,
                page=p,
                page_size=50,
            )
        )
        headers_row = [
            "User ID",
            "Name",
            "Email",
            "Plan",
            "Effective Status",
            "Quota Used",
            "Quota Limit",
            "Published In Window",
            "Tokens In",
            "Tokens Out",
            "Window Cost USD",
            "Today Cost USD",
            "Daily Cap USD",
            "Over Cap",
        ]
        data_rows = [
            [
                r.get("id"),
                r.get("name"),
                r.get("email"),
                r.get("plan_name") or r.get("plan_id"),
                r.get("effective_status"),
                r.get("quota_used"),
                r.get("quota_limit"),
                r.get("published_count"),
                r.get("tokens_in"),
                r.get("tokens_out"),
                r.get("window_cost_usd"),
                r.get("today_cost_usd"),
                r.get("daily_cap_usd"),
                r.get("over_cap"),
            ]
            for r in items
        ]

    else:  # support-tickets
        items, truncated = _collect_pages(
            lambda p: support_svc.list_admin_tickets(
                db,
                status_filter=status_filter or "all",
                priority_filter=priority,
                category_filter=category,
                search=search,
                page=p,
                page_size=100,
            )
        )
        headers_row = [
            "Ticket ID",
            "User ID",
            "User Name",
            "User Email",
            "Subject",
            "Category",
            "Priority",
            "Status",
            "Messages",
            "Created At",
            "Last Message At",
            "Resolved At",
        ]
        data_rows = [
            [
                r.get("id"),
                r.get("user_id"),
                r.get("user_name"),
                r.get("user_email"),
                r.get("subject"),
                r.get("category"),
                r.get("priority"),
                r.get("status"),
                r.get("message_count"),
                r.get("created_at"),
                r.get("last_message_at"),
                r.get("resolved_at"),
            ]
            for r in items
        ]

    audit = AdminAuditLog(
        actor_id=admin.id,
        actor_email=admin.email,
        action=f"export.csv.{kind}",
        target_type="export",
        target_id=kind,
        reason=f"Exported {len(data_rows)} {kind} row(s) as CSV",
        after_state={"rows": len(data_rows), "truncated": truncated},
        email_status="not_sent",
    )
    db.add(audit)
    db.commit()

    today_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    resp_headers = {
        "Content-Disposition": f'attachment; filename="autopulse-{kind}-{today_str}.csv"',
        "X-Export-Truncated": "true" if truncated else "false",
        "X-Export-Row-Limit": str(MAX_EXPORT_ROWS),
        "Access-Control-Expose-Headers": "Content-Disposition, X-Export-Truncated, X-Export-Row-Limit",
        "Cache-Control": "no-store",
    }
    return StreamingResponse(
        _iter_csv_utf8_bom(headers_row, data_rows),
        media_type="text/csv; charset=utf-8",
        headers=resp_headers,
    )


@router.get("/users/{user_id}/export")
def export_single_user_json(
    user_id: str,
    admin: AdminCaller = Depends(require_admin_caller),
    db: Session = Depends(get_db),
) -> Response:
    _enforce_export_rate_limit(admin)
    detail = admin_users_svc.get_admin_user_detail(db=db, user_id=user_id)
    summary = detail.get("summary") or {}

    payload = {
        "exported_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "profile": summary,
        "plan": detail.get("billing"),
        "quota_usage": detail.get("quota"),
        "connections": detail.get("connections") or [],
        "payments": detail.get("payments") or [],
    }

    audit = AdminAuditLog(
        actor_id=admin.id,
        actor_email=admin.email,
        action="export.user_json",
        target_type="user",
        target_id=user_id,
        target_email=summary.get("email"),
        reason="Exported user profile, plan, usage, connections, and payments as JSON",
        email_status="not_sent",
    )
    db.add(audit)
    db.commit()

    safe_uid = "".join(c for c in user_id if c.isalnum() or c in ("-", "_"))[:64] or "user"
    return Response(
        content=json.dumps(payload, indent=2, default=str),
        media_type="application/json; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="autopulse-user-{safe_uid}.json"',
            "Access-Control-Expose-Headers": "Content-Disposition",
            "Cache-Control": "no-store",
        },
    )
