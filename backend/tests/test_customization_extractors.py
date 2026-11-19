"""Unit tests for PDF/DOCX/text extractors, URL SSRF guards, and post splitter."""

import io
import zipfile

import docx
import pytest
from pypdf import PdfWriter

from app.services.customization.extractors import (
    extract_docx_bytes,
    extract_pdf_bytes,
    extract_text_content,
    resolve_and_validate_host,
)
from app.services.customization.splitter import split_previous_posts
from app.services.customization.validation import ValidationError


def test_extract_docx_with_headings_lists_and_table():
    doc = docx.Document()
    doc.add_heading("Playbook Title", level=1)
    doc.add_paragraph("Keep hooks crisp and concrete.")
    doc.add_paragraph("First bullet rule", style="List Bullet")
    table = doc.add_table(rows=1, cols=2)
    table.cell(0, 0).text = "Metric"
    table.cell(0, 1).text = "Target"
    buf = io.BytesIO()
    doc.save(buf)

    res = extract_docx_bytes(buf.getvalue())
    assert "# Playbook Title" in res.text
    assert "- First bullet rule" in res.text
    assert "Metric | Target" in res.text


def test_extract_encrypted_or_empty_pdf():
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    with pytest.raises(ValidationError) as exc:
        extract_pdf_bytes(buf.getvalue())
    assert exc.value.code == "no_text_layer"

    enc_writer = PdfWriter()
    enc_writer.add_blank_page(width=200, height=200)
    enc_writer.encrypt("secret")
    ebuf = io.BytesIO()
    enc_writer.write(ebuf)
    with pytest.raises(ValidationError) as exc2:
        extract_pdf_bytes(ebuf.getvalue())
    assert exc2.value.code == "encrypted_pdf"


def test_extract_markdown_strips_inline_images():
    res = extract_text_content("# Guide\n\n![img](data:image/png;base64,AAAA)\n\nRule 1.", "text/markdown")
    assert "data:image" not in res.text
    assert "Rule 1." in res.text


def test_resolve_and_validate_host_blocks_private_ip(monkeypatch):
    def fake_getaddrinfo(host, port):
        return [(2, 1, 6, "", ("10.0.0.5", 0))]

    monkeypatch.setattr("socket.getaddrinfo", fake_getaddrinfo)
    with pytest.raises(ValidationError) as exc:
        resolve_and_validate_host("internal.corp")
    assert exc.value.code == "url_blocked"


def test_split_previous_posts_and_features():
    raw = (
        "First post about database connection pooling in production.\n"
        "We saw latency drop when pooling was tuned.\n"
        "How do you size your pool?\n"
        "---\n"
        "Short\n"
        "---\n"
        "Second post about deployment pipelines and rollback speed.\n"
        "Fast rollbacks matter more than zero-bug deploys in real teams.\n"
        "Keep every migration backward compatible. #DevOps #Reliability"
    )
    samples = split_previous_posts(raw)
    assert len(samples) == 3
    assert samples[0].features["ends_with_question"] is True
    assert samples[1].quality_flag == "too_short"
    assert samples[2].features["hashtag_count"] == 2
    assert samples[2].features["hashtag_case"] == "camel"
