"""Transactional user notification service with outbox queue, retries, idempotency, and metrics."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
import datetime
from email.message import EmailMessage
import html
import logging
import os
import random
import re
import sys
import time
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.admin import EmailLog
from app.services.email import (
    EmailDeliveryError,
    apply_email_headers,
    get_pending_approval_token,
    pop_pending_approval_token,
    render_approval_email,
    render_reminder_email,
    render_skipped_notice_email,
    render_slack_disconnect_alert_email,
    render_spend_alert_email,
    render_subscription_reminder_email,
    send_email_message,
)

logger = logging.getLogger(__name__)

_EMAIL_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="autopulse-email")
_BACKOFF_SECONDS = (5, 30, 120)
_EMAIL_ADDR_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _is_test_env() -> bool:
    return bool(os.environ.get("PYTEST_CURRENT_TEST") or "pytest" in sys.modules)


def _compute_backoff_seconds(attempt_number: int) -> float:
    idx = max(0, min(attempt_number - 1, len(_BACKOFF_SECONDS) - 1))
    base = float(_BACKOFF_SECONDS[idx])
    jitter = random.uniform(0.0, min(30.0, base * 0.15))
    return base + jitter


def _wrap_html(subject: str, body_html: str) -> str:
    support = html.escape(settings.SUPPORT_EMAIL)
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{html.escape(subject)}</title>
</head>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#fafafa;color:#111827;">
  <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:28px;">
    <div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:16px;">AutoPulse</div>
    {body_html}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="margin:0;font-size:12px;color:#6b7280;">Need help? Contact us at <a href="mailto:{support}" style="color:#111827;">{support}</a>.</p>
  </div>
</body>
</html>"""


def render_notification_template(
    notification_type: str,
    payload: Dict[str, Any],
    idempotency_key: Optional[str] = None,
) -> Tuple[str, str, str]:
    """Render (subject, plain_text, html_body) for templates 1-7."""
    app_url = settings.APP_BASE_URL.rstrip("/")
    support = settings.SUPPORT_EMAIL
    name = str(payload.get("display_name") or "there")
    admin_msg = str(payload.get("admin_message") or "").strip()

    admin_note_plain = f"\n\nMessage from support:\n{admin_msg}" if admin_msg else ""
    admin_note_html = (
        f'<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin:16px 0;font-size:13px;color:#374151;">'
        f'<strong style="display:block;margin-bottom:4px;color:#111827;">Message from support:</strong>'
        f'{html.escape(admin_msg).replace(chr(10), "<br />")}</div>'
        if admin_msg
        else ""
    )

    if notification_type in ("suspended", "disabled"):
        verb = "suspended" if notification_type == "suspended" else "disabled"
        subject = f"Your AutoPulse account has been {verb}"
        plain = (
            f"Hi {name},\n\n"
            f"Your AutoPulse account has been {verb}.\n\n"
            f"- Sign-in to your account is blocked.\n"
            f"- Automated LinkedIn posting is stopped.\n"
            f"- Any pending approvals and unpublished scheduled posts were cancelled."
            f"{admin_note_plain}\n\n"
            f"If you have questions, please contact {support}.\n"
        )
        body = (
            f'<h2 style="margin:0 0 12px;font-size:18px;color:#111827;">Your AutoPulse account has been {verb}</h2>'
            f'<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">Hi {html.escape(name)},</p>'
            f'<ul style="margin:0 0 16px;padding-left:18px;font-size:14px;line-height:1.6;color:#374151;">'
            f'<li>Sign-in to your account is blocked.</li>'
            f'<li>Automated LinkedIn posting is stopped.</li>'
            f'<li>Pending approvals and unpublished scheduled posts were cancelled.</li>'
            f'</ul>'
            f'{admin_note_html}'
        )
        return subject, plain, _wrap_html(subject, body)

    if notification_type == "reactivated":
        sign_in_url = f"{app_url}/auth/sign-in"
        subject = "Your AutoPulse account is active again"
        plain = (
            f"Hi {name},\n\n"
            f"Your AutoPulse account is active again and you can sign in.\n\n"
            f"- Automated posting will resume on your next scheduled day.\n"
            f"- Your LinkedIn connection may need to be reconnected (LinkedIn tokens last 60 days).\n\n"
            f"Sign in: {sign_in_url}\n"
        )
        body = (
            f'<h2 style="margin:0 0 12px;font-size:18px;color:#111827;">Your AutoPulse account is active again</h2>'
            f'<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">Hi {html.escape(name)}, your access has been restored.</p>'
            f'<ul style="margin:0 0 18px;padding-left:18px;font-size:14px;line-height:1.6;color:#374151;">'
            f'<li>Auto posting resumes on your next scheduled day.</li>'
            f'<li>Your LinkedIn connection may need reconnecting (tokens last 60 days).</li>'
            f'</ul>'
            f'<a href="{sign_in_url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;">Sign in to AutoPulse</a>'
        )
        return subject, plain, _wrap_html(subject, body)

    if notification_type == "account_deleted":
        subject = "Your AutoPulse account has been deleted"
        plain = (
            f"Hi {name},\n\n"
            f"Your AutoPulse account has been permanently deleted.\n\n"
            f"The following data was removed:\n"
            f"- Profile and settings\n"
            f"- Posts, drafts, and generation runs\n"
            f"- LinkedIn and Slack connections\n"
            f"- Customization documents and uploads\n\n"
            f"This action cannot be undone."
            f"{admin_note_plain}\n\n"
            f"Questions? Contact {support}.\n"
        )
        body = (
            f'<h2 style="margin:0 0 12px;font-size:18px;color:#111827;">Your AutoPulse account has been deleted</h2>'
            f'<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">Hi {html.escape(name)}, your account and the following data were permanently removed:</p>'
            f'<ul style="margin:0 0 12px;padding-left:18px;font-size:14px;line-height:1.6;color:#374151;">'
            f'<li>Profile and schedule settings</li>'
            f'<li>Posts, drafts, and run history</li>'
            f'<li>LinkedIn and Slack connections</li>'
            f'<li>Customization documents and uploads</li>'
            f'</ul>'
            f'<p style="margin:0 0 12px;font-size:13px;color:#6b7280;">This action cannot be undone.</p>'
            f'{admin_note_html}'
        )
        return subject, plain, _wrap_html(subject, body)

    if notification_type == "plan_changed":
        old_plan = str(payload.get("old_plan") or "Trial")
        new_plan = str(payload.get("new_plan") or "Starter")
        limits_summary = str(payload.get("limits_summary") or "")
        subject = f"Your AutoPulse plan was changed to {new_plan}"
        plain = (
            f"Hi {name},\n\n"
            f"Your AutoPulse plan was changed from {old_plan} to {new_plan}.\n"
            + (f"New limits: {limits_summary}\n" if limits_summary else "")
            + f"{admin_note_plain}\n"
        )
        body = (
            f'<h2 style="margin:0 0 12px;font-size:18px;color:#111827;">Your plan was changed to {html.escape(new_plan)}</h2>'
            f'<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">Hi {html.escape(name)}, your AutoPulse plan has been updated.</p>'
            f'<p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Previous plan:</strong> {html.escape(old_plan)}<br />'
            f'<strong>New plan:</strong> {html.escape(new_plan)}</p>'
            + (f'<p style="margin:0 0 12px;font-size:13px;color:#4b5563;"><strong>New limits:</strong> {html.escape(limits_summary)}</p>' if limits_summary else "")
            + admin_note_html
        )
        return subject, plain, _wrap_html(subject, body)

    if notification_type == "payment_approved":
        amount = str(payload.get("amount") or "")
        plan_name = str(payload.get("plan_name") or "")
        interval = str(payload.get("billing_interval") or "monthly")
        paid_until = str(payload.get("paid_until") or "")
        tx_id = str(payload.get("transaction_id") or "")
        dash_url = f"{app_url}/app"
        subject = "Your AutoPulse payment was confirmed"
        plain = (
            f"Hi {name},\n\n"
            f"Your payment has been confirmed and your plan is active.\n\n"
            f"Amount: {amount}\n"
            f"Plan: {plan_name} ({interval})\n"
            f"Paid until (UTC): {paid_until}\n"
            f"Transaction ID: {tx_id}\n\n"
            f"Note: Plans do not renew automatically.\n\n"
            f"Open dashboard: {dash_url}\n"
        )
        body = (
            f'<h2 style="margin:0 0 12px;font-size:18px;color:#111827;">Your AutoPulse payment was confirmed</h2>'
            f'<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">Hi {html.escape(name)}, thank you! Your plan is now active.</p>'
            f'<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin:0 0 16px;font-size:13px;line-height:1.6;color:#374151;">'
            f'<strong>Amount:</strong> {html.escape(amount)}<br />'
            f'<strong>Plan:</strong> {html.escape(plan_name)} ({html.escape(interval)})<br />'
            f'<strong>Paid until (UTC):</strong> {html.escape(paid_until)}<br />'
            f'<strong>Transaction ID:</strong> {html.escape(tx_id)}</div>'
            f'<p style="margin:0 0 18px;font-size:13px;color:#6b7280;">Plans do not renew automatically. You can submit your next payment from Billing before this period ends.</p>'
            f'<a href="{dash_url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;">Open Dashboard</a>'
        )
        return subject, plain, _wrap_html(subject, body)

    if notification_type == "payment_rejected":
        amount = str(payload.get("amount") or "")
        tx_id = str(payload.get("transaction_id") or "")
        reason = str(payload.get("reason") or "Could not verify transaction details.")
        billing_url = f"{app_url}/app/billing"
        subject = "We could not confirm your AutoPulse payment"
        plain = (
            f"Hi {name},\n\n"
            f"We could not confirm your payment.\n\n"
            f"Amount: {amount}\n"
            f"Transaction ID: {tx_id}\n"
            f"Reason: {reason}\n\n"
            f"Your current plan did not change. You can try again from your Billing page:\n"
            f"{billing_url}\n"
        )
        body = (
            f'<h2 style="margin:0 0 12px;font-size:18px;color:#111827;">We could not confirm your AutoPulse payment</h2>'
            f'<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">Hi {html.escape(name)}, we were unable to verify your payment submission.</p>'
            f'<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin:0 0 16px;font-size:13px;line-height:1.6;color:#374151;">'
            f'<strong>Amount:</strong> {html.escape(amount)}<br />'
            f'<strong>Transaction ID:</strong> {html.escape(tx_id)}<br />'
            f'<strong>Reason:</strong> {html.escape(reason)}</div>'
            f'<p style="margin:0 0 18px;font-size:13px;color:#6b7280;">Your current plan did not change.</p>'
            f'<a href="{billing_url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;">Try Again in Billing</a>'
        )
        return subject, plain, _wrap_html(subject, body)

    if notification_type == "payment_voided":
        amount = str(payload.get("amount") or "")
        tx_id = str(payload.get("transaction_id") or "")
        plan_name = str(payload.get("plan_name") or "")
        reason = str(payload.get("reason") or "Payment voided by administrator.")
        access_note = str(payload.get("access_note") or "")
        user_msg = str(payload.get("user_message") or "").strip()
        billing_url = f"{app_url}/app/billing"
        user_msg_plain = f"\n\nMessage from support:\n{user_msg}" if user_msg else ""
        user_msg_html = (
            f'<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin:16px 0;font-size:13px;color:#374151;">'
            f'<strong style="display:block;margin-bottom:4px;color:#111827;">Message from support:</strong>'
            f'{html.escape(user_msg).replace(chr(10), "<br />")}</div>'
            if user_msg
            else ""
        )
        subject = "Your AutoPulse payment was voided"
        plain = (
            f"Hi {name},\n\n"
            f"A previously recorded AutoPulse payment was voided.\n\n"
            f"Plan: {plan_name}\n"
            f"Amount: {amount}\n"
            f"Transaction ID: {tx_id}\n"
            f"Reason: {reason}\n"
            + (f"{access_note}\n" if access_note else "")
            + f"{user_msg_plain}\n\n"
            f"View billing details: {billing_url}\n"
        )
        body = (
            f'<h2 style="margin:0 0 12px;font-size:18px;color:#111827;">Your AutoPulse payment was voided</h2>'
            f'<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">Hi {html.escape(name)}, a payment on your account has been voided.</p>'
            f'<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin:0 0 16px;font-size:13px;line-height:1.6;color:#374151;">'
            f'<strong>Plan:</strong> {html.escape(plan_name)}<br />'
            f'<strong>Amount:</strong> {html.escape(amount)}<br />'
            f'<strong>Transaction ID:</strong> {html.escape(tx_id)}<br />'
            f'<strong>Reason:</strong> {html.escape(reason)}</div>'
            + (f'<p style="margin:0 0 14px;font-size:13px;color:#374151;">{html.escape(access_note)}</p>' if access_note else "")
            + user_msg_html
            + f'<a href="{billing_url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;">View Billing</a>'
        )
        return subject, plain, _wrap_html(subject, body)

    if notification_type == "support_ticket_created_user":
        ticket_id = str(payload.get("ticket_id") or "")
        subject_txt = str(payload.get("subject") or "Support Request")
        category = str(payload.get("category") or "other").replace("_", " ")
        priority = str(payload.get("priority") or "medium")
        ticket_url = f"{app_url}/app/support/{ticket_id}"
        subject = f"We received your support ticket: {subject_txt}"
        plain = (
            f"Hi {name},\n\n"
            f"We received your support ticket and will reply as soon as possible.\n\n"
            f"Subject: {subject_txt}\n"
            f"Category: {category}\n"
            f"Priority: {priority}\n\n"
            f"View your ticket: {ticket_url}\n"
        )
        body = (
            f'<h2 style="margin:0 0 12px;font-size:18px;color:#111827;">We received your support ticket</h2>'
            f'<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">Hi {html.escape(name)}, our team has received your request.</p>'
            f'<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin:0 0 16px;font-size:13px;line-height:1.6;color:#374151;">'
            f'<strong>Subject:</strong> {html.escape(subject_txt)}<br />'
            f'<strong>Category:</strong> {html.escape(category)}<br />'
            f'<strong>Priority:</strong> {html.escape(priority)}</div>'
            f'<a href="{ticket_url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;">View Support Ticket</a>'
        )
        return subject, plain, _wrap_html(subject, body)

    if notification_type == "support_ticket_created_admin":
        ticket_id = str(payload.get("ticket_id") or "")
        subject_txt = str(payload.get("subject") or "Support Request")
        user_email = str(payload.get("user_email") or "unknown")
        category = str(payload.get("category") or "other").replace("_", " ")
        priority = str(payload.get("priority") or "medium")
        preview = str(payload.get("preview") or "")[:400]
        ticket_url = f"{app_url}/admin/support/{ticket_id}"
        subject = f"[AutoPulse Support] New {priority} ticket: {subject_txt}"
        plain = (
            f"New support ticket submitted.\n\n"
            f"From: {name} ({user_email})\n"
            f"Subject: {subject_txt}\n"
            f"Category: {category}\n"
            f"Priority: {priority}\n\n"
            f"{preview}\n\n"
            f"Open in admin: {ticket_url}\n"
        )
        body = (
            f'<h2 style="margin:0 0 12px;font-size:18px;color:#111827;">New support ticket submitted</h2>'
            f'<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin:0 0 16px;font-size:13px;line-height:1.6;color:#374151;">'
            f'<strong>User:</strong> {html.escape(name)} ({html.escape(user_email)})<br />'
            f'<strong>Subject:</strong> {html.escape(subject_txt)}<br />'
            f'<strong>Category:</strong> {html.escape(category)} · <strong>Priority:</strong> {html.escape(priority)}</div>'
            + (f'<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#374151;">{html.escape(preview).replace(chr(10), "<br />")}</p>' if preview else "")
            + f'<a href="{ticket_url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;">Open Ticket in Admin</a>'
        )
        return subject, plain, _wrap_html(subject, body)

    if notification_type == "support_reply_user":
        ticket_id = str(payload.get("ticket_id") or "")
        subject_txt = str(payload.get("subject") or "Support Request")
        reply_body = str(payload.get("reply_body") or "")
        ticket_url = f"{app_url}/app/support/{ticket_id}"
        subject = f"New reply on your AutoPulse ticket: {subject_txt}"
        plain = (
            f"Hi {name},\n\n"
            f"Support replied to your ticket \"{subject_txt}\":\n\n"
            f"{reply_body}\n\n"
            f"Reply in AutoPulse: {ticket_url}\n"
        )
        body = (
            f'<h2 style="margin:0 0 12px;font-size:18px;color:#111827;">New reply on your support ticket</h2>'
            f'<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">Hi {html.escape(name)}, our team replied to <strong>{html.escape(subject_txt)}</strong>:</p>'
            f'<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin:0 0 16px;font-size:13px;line-height:1.6;color:#374151;">'
            f'{html.escape(reply_body).replace(chr(10), "<br />")}</div>'
            f'<a href="{ticket_url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;">View &amp; Reply</a>'
        )
        return subject, plain, _wrap_html(subject, body)

    if notification_type == "support_reply_admin":
        ticket_id = str(payload.get("ticket_id") or "")
        subject_txt = str(payload.get("subject") or "Support Request")
        user_email = str(payload.get("user_email") or "unknown")
        reply_body = str(payload.get("reply_body") or "")
        ticket_url = f"{app_url}/admin/support/{ticket_id}"
        subject = f"[AutoPulse Support] User reply on: {subject_txt}"
        plain = (
            f"{name} ({user_email}) replied on ticket \"{subject_txt}\":\n\n"
            f"{reply_body}\n\n"
            f"Open in admin: {ticket_url}\n"
        )
        body = (
            f'<h2 style="margin:0 0 12px;font-size:18px;color:#111827;">User replied on support ticket</h2>'
            f'<p style="margin:0 0 12px;font-size:13px;color:#374151;"><strong>From:</strong> {html.escape(name)} ({html.escape(user_email)})<br /><strong>Ticket:</strong> {html.escape(subject_txt)}</p>'
            f'<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin:0 0 16px;font-size:13px;line-height:1.6;color:#374151;">'
            f'{html.escape(reply_body).replace(chr(10), "<br />")}</div>'
            f'<a href="{ticket_url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;">Open Ticket in Admin</a>'
        )
        return subject, plain, _wrap_html(subject, body)

    if notification_type == "support_status_changed_user":
        ticket_id = str(payload.get("ticket_id") or "")
        subject_txt = str(payload.get("subject") or "Support Request")
        new_status = str(payload.get("status") or "open").replace("_", " ")
        ticket_url = f"{app_url}/app/support/{ticket_id}"
        subject = f"Your AutoPulse ticket is now {new_status}: {subject_txt}"
        plain = (
            f"Hi {name},\n\n"
            f"The status of your support ticket \"{subject_txt}\" changed to: {new_status}.\n\n"
            f"View your ticket: {ticket_url}\n"
        )
        body = (
            f'<h2 style="margin:0 0 12px;font-size:18px;color:#111827;">Support ticket status updated</h2>'
            f'<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">Hi {html.escape(name)}, your ticket <strong>{html.escape(subject_txt)}</strong> is now <strong>{html.escape(new_status)}</strong>.</p>'
            f'<a href="{ticket_url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;">View Support Ticket</a>'
        )
        return subject, plain, _wrap_html(subject, body)

    if notification_type == "approval_request":
        raw_token = get_pending_approval_token(idempotency_key)
        if not raw_token:
            raise EmailDeliveryError(
                "Approval token is no longer in memory for this queued approval email",
                retryable=False,
                provider="internal",
            )
        return render_approval_email(
            display_name=str(payload.get("display_name") or "there"),
            weekday=str(payload.get("weekday") or ""),
            time_str=str(payload.get("time_str") or ""),
            local_deadline=str(payload.get("local_deadline") or ""),
            topic_title=str(payload.get("topic_title") or ""),
            caption=str(payload.get("caption") or ""),
            raw_token=raw_token,
            needs_review=bool(payload.get("needs_review", False)),
            first_comment=payload.get("first_comment"),
            publish_notice=payload.get("publish_notice"),
            has_image=bool(payload.get("has_image", True)),
        )

    if notification_type == "slack_disconnect":
        return render_slack_disconnect_alert_email(
            display_name=str(payload.get("display_name") or "there"),
            error_reason=str(payload.get("error_reason") or "unknown"),
        )

    if notification_type == "approval_reminder":
        return render_reminder_email(
            display_name=str(payload.get("display_name") or "there"),
            publish_date_str=str(payload.get("publish_date_str") or ""),
            publish_time_str=str(payload.get("publish_time_str") or ""),
            tz_label=str(payload.get("tz_label") or ""),
            topic_title=str(payload.get("topic_title") or ""),
            post_id=str(payload.get("post_id") or ""),
        )

    if notification_type == "post_skipped":
        return render_skipped_notice_email(
            display_name=str(payload.get("display_name") or "there"),
            publish_time_str=str(payload.get("publish_time_str") or ""),
            post_id=str(payload.get("post_id") or ""),
        )

    if notification_type == "spend_alert":
        return render_spend_alert_email(
            user_email=str(payload.get("user_email") or ""),
            plan_id=str(payload.get("plan_id") or ""),
            spend_usd=float(payload.get("spend_usd") or 0.0),
            limit_usd=float(payload.get("limit_usd") or 0.0),
        )

    if notification_type == "subscription_reminder":
        return render_subscription_reminder_email(
            display_name=str(payload.get("display_name") or "there"),
            reminder_type=str(payload.get("reminder_type") or "renewal_5d"),
            plan_name=str(payload.get("plan_name") or ""),
            target_date_str=str(payload.get("target_date_str") or ""),
        )

    raise ValueError(f"Unsupported notification type: {notification_type}")


def _build_email_message(
    to_email: str,
    notification_type: str,
    payload: Dict[str, Any],
    idempotency_key: Optional[str] = None,
) -> Tuple[str, EmailMessage]:
    subject, plain_text, html_content = render_notification_template(
        notification_type,
        payload,
        idempotency_key=idempotency_key,
    )
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["To"] = to_email
    apply_email_headers(msg, idempotency_key=idempotency_key)
    msg.set_content(plain_text)
    msg.add_alternative(html_content, subtype="html")
    return subject, msg


def _trigger_outbox_drain() -> None:
    """Fire-and-forget outbox drain on the background thread pool."""
    if _is_test_env():
        return
    try:
        _EMAIL_EXECUTOR.submit(_drain_outbox_in_background)
    except Exception as exc:
        logger.warning(f"Failed to submit background email drain: {exc}")


def _drain_outbox_in_background() -> None:
    try:
        with SessionLocal() as db:
            process_email_outbox(db, max_batch=25)
    except Exception as exc:
        logger.error(f"Background email outbox drain failed: {exc}", exc_info=True)


def reap_stuck_email_logs(db: Session, stuck_minutes: int = 5) -> int:
    """Move rows stuck in 'sending' for longer than stuck_minutes back to 'queued'."""
    res = db.execute(
        text(
            """
            UPDATE email_logs
            SET status = 'queued',
                locked_at = NULL,
                next_attempt_at = now(),
                updated_at = now(),
                error = COALESCE(error, 'Recovered from stuck sending state (>5m)')
            WHERE status = 'sending'
              AND locked_at IS NOT NULL
              AND locked_at < now() - make_interval(mins => :mins)
            """
        ),
        {"mins": stuck_minutes},
    )
    reaped = int(res.rowcount or 0)
    if reaped:
        db.commit()
        logger.warning(f"Recovered {reaped} stuck email_logs row(s) from 'sending' back to 'queued'")
    return reaped


def claim_next_email_log(db: Session) -> Optional[EmailLog]:
    """Atomically claim one due 'queued' email_logs row into 'sending'."""
    row = db.execute(
        text(
            """
            UPDATE email_logs
            SET status = 'sending',
                locked_at = now(),
                updated_at = now()
            WHERE id = (
                SELECT id
                FROM email_logs
                WHERE status = 'queued'
                  AND (next_attempt_at IS NULL OR next_attempt_at <= now())
                ORDER BY created_at ASC
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            RETURNING id
            """
        )
    ).fetchone()
    if not row:
        return None
    db.commit()
    return db.scalars(select(EmailLog).where(EmailLog.id == row.id)).first()


def deliver_email_log(db: Session, log_row: EmailLog) -> EmailLog:
    """Deliver one claimed EmailLog row, recording timing, retries, and real errors."""
    attempt_num = int(log_row.attempts or 0) + 1
    max_attempts = int(log_row.max_attempts or 4)
    now_utc = datetime.datetime.now(datetime.timezone.utc)

    to_clean = (log_row.to_email or "").strip()
    if not _EMAIL_ADDR_RE.match(to_clean):
        log_row.attempts = attempt_num
        log_row.status = "failed"
        log_row.error = f"Invalid recipient email address: {to_clean!r}"
        log_row.locked_at = None
        log_row.next_attempt_at = None
        log_row.updated_at = now_utc
        db.commit()
        db.refresh(log_row)
        logger.warning(f"Email permanently failed (invalid address) id={log_row.id} to={to_clean!r}")
        return log_row

    try:
        subject, msg = _build_email_message(
            to_email=to_clean,
            notification_type=log_row.type,
            payload=log_row.payload or {},
            idempotency_key=log_row.idempotency_key,
        )
        if not log_row.subject:
            log_row.subject = subject

        t0 = time.perf_counter()
        provider_msg_id, provider_name, provider_ms = send_email_message(
            msg,
            attempt_number=attempt_num,
            idempotency_key=log_row.idempotency_key,
        )
        if provider_ms <= 0:
            provider_ms = int((time.perf_counter() - t0) * 1000)

        sent_at = datetime.datetime.now(datetime.timezone.utc)
        created_at = log_row.created_at or sent_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=datetime.timezone.utc)
        total_ms = max(0, int((sent_at - created_at).total_seconds() * 1000))

        log_row.attempts = attempt_num
        log_row.status = "sent"
        log_row.sent_at = sent_at
        log_row.locked_at = None
        log_row.next_attempt_at = None
        log_row.error = None
        log_row.provider = provider_name
        log_row.provider_response_ms = provider_ms
        log_row.total_duration_ms = total_ms
        log_row.provider_message_id = provider_msg_id
        log_row.updated_at = sent_at
        db.commit()
        db.refresh(log_row)
        logger.info(
            f"Email delivered id={log_row.id} type={log_row.type} to={to_clean} "
            f"provider={provider_name} provider_ms={provider_ms} total_ms={total_ms} attempts={attempt_num}"
        )
    except Exception as exc:
        err_text = str(exc).strip()[:1000] or type(exc).__name__
        unknown_outcome = isinstance(exc, EmailDeliveryError) and exc.unknown_outcome
        retryable = exc.retryable if isinstance(exc, EmailDeliveryError) else True
        provider_name = exc.provider if isinstance(exc, EmailDeliveryError) else "smtp"

        log_row.attempts = attempt_num
        log_row.provider = provider_name
        log_row.locked_at = None
        log_row.error = err_text
        log_row.updated_at = now_utc

        if unknown_outcome:
            log_row.status = "unknown"
            log_row.next_attempt_at = None
            logger.error(
                f"Email outcome unknown id={log_row.id} type={log_row.type} to={to_clean} "
                f"provider={provider_name} attempts={attempt_num}: {err_text}"
            )
        elif retryable and attempt_num < max_attempts:
            delay = _compute_backoff_seconds(attempt_num)
            log_row.status = "queued"
            log_row.next_attempt_at = now_utc + datetime.timedelta(seconds=delay)
            logger.warning(
                f"Email delivery failed (will retry in {delay:.1f}s) id={log_row.id} "
                f"type={log_row.type} to={to_clean} provider={provider_name} "
                f"attempt={attempt_num}/{max_attempts}: {err_text}"
            )
        else:
            log_row.status = "failed"
            log_row.next_attempt_at = None
            logger.error(
                f"Email delivery permanently failed id={log_row.id} type={log_row.type} to={to_clean} "
                f"provider={provider_name} attempt={attempt_num}/{max_attempts}: {err_text}"
            )

        db.commit()
        db.refresh(log_row)

    try:
        from app.services.admin_overview import invalidate_admin_overview_cache
        invalidate_admin_overview_cache()
    except Exception:
        pass

    return log_row


def process_email_outbox(db: Session, max_batch: int = 25) -> Dict[str, int]:
    """Recover stuck rows and process up to max_batch due queued emails."""
    reaped = reap_stuck_email_logs(db)
    counts = {"reaped": reaped, "processed": 0, "sent": 0, "requeued": 0, "failed": 0, "unknown": 0}
    for _ in range(max_batch):
        row = claim_next_email_log(db)
        if row is None:
            break
        result = deliver_email_log(db, row)
        counts["processed"] += 1
        if result.status == "sent":
            counts["sent"] += 1
        elif result.status == "queued":
            counts["requeued"] += 1
        elif result.status == "failed":
            counts["failed"] += 1
        elif result.status == "unknown":
            counts["unknown"] += 1
    return counts


def send_user_notification(
    user_id: Optional[str],
    to_email: str,
    notification_type: str,
    payload: Dict[str, Any],
    idempotency_key: Optional[str] = None,
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    """Queue a transactional email in email_logs (outbox) and trigger non-blocking delivery."""
    own_db = False
    if db is None:
        db = SessionLocal()
        own_db = True

    try:
        if idempotency_key:
            existing = db.scalars(
                select(EmailLog).where(EmailLog.idempotency_key == idempotency_key)
            ).first()
            if existing:
                if existing.status == "sent":
                    return {
                        "id": str(existing.id),
                        "status": "skipped",
                        "provider_message_id": existing.provider_message_id,
                        "error": None,
                    }
                if existing.status in ("queued", "sending"):
                    return {
                        "id": str(existing.id),
                        "status": existing.status,
                        "provider_message_id": existing.provider_message_id,
                        "error": existing.error,
                    }

        subject, _, _ = render_notification_template(
        notification_type,
        payload,
        idempotency_key=idempotency_key,
    )

        log_row = EmailLog(
            user_id=user_id,
            to_email=to_email,
            type=notification_type,
            subject=subject,
            status="queued",
            error=None,
            attempts=0,
            max_attempts=4,
            next_attempt_at=datetime.datetime.now(datetime.timezone.utc),
            idempotency_key=idempotency_key,
            payload=payload,
        )
        db.add(log_row)
        db.commit()
        db.refresh(log_row)

        _trigger_outbox_drain()

        return {
            "id": str(log_row.id),
            "status": "queued",
            "provider_message_id": None,
            "error": None,
        }
    finally:
        if own_db:
            db.close()


async def send_user_notification_async(
    user_id: Optional[str],
    to_email: str,
    notification_type: str,
    payload: Dict[str, Any],
    idempotency_key: Optional[str] = None,
    timeout_seconds: float = 5.0,
) -> Dict[str, Any]:
    """Non-blocking wrapper around send_user_notification (queues in DB and returns immediately)."""
    loop = asyncio.get_running_loop()
    return await asyncio.wait_for(
        loop.run_in_executor(
            _EMAIL_EXECUTOR,
            lambda: send_user_notification(
                user_id=user_id,
                to_email=to_email,
                notification_type=notification_type,
                payload=payload,
                idempotency_key=idempotency_key,
            ),
        ),
        timeout=timeout_seconds,
    )
