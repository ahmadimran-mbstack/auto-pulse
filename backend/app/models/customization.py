"""SQLAlchemy models for the AutoPulse customization module."""

import datetime
import uuid
from typing import Any, Dict, List, Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
    text as sa_text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.db.session import Base


class CustomizationDocument(Base):
    __tablename__ = "customization_documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=sa_text("gen_random_uuid()")
    )
    user_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    original_filename: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mime_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sha256: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    storage_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="uploaded")
    error_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    needs_embedding: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=sa_text("false")
    )

    page_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    char_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    token_estimate: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    extracted_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    distilled: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)

    parser_version: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    distiller_version: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=sa_text("true"))
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")

    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    processed_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        CheckConstraint(
            "kind IN ('playbook', 'business', 'previous_posts')",
            name="ck_customization_documents_kind",
        ),
        CheckConstraint(
            "source_type IN ('upload', 'url', 'paste')",
            name="ck_customization_documents_source_type",
        ),
        CheckConstraint(
            "status IN ('uploaded', 'extracting', 'distilling', 'embedding', 'ready', 'failed', 'disabled', 'deleted')",
            name="ck_customization_documents_status",
        ),
        Index("ix_customization_documents_user_kind_status", "user_id", "kind", "status"),
        Index(
            "uq_customization_documents_user_kind_sha256",
            "user_id",
            "kind",
            "sha256",
            unique=True,
            postgresql_where=sa_text("deleted_at IS NULL AND sha256 IS NOT NULL"),
        ),
        Index(
            "uq_customization_documents_user_kind_url",
            "user_id",
            "kind",
            "source_url",
            unique=True,
            postgresql_where=sa_text("deleted_at IS NULL AND source_url IS NOT NULL"),
        ),
    )


class CustomizationPostSample(Base):
    __tablename__ = "customization_post_samples"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=sa_text("gen_random_uuid()")
    )
    user_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customization_documents.id", ondelete="CASCADE"),
        nullable=False,
    )
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    text: Mapped[str] = mapped_column(Text, nullable=False)
    char_count: Mapped[int] = mapped_column(Integer, nullable=False)
    features: Mapped[Dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=sa_text("'{}'::jsonb")
    )
    quality_flag: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=sa_text("false"))
    excluded: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=sa_text("false"))

    embedding: Mapped[Optional[List[float]]] = mapped_column(
        Vector(settings.EMBEDDING_DIM), nullable=True
    )
    embedding_model: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content_hash: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_customization_post_samples_user_doc", "user_id", "document_id"),
    )


class CustomizationFact(Base):
    __tablename__ = "customization_facts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=sa_text("gen_random_uuid()")
    )
    user_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customization_documents.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    numbers: Mapped[List[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default=sa_text("'{}'")
    )
    evidence_quote: Mapped[str] = mapped_column(Text, nullable=False)
    source_label: Mapped[str] = mapped_column(Text, nullable=False)
    is_core: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=sa_text("false"))
    removed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=sa_text("false"))

    embedding: Mapped[Optional[List[float]]] = mapped_column(
        Vector(settings.EMBEDDING_DIM), nullable=True
    )
    embedding_model: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content_hash: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "kind IN ('business_fact', 'documented_experience', 'playbook_rule')",
            name="ck_customization_facts_kind",
        ),
        Index("ix_customization_facts_user_kind_removed", "user_id", "kind", "removed"),
    )


class CustomizationVersion(Base):
    __tablename__ = "customization_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=sa_text("gen_random_uuid()")
    )
    user_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    compiled: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False)
    input_fingerprint: Mapped[str] = mapped_column(Text, nullable=False)
    compiler_version: Mapped[str] = mapped_column(Text, nullable=False)
    token_counts: Mapped[Dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=sa_text("'{}'::jsonb")
    )
    warnings: Mapped[List[str]] = mapped_column(
        JSONB, nullable=False, server_default=sa_text("'[]'::jsonb")
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("user_id", "version", name="uq_customization_versions_user_version"),
    )


class CustomizationSettings(Base):
    __tablename__ = "customization_settings"

    user_id: Mapped[str] = mapped_column(Text, primary_key=True)
    custom_instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    default_playbook_mode: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="merge"
    )
    use_previous_posts_for_voice: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=sa_text("true")
    )
    business_mention: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="natural"
    )
    overrides: Mapped[Dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=sa_text("'{}'::jsonb")
    )
    active_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customization_versions.id", ondelete="SET NULL"),
        nullable=True,
    )
    compile_requested_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "default_playbook_mode IN ('merge', 'replace')",
            name="ck_customization_settings_playbook_mode",
        ),
        CheckConstraint(
            "business_mention IN ('never', 'natural', 'often')",
            name="ck_customization_settings_business_mention",
        ),
    )


class CustomizationJob(Base):
    __tablename__ = "customization_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=sa_text("gen_random_uuid()")
    )
    user_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    job_type: Mapped[str] = mapped_column(Text, nullable=False)
    document_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="queued")
    run_after: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    max_attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="3")
    locked_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    boot_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    finished_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        CheckConstraint(
            "job_type IN ('extract_distill', 'embed', 'compile', 'purge', 'refresh_url', 'reembed_user')",
            name="ck_customization_jobs_type",
        ),
        CheckConstraint(
            "status IN ('queued', 'running', 'done', 'failed', 'dead')",
            name="ck_customization_jobs_status",
        ),
        Index(
            "uq_customization_jobs_compile_queued",
            "user_id",
            "job_type",
            unique=True,
            postgresql_where=sa_text("job_type = 'compile' AND status = 'queued'"),
        ),
        Index("ix_customization_jobs_status_run_after", "status", "run_after"),
    )
