"""Validation and sanitization for customization uploads, pastes, and URLs."""

import io
import re
import zipfile
from typing import Optional, Tuple
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from charset_normalizer import from_bytes

from app.core.config import settings

MAX_PDF_PAGES = 150
MAX_EXTRACTED_CHARS = 200_000
MAX_PASTE_CHARS = 30_000
MAX_INSTRUCTIONS_CHARS = 4_000
MAX_URL_LENGTH = 2_048

# ZIP bomb bounds for DOCX
MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024  # 50 MB
MAX_DOCX_COMPRESSION_RATIO = 100.0
MAX_DOCX_ENTRIES = 2_000

# Quotas per user
QUOTA_PLAYBOOKS = 5
QUOTA_BUSINESS_DOCS = 20
QUOTA_BUSINESS_URLS = 10
QUOTA_PREVIOUS_POSTS_DOCS = 10
QUOTA_TOTAL_SAMPLES = 200
QUOTA_TOTAL_BYTES = 100 * 1024 * 1024  # 100 MB

TRACKING_QUERY_PARAMS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "fbclid",
    "mc_cid",
    "mc_eid",
    "ref",
}


class ValidationError(Exception):
    """Raised when an upload, paste, or URL fails validation."""

    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def max_upload_bytes() -> int:
    return int(settings.CUSTOMIZATION_MAX_FILE_MB) * 1024 * 1024


def sanitize_filename(filename: Optional[str], fallback: str = "document") -> str:
    if not filename:
        return fallback
    base = filename.replace("\\", "/").split("/")[-1].strip()
    cleaned = re.sub(r"[^A-Za-z0-9._ -]+", "_", base).strip(" ._")
    return cleaned[:120] or fallback


def detect_and_validate_file(data: bytes, filename: Optional[str] = None) -> Tuple[str, Optional[str]]:
    """Detect file type via magic bytes/structure (never trust client Content-Type).
    Returns (detected_mime_type, decoded_text_if_text).
    Raises ValidationError on invalid, corrupt, macro-enabled, or binary files.
    """
    if not data:
        raise ValidationError("empty_document", "The uploaded file is empty.", 400)

    if len(data) > max_upload_bytes():
        raise ValidationError(
            "file_too_large",
            f"File exceeds the {settings.CUSTOMIZATION_MAX_FILE_MB} MB limit.",
            413,
        )

    # 1. Legacy OLE .doc
    if data[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        raise ValidationError(
            "unsupported_type",
            "Legacy .doc files are not supported. Please save as .docx or .pdf.",
            400,
        )

    # 2. PDF (%PDF-)
    if data[:5] == b"%PDF-":
        return "application/pdf", None

    # 3. ZIP / OOXML (DOCX)
    if data[:4] == b"PK\x03\x04":
        _validate_docx_zip(data)
        return (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            None,
        )

    # 4. Text / Markdown (UTF-8 or charset-normalizer)
    if b"\x00" in data[:8192]:
        raise ValidationError(
            "unsupported_type",
            "Unsupported binary file. Upload PDF, DOCX, Markdown, or TXT.",
            400,
        )

    decoded: Optional[str] = None
    try:
        decoded = data.decode("utf-8")
    except UnicodeDecodeError:
        best = from_bytes(data).best()
        if best is not None:
            decoded = str(best)

    if decoded is None:
        raise ValidationError(
            "decode_failed",
            "Could not decode text file. Please save as UTF-8.",
            400,
        )

    # Reject binary disguised as text (> 1% control characters excluding \n, \r, \t)
    sample = decoded[:20000]
    if sample:
        ctrl = sum(1 for ch in sample if ord(ch) < 32 and ch not in ("\n", "\r", "\t"))
        if (ctrl / len(sample)) > 0.01:
            raise ValidationError(
                "unsupported_type",
                "File contains binary data. Upload PDF, DOCX, Markdown, or TXT.",
                400,
            )

    ext = (filename or "").lower().rsplit(".", 1)[-1] if filename and "." in filename else ""
    mime = "text/markdown" if ext in {"md", "markdown"} else "text/plain"
    return mime, decoded


def _validate_docx_zip(data: bytes) -> None:
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise ValidationError("unsupported_type", "Corrupt DOCX archive.", 400) from exc

    with zf:
        infos = zf.infolist()
        if len(infos) > MAX_DOCX_ENTRIES:
            raise ValidationError("zip_bomb", "DOCX archive has too many entries.", 400)

        total_uncompressed = 0
        names = set()
        for info in infos:
            name = info.filename
            if name.startswith("/") or name.startswith("\\") or ".." in name.split("/"):
                raise ValidationError("zip_bomb", "Invalid path inside DOCX archive.", 400)
            names.add(name)
            total_uncompressed += info.file_size
            if total_uncompressed > MAX_DOCX_UNCOMPRESSED_BYTES:
                raise ValidationError("zip_bomb", "DOCX uncompressed size exceeds limit.", 400)
            if info.compress_size > 0 and (info.file_size / info.compress_size) > MAX_DOCX_COMPRESSION_RATIO:
                raise ValidationError("zip_bomb", "Suspicious compression ratio in DOCX.", 400)

        if "[Content_Types].xml" not in names or "word/document.xml" not in names:
            raise ValidationError(
                "unsupported_type",
                "ZIP archive is not a valid DOCX document.",
                400,
            )

        content_types = zf.read("[Content_Types].xml").decode("utf-8", errors="ignore")
        if "macroEnabled" in content_types or "vbaProject" in " ".join(names):
            raise ValidationError(
                "macro_document",
                "Macro-enabled Word documents (.docm) are not allowed.",
                400,
            )


def normalize_and_validate_url(raw_url: str) -> str:
    """Validate http/https URL, strip fragments & tracking query params, normalize host."""
    url = (raw_url or "").strip()
    if not url:
        raise ValidationError("url_blocked", "URL is required.", 400)
    if len(url) > MAX_URL_LENGTH:
        raise ValidationError("url_blocked", "URL exceeds maximum length.", 400)

    parsed = urlparse(url)
    if parsed.scheme.lower() not in {"http", "https"}:
        raise ValidationError("url_blocked", "Only http and https URLs are supported.", 400)
    if not parsed.netloc or parsed.username or parsed.password:
        raise ValidationError("url_blocked", "Invalid URL host or embedded credentials.", 400)
    if parsed.port not in (None, 80, 443):
        raise ValidationError("url_blocked", "Only standard ports (80, 443) are allowed.", 400)

    hostname = (parsed.hostname or "").lower()
    if not hostname or hostname in {"localhost", "127.0.0.1", "0.0.0.0", "::1"} or hostname.endswith(".local"):
        raise ValidationError("url_blocked", "Private or local URLs are not allowed.", 400)

    clean_query = [
        (k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k.lower() not in TRACKING_QUERY_PARAMS
    ]
    normalized = urlunparse(
        (
            parsed.scheme.lower(),
            hostname if parsed.port is None else f"{hostname}:{parsed.port}",
            parsed.path or "/",
            "",
            urlencode(clean_query),
            "",
        )
    )
    return normalized
