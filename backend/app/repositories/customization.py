"""Repository layer for customization documents, samples, facts, settings, versions, and jobs.
Every query is strictly scoped by user_id.
"""

import datetime
import hashlib
import uuid
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, text as sa_text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.customization import (
    CustomizationDocument,
    CustomizationFact,
    CustomizationJob,
    CustomizationPostSample,
    CustomizationSettings,
    CustomizationVersion,
)
from app.schemas.customization import (
    CustomizationOverview,
    CustomizationSettingsView,
    DocumentDetail,
    DocumentSummary,
    FactView,
    PostSampleView,
    QuotaUsage,
    VersionSummary,
)
from app.services.customization.validation import (
    QUOTA_BUSINESS_DOCS,
    QUOTA_BUSINESS_URLS,
    QUOTA_PLAYBOOKS,
    QUOTA_PREVIOUS_POSTS_DOCS,
    QUOTA_TOTAL_BYTES,
    QUOTA_TOTAL_SAMPLES,
    ValidationError,
)


def compute_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def get_or_create_settings(db: Session, user_id: str) -> CustomizationSettings:
    row = (
        db.query(CustomizationSettings)
        .filter(CustomizationSettings.user_id == user_id)
        .first()
    )
    if row is None:
        row = CustomizationSettings(user_id=user_id)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def has_pending_compile(db: Session, user_id: str) -> bool:
    return (
        db.query(CustomizationJob.id)
        .filter(
            CustomizationJob.user_id == user_id,
            CustomizationJob.job_type == "compile",
            CustomizationJob.status.in_(["queued", "running"]),
        )
        .first()
        is not None
    )


def enqueue_job(
    db: Session,
    user_id: str,
    job_type: str,
    document_id: Optional[uuid.UUID] = None,
    delay_seconds: int = 0,
) -> Optional[CustomizationJob]:
    """Enqueue a customization background job. Compile jobs are coalesced via partial unique index."""
    run_after = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
        seconds=max(0, delay_seconds)
    )
    if job_type == "compile":
        stmt = (
            pg_insert(CustomizationJob)
            .values(
                user_id=user_id,
                job_type="compile",
                document_id=None,
                status="queued",
                run_after=run_after,
            )
            .on_conflict_do_update(
                index_elements=["user_id", "job_type"],
                index_where=sa_text("job_type = 'compile' AND status = 'queued'"),
                set_={"run_after": run_after},
            )
        )
        db.execute(stmt)
        db.commit()
        return (
            db.query(CustomizationJob)
            .filter(
                CustomizationJob.user_id == user_id,
                CustomizationJob.job_type == "compile",
                CustomizationJob.status == "queued",
            )
            .first()
        )

    job = CustomizationJob(
        user_id=user_id,
        job_type=job_type,
        document_id=document_id,
        status="queued",
        run_after=run_after,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_quota_usage(db: Session, user_id: str) -> QuotaUsage:
    active_docs = (
        db.query(CustomizationDocument)
        .filter(
            CustomizationDocument.user_id == user_id,
            CustomizationDocument.deleted_at.is_(None),
            CustomizationDocument.status != "deleted",
        )
        .all()
    )
    playbooks = sum(1 for d in active_docs if d.kind == "playbook")
    business_docs = sum(1 for d in active_docs if d.kind == "business" and d.source_type != "url")
    business_urls = sum(1 for d in active_docs if d.kind == "business" and d.source_type == "url")
    prev_docs = sum(1 for d in active_docs if d.kind == "previous_posts")
    total_bytes = sum(int(d.size_bytes or 0) for d in active_docs)

    samples_used = (
        db.query(func.count(CustomizationPostSample.id))
        .filter(CustomizationPostSample.user_id == user_id)
        .scalar()
        or 0
    )

    return QuotaUsage(
        playbooks_used=playbooks,
        playbooks_max=QUOTA_PLAYBOOKS,
        business_docs_used=business_docs,
        business_docs_max=QUOTA_BUSINESS_DOCS,
        business_urls_used=business_urls,
        business_urls_max=QUOTA_BUSINESS_URLS,
        previous_posts_docs_used=prev_docs,
        previous_posts_docs_max=QUOTA_PREVIOUS_POSTS_DOCS,
        samples_used=int(samples_used),
        samples_max=QUOTA_TOTAL_SAMPLES,
        storage_bytes_used=total_bytes,
        storage_bytes_max=QUOTA_TOTAL_BYTES,
    )


def enforce_quota(
    db: Session,
    user_id: str,
    kind: str,
    source_type: str,
    incoming_bytes: int = 0,
) -> None:
    q = get_quota_usage(db, user_id)
    if kind == "playbook" and q.playbooks_used >= q.playbooks_max:
        raise ValidationError("quota_exceeded", f"Maximum {q.playbooks_max} playbooks reached.", 409)
    if kind == "business" and source_type == "url" and q.business_urls_used >= q.business_urls_max:
        raise ValidationError("quota_exceeded", f"Maximum {q.business_urls_max} business URLs reached.", 409)
    if kind == "business" and source_type != "url" and q.business_docs_used >= q.business_docs_max:
        raise ValidationError("quota_exceeded", f"Maximum {q.business_docs_max} business documents reached.", 409)
    if kind == "previous_posts" and q.previous_posts_docs_used >= q.previous_posts_docs_max:
        raise ValidationError(
            "quota_exceeded", f"Maximum {q.previous_posts_docs_max} previous-post documents reached.", 409
        )
    if (q.storage_bytes_used + incoming_bytes) > q.storage_bytes_max:
        raise ValidationError("quota_exceeded", "Total customization storage quota (100 MB) exceeded.", 409)


def find_duplicate_by_sha256(
    db: Session, user_id: str, kind: str, sha256: str
) -> Optional[CustomizationDocument]:
    return (
        db.query(CustomizationDocument)
        .filter(
            CustomizationDocument.user_id == user_id,
            CustomizationDocument.kind == kind,
            CustomizationDocument.sha256 == sha256,
            CustomizationDocument.deleted_at.is_(None),
        )
        .first()
    )


def find_duplicate_by_url(
    db: Session, user_id: str, kind: str, source_url: str
) -> Optional[CustomizationDocument]:
    return (
        db.query(CustomizationDocument)
        .filter(
            CustomizationDocument.user_id == user_id,
            CustomizationDocument.kind == kind,
            CustomizationDocument.source_url == source_url,
            CustomizationDocument.deleted_at.is_(None),
        )
        .first()
    )


_ERROR_CODE_FRIENDLY: Dict[str, str] = {
    "distill_failed": "We could not extract rules or voice from this file. Try retrying or uploading a cleaner copy.",
    "unsupported_type": "This file type is not supported. Upload a PDF, DOCX, Markdown, or TXT file.",
    "encrypted_pdf": "This PDF is password-protected. Please export an unlocked copy and try again.",
    "no_text_layer": "This PDF looks like a scanned image without selectable text.",
    "empty_document": "No readable text was found in this document.",
    "too_many_pages": "This PDF exceeds the maximum allowed page count.",
    "zip_bomb": "This file could not be safely unpacked.",
    "macro_document": "Documents with macros are blocked for safety.",
    "decode_failed": "Could not decode text in this file. Save as UTF-8 and try again.",
    "url_blocked": "That URL could not be accessed for security reasons.",
    "url_robots_disallowed": "That website does not allow automated reading.",
    "url_unreachable": "Could not reach that URL. Check the link and try again.",
    "url_unsupported_content": "That URL does not point to a readable web page or PDF.",
}


def _compute_stage_info(
    doc: CustomizationDocument, latest_job: Optional[CustomizationJob] = None
) -> Dict[str, Any]:
    st = doc.status
    if st == "uploaded":
        return {"stage_name": "Queued", "stage_index": 1, "friendly_status": "Queued", "friendly_error": None}
    if st == "extracting":
        return {"stage_name": "Reading file", "stage_index": 2, "friendly_status": "Reading file", "friendly_error": None}
    if st == "distilling":
        return {"stage_name": "Learning from it", "stage_index": 3, "friendly_status": "Learning from it", "friendly_error": None}
    if st == "embedding":
        return {"stage_name": "Applying", "stage_index": 4, "friendly_status": "Applying", "friendly_error": None}
    if st == "ready":
        return {"stage_name": "Active", "stage_index": 4, "friendly_status": "Active", "friendly_error": None}
    if st == "disabled":
        return {"stage_name": "Paused", "stage_index": 4, "friendly_status": "Paused", "friendly_error": None}
    if st == "failed":
        idx = 1
        if doc.extracted_text:
            idx = 3 if doc.distilled is None else 4
        elif latest_job and latest_job.job_type == "extract_distill":
            idx = 2
        code = doc.error_code or ""
        friendly_err = _ERROR_CODE_FRIENDLY.get(
            code,
            "Processing failed. Try retrying or uploading a different version.",
        )
        return {
            "stage_name": "Failed",
            "stage_index": idx,
            "friendly_status": "Failed",
            "friendly_error": friendly_err,
        }
    return {"stage_name": st, "stage_index": 1, "friendly_status": st, "friendly_error": None}


def to_document_summary(
    doc: CustomizationDocument,
    duplicate: bool = False,
    latest_job: Optional[CustomizationJob] = None,
) -> DocumentSummary:
    stage = _compute_stage_info(doc, latest_job=latest_job)
    return DocumentSummary(
        id=str(doc.id),
        kind=doc.kind,  # type: ignore[arg-type]
        source_type=doc.source_type,  # type: ignore[arg-type]
        title=doc.title,
        original_filename=doc.original_filename,
        mime_type=doc.mime_type,
        size_bytes=doc.size_bytes,
        source_url=doc.source_url,
        status=doc.status,  # type: ignore[arg-type]
        stage_name=stage["stage_name"],
        stage_index=stage["stage_index"],
        stage_total=4,
        friendly_status=stage["friendly_status"],
        friendly_error=stage["friendly_error"],
        error_code=doc.error_code,
        error_detail=doc.error_detail or (latest_job.last_error if latest_job and doc.status == "failed" else None),
        needs_embedding=doc.needs_embedding,
        page_count=doc.page_count,
        char_count=doc.char_count,
        token_estimate=doc.token_estimate,
        enabled=doc.enabled,
        duplicate=duplicate,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        processed_at=doc.processed_at,
    )


def list_documents(
    db: Session, user_id: str, kind: Optional[str] = None
) -> List[CustomizationDocument]:
    q = db.query(CustomizationDocument).filter(
        CustomizationDocument.user_id == user_id,
        CustomizationDocument.deleted_at.is_(None),
        CustomizationDocument.status != "deleted",
    )
    if kind:
        q = q.filter(CustomizationDocument.kind == kind)
    return q.order_by(CustomizationDocument.created_at.desc()).all()


def get_document(
    db: Session, user_id: str, doc_id: uuid.UUID
) -> Optional[CustomizationDocument]:
    return (
        db.query(CustomizationDocument)
        .filter(
            CustomizationDocument.id == doc_id,
            CustomizationDocument.user_id == user_id,
            CustomizationDocument.deleted_at.is_(None),
        )
        .first()
    )


def get_document_detail(
    db: Session, user_id: str, doc_id: uuid.UUID
) -> Optional[DocumentDetail]:
    doc = get_document(db, user_id, doc_id)
    if not doc:
        return None
    samples = (
        db.query(CustomizationPostSample)
        .filter(
            CustomizationPostSample.user_id == user_id,
            CustomizationPostSample.document_id == doc.id,
        )
        .order_by(CustomizationPostSample.ordinal.asc())
        .all()
    )
    facts = (
        db.query(CustomizationFact)
        .filter(
            CustomizationFact.user_id == user_id,
            CustomizationFact.document_id == doc.id,
        )
        .order_by(CustomizationFact.created_at.asc())
        .all()
    )
    base = to_document_summary(doc)
    return DocumentDetail(
        **base.model_dump(),
        text_preview=(doc.extracted_text[:5000] if doc.extracted_text else None),
        distilled=doc.distilled,
        samples=[
            PostSampleView(
                id=str(s.id),
                document_id=str(s.document_id),
                ordinal=s.ordinal,
                text=s.text,
                char_count=s.char_count,
                features=s.features or {},
                quality_flag=s.quality_flag,
                pinned=s.pinned,
                excluded=s.excluded,
            )
            for s in samples
        ],
        facts=[
            FactView(
                id=str(f.id),
                document_id=str(f.document_id),
                kind=f.kind,
                category=f.category,
                text=f.text,
                numbers=list(f.numbers or []),
                source_label=f.source_label,
                is_core=f.is_core,
                removed=f.removed,
            )
            for f in facts
        ],
    )


def get_overview(db: Session, user_id: str) -> CustomizationOverview:
    docs = list_documents(db, user_id)
    counts_by_kind: Dict[str, int] = {"playbook": 0, "business": 0, "previous_posts": 0}
    status_counts: Dict[str, int] = {}
    for d in docs:
        counts_by_kind[d.kind] = counts_by_kind.get(d.kind, 0) + 1
        status_counts[d.status] = status_counts.get(d.status, 0) + 1

    settings_row = get_or_create_settings(db, user_id)
    compile_pending = has_pending_compile(db, user_id)
    active_version_num: Optional[int] = None
    if settings_row.active_version_id:
        ver = (
            db.query(CustomizationVersion)
            .filter(
                CustomizationVersion.id == settings_row.active_version_id,
                CustomizationVersion.user_id == user_id,
            )
            .first()
        )
        if ver:
            active_version_num = ver.version

    detected = (settings_row.overrides or {}).get("instruction_constraints") or []

    return CustomizationOverview(
        counts_by_kind=counts_by_kind,
        status_counts=status_counts,
        settings=CustomizationSettingsView(
            custom_instructions=settings_row.custom_instructions,
            default_playbook_mode=settings_row.default_playbook_mode,  # type: ignore[arg-type]
            use_previous_posts_for_voice=settings_row.use_previous_posts_for_voice,
            business_mention=settings_row.business_mention,  # type: ignore[arg-type]
            active_version_id=str(settings_row.active_version_id) if settings_row.active_version_id else None,
            compile_pending=compile_pending,
            detected_constraints=detected,
        ),
        active_version=active_version_num,
        active_version_id=str(settings_row.active_version_id) if settings_row.active_version_id else None,
        compile_pending=compile_pending,
        quota=get_quota_usage(db, user_id),
    )


def list_versions(db: Session, user_id: str, limit: int = 20) -> List[VersionSummary]:
    settings_row = get_or_create_settings(db, user_id)
    rows = (
        db.query(CustomizationVersion)
        .filter(CustomizationVersion.user_id == user_id)
        .order_by(CustomizationVersion.version.desc())
        .limit(limit)
        .all()
    )
    return [
        VersionSummary(
            id=str(v.id),
            version=v.version,
            compiler_version=v.compiler_version,
            token_counts=v.token_counts or {},
            warnings=list(v.warnings or []),
            is_active=(settings_row.active_version_id == v.id),
            created_at=v.created_at,
        )
        for v in rows
    ]
