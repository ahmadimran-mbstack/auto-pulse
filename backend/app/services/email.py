import html
import logging
import smtplib
from email.message import EmailMessage
from typing import Optional
from app.core.config import settings

logger = logging.getLogger(__name__)


import json
from pathlib import Path
import subprocess

# Low-level helper to dispatch an email via nodemailer SMTP with smtplib fallback
def send_smtp_message(msg: EmailMessage) -> None:
    host = settings.SMTP_HOST
    port = settings.SMTP_PORT
    user = settings.SMTP_USER
    password = settings.SMTP_PASSWORD
    use_tls = settings.SMTP_USE_TLS

    if not host:
        logger.warning("SMTP_HOST is not set; skipping email dispatch")
        return

    # First attempt dispatch via nodemailer SMTP helper script
    script_path = Path(__file__).resolve().parent.parent.parent / "scripts" / "send_mail.js"
    if script_path.exists():
        try:
            body_text = ""
            body_html = ""
            if msg.is_multipart():
                for part in msg.walk():
                    content_type = part.get_content_type()
                    payload = part.get_payload(decode=True)
                    if payload:
                        decoded = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
                        if content_type == "text/plain":
                            body_text = decoded
                        elif content_type == "text/html":
                            body_html = decoded
            else:
                body_text = msg.get_content()

            headers = {}
            for h in ("Resend-Idempotency-Key", "Idempotency-Key"):
                if h in msg:
                    headers[h] = msg[h]

            payload_data = {
                "from": msg["From"],
                "to": msg["To"],
                "subject": msg["Subject"],
                "text": body_text,
                "html": body_html,
                "headers": headers,
                "smtp": {
                    "host": host,
                    "port": port,
                    "user": user,
                    "pass": password,
                    "use_tls": use_tls,
                },
            }

            result = subprocess.run(
                ["node", str(script_path)],
                input=json.dumps(payload_data),
                text=True,
                capture_output=True,
                check=False,
                timeout=20,
            )
            if result.returncode == 0:
                logger.info("Email dispatched successfully via nodemailer SMTP")
                return
            else:
                logger.warning(f"nodemailer SMTP helper exited with code {result.returncode}, falling back to smtplib")
        except Exception as exc:
            logger.warning(f"nodemailer SMTP helper error ({exc}), falling back to smtplib")

    # Standard smtplib fallback
    server = None
    try:
        # Connect with standard SMTP and upgrade via STARTTLS if supported
        server = smtplib.SMTP(host, port, timeout=15)
        server.ehlo()
        if use_tls and server.has_extn("STARTTLS"):
            server.starttls()
            server.ehlo()
    except Exception as exc:
        logger.debug(f"Standard SMTP/STARTTLS failed, attempting direct SSL: {exc}")
        if server:
            try:
                server.close()
            except Exception:
                pass
        # Fallback to direct SSL for servers requiring immediate TLS handshake
        server = smtplib.SMTP_SSL(host, port, timeout=15)
        server.ehlo()

    try:
        if user and password:
            server.login(user, password)
        server.send_message(msg)
    finally:
        try:
            server.quit()
        except Exception:
            pass


# Build and send the approval notification email
def send_approval_email(
    to_email: str,
    display_name: str,
    weekday: str,
    time_str: str,
    local_deadline: str,
    topic_title: str,
    caption: str,
    raw_token: str,
    idempotency_key: Optional[str] = None,
    needs_review: bool = False,
    first_comment: Optional[str] = None,
    publish_notice: Optional[str] = None,
    has_image: bool = True,
) -> None:
    # Subject line matching specification
    subject = f"Approve your LinkedIn post for {weekday} {time_str}"

    # Public image and decision link targets
    approve_url = f"{settings.APP_BASE_URL.rstrip('/')}/approve/{raw_token}"
    image_url = f"{settings.APP_BASE_URL.rstrip('/')}/public/approvals/{raw_token}/image.png"

    review_notice_plain = (
        "\n\n⚠️ Needs Review: AI-slop score did not meet target threshold (< 15) or checks flagged warnings."
        if needs_review
        else ""
    )
    review_notice_html = (
        """<div style="background-color: #7f1d1d; border: 1px solid #ef4444; border-radius: 6px; padding: 12px; margin-bottom: 20px; color: #fecaca; font-weight: 600; font-size: 14px;">⚠️ Needs Review: AI-slop score did not meet target threshold (&lt; 15) or checks flagged warnings.</div>"""
        if needs_review
        else ""
    )

    first_comment_plain = (
        f"\n\nSuggested First Comment (paste after publishing):\n{first_comment.strip()}"
        if first_comment and first_comment.strip()
        else ""
    )
    first_comment_html = (
        f"""<div style="background-color: #0f172a; border: 1px dashed #334155; border-radius: 8px; padding: 12px; margin-bottom: 20px;"><div style="font-weight: 600; color: #94a3b8; font-size: 12px; margin-bottom: 6px;">Suggested First Comment (paste after publishing):</div><div style="color: #e2e8f0; font-size: 13px; line-height: 1.5;">{html.escape(first_comment.strip()).replace(chr(10), '<br />')}</div></div>"""
        if first_comment and first_comment.strip()
        else ""
    )

    notice_line = publish_notice or f"This post will publish before {local_deadline} if you approve. If you do not approve before then, it will be skipped and not published."

    # Plain text version (contains exactly one link: the decision link)
    plain_text = (
        f"Hi {display_name},\n\n"
        f"{notice_line}{review_notice_plain}\n\n"
        f"Topic: {topic_title}\n\n"
        f"Caption:\n{caption}{first_comment_plain}\n\n"
        f"Review and decide:\n{approve_url}\n\n"
        f"---\n"
        f"You received this email because you enabled automated LinkedIn posting on AutoPulse."
    )

    # HTML-escaped text preserving paragraphs and line breaks
    escaped_display_name = html.escape(display_name)
    escaped_topic = html.escape(topic_title)
    escaped_caption = html.escape(caption).replace("\n", "<br />")
    escaped_deadline = html.escape(local_deadline)
    escaped_notice = html.escape(notice_line)

    image_block_html = (
        f"""\n    <div style="margin-bottom: 24px; text-align: center;">\n      <img src="{image_url}" alt="Post graphic preview" style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #334155;" />\n    </div>\n"""
        if has_image
        else ""
    )

    # HTML version contains exactly ONE <a ...> link (the review button) and optional <img> tag
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{html.escape(subject)}</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 32px;">
    <h2 style="margin-top: 0; color: #f8fafc; font-size: 20px;">Hi {escaped_display_name},</h2>
    <p style="color: #cbd5e1; font-size: 14px; font-weight: 500; margin-bottom: 20px;">{escaped_notice}</p>
    {review_notice_html}
    <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <div style="font-weight: 600; color: #38bdf8; font-size: 14px; margin-bottom: 8px;">Topic: {escaped_topic}</div>
      <div style="color: #e2e8f0; font-size: 14px; line-height: 1.6;">{escaped_caption}</div>
    </div>
    {first_comment_html}{image_block_html}

    <p style="color: #cbd5e1; font-size: 14px; font-weight: 500;">Decide before {escaped_deadline}. After that this draft is skipped.</p>

    <div style="margin-top: 28px; margin-bottom: 28px; text-align: center;">
      <a href="{approve_url}" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 14px 28px; font-size: 15px; font-weight: 600; border-radius: 8px;">Review and decide</a>
    </div>

    <hr style="border: none; border-top: 1px solid #1f2937; margin: 24px 0;" />
    <p style="color: #64748b; font-size: 12px; margin: 0;">You received this email because you have automated LinkedIn post approvals enabled for your AutoPulse account.</p>
  </div>
</body>
</html>"""

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to_email
    if idempotency_key:
        msg["Resend-Idempotency-Key"] = idempotency_key
        msg["Idempotency-Key"] = idempotency_key

    msg.set_content(plain_text)
    msg.add_alternative(html_content, subtype="html")

    # Send message using SMTP
    send_smtp_message(msg)


# Alert user when Slack authentication is revoked or invalid
def send_slack_disconnect_alert_email(
    to_email: str,
    display_name: str,
    error_reason: str,
) -> None:
    subject = "Action required: Your AutoPulse Slack integration was disconnected"
    plain_text = (
        f"Hi {display_name},\n\n"
        f"Your Slack integration for AutoPulse was disconnected because Slack reported an authentication error ({error_reason}).\n\n"
        f"Your post approval requests will continue to arrive by email as usual.\n\n"
        f"To restore Slack approvals, please reconnect your Slack workspace from your AutoPulse dashboard:\n"
        f"{settings.APP_BASE_URL.rstrip('/')}/dashboard\n\n"
        f"---\nAutoPulse Support"
    )
    html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>{html.escape(subject)}</title></head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 32px;">
    <h2 style="margin-top: 0; color: #f8fafc; font-size: 20px;">Hi {html.escape(display_name)},</h2>
    <p style="color: #f87171; font-size: 15px; font-weight: 600;">Your Slack integration was disconnected</p>
    <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">Slack reported an authentication error (<code>{html.escape(error_reason)}</code>). Your approval notifications will continue to arrive by email so you never miss a post.</p>
    <div style="margin: 28px 0; text-align: center;">
      <a href="{settings.APP_BASE_URL.rstrip('/')}/dashboard" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 24px; font-size: 14px; font-weight: 600; border-radius: 8px;">Reconnect Slack in Dashboard</a>
    </div>
  </div>
</body>
</html>"""
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to_email
    msg.set_content(plain_text)
    msg.add_alternative(html_content, subtype="html")
    send_smtp_message(msg)


def send_reminder_email(
    to_email: str,
    display_name: str,
    publish_date_str: str,
    publish_time_str: str,
    tz_label: str,
    topic_title: str,
    post_id: str,
) -> None:
    subject = f"Reminder: approve your {publish_time_str} LinkedIn post (publishes in 30m)"
    review_url = f"{settings.APP_BASE_URL.rstrip('/')}/app/posts/{post_id}"
    plain_text = (
        f"Hi {display_name},\n\n"
        f"Reminder: this post will publish on {publish_date_str} at {publish_time_str} {tz_label} if you approve. "
        f"If you do not approve before then, it will be skipped and not published.\n\n"
        f"Topic: {topic_title}\n\n"
        f"Open dashboard to review:\n{review_url}\n"
    )
    html_content = f"""<!DOCTYPE html>
<html><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0b0f19;color:#f8fafc;">
  <div style="max-width:560px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:12px;padding:28px;">
    <h2 style="margin-top:0;font-size:18px;color:#f8fafc;">Reminder: 30 minutes left to approve</h2>
    <p style="color:#cbd5e1;font-size:14px;">This post will publish on <strong>{html.escape(publish_date_str)}</strong> at <strong>{html.escape(publish_time_str)} {html.escape(tz_label)}</strong> if you approve. If you do not approve before then, it will be skipped and not published.</p>
    <p style="color:#94a3b8;font-size:13px;">Topic: {html.escape(topic_title)}</p>
    <div style="margin-top:20px;"><a href="{review_url}" style="display:inline-block;background:#0284c7;color:#fff;text-decoration:none;padding:12px 22px;font-size:14px;font-weight:600;border-radius:8px;">Review and decide</a></div>
  </div>
</body></html>"""
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to_email
    msg.set_content(plain_text)
    msg.add_alternative(html_content, subtype="html")
    send_smtp_message(msg)


def send_skipped_notice_email(
    to_email: str,
    display_name: str,
    publish_time_str: str,
    post_id: str,
) -> None:
    subject = f"Skipped: your {publish_time_str} LinkedIn post was not approved"
    dashboard_url = f"{settings.APP_BASE_URL.rstrip('/')}/app/posts/{post_id}"
    plain_text = (
        f"Hi {display_name},\n\n"
        f"Your {publish_time_str} post was not published because it was not approved. "
        f"Open the dashboard to review:\n{dashboard_url}\n"
    )
    html_content = f"""<!DOCTYPE html>
<html><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0b0f19;color:#f8fafc;">
  <div style="max-width:560px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:12px;padding:28px;">
    <h2 style="margin-top:0;font-size:18px;color:#f8fafc;">Post skipped (not approved)</h2>
    <p style="color:#cbd5e1;font-size:14px;">Your {html.escape(publish_time_str)} post was not published because it was not approved. Open the dashboard to review.</p>
    <div style="margin-top:20px;"><a href="{dashboard_url}" style="display:inline-block;background:#0284c7;color:#fff;text-decoration:none;padding:12px 22px;font-size:14px;font-weight:600;border-radius:8px;">Open dashboard</a></div>
  </div>
</body></html>"""
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to_email
    msg.set_content(plain_text)
    msg.add_alternative(html_content, subtype="html")
    send_smtp_message(msg)

