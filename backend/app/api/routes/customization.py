"""FastAPI routes for the AutoPulse customization module."""

import datetime
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.routes.account import is_user_deletion_pending
from app.core.auth import User, current_user
from app.core.config import settings
from app.core.limiter import enforce_rate_limit
from app.db.session import get_db, get_readonly_db
from app.models.customization import (
    CustomizationDocument,
    CustomizationFact,
    CustomizationJob,
    CustomizationPostSample,
    CustomizationVersion,
)
from app.repositories import customization as custom_repo
from app.schemas.customization import (
    CustomizationOverview,
    CustomizationSettingsUpdate,
    CustomizationSettingsView,
    DocumentDetail,
    DocumentKind,
    DocumentPatchRequest,
    DocumentSummary,
    DownloadUrlResponse,
    OverridesPatchRequest,
    PasteDocumentRequest,
    PostSampleView,
    SamplePatchRequest,
    UrlAddRequest,
    VersionSummary,
)
from app.services.customization.policy import EffectivePolicy, clamp_policy
from app.services.customization.validation import (
    ValidationError,
    detect_and_validate_file,
    max_upload_bytes,
    normalize_and_validate_url,
    sanitize_filename,
)
from app.services.storage import get_storage_backend

router = APIRouter(prefix="/customization", tags=["customization"])


def require_customization_enabled(user: User = Depends(current_user)) -> User:
    if not settings.is_customization_enabled_for(user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Customization module is not enabled."},
        )
    if is_user_deletion_pending(user.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "account_deleting", "message": "Account deletion is in progress."},
        )
    return user


def _parse_uuid(raw: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Resource not found."},
        ) from exc


@router.get("", response_model=CustomizationOverview)
def get_customization_overview(
    user: User = Depends(require_customization_enabled),
    db: Session = Depends(get_readonly_db),
) -> CustomizationOverview:
    return custom_repo.get_overview(db, user.id)


@router.get("/documents", response_model=List[DocumentSummary])
def list_customization_documents(
    kind: Optional[DocumentKind] = Query(default=None),
    user: User = Depends(require_customization_enabled),
    db: Session = Depends(get_readonly_db),
) -> List[DocumentSummary]:
    docs = custom_repo.list_documents(db, user.id, kind=kind)
    doc_ids = [d.id for d in docs]
    latest_jobs: Dict[uuid.UUID, CustomizationJob] = {}
    if doc_ids:
        jobs = (
            db.query(CustomizationJob)
            .filter(
                CustomizationJob.user_id == user.id,
                CustomizationJob.document_id.in_(doc_ids),
            )
            .order_by(CustomizationJob.created_at.desc())
            .all()
        )
        for j in jobs:
            if j.document_id and j.document_id not in latest_jobs:
                latest_jobs[j.document_id] = j
    return [custom_repo.to_document_summary(d, latest_job=latest_jobs.get(d.id)) for d in docs]


@router.post("/documents", response_model=DocumentSummary, status_code=status.HTTP_202_ACCEPTED)
async def upload_customization_document(
    response: Response,
    file: UploadFile = File(...),
    kind: DocumentKind = Form(...),
    title: Optional[str] = Form(default=None),
    user: User = Depends(require_customization_enabled),
    db: Session = Depends(get_db),
) -> DocumentSummary:
    enforce_rate_limit(
        f"custom_upload:{user.id}",
        max_requests=30,
        window_seconds=3600,
        error_message="Upload limit reached (30/hour). Please try again later.",
    )

    # Check count quota before reading upload stream
    try:
        custom_repo.enforce_quota(db, user.id, kind=kind, source_type="upload", incoming_bytes=0)
    except ValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.message})

    limit = max_upload_bytes()
    chunks: List[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 256)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail={
                    "code": "file_too_large",
                    "message": f"File exceeds the {settings.CUSTOMIZATION_MAX_FILE_MB} MB limit.",
                },
            )
        chunks.append(chunk)
    raw_bytes = b"".join(chunks)

    try:
        custom_repo.enforce_quota(db, user.id, kind=kind, source_type="upload", incoming_bytes=len(raw_bytes))
        detected_mime, decoded_text = detect_and_validate_file(raw_bytes, filename=file.filename)
    except ValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.message})

    sha = custom_repo.compute_sha256(raw_bytes)
    existing = custom_repo.find_duplicate_by_sha256(db, user.id, kind=kind, sha256=sha)
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return custom_repo.to_document_summary(existing, duplicate=True)

    doc_id = uuid.uuid4()
    clean_name = sanitize_filename(file.filename, fallback="document")
    clean_title = (title or clean_name).strip()[:120] or clean_name
    storage_key = f"customization/{user.id}/{doc_id}/original"

    storage = get_storage_backend()
    storage.put(storage_key, raw_bytes, content_type=detected_mime)

    doc = CustomizationDocument(
        id=doc_id,
        user_id=user.id,
        kind=kind,
        source_type="upload",
        title=clean_title,
        original_filename=clean_name,
        mime_type=detected_mime,
        size_bytes=len(raw_bytes),
        sha256=sha,
        storage_key=storage_key,
        status="uploaded",
        extracted_text=decoded_text[:200000] if decoded_text else None,
        char_count=len(decoded_text) if decoded_text else None,
        token_estimate=max(1, len(decoded_text) // 4) if decoded_text else None,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    custom_repo.enqueue_job(db, user_id=user.id, job_type="extract_distill", document_id=doc.id)
    return custom_repo.to_document_summary(doc)


@router.post("/documents/paste", response_model=DocumentSummary, status_code=status.HTTP_202_ACCEPTED)
def paste_customization_document(
    payload: PasteDocumentRequest,
    response: Response,
    user: User = Depends(require_customization_enabled),
    db: Session = Depends(get_db),
) -> DocumentSummary:
    enforce_rate_limit(f"custom_upload:{user.id}", max_requests=30, window_seconds=3600)
    raw_bytes = payload.text.strip().encode("utf-8")
    try:
        custom_repo.enforce_quota(
            db, user.id, kind=payload.kind, source_type="paste", incoming_bytes=len(raw_bytes)
        )
    except ValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.message})

    sha = custom_repo.compute_sha256(raw_bytes)
    existing = custom_repo.find_duplicate_by_sha256(db, user.id, kind=payload.kind, sha256=sha)
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return custom_repo.to_document_summary(existing, duplicate=True)

    text_clean = payload.text.strip()
    doc = CustomizationDocument(
        user_id=user.id,
        kind=payload.kind,
        source_type="paste",
        title=payload.title.strip()[:120],
        mime_type="text/plain",
        size_bytes=len(raw_bytes),
        sha256=sha,
        status="uploaded",
        extracted_text=text_clean,
        char_count=len(text_clean),
        token_estimate=max(1, len(text_clean) // 4),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    custom_repo.enqueue_job(db, user_id=user.id, job_type="extract_distill", document_id=doc.id)
    return custom_repo.to_document_summary(doc)


@router.post("/urls", response_model=DocumentSummary, status_code=status.HTTP_202_ACCEPTED)
def add_business_url(
    payload: UrlAddRequest,
    response: Response,
    user: User = Depends(require_customization_enabled),
    db: Session = Depends(get_db),
) -> DocumentSummary:
    enforce_rate_limit(
        f"custom_url:{user.id}",
        max_requests=10,
        window_seconds=3600,
        error_message="URL add limit reached (10/hour). Please try again later.",
    )
    try:
        custom_repo.enforce_quota(db, user.id, kind="business", source_type="url", incoming_bytes=0)
        normalized_url = normalize_and_validate_url(payload.url)
    except ValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.message})

    existing = custom_repo.find_duplicate_by_url(db, user.id, kind="business", source_url=normalized_url)
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return custom_repo.to_document_summary(existing, duplicate=True)

    from urllib.parse import urlparse

    host = urlparse(normalized_url).netloc
    doc = CustomizationDocument(
        user_id=user.id,
        kind="business",
        source_type="url",
        title=(payload.title or host).strip()[:120],
        source_url=normalized_url,
        status="uploaded",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    custom_repo.enqueue_job(db, user_id=user.id, job_type="extract_distill", document_id=doc.id)
    return custom_repo.to_document_summary(doc)


@router.get("/documents/{doc_id}", response_model=DocumentDetail)
def get_customization_document(
    doc_id: str,
    user: User = Depends(require_customization_enabled),
    db: Session = Depends(get_readonly_db),
) -> DocumentDetail:
    detail = custom_repo.get_document_detail(db, user.id, _parse_uuid(doc_id))
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Document not found."},
        )
    return detail


@router.patch("/documents/{doc_id}", response_model=DocumentSummary)
def patch_customization_document(
    doc_id: str,
    payload: DocumentPatchRequest,
    user: User = Depends(require_customization_enabled),
    db: Session = Depends(get_db),
) -> DocumentSummary:
    doc = custom_repo.get_document(db, user.id, _parse_uuid(doc_id))
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Document not found."},
        )
    if payload.title is not None:
        doc.title = payload.title.strip()[:120]
    if payload.enabled is not None:
        doc.enabled = payload.enabled
        if not payload.enabled and doc.status == "ready":
            doc.status = "disabled"
        elif payload.enabled and doc.status == "disabled":
            doc.status = "ready"
    doc.updated_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    db.refresh(doc)

    custom_repo.enqueue_job(db, user_id=user.id, job_type="compile", delay_seconds=2)
    return custom_repo.to_document_summary(doc)


@router.post("/documents/{doc_id}/reprocess", response_model=DocumentSummary, status_code=status.HTTP_202_ACCEPTED)
def reprocess_customization_document(
    doc_id: str,
    user: User = Depends(require_customization_enabled),
    db: Session = Depends(get_db),
) -> DocumentSummary:
    doc = custom_repo.get_document(db, user.id, _parse_uuid(doc_id))
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Document not found."},
        )
    if doc.status not in {"failed", "ready", "disabled"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "invalid_state", "message": "Document is currently processing."},
        )
    doc.status = "uploaded"
    doc.error_code = None
    doc.error_detail = None
    doc.attempts = 0
    doc.updated_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    db.refresh(doc)

    custom_repo.enqueue_job(db, user_id=user.id, job_type="extract_distill", document_id=doc.id)
    return custom_repo.to_document_summary(doc)


@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customization_document(
    doc_id: str,
    user: User = Depends(require_customization_enabled),
    db: Session = Depends(get_db),
) -> Response:
    doc = custom_repo.get_document(db, user.id, _parse_uuid(doc_id))
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Document not found."},
        )
    now = datetime.datetime.now(datetime.timezone.utc)
    doc.deleted_at = now
    doc.status = "deleted"
    doc.enabled = False
    doc.updated_at = now
    db.commit()

    custom_repo.enqueue_job(db, user_id=user.id, job_type="purge", document_id=doc.id)
    custom_repo.enqueue_job(db, user_id=user.id, job_type="compile", delay_seconds=2)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/documents/{doc_id}/download", response_model=DownloadUrlResponse)
def download_customization_document(
    doc_id: str,
    user: User = Depends(require_customization_enabled),
    db: Session = Depends(get_readonly_db),
) -> DownloadUrlResponse:
    doc = custom_repo.get_document(db, user.id, _parse_uuid(doc_id))
    if doc is None or not doc.storage_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Original file not found."},
        )
    storage = get_storage_backend()
    url = storage.presigned_get(
        doc.storage_key, expires_in=300, filename=doc.original_filename or doc.title
    )
    if url is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "download_unavailable", "message": "Presigned downloads require S3 storage."},
        )
    return DownloadUrlResponse(
        url=url,
        expires_at=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=300),
    )


@router.patch("/samples/{sample_id}", response_model=PostSampleView)
def patch_post_sample(
    sample_id: str,
    payload: SamplePatchRequest,
    user: User = Depends(require_customization_enabled),
    db: Session = Depends(get_db),
) -> PostSampleView:
    sample = (
        db.query(CustomizationPostSample)
        .filter(
            CustomizationPostSample.id == _parse_uuid(sample_id),
            CustomizationPostSample.user_id == user.id,
        )
        .first()
    )
    if sample is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Sample not found."},
        )
    if payload.pinned is not None:
        sample.pinned = payload.pinned
    if payload.excluded is not None:
        sample.excluded = payload.excluded
    db.commit()
    db.refresh(sample)

    custom_repo.enqueue_job(db, user_id=user.id, job_type="compile", delay_seconds=2)
    return PostSampleView(
        id=str(sample.id),
        document_id=str(sample.document_id),
        ordinal=sample.ordinal,
        text=sample.text,
        char_count=sample.char_count,
        features=sample.features or {},
        quality_flag=sample.quality_flag,
        pinned=sample.pinned,
        excluded=sample.excluded,
    )


@router.get("/settings", response_model=CustomizationSettingsView)
def get_customization_settings(
    user: User = Depends(require_customization_enabled),
    db: Session = Depends(get_readonly_db),
) -> CustomizationSettingsView:
    row = custom_repo.get_or_create_settings(db, user.id)
    return CustomizationSettingsView(
        custom_instructions=row.custom_instructions,
        default_playbook_mode=row.default_playbook_mode,  # type: ignore[arg-type]
        use_previous_posts_for_voice=row.use_previous_posts_for_voice,
        business_mention=row.business_mention,  # type: ignore[arg-type]
        active_version_id=str(row.active_version_id) if row.active_version_id else None,
        compile_pending=custom_repo.has_pending_compile(db, user.id),
        detected_constraints=(row.overrides or {}).get("instruction_constraints") or [],
    )


@router.put("/settings", response_model=CustomizationSettingsView)
def update_customization_settings(
    payload: CustomizationSettingsUpdate,
    user: User = Depends(require_customization_enabled),
    db: Session = Depends(get_db),
) -> CustomizationSettingsView:
    row = custom_repo.get_or_create_settings(db, user.id)
    if payload.custom_instructions is not None:
        row.custom_instructions = payload.custom_instructions.strip() or None
        # Synchronous instruction constraint extraction (P3 service; safe fallback if not ready)
        try:
            from app.services.customization.distillers import distill_instructions

            detected = distill_instructions(row.custom_instructions or "")
            overrides = dict(row.overrides or {})
            overrides["instruction_constraints"] = [c.model_dump() for c in detected.constraints]
            overrides["instruction_topics_include"] = detected.topics_include
            overrides["instruction_topics_avoid"] = detected.topics_avoid
            row.overrides = overrides
        except Exception:
            pass
    if payload.default_playbook_mode is not None:
        row.default_playbook_mode = payload.default_playbook_mode
    if payload.use_previous_posts_for_voice is not None:
        row.use_previous_posts_for_voice = payload.use_previous_posts_for_voice
    if payload.business_mention is not None:
        row.business_mention = payload.business_mention

    row.updated_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    db.refresh(row)

    custom_repo.enqueue_job(db, user_id=user.id, job_type="compile", delay_seconds=1)
    return CustomizationSettingsView(
        custom_instructions=row.custom_instructions,
        default_playbook_mode=row.default_playbook_mode,  # type: ignore[arg-type]
        use_previous_posts_for_voice=row.use_previous_posts_for_voice,
        business_mention=row.business_mention,  # type: ignore[arg-type]
        active_version_id=str(row.active_version_id) if row.active_version_id else None,
        compile_pending=custom_repo.has_pending_compile(db, user.id),
        detected_constraints=(row.overrides or {}).get("instruction_constraints") or [],
    )


def _build_policy_items(
    db: Session,
    user_id: str,
    compiled: Dict[str, Any],
    post_type: str = "all",
) -> List[Dict[str, Any]]:
    policy = compiled.get("policy") or EffectivePolicy().model_dump()
    provenance = policy.get("provenance") or {}
    sources_map = {s.get("id"): s.get("title") for s in (compiled.get("sources") or []) if s.get("id")}
    docs = custom_repo.list_documents(db, user_id, kind="playbook")
    doc_by_prefix = {str(d.id).replace("-", "")[:3].upper(): d.title for d in docs}
    playbook_facts = (
        db.query(CustomizationFact)
        .filter(
            CustomizationFact.user_id == user_id,
            CustomizationFact.kind == "playbook_rule",
            CustomizationFact.removed.is_(False),
        )
        .all()
    )

    def _source_meta(prov_key: str, keyword_hints: List[str]) -> Dict[str, Any]:
        raw = str(provenance.get(prov_key) or "default")
        if raw in ("custom_instructions", "instructions", "override"):
            return {"source_type": "custom_instructions", "document_name": "Your instructions", "evidence_quote": None}
        if raw.startswith("playbook:"):
            parts = raw.split(":", 1)[1].split("-")
            prefix = parts[0][1:] if parts and parts[0].startswith("U") else ""
            doc_name = doc_by_prefix.get(prefix) or next(iter(sources_map.values()), "Playbook")
            quote = None
            for f in playbook_facts:
                txt = (f.text or "").lower()
                if any(k in txt for k in keyword_hints):
                    quote = f.evidence_quote
                    doc_name = f.source_label or doc_name
                    break
            return {"source_type": "playbook", "document_name": doc_name, "evidence_quote": quote}
        return {"source_type": "default", "document_name": "Default", "evidence_quote": None}

    # Resolve length for selected post_type
    lmin = policy.get("length_min", 850)
    lmax = policy.get("length_max", 1200)
    length_prov = "length_max"
    if post_type == "hot_take" and isinstance(policy.get("length_by_post_type"), dict) and "hot_take" in policy["length_by_post_type"]:
        ht = policy["length_by_post_type"]["hot_take"]
        lmin = ht.get("min", lmin)
        lmax = ht.get("max", lmax)
        length_prov = "length_by_post_type"

    # Hashtags
    if not policy.get("hashtags_in_body", True):
        fc_max = policy.get("first_comment_hashtags_max", 3)
        hashtag_val = f"First comment only, max {fc_max}" if fc_max > 0 else "None"
    elif policy.get("hashtags_max", 3) == 0:
        hashtag_val = "None"
    else:
        hashtag_val = f"{policy.get('hashtags_min', 1)} to {policy.get('hashtags_max', 3)} in body"

    # Emojis
    emoji_map = {
        "none": "None",
        "sparse": "Sparse (up to 3)",
        "allowed": "Allowed",
        "many": "Frequent",
    }
    emoji_val = emoji_map.get(str(policy.get("emoji_policy", "none")), "None")

    # Question ending
    q_end = policy.get("question_ending", "allowed")
    if post_type == "technical_explainer" and provenance.get("question_ending") != "custom_instructions":
        q_end = "required"
    q_end_map = {"required": "Required", "forbidden": "Not allowed", "allowed": "Optional"}

    # Hook style
    if policy.get("require_number_hook"):
        hook_val = "Must start with a number"
    elif policy.get("no_question_hooks"):
        hook_val = "No question hooks"
    else:
        hook_val = "Varied (no repeats)"

    items = [
        {"key": "length", "label": "Post length", "value": f"{lmin}–{lmax} characters", **_source_meta(length_prov, ["length", "character", "200 words"])},
        {"key": "hashtags", "label": "Hashtags", "value": hashtag_val, **_source_meta("hashtags_in_body", ["hashtag"])},
        {"key": "emojis", "label": "Emojis", "value": emoji_val, **_source_meta("emoji_policy", ["emoji"])},
        {"key": "hook_style", "label": "Opening hook", "value": hook_val, **_source_meta("no_question_hooks" if policy.get("no_question_hooks") else "require_number_hook", ["hook", "first line", "question"])},
        {"key": "question_ending", "label": "Ending question", "value": q_end_map.get(q_end, "Optional"), **_source_meta("question_ending", ["question"])},
        {"key": "first_line_max", "label": "First line max", "value": f"{policy.get('first_line_max', 140)} characters", **_source_meta("first_line_max", ["first line"])},
        {"key": "paragraphs", "label": "Paragraphs", "value": f"{policy.get('paragraphs_min', 3)} to {policy.get('paragraphs_max', 6)} paragraphs", **_source_meta("paragraphs_max", ["paragraph"])},
    ]
    return items


def _build_context_view(db: Session, user_id: str) -> Dict[str, Any]:
    settings_row = custom_repo.get_or_create_settings(db, user_id)
    compile_pending = custom_repo.has_pending_compile(db, user_id)
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
            compiled = ver.compiled or {}
            policy_by_type = {
                pt: _build_policy_items(db, user_id, compiled, post_type=pt)
                for pt in ("all", "build_in_public", "technical_explainer", "hot_take")
            }
            return {
                "version_id": str(ver.id),
                "version": ver.version,
                "compile_pending": compile_pending,
                "updated_at": ver.created_at.isoformat() if ver.created_at else None,
                "warnings": list(ver.warnings or []),
                "token_counts": ver.token_counts or {},
                "compiled": compiled,
                "policy_items": policy_by_type["all"],
                "policy_items_by_post_type": policy_by_type,
            }
    empty_compiled = {
        "version_id": "",
        "version": 0,
        "is_empty": True,
        "policy": EffectivePolicy().model_dump(),
        "guidance": {},
        "sources": [],
        "warnings": [],
    }
    empty_items = _build_policy_items(db, user_id, empty_compiled, post_type="all")
    return {
        "version_id": None,
        "version": 0,
        "compile_pending": compile_pending,
        "updated_at": None,
        "warnings": [],
        "token_counts": {},
        "compiled": empty_compiled,
        "policy_items": empty_items,
        "policy_items_by_post_type": {"all": empty_items},
    }


@router.get("/context")
def get_compiled_context_view(
    user: User = Depends(require_customization_enabled),
    db: Session = Depends(get_readonly_db),
) -> JSONResponse:
    return JSONResponse(content=_build_context_view(db, user.id))


@router.patch("/context/overrides")
def patch_context_overrides(
    payload: OverridesPatchRequest,
    user: User = Depends(require_customization_enabled),
    db: Session = Depends(get_db),
) -> JSONResponse:
    row = custom_repo.get_or_create_settings(db, user.id)
    overrides = dict(row.overrides or {})

    if payload.disabled_rule_ids is not None:
        overrides["disabled_rule_ids"] = [str(x).strip() for x in payload.disabled_rule_ids if x][:200]
    if payload.voice_summary_override is not None:
        overrides["voice_summary_override"] = payload.voice_summary_override.strip() or None
    if payload.removed_fact_ids is not None:
        removed_ids = [str(x).strip() for x in payload.removed_fact_ids if x][:200]
        overrides["removed_fact_ids"] = removed_ids
        # Also mark fact rows removed=True
        for fid in removed_ids:
            try:
                uid_val = uuid.UUID(fid)
                fact = (
                    db.query(CustomizationFact)
                    .filter(CustomizationFact.id == uid_val, CustomizationFact.user_id == user.id)
                    .first()
                )
                if fact:
                    fact.removed = True
            except ValueError:
                pass
    if payload.policy_overrides is not None:
        # Validate against EffectivePolicy + clamp_policy
        candidate = EffectivePolicy.model_validate(
            {**EffectivePolicy().model_dump(), **payload.policy_overrides}
        )
        clamped, _ = clamp_policy(candidate)
        allowed_keys = set(payload.policy_overrides.keys()) & set(clamped.model_dump().keys())
        overrides["policy_overrides"] = {
            k: getattr(clamped, k) for k in allowed_keys if k != "provenance"
        }

    row.overrides = overrides
    row.updated_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()

    custom_repo.enqueue_job(db, user_id=user.id, job_type="compile", delay_seconds=0)
    return JSONResponse(content=_build_context_view(db, user.id))


@router.post("/compile", status_code=status.HTTP_202_ACCEPTED)
def trigger_compile(
    user: User = Depends(require_customization_enabled),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    enforce_rate_limit(
        f"custom_compile:{user.id}",
        max_requests=20,
        window_seconds=3600,
        error_message="Compile rate limit reached (20/hour).",
    )
    job = custom_repo.enqueue_job(db, user_id=user.id, job_type="compile", delay_seconds=0)
    return {"status": "queued", "job_id": str(job.id) if job else None}


@router.get("/versions", response_model=List[VersionSummary])
def list_customization_versions(
    user: User = Depends(require_customization_enabled),
    db: Session = Depends(get_readonly_db),
) -> List[VersionSummary]:
    return custom_repo.list_versions(db, user.id)


@router.post("/versions/{version_id}/activate")
def activate_customization_version(
    version_id: str,
    user: User = Depends(require_customization_enabled),
    db: Session = Depends(get_db),
) -> JSONResponse:
    ver = (
        db.query(CustomizationVersion)
        .filter(
            CustomizationVersion.id == _parse_uuid(version_id),
            CustomizationVersion.user_id == user.id,
        )
        .first()
    )
    if ver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Version not found."},
        )
    row = custom_repo.get_or_create_settings(db, user.id)
    row.active_version_id = ver.id
    row.updated_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    try:
        from app.services.customization.context import invalidate_customization_context_cache

        invalidate_customization_context_cache(user.id)
    except Exception:
        pass
    return JSONResponse(content=_build_context_view(db, user.id))
