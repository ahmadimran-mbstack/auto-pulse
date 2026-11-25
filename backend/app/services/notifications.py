"""Transactional user notification service with idempotency and email_logs auditing."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from email.message import EmailMessage
import html
import logging
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.admin import EmailLog
from app.services.email import send_smtp_message

logger = logging.getLogger(__name__)

_EMAIL_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="autopulse-email")


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

    raise ValueError(f"Unsupported notification type: {notification_type}")


def send_user_notification(
    user_id: Optional[str],
    to_email: str,
    notification_type: str,
    payload: Dict[str, Any],
    idempotency_key: Optional[str] = None,
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    """Send a transactional email through SMTP and always log the outcome in email_logs."""
    own_db = False
    if db is None:
        db = SessionLocal()
        own_db = True

    try:
        if idempotency_key:
            existing = db.scalars(
                select(EmailLog).where(EmailLog.idempotency_key == idempotency_key)
            ).first()
            if existing and existing.status == "sent":
                return {
                    "id": str(existing.id),
                    "status": "skipped",
                    "provider_message_id": existing.provider_message_id,
                    "error": None,
                }

        subject, plain_text, html_content = render_notification_template(notification_type, payload)

        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings.EMAIL_FROM
        msg["To"] = to_email
        if idempotency_key:
            msg["Idempotency-Key"] = idempotency_key
        msg.set_content(plain_text)
        msg.add_alternative(html_content, subtype="html")

        status_val = "failed"
        provider_message_id: Optional[str] = None
        error_text: Optional[str] = None

        try:
            provider_message_id = send_smtp_message(msg)
            status_val = "sent"
        except Exception as exc:
            error_text = str(exc)[:500]
            logger.warning(f"Failed to send {notification_type} email to {to_email}: {error_text}")

        log_row = EmailLog(
            user_id=user_id,
            to_email=to_email,
            type=notification_type,
            status=status_val,
            error=error_text,
            attempts=1,
            provider_message_id=provider_message_id,
            idempotency_key=idempotency_key,
            payload=payload,
        )
        db.add(log_row)
        db.commit()
        db.refresh(log_row)

        return {
            "id": str(log_row.id),
            "status": status_val,
            "provider_message_id": provider_message_id,
            "error": error_text,
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
    timeout_seconds: float = 25.0,
) -> Dict[str, Any]:
    """Non-blocking wrapper around send_user_notification with a timeout."""
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
