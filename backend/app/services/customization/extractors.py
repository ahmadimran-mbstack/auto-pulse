"""Document and URL text extractors with SSRF protection and normalization."""

import io
import ipaddress
import logging
import re
import socket
import unicodedata
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Dict, List, Optional
from urllib.parse import urljoin, urlparse

import httpx

from app.core.config import settings
from app.services.customization.validation import (
    MAX_EXTRACTED_CHARS,
    MAX_PDF_PAGES,
    ValidationError,
    normalize_and_validate_url,
)

logger = logging.getLogger(__name__)

PARSER_VERSION_PDF = "pdf-1"
PARSER_VERSION_DOCX = "docx-1"
PARSER_VERSION_TEXT = "text-1"
PARSER_VERSION_URL = "url-1"

_ZERO_WIDTH_RE = re.compile(r"[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]")


@dataclass
class ExtractedDocument:
    text: str
    page_count: Optional[int]
    char_count: int
    token_estimate: int
    parser_version: str
    truncated: bool = False
    title_hint: Optional[str] = None


def normalize_extracted_text(raw: str, max_chars: int = MAX_EXTRACTED_CHARS) -> tuple[str, bool]:
    """Unicode NFKC, strip zero-width/bidi chars, normalize newlines, cap at max_chars."""
    text = unicodedata.normalize("NFKC", raw or "")
    text = _ZERO_WIDTH_RE.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Collapse >2 consecutive blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Collapse horizontal whitespace runs on each line
    lines = [re.sub(r"[ \t]{2,}", " ", ln).rstrip() for ln in text.split("\n")]
    cleaned = "\n".join(lines).strip()
    truncated = False
    if len(cleaned) > max_chars:
        cleaned = cleaned[:max_chars].rstrip()
        truncated = True
    return cleaned, truncated


def extract_pdf_bytes(data: bytes) -> ExtractedDocument:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception as exc:
        raise ValidationError("unsupported_type", f"Could not parse PDF: {exc}", 400) from exc

    if reader.is_encrypted:
        raise ValidationError(
            "encrypted_pdf",
            "Encrypted or password-protected PDFs are not supported.",
            400,
        )

    num_pages = len(reader.pages)
    if num_pages == 0:
        raise ValidationError("empty_document", "PDF has no pages.", 400)
    if num_pages > MAX_PDF_PAGES:
        raise ValidationError(
            "too_many_pages",
            f"PDF has {num_pages} pages (max {MAX_PDF_PAGES}).",
            400,
        )

    page_texts: List[str] = []
    for page in reader.pages:
        try:
            txt = page.extract_text(extraction_mode="layout") or ""
        except Exception:
            txt = page.extract_text() or ""
        page_texts.append(txt)

    # Remove repeated header/footer lines appearing on >= 60% of pages (when >= 3 pages)
    if num_pages >= 3:
        line_page_counts: Dict[str, int] = {}
        for pt in page_texts:
            seen_on_page = {ln.strip() for ln in pt.splitlines() if ln.strip() and len(ln.strip()) <= 100}
            for ln in seen_on_page:
                line_page_counts[ln] = line_page_counts.get(ln, 0) + 1
        threshold = max(2, int(num_pages * 0.6))
        repeated = {ln for ln, cnt in line_page_counts.items() if cnt >= threshold}
        if repeated:
            page_texts = [
                "\n".join(ln for ln in pt.splitlines() if ln.strip() not in repeated)
                for pt in page_texts
            ]

    combined = "\n\n".join(pt.strip() for pt in page_texts if pt.strip())
    cleaned, truncated = normalize_extracted_text(combined)
    if not cleaned or (len(cleaned) / num_pages) < 30:
        raise ValidationError(
            "no_text_layer",
            "This PDF appears to be scanned or image-only. Please export it with selectable text.",
            400,
        )

    return ExtractedDocument(
        text=cleaned,
        page_count=num_pages,
        char_count=len(cleaned),
        token_estimate=max(1, len(cleaned) // 4),
        parser_version=PARSER_VERSION_PDF,
        truncated=truncated,
    )


def extract_docx_bytes(data: bytes) -> ExtractedDocument:
    import docx

    try:
        document = docx.Document(io.BytesIO(data))
    except Exception as exc:
        raise ValidationError("unsupported_type", f"Could not parse DOCX: {exc}", 400) from exc

    parts: List[str] = []
    for para in document.paragraphs:
        txt = (para.text or "").strip()
        if not txt:
            continue
        style_name = (para.style.name if para.style else "") or ""
        if style_name.startswith("Heading"):
            level = 1
            for ch in style_name:
                if ch.isdigit():
                    level = min(4, int(ch))
                    break
            parts.append(f"{'#' * level} {txt}")
        elif "List" in style_name or "Bullet" in style_name:
            parts.append(f"- {txt}")
        else:
            parts.append(txt)

    for table in document.tables:
        for row in table.rows:
            cells = [" ".join((c.text or "").split()) for c in row.cells]
            if any(cells):
                parts.append(" | ".join(cells))

    cleaned, truncated = normalize_extracted_text("\n\n".join(parts))
    if not cleaned:
        raise ValidationError("empty_document", "DOCX contains no readable text.", 400)

    return ExtractedDocument(
        text=cleaned,
        page_count=None,
        char_count=len(cleaned),
        token_estimate=max(1, len(cleaned) // 4),
        parser_version=PARSER_VERSION_DOCX,
        truncated=truncated,
    )


def extract_text_content(raw_text: str, mime_type: str = "text/plain") -> ExtractedDocument:
    text = raw_text or ""
    if mime_type == "text/markdown":
        # Strip inline base64 images and HTML tags while preserving markdown structure
        text = re.sub(r"!\[[^\]]*\]\(data:image/[^)]+\)", "", text)
        text = re.sub(r"<[^>]+>", " ", text)
    cleaned, truncated = normalize_extracted_text(text)
    if not cleaned:
        raise ValidationError("empty_document", "Document contains no readable text.", 400)
    return ExtractedDocument(
        text=cleaned,
        page_count=None,
        char_count=len(cleaned),
        token_estimate=max(1, len(cleaned) // 4),
        parser_version=PARSER_VERSION_TEXT,
        truncated=truncated,
    )


class _SimpleHTMLTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._skip_depth = 0
        self._in_title = False
        self.title_parts: List[str] = []
        self.text_parts: List[str] = []

    def handle_starttag(self, tag, attrs):
        t = tag.lower()
        if t in {"script", "style", "noscript", "svg"}:
            self._skip_depth += 1
        elif t == "title":
            self._in_title = True
        elif t in {"p", "br", "div", "li", "h1", "h2", "h3", "h4", "tr"}:
            self.text_parts.append("\n")

    def handle_endtag(self, tag):
        t = tag.lower()
        if t in {"script", "style", "noscript", "svg"} and self._skip_depth > 0:
            self._skip_depth -= 1
        elif t == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._skip_depth > 0:
            return
        if self._in_title:
            self.title_parts.append(data)
        self.text_parts.append(data)


def _is_public_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def resolve_and_validate_host(hostname: str) -> str:
    """Resolve hostname via DNS and verify every returned IP is public."""
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise ValidationError("url_unreachable", f"Could not resolve host {hostname}.", 400) from exc

    ips = [info[4][0] for info in infos if info and info[4]]
    if not ips:
        raise ValidationError("url_unreachable", f"No DNS records for {hostname}.", 400)
    for ip in ips:
        if not _is_public_ip(ip):
            raise ValidationError("url_blocked", "URL resolves to a non-public IP address.", 400)
    return ips[0]


def _guarded_http_fetch(url: str) -> ExtractedDocument:
    current_url = normalize_and_validate_url(url)
    headers = {"User-Agent": "AutoPulseBot/1.0 (+https://autopulse.app/bot)"}

    for _hop in range(4):
        parsed = urlparse(current_url)
        resolve_and_validate_host(parsed.hostname or "")

        # Best-effort robots.txt check
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        try:
            with httpx.Client(timeout=4.0, follow_redirects=False) as rclient:
                rresp = rclient.get(robots_url, headers=headers)
                if rresp.status_code == 200:
                    if _robots_disallows(rresp.text, parsed.path or "/"):
                        raise ValidationError(
                            "url_robots_disallowed",
                            "Site's robots.txt disallows automated reading of this path.",
                            400,
                        )
        except ValidationError:
            raise
        except Exception:
            pass

        with httpx.Client(timeout=10.0, follow_redirects=False) as client:
            resp = client.get(current_url, headers=headers)

        if resp.status_code in (301, 302, 303, 307, 308):
            loc = resp.headers.get("location")
            if not loc:
                raise ValidationError("url_unreachable", "Redirect missing Location header.", 400)
            current_url = normalize_and_validate_url(urljoin(current_url, loc))
            continue

        if resp.status_code >= 400:
            raise ValidationError("url_unreachable", f"URL returned HTTP {resp.status_code}.", 400)

        if len(resp.content) > 2 * 1024 * 1024:
            raise ValidationError("file_too_large", "URL response exceeds 2 MB limit.", 400)

        ctype = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
        if ctype == "application/pdf":
            doc = extract_pdf_bytes(resp.content)
            doc.parser_version = PARSER_VERSION_URL
            return doc
        if ctype in ("text/plain", "text/markdown"):
            doc = extract_text_content(resp.text, mime_type=ctype)
            doc.parser_version = PARSER_VERSION_URL
            return doc
        if ctype in ("text/html", "application/xhtml+xml", ""):
            parser = _SimpleHTMLTextExtractor()
            parser.feed(resp.text)
            raw = "".join(parser.text_parts)
            title = " ".join("".join(parser.title_parts).split())[:120] or None
            cleaned, truncated = normalize_extracted_text(raw, max_chars=25_000)
            if not cleaned:
                raise ValidationError("empty_document", "No readable text found at URL.", 400)
            return ExtractedDocument(
                text=cleaned,
                page_count=None,
                char_count=len(cleaned),
                token_estimate=max(1, len(cleaned) // 4),
                parser_version=PARSER_VERSION_URL,
                truncated=truncated,
                title_hint=title,
            )

        raise ValidationError(
            "url_unsupported_content",
            f"Unsupported URL content-type: {ctype or 'unknown'}.",
            400,
        )

    raise ValidationError("url_unreachable", "Too many redirects.", 400)


def _robots_disallows(robots_txt: str, path: str) -> bool:
    applies = False
    for raw_line in robots_txt.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        key, val = [p.strip() for p in line.split(":", 1)]
        kl = key.lower()
        if kl == "user-agent":
            applies = val in ("*", "AutoPulseBot")
        elif kl == "disallow" and applies and val:
            if path.startswith(val):
                return True
    return False


def fetch_business_url(url: str) -> ExtractedDocument:
    """Fetch business URL content using Exa get_contents (primary) with SSRF-guarded httpx fallback."""
    normalized = normalize_and_validate_url(url)

    if settings.EXA_API_KEY:
        try:
            from exa_py import Exa

            exa = Exa(api_key=settings.EXA_API_KEY)
            res = exa.get_contents([normalized], text={"max_characters": 20000})
            results = getattr(res, "results", None) or []
            if results:
                first = results[0]
                text = getattr(first, "text", None) or ""
                title = getattr(first, "title", None)
                cleaned, truncated = normalize_extracted_text(text, max_chars=25_000)
                if len(cleaned) >= 80:
                    return ExtractedDocument(
                        text=cleaned,
                        page_count=None,
                        char_count=len(cleaned),
                        token_estimate=max(1, len(cleaned) // 4),
                        parser_version=PARSER_VERSION_URL,
                        truncated=truncated,
                        title_hint=title[:120] if title else None,
                    )
        except Exception as exc:
            logger.info(f"Exa get_contents fallback to guarded httpx for {normalized}: {exc}")

    return _guarded_http_fetch(normalized)
