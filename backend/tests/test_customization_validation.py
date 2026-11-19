"""Unit tests for customization file/URL validation and magic-byte detection."""

import io
import zipfile

import pytest

from app.services.customization.validation import (
    ValidationError,
    detect_and_validate_file,
    normalize_and_validate_url,
    sanitize_filename,
)


def _make_docx_bytes(content_types: str = "<Types></Types>", extra_files=None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>")
        for name, data in (extra_files or {}).items():
            zf.writestr(name, data)
    return buf.getvalue()


def test_detect_pdf_and_text_and_markdown():
    mime, decoded = detect_and_validate_file(b"%PDF-1.4\n%fake", "playbook.pdf")
    assert mime == "application/pdf"
    assert decoded is None

    mime, decoded = detect_and_validate_file(b"# My Playbook\n\n- Rule 1\n", "playbook.md")
    assert mime == "text/markdown"
    assert "Rule 1" in decoded

    mime, decoded = detect_and_validate_file(b"Plain text post.", "posts.txt")
    assert mime == "text/plain"
    assert decoded == "Plain text post."


def test_reject_spoofed_binary_and_legacy_doc():
    with pytest.raises(ValidationError) as exc:
        detect_and_validate_file(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1rest", "old.doc")
    assert exc.value.code == "unsupported_type"

    with pytest.raises(ValidationError) as exc2:
        detect_and_validate_file(b"\x00\x01\x02\x03\x04\x05", "fake.txt")
    assert exc2.value.code == "unsupported_type"

    with pytest.raises(ValidationError) as exc3:
        detect_and_validate_file(b"", "empty.txt")
    assert exc3.value.code == "empty_document"


def test_docx_and_macro_and_zip_bomb_guards():
    valid = _make_docx_bytes()
    mime, _ = detect_and_validate_file(valid, "guide.docx")
    assert mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    macro = _make_docx_bytes(content_types="application/vnd.ms-word.document.macroEnabled.12")
    with pytest.raises(ValidationError) as exc:
        detect_and_validate_file(macro, "evil.docm")
    assert exc.value.code == "macro_document"

    traversal = _make_docx_bytes(extra_files={"../../etc/passwd": b"root"})
    with pytest.raises(ValidationError) as exc2:
        detect_and_validate_file(traversal, "bad.docx")
    assert exc2.value.code == "zip_bomb"


def test_url_normalization_and_ssrf_blocks():
    norm = normalize_and_validate_url("HTTPS://Example.COM/about?utm_source=x&tab=1#top")
    assert norm == "https://example.com/about?tab=1"

    for bad in [
        "file:///etc/passwd",
        "http://localhost:8000/secret",
        "http://127.0.0.1/admin",
        "https://user:pass@example.com/",
        "https://example.com:8443/",
    ]:
        with pytest.raises(ValidationError):
            normalize_and_validate_url(bad)


def test_sanitize_filename():
    assert sanitize_filename("../../weird name (1).pdf") == "weird name _1_.pdf"
    assert sanitize_filename(None) == "document"
