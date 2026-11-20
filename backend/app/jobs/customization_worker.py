"""Background worker for customization extraction, distillation, embedding, compilation, and purge."""

import asyncio
import datetime
import hashlib
import logging
import os
from typing import Any, Dict, List, Optional

from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session

from app.agents.gtm import compile_default_playbook_rules
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.customization import (
    CustomizationDocument,
    CustomizationFact,
    CustomizationJob,
    CustomizationPostSample,
    CustomizationVersion,
)
from app.repositories import customization as custom_repo
from app.services.customization.compiler import (
    COMPILER_VERSION,
    compile_customization_context,
    compute_input_fingerprint,
)
from app.services.customization.context import invalidate_customization_context_cache
from app.services.customization.distillers import (
    DISTILLER_VERSION_BUSINESS,
    DISTILLER_VERSION_PLAYBOOK,
    DISTILLER_VERSION_VOICE,
    distill_business,
    distill_playbook,
    distill_voice,
)
from app.services.customization.extractors import (
    extract_docx_bytes,
    extract_pdf_bytes,
    extract_text_content,
    fetch_business_url,
)
from app.services.customization.splitter import split_previous_posts
from app.services.customization.validation import ValidationError
from app.services.embeddings import get_embedding_provider
from app.services.storage import get_storage_backend

logger = logging.getLogger(__name__)

_PERMANENT_ERROR_CODES = {
    "unsupported_type",
    "encrypted_pdf",
    "no_text_layer",
    "empty_document",
    "too_many_pages",
    "zip_bomb",
    "macro_document",
    "decode_failed",
    "url_blocked",
    "url_robots_disallowed",
    "url_unsupported_content",
}


def _sha256_str(s: str) -> str:
    return hashlib.sha256((s or "").encode("utf-8")).hexdigest()


def _embed_pending_for_document(db: Session, doc: CustomizationDocument) -> bool:
    """Embed facts and samples for doc. Returns True if all embedded or nothing to embed, False if provider failed."""
    provider = get_embedding_provider()
    if provider is None:
        return True

    model_id = provider.model_id
    facts = (
        db.query(CustomizationFact)
        .filter(
            CustomizationFact.document_id == doc.id,
            CustomizationFact.user_id == doc.user_id,
            (CustomizationFact.embedding.is_(None)) | (CustomizationFact.embedding_model != model_id),
        )
        .all()
    )
    samples = (
        db.query(CustomizationPostSample)
        .filter(
            CustomizationPostSample.document_id == doc.id,
            CustomizationPostSample.user_id == doc.user_id,
            (CustomizationPostSample.embedding.is_(None))
            | (CustomizationPostSample.embedding_model != model_id),
        )
        .all()
    )

    texts_to_embed: List[str] = []
    targets: List[tuple[str, Any]] = []
    for f in facts:
        texts_to_embed.append(f"{f.category}: {f.text}")
        targets.append(("fact", f))
    for s in samples:
        texts_to_embed.append(s.text[:2000])
        targets.append(("sample", s))

    if not texts_to_embed:
        doc.needs_embedding = False
        return True

    try:
        vectors = provider.embed_documents(texts_to_embed)
        for (_kind, obj), vec in zip(targets, vectors):
            obj.embedding = vec
            obj.embedding_model = model_id
        doc.needs_embedding = False
        db.commit()
        return True
    except Exception as exc:
        logger.warning(f"Embedding failed for doc {doc.id}: {exc}")
        doc.needs_embedding = True
        db.commit()
        return False


def _handle_extract_distill(db: Session, job: CustomizationJob) -> None:
    doc = (
        db.query(CustomizationDocument)
        .filter(
            CustomizationDocument.id == job.document_id,
            CustomizationDocument.user_id == job.user_id,
        )
        .first()
    )
    if doc is None or doc.status == "deleted":
        return

    now = datetime.datetime.now(datetime.timezone.utc)
    doc.status = "extracting"
    doc.attempts = (doc.attempts or 0) + 1
    doc.updated_at = now
    db.commit()

    # 1. Extract text if not already extracted (e.g. paste already has extracted_text)
    if not doc.extracted_text:
        if doc.source_type == "url" and doc.source_url:
            extracted = fetch_business_url(doc.source_url)
            if extracted.title_hint and doc.title == doc.source_url:
                doc.title = extracted.title_hint
        elif doc.source_type == "upload" and doc.storage_key:
            raw = get_storage_backend().get(doc.storage_key)
            if doc.mime_type == "application/pdf":
                extracted = extract_pdf_bytes(raw)
            elif doc.mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                extracted = extract_docx_bytes(raw)
            else:
                extracted = extract_text_content(raw.decode("utf-8", errors="replace"), mime_type=doc.mime_type or "text/plain")
        else:
            raise ValidationError("empty_document", "Document has no content to extract.", 400)

        doc.extracted_text = extracted.text
        doc.page_count = extracted.page_count
        doc.char_count = extracted.char_count
        doc.token_estimate = extracted.token_estimate
        doc.parser_version = extracted.parser_version

        if not settings.RETAIN_ORIGINALS and doc.storage_key:
            try:
                get_storage_backend().delete(doc.storage_key)
                doc.storage_key = None
            except Exception:
                pass

    # 2. Distill
    doc.status = "distilling"
    doc.updated_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()

    text = doc.extracted_text or ""
    # Clear old derived rows before re-inserting (safe for reprocess)
    db.query(CustomizationFact).filter(
        CustomizationFact.document_id == doc.id, CustomizationFact.user_id == doc.user_id
    ).delete(synchronize_session=False)
    db.query(CustomizationPostSample).filter(
        CustomizationPostSample.document_id == doc.id, CustomizationPostSample.user_id == doc.user_id
    ).delete(synchronize_session=False)

    if doc.kind == "playbook":
        distilled = distill_playbook(text)
        doc.distilled = distilled.model_dump()
        doc.distiller_version = DISTILLER_VERSION_PLAYBOOK
        for r in distilled.rules:
            db.add(
                CustomizationFact(
                    user_id=doc.user_id,
                    document_id=doc.id,
                    kind="playbook_rule",
                    category=r.category,
                    text=r.rule[:240],
                    numbers=[],
                    evidence_quote=r.evidence_quote[:240],
                    source_label=doc.title,
                    is_core=False,
                    content_hash=_sha256_str(r.rule),
                )
            )

    elif doc.kind == "business":
        source_label = doc.source_url or doc.title
        distilled = distill_business(text, source_label=source_label)
        doc.distilled = distilled.model_dump()
        doc.distiller_version = DISTILLER_VERSION_BUSINESS
        if distilled.one_liner:
            db.add(
                CustomizationFact(
                    user_id=doc.user_id,
                    document_id=doc.id,
                    kind="business_fact",
                    category="company",
                    text=distilled.one_liner[:240],
                    numbers=[],
                    evidence_quote=distilled.one_liner[:240],
                    source_label=doc.title,
                    is_core=True,
                    content_hash=_sha256_str(distilled.one_liner),
                )
            )
        for pt in distilled.proof_points:
            kind_val = "documented_experience" if pt.is_claim_about_results else "business_fact"
            db.add(
                CustomizationFact(
                    user_id=doc.user_id,
                    document_id=doc.id,
                    kind=kind_val,
                    category=pt.category,
                    text=pt.fact[:240],
                    numbers=list(pt.numbers or []),
                    evidence_quote=pt.evidence_quote[:240],
                    source_label=doc.title,
                    is_core=False,
                    content_hash=_sha256_str(pt.fact),
                )
            )

    elif doc.kind == "previous_posts":
        split_items = split_previous_posts(text)
        for item in split_items:
            db.add(
                CustomizationPostSample(
                    user_id=doc.user_id,
                    document_id=doc.id,
                    ordinal=item.ordinal,
                    text=item.text,
                    char_count=item.char_count,
                    features=item.features,
                    quality_flag=item.quality_flag,
                    content_hash=item.content_hash,
                )
            )
        valid_texts = [s.text for s in split_items if s.quality_flag != "not_a_post"]
        distilled = distill_voice(valid_texts)
        doc.distilled = distilled.model_dump()
        doc.distiller_version = DISTILLER_VERSION_VOICE
        for exp in distilled.documented_experiences:
            exp_nums = list(getattr(exp, "numbers", None) or [])
            db.add(
                CustomizationFact(
                    user_id=doc.user_id,
                    document_id=doc.id,
                    kind="documented_experience",
                    category=exp.category,
                    text=exp.fact[:240],
                    numbers=exp_nums,
                    evidence_quote=exp.evidence_quote[:240],
                    source_label=doc.title,
                    is_core=False,
                    content_hash=_sha256_str(exp.fact),
                )
            )

    # 3. Embed
    doc.status = "embedding"
    doc.updated_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()

    embed_ok = _embed_pending_for_document(db, doc)
    doc.status = "ready" if doc.enabled else "disabled"
    doc.processed_at = datetime.datetime.now(datetime.timezone.utc)
    doc.updated_at = doc.processed_at
    db.commit()

    if not embed_ok:
        custom_repo.enqueue_job(db, user_id=doc.user_id, job_type="embed", document_id=doc.id, delay_seconds=60)

    custom_repo.enqueue_job(db, user_id=doc.user_id, job_type="compile", delay_seconds=5)


def _handle_embed(db: Session, job: CustomizationJob) -> None:
    if job.document_id:
        doc = (
            db.query(CustomizationDocument)
            .filter(CustomizationDocument.id == job.document_id, CustomizationDocument.user_id == job.user_id)
            .first()
        )
        if doc:
            _embed_pending_for_document(db, doc)
            custom_repo.enqueue_job(db, user_id=job.user_id, job_type="compile", delay_seconds=2)


def _handle_compile(db: Session, job: CustomizationJob) -> None:
    uid = job.user_id
    docs = (
        db.query(CustomizationDocument)
        .filter(CustomizationDocument.user_id == uid, CustomizationDocument.deleted_at.is_(None))
        .all()
    )
    samples = db.query(CustomizationPostSample).filter(CustomizationPostSample.user_id == uid).all()
    facts = db.query(CustomizationFact).filter(CustomizationFact.user_id == uid).all()
    settings_row = custom_repo.get_or_create_settings(db, uid)

    docs_dicts = [
        {
            "id": str(d.id),
            "kind": d.kind,
            "source_type": d.source_type,
            "title": d.title,
            "sha256": d.sha256,
            "distiller_version": d.distiller_version,
            "enabled": d.enabled,
            "status": d.status,
            "distilled": d.distilled,
            "created_at": d.created_at,
        }
        for d in docs
    ]
    samples_dicts = [
        {
            "id": str(s.id),
            "document_id": str(s.document_id),
            "text": s.text,
            "char_count": s.char_count,
            "features": s.features,
            "quality_flag": s.quality_flag,
            "pinned": s.pinned,
            "excluded": s.excluded,
            "embedding": list(s.embedding) if s.embedding is not None else None,
            "embedding_model": s.embedding_model,
        }
        for s in samples
    ]
    facts_dicts = [
        {
            "id": str(f.id),
            "kind": f.kind,
            "category": f.category,
            "text": f.text,
            "numbers": list(f.numbers or []),
            "source_label": f.source_label,
            "is_core": f.is_core,
            "removed": f.removed,
            "embedding": list(f.embedding) if f.embedding is not None else None,
            "embedding_model": f.embedding_model,
        }
        for f in facts
    ]
    settings_dict = {
        "custom_instructions": settings_row.custom_instructions,
        "default_playbook_mode": settings_row.default_playbook_mode,
        "use_previous_posts_for_voice": settings_row.use_previous_posts_for_voice,
        "business_mention": settings_row.business_mention,
        "overrides": settings_row.overrides or {},
    }

    fp = compute_input_fingerprint(docs_dicts, samples_dicts, facts_dicts, settings_dict)
    if settings_row.active_version_id:
        active_ver = (
            db.query(CustomizationVersion)
            .filter(CustomizationVersion.id == settings_row.active_version_id, CustomizationVersion.user_id == uid)
            .first()
        )
        if active_ver and active_ver.input_fingerprint == fp:
            return

    ctx, token_counts = compile_customization_context(
        docs=docs_dicts,
        samples=samples_dicts,
        facts=facts_dicts,
        settings_data=settings_dict,
        default_playbook_text=compile_default_playbook_rules(),
    )

    latest = (
        db.query(CustomizationVersion)
        .filter(CustomizationVersion.user_id == uid)
        .order_by(CustomizationVersion.version.desc())
        .first()
    )
    next_ver_num = (latest.version + 1) if latest else 1

    new_ver = CustomizationVersion(
        user_id=uid,
        version=next_ver_num,
        compiled=ctx.model_dump(),
        input_fingerprint=fp,
        compiler_version=COMPILER_VERSION,
        token_counts=token_counts,
        warnings=ctx.warnings,
    )
    db.add(new_ver)
    db.flush()

    ctx.version_id = str(new_ver.id)
    ctx.version = next_ver_num
    new_ver.compiled = ctx.model_dump()

    settings_row.active_version_id = new_ver.id
    settings_row.updated_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()

    invalidate_customization_context_cache(uid)


def _handle_purge(db: Session, job: CustomizationJob) -> None:
    if not job.document_id:
        return
    doc = (
        db.query(CustomizationDocument)
        .filter(CustomizationDocument.id == job.document_id, CustomizationDocument.user_id == job.user_id)
        .first()
    )
    if doc is None:
        return
    if doc.storage_key:
        try:
            get_storage_backend().delete(doc.storage_key)
        except Exception as exc:
            logger.warning(f"Purge storage delete failed for {doc.storage_key}: {exc}")
    db.delete(doc)
    db.commit()


def process_next_job(db: Optional[Session] = None) -> bool:
    """Claim and process one queued customization job. Returns True if a job was claimed."""
    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    try:
        now = datetime.datetime.now(datetime.timezone.utc)
        job = (
            db.query(CustomizationJob)
            .filter(CustomizationJob.status == "queued", CustomizationJob.run_after <= now)
            .order_by(CustomizationJob.created_at.asc())
            .with_for_update(skip_locked=True)
            .first()
        )
        if job is None:
            return False

        job.status = "running"
        job.locked_at = now
        job.boot_id = settings.BOOT_ID
        job.attempts = (job.attempts or 0) + 1
        db.commit()

        try:
            if job.job_type == "extract_distill":
                _handle_extract_distill(db, job)
            elif job.job_type == "embed":
                _handle_embed(db, job)
            elif job.job_type == "compile":
                _handle_compile(db, job)
            elif job.job_type == "purge":
                _handle_purge(db, job)

            job.status = "done"
            job.finished_at = datetime.datetime.now(datetime.timezone.utc)
            db.commit()
            return True
        except ValidationError as exc:
            db.rollback()
            job = db.query(CustomizationJob).filter(CustomizationJob.id == job.id).first()
            if job:
                job.status = "dead" if exc.code in _PERMANENT_ERROR_CODES else "failed"
                job.last_error = f"{exc.code}: {exc.message}"
                job.finished_at = datetime.datetime.now(datetime.timezone.utc)
            if job and job.document_id:
                doc = db.query(CustomizationDocument).filter(CustomizationDocument.id == job.document_id).first()
                if doc:
                    doc.status = "failed"
                    doc.error_code = exc.code
                    doc.error_detail = exc.message[:300]
            db.commit()
            return True
        except Exception as exc:
            db.rollback()
            logger.exception(f"Customization job {job.id} ({job.job_type}) failed: {exc}")
            job = db.query(CustomizationJob).filter(CustomizationJob.id == job.id).first()
            if job:
                if job.attempts < job.max_attempts:
                    backoff = [10, 60, 300][min(2, job.attempts - 1)]
                    job.status = "queued"
                    job.run_after = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=backoff)
                else:
                    job.status = "dead"
                    job.finished_at = datetime.datetime.now(datetime.timezone.utc)
                    if job.document_id:
                        doc = db.query(CustomizationDocument).filter(CustomizationDocument.id == job.document_id).first()
                        if doc:
                            doc.status = "failed"
                            doc.error_code = "distill_failed"
                            doc.error_detail = "Processing failed after retries. Please try again."
                job.last_error = str(exc)[:500]
                db.commit()
            return True
    finally:
        if should_close:
            db.close()


def reap_stale_customization_jobs(db: Optional[Session] = None) -> int:
    """Reset stale running jobs (> 5 min) or foreign boot_id jobs back to queued or dead."""
    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True
    try:
        cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=5)
        stale = (
            db.query(CustomizationJob)
            .filter(
                CustomizationJob.status == "running",
                (CustomizationJob.locked_at < cutoff) | (CustomizationJob.boot_id != settings.BOOT_ID),
            )
            .all()
        )
        for job in stale:
            if job.attempts >= job.max_attempts:
                job.status = "dead"
                job.last_error = "Timed out or interrupted"
            else:
                job.status = "queued"
                job.run_after = datetime.datetime.now(datetime.timezone.utc)
        if stale:
            db.commit()
        return len(stale)
    finally:
        if should_close:
            db.close()


async def _customization_worker_loop() -> None:
    logger.info("AutoPulse customization worker loop started")
    while True:
        try:
            did_work = await asyncio.to_thread(process_next_job)
            await asyncio.sleep(2 if did_work else 15)
        except asyncio.CancelledError:
            logger.info("AutoPulse customization worker loop cancelled")
            break
        except Exception as exc:
            logger.error(f"Error in customization worker loop: {exc}", exc_info=True)
            await asyncio.sleep(15)


def start_customization_worker() -> None:
    if (
        os.getenv("PYTEST_CURRENT_TEST") is not None
        or "pytest" in os.getenv("_", "")
        or not settings.CUSTOMIZATION_WORKER_ENABLED
    ):
        return
    asyncio.create_task(_customization_worker_loop())
