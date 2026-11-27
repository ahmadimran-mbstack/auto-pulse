import html
import logging
import smtplib
import socket
import threading
import time
from email.message import EmailMessage
from email.utils import make_msgid
from typing import Optional, Tuple

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

EMAIL_CONNECT_TIMEOUT_SECONDS = 20.0
EMAIL_READ_TIMEOUT_SECONDS = 20.0

_http_client_lock = threading.Lock()
_http_client: Optional[httpx.Client] = None

# Short-lived in-memory store for raw approval tokens so they are NEVER persisted in email_logs
_PENDING_APPROVAL_TOKENS_LOCK = threading.Lock()
_PENDING_APPROVAL_TOKENS: dict[str, str] = {}


def store_pending_approval_token(key: str, raw_token: str) -> None:
    if not key or not raw_token:
        return
    with _PENDING_APPROVAL_TOKENS_LOCK:
        _PENDING_APPROVAL_TOKENS[key] = raw_token


def get_pending_approval_token(key: Optional[str]) -> Optional[str]:
    if not key:
        return None
    with _PENDING_APPROVAL_TOKENS_LOCK:
        return _PENDING_APPROVAL_TOKENS.get(key)


def pop_pending_approval_token(key: Optional[str]) -> Optional[str]:
    if not key:
        return None
    with _PENDING_APPROVAL_TOKENS_LOCK:
        return _PENDING_APPROVAL_TOKENS.pop(key, None)


def format_from_address() -> str:
    raw = (settings.EMAIL_FROM or "").strip()
    if not raw:
        return "AutoPulse <noreply@mbstack.net>"
    if "<" in raw and ">" in raw:
        return raw
    return f"AutoPulse <{raw}>"


def apply_email_headers(msg: EmailMessage, idempotency_key: Optional[str] = None) -> None:
    if "From" not in msg or not str(msg["From"]).strip():
        msg["From"] = format_from_address()
    else:
        cur = str(msg["From"]).strip()
        if "<" not in cur:
            del msg["From"]
            msg["From"] = f"AutoPulse <{cur}>"
    support = (settings.SUPPORT_EMAIL or "").strip()
    if support and "Reply-To" not in msg:
        msg["Reply-To"] = support
    if idempotency_key:
        if "Resend-Idempotency-Key" not in msg:
            msg["Resend-Idempotency-Key"] = idempotency_key
        if "Idempotency-Key" not in msg:
            msg["Idempotency-Key"] = idempotency_key


class EmailDeliveryError(RuntimeError):
    """Structured email delivery error for retry and status classification."""

    def __init__(
        self,
        message: str,
        *,
        retryable: bool = True,
        unknown_outcome: bool = False,
        status_code: Optional[int] = None,
        provider: str = "smtp",
    ) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.unknown_outcome = unknown_outcome
        self.status_code = status_code
        self.provider = provider


def _get_http_client() -> httpx.Client:
    """Return a shared persistent httpx.Client with connection pooling and sane timeouts."""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        with _http_client_lock:
            if _http_client is None or _http_client.is_closed:
                _http_client = httpx.Client(
                    timeout=httpx.Timeout(
                        EMAIL_READ_TIMEOUT_SECONDS,
                        connect=EMAIL_CONNECT_TIMEOUT_SECONDS,
                    ),
                    limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
                )
    return _http_client


def _extract_bodies(msg: EmailMessage) -> Tuple[str, str]:
    body_text = ""
    body_html = ""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            payload = part.get_payload(decode=True)
            if payload:
                decoded = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
                if content_type == "text/plain" and not body_text:
                    body_text = decoded
                elif content_type == "text/html" and not body_html:
                    body_html = decoded
    else:
        content = msg.get_content()
        if msg.get_content_type() == "text/html":
            body_html = str(content)
        else:
            body_text = str(content)
    return body_text, body_html


def _ensure_message_id(msg: EmailMessage) -> str:
    if "Message-ID" not in msg:
        domain = None
        if settings.EMAIL_FROM and "@" in settings.EMAIL_FROM:
            domain = settings.EMAIL_FROM.split("@", 1)[1].rstrip("> ").strip()
        msg["Message-ID"] = make_msgid(domain=domain or None)
    return str(msg["Message-ID"])


def send_resend_message(
    msg: EmailMessage,
    idempotency_key: Optional[str] = None,
) -> Tuple[str, int]:
    """Send an email via Resend HTTP API using a persistent pooled httpx.Client."""
    api_key = (settings.EMAIL_API_KEY or "").strip()
    if not api_key:
        raise EmailDeliveryError(
            "EMAIL_API_KEY is not configured",
            retryable=False,
            provider="resend",
        )

    body_text, body_html = _extract_bodies(msg)
    payload = {
        "from": str(msg["From"]),
        "to": [str(msg["To"])],
        "subject": str(msg["Subject"] or ""),
    }
    if body_html:
        payload["html"] = body_html
    if body_text:
        payload["text"] = body_text

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    idem = idempotency_key or msg.get("Idempotency-Key") or msg.get("Resend-Idempotency-Key")
    if idem:
        headers["Idempotency-Key"] = str(idem)

    client = _get_http_client()
    t0 = time.perf_counter()
    try:
        resp = client.post("https://api.resend.com/emails", json=payload, headers=headers)
    except httpx.ReadTimeout as exc:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        raise EmailDeliveryError(
            f"Resend API read timed out after {elapsed_ms}ms (delivery outcome unknown): {exc}",
            retryable=False,
            unknown_outcome=True,
            provider="resend",
        ) from exc
    except (httpx.ConnectTimeout, httpx.ConnectError, httpx.PoolTimeout) as exc:
        raise EmailDeliveryError(
            f"Resend API connection error: {exc}",
            retryable=True,
            unknown_outcome=False,
            provider="resend",
        ) from exc
    except httpx.HTTPError as exc:
        raise EmailDeliveryError(
            f"Resend API HTTP error: {exc}",
            retryable=True,
            unknown_outcome=False,
            provider="resend",
        ) from exc

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    if 200 <= resp.status_code < 300:
        data = resp.json() if resp.content else {}
        msg_id = str(data.get("id") or _ensure_message_id(msg))
        logger.info(f"Email sent via Resend HTTP API in {elapsed_ms}ms (message_id={msg_id})")
        return msg_id, elapsed_ms

    detail = resp.text[:400] if resp.text else f"HTTP {resp.status_code}"
    if resp.status_code == 429 or resp.status_code >= 500:
        raise EmailDeliveryError(
            f"Resend API HTTP {resp.status_code}: {detail}",
            retryable=True,
            status_code=resp.status_code,
            provider="resend",
        )
    raise EmailDeliveryError(
        f"Resend API rejected message (HTTP {resp.status_code}): {detail}",
        retryable=False,
        status_code=resp.status_code,
        provider="resend",
    )


def send_smtp_message(msg: EmailMessage) -> str:
    """Send an email directly via Python smtplib using implicit SSL on 465 or STARTTLS on 587."""
    host = settings.SMTP_HOST
    port = int(settings.SMTP_PORT or 587)
    user = settings.SMTP_USER
    password = settings.SMTP_PASSWORD
    use_tls = settings.SMTP_USE_TLS

    if not host:
        raise RuntimeError("SMTP_HOST is not configured")

    message_id = _ensure_message_id(msg)
    server = None
    in_send_phase = False
    t0 = time.perf_counter()

    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=EMAIL_CONNECT_TIMEOUT_SECONDS)
            if server.sock:
                server.sock.settimeout(EMAIL_READ_TIMEOUT_SECONDS)
            server.ehlo()
        else:
            server = smtplib.SMTP(host, port, timeout=EMAIL_CONNECT_TIMEOUT_SECONDS)
            if server.sock:
                server.sock.settimeout(EMAIL_READ_TIMEOUT_SECONDS)
            server.ehlo()
            if use_tls and server.has_extn("STARTTLS"):
                server.starttls()
                server.ehlo()

        if user and password:
            server.login(user, password)

        in_send_phase = True
        refused = server.send_message(msg)
        if refused:
            raise EmailDeliveryError(
                f"SMTP server refused recipient(s): {refused}",
                retryable=False,
                provider="smtp",
            )
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(f"Email sent via SMTP ({host}:{port}) in {elapsed_ms}ms (message_id={message_id})")
        return message_id
    except EmailDeliveryError:
        raise
    except smtplib.SMTPRecipientsRefused as exc:
        raise EmailDeliveryError(
            f"SMTP recipients refused: {exc.recipients}",
            retryable=False,
            provider="smtp",
        ) from exc
    except smtplib.SMTPAuthenticationError as exc:
        raise EmailDeliveryError(
            f"SMTP authentication failed ({exc.smtp_code}): {exc.smtp_error}",
            retryable=False,
            status_code=exc.smtp_code,
            provider="smtp",
        ) from exc
    except smtplib.SMTPResponseException as exc:
        code = int(exc.smtp_code or 0)
        is_transient = 400 <= code < 500
        err_msg = exc.smtp_error.decode("utf-8", errors="replace") if isinstance(exc.smtp_error, bytes) else str(exc.smtp_error)
        raise EmailDeliveryError(
            f"SMTP error {code}: {err_msg}",
            retryable=is_transient,
            status_code=code,
            provider="smtp",
        ) from exc
    except (TimeoutError, socket.timeout) as exc:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        if in_send_phase:
            raise EmailDeliveryError(
                f"SMTP send timed out after {elapsed_ms}ms (delivery outcome unknown): {exc}",
                retryable=False,
                unknown_outcome=True,
                provider="smtp",
            ) from exc
        raise EmailDeliveryError(
            f"SMTP connection/handshake timed out after {elapsed_ms}ms: {exc}",
            retryable=True,
            unknown_outcome=False,
            provider="smtp",
        ) from exc
    except (OSError, smtplib.SMTPException) as exc:
        raise EmailDeliveryError(
            f"SMTP transport error: {exc}",
            retryable=True,
            unknown_outcome=False,
            provider="smtp",
        ) from exc
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:
                try:
                    server.close()
                except Exception:
                    pass


def get_available_providers() -> list[str]:
    """Return ordered list of configured email providers."""
    providers: list[str] = []
    pref = (settings.EMAIL_PROVIDER or "auto").strip().lower()
    has_resend = bool((settings.EMAIL_API_KEY or "").strip())
    has_smtp = bool((settings.SMTP_HOST or "").strip())

    if pref == "smtp":
        if has_smtp:
            providers.append("smtp")
        if has_resend:
            providers.append("resend")
    else:
        if has_resend:
            providers.append("resend")
        if has_smtp:
            providers.append("smtp")
    return providers


def send_email_message(
    msg: EmailMessage,
    *,
    attempt_number: int = 1,
    idempotency_key: Optional[str] = None,
) -> Tuple[str, str, int]:
    """Send an email using the configured primary provider (with fallback after 3 failures).

    Returns (provider_message_id, provider_name, provider_response_ms).
    """
    providers = get_available_providers()
    if not providers:
        raise EmailDeliveryError(
            "No email provider is configured (neither EMAIL_API_KEY nor SMTP_HOST is set)",
            retryable=False,
            provider="none",
        )

    apply_email_headers(msg, idempotency_key=idempotency_key)

    # Fallback: if primary failed 3 times in a row and a second provider is configured, use it
    chosen = providers[1] if (attempt_number >= 4 and len(providers) > 1) else providers[0]

    t0 = time.perf_counter()
    if chosen == "resend":
        msg_id, response_ms = send_resend_message(msg, idempotency_key=idempotency_key)
        return msg_id, "resend", response_ms

    msg_id = send_smtp_message(msg)
    response_ms = int((time.perf_counter() - t0) * 1000)
    return msg_id, "smtp", response_ms


def _enqueue_via_outbox(
    *,
    to_email: str,
    notification_type: str,
    payload: dict,
    idempotency_key: Optional[str] = None,
    user_id: Optional[str] = None,
) -> None:
    """Queue an email in email_logs for fast background delivery (or deliver inline in pytest)."""
    import uuid
    from app.db.session import SessionLocal
    from app.models.admin import EmailLog
    from app.services.notifications import _is_test_env, deliver_email_log, send_user_notification

    effective_uid = user_id or f"system:{notification_type}"
    effective_idem = idempotency_key or f"{notification_type}:{to_email}:{uuid.uuid4().hex}"

    with SessionLocal() as db:
        res = send_user_notification(
            user_id=effective_uid,
            to_email=to_email,
            notification_type=notification_type,
            payload=payload,
            idempotency_key=effective_idem,
            db=db,
        )
        if _is_test_env() and res.get("status") == "queued" and res.get("id"):
            row = db.query(EmailLog).filter(EmailLog.id == uuid.UUID(res["id"])).first()
            if row is not None and row.status == "queued":
                deliver_email_log(db, row)


def render_approval_email(
    display_name: str,
    weekday: str,
    time_str: str,
    local_deadline: str,
    topic_title: str,
    caption: str,
    raw_token: str,
    needs_review: bool = False,
    first_comment: Optional[str] = None,
    publish_notice: Optional[str] = None,
    has_image: bool = True,
) -> Tuple[str, str, str]:
    subject = f"Approve your LinkedIn post for {weekday} {time_str}"

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

    plain_text = (
        f"Hi {display_name},\n\n"
        f"{notice_line}{review_notice_plain}\n\n"
        f"Topic: {topic_title}\n\n"
        f"Caption:\n{caption}{first_comment_plain}\n\n"
        f"Review and decide:\n{approve_url}\n\n"
        f"---\n"
        f"You received this email because you enabled automated LinkedIn posting on AutoPulse."
    )

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
    return subject, plain_text, html_content


# Build and queue the approval notification email (never stores raw_token in email_logs)
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
    import uuid
    idem = idempotency_key or f"approval:{uuid.uuid4().hex}"
    store_pending_approval_token(idem, raw_token)
    _enqueue_via_outbox(
        to_email=to_email,
        notification_type="approval_request",
        payload={
            "display_name": display_name,
            "weekday": weekday,
            "time_str": time_str,
            "local_deadline": local_deadline,
            "topic_title": topic_title,
            "caption": caption,
            "needs_review": needs_review,
            "first_comment": first_comment,
            "publish_notice": publish_notice,
            "has_image": has_image,
        },
        idempotency_key=idem,
    )


def render_slack_disconnect_alert_email(display_name: str, error_reason: str) -> Tuple[str, str, str]:
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
    return subject, plain_text, html_content


# Alert user when Slack authentication is revoked or invalid
def send_slack_disconnect_alert_email(
    to_email: str,
    display_name: str,
    error_reason: str,
) -> None:
    _enqueue_via_outbox(
        to_email=to_email,
        notification_type="slack_disconnect",
        payload={"display_name": display_name, "error_reason": error_reason},
    )


def render_reminder_email(
    display_name: str,
    publish_date_str: str,
    publish_time_str: str,
    tz_label: str,
    topic_title: str,
    post_id: str,
) -> Tuple[str, str, str]:
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
    return subject, plain_text, html_content


def send_reminder_email(
    to_email: str,
    display_name: str,
    publish_date_str: str,
    publish_time_str: str,
    tz_label: str,
    topic_title: str,
    post_id: str,
) -> None:
    _enqueue_via_outbox(
        to_email=to_email,
        notification_type="approval_reminder",
        payload={
            "display_name": display_name,
            "publish_date_str": publish_date_str,
            "publish_time_str": publish_time_str,
            "tz_label": tz_label,
            "topic_title": topic_title,
            "post_id": post_id,
        },
        idempotency_key=f"approval_reminder:{post_id}",
    )


def render_skipped_notice_email(
    display_name: str,
    publish_time_str: str,
    post_id: str,
) -> Tuple[str, str, str]:
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
    return subject, plain_text, html_content


def send_skipped_notice_email(
    to_email: str,
    display_name: str,
    publish_time_str: str,
    post_id: str,
) -> None:
    _enqueue_via_outbox(
        to_email=to_email,
        notification_type="post_skipped",
        payload={
            "display_name": display_name,
            "publish_time_str": publish_time_str,
            "post_id": post_id,
        },
        idempotency_key=f"post_skipped:{post_id}",
    )


def render_spend_alert_email(
    user_email: str,
    plan_id: str,
    spend_usd: float,
    limit_usd: float,
) -> Tuple[str, str, str]:
    subject = f"[AutoPulse Alert] Daily spend limit reached: {user_email} ({plan_id})"
    plain_text = (
        f"User {user_email} on plan '{plan_id}' hit their daily spend limit.\n\n"
        f"Today's spend: ${spend_usd:.4f}\n"
        f"Daily limit:   ${limit_usd:.2f}\n\n"
        f"Further runs for this user are blocked for the rest of their local day."
    )
    html_content = f"""<!DOCTYPE html>
<html><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0b0f19;color:#f8fafc;">
  <div style="max-width:560px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:12px;padding:28px;">
    <h2 style="margin-top:0;font-size:18px;color:#f87171;">Daily Spend Limit Reached</h2>
    <p style="color:#cbd5e1;font-size:14px;">User <strong>{html.escape(user_email)}</strong> (plan: <strong>{html.escape(plan_id)}</strong>) reached their daily spend limit.</p>
    <p style="color:#cbd5e1;font-size:14px;">Today's spend: <strong>${spend_usd:.4f}</strong> / Limit: <strong>${limit_usd:.2f}</strong></p>
  </div>
</body></html>"""
    return subject, plain_text, html_content


def send_spend_alert_email(
    to_email: str,
    user_email: str,
    plan_id: str,
    spend_usd: float,
    limit_usd: float,
) -> None:
    """Alert ops once per user per day when a user hits their plan's daily spend limit."""
    _enqueue_via_outbox(
        to_email=to_email,
        notification_type="spend_alert",
        payload={
            "user_email": user_email,
            "plan_id": plan_id,
            "spend_usd": float(spend_usd),
            "limit_usd": float(limit_usd),
        },
    )


def render_subscription_reminder_email(
    display_name: str,
    reminder_type: str,
    plan_name: str,
    target_date_str: str,
) -> Tuple[str, str, str]:
    billing_url = f"{settings.APP_BASE_URL.rstrip('/')}/app/billing"
    if reminder_type == "trial_1d":
        from app.core.plans import TRIAL_DAYS
        subject = "Your AutoPulse free trial ends tomorrow"
        headline = "1 day left in your free trial"
        body_line = f"Your {TRIAL_DAYS}-day AutoPulse free trial ends on {target_date_str}. Choose a plan to keep your scheduled LinkedIn posts running."
    elif reminder_type == "renewal_1d":
        subject = f"Your AutoPulse {plan_name} plan renews tomorrow"
        headline = "1 day until plan renewal"
        body_line = f"Your AutoPulse {plan_name} plan period ends on {target_date_str}."
    else:
        subject = f"Your AutoPulse {plan_name} plan renews in 5 days"
        headline = "5 days until plan renewal"
        body_line = f"Your AutoPulse {plan_name} plan period ends on {target_date_str}."

    plain_text = (
        f"Hi {display_name},\n\n"
        f"{body_line}\n\n"
        f"Manage your plan:\n{billing_url}\n"
    )
    html_content = f"""<!DOCTYPE html>
<html><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0b0f19;color:#f8fafc;">
  <div style="max-width:560px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:12px;padding:28px;">
    <h2 style="margin-top:0;font-size:18px;color:#f8fafc;">{html.escape(headline)}</h2>
    <p style="color:#cbd5e1;font-size:14px;">Hi {html.escape(display_name)},</p>
    <p style="color:#cbd5e1;font-size:14px;">{html.escape(body_line)}</p>
    <div style="margin-top:20px;"><a href="{billing_url}" style="display:inline-block;background:#0284c7;color:#fff;text-decoration:none;padding:12px 22px;font-size:14px;font-weight:600;border-radius:8px;">View Plan &amp; Billing</a></div>
  </div>
</body></html>"""
    return subject, plain_text, html_content


def send_subscription_reminder_email(
    to_email: str,
    display_name: str,
    reminder_type: str,
    plan_name: str,
    target_date_str: str,
) -> None:
    """Send trial (1d) or renewal (5d, 1d) reminder email."""
    _enqueue_via_outbox(
        to_email=to_email,
        notification_type="subscription_reminder",
        payload={
            "display_name": display_name,
            "reminder_type": reminder_type,
            "plan_name": plan_name,
            "target_date_str": target_date_str,
        },
    )
