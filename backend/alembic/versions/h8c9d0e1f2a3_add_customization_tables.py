"""add_customization_tables

Revision ID: h8c9d0e1f2a3
Revises: g7b8c9d0e1f2
Create Date: 2026-11-19 14:18:00.000000

Adds pgvector extension, customization_documents, customization_post_samples,
customization_facts, customization_versions, customization_settings,
customization_jobs, and customization_version_id / caption_embedding columns
on posts and run tables. Also migrates existing profiles.sample_posts.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

from app.core.config import settings

revision: str = "h8c9d0e1f2a3"
down_revision: Union[str, Sequence[str], None] = "g7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMBED_DIM = settings.EMBEDDING_DIM


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "customization_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("source_type", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("original_filename", sa.Text(), nullable=True),
        sa.Column("mime_type", sa.Text(), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("sha256", sa.Text(), nullable=True),
        sa.Column("storage_key", sa.Text(), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="uploaded"),
        sa.Column("error_code", sa.Text(), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("needs_embedding", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("char_count", sa.Integer(), nullable=True),
        sa.Column("token_estimate", sa.Integer(), nullable=True),
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column("distilled", postgresql.JSONB(), nullable=True),
        sa.Column("parser_version", sa.Text(), nullable=True),
        sa.Column("distiller_version", sa.Text(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("attempts", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("kind IN ('playbook', 'business', 'previous_posts')", name="ck_customization_documents_kind"),
        sa.CheckConstraint("source_type IN ('upload', 'url', 'paste')", name="ck_customization_documents_source_type"),
        sa.CheckConstraint(
            "status IN ('uploaded', 'extracting', 'distilling', 'embedding', 'ready', 'failed', 'disabled', 'deleted')",
            name="ck_customization_documents_status",
        ),
    )
    op.create_index("ix_customization_documents_user_id", "customization_documents", ["user_id"])
    op.create_index("ix_customization_documents_user_kind_status", "customization_documents", ["user_id", "kind", "status"])
    op.create_index(
        "uq_customization_documents_user_kind_sha256",
        "customization_documents",
        ["user_id", "kind", "sha256"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL AND sha256 IS NOT NULL"),
    )
    op.create_index(
        "uq_customization_documents_user_kind_url",
        "customization_documents",
        ["user_id", "kind", "source_url"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL AND source_url IS NOT NULL"),
    )

    op.create_table(
        "customization_post_samples",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("customization_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ordinal", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("char_count", sa.Integer(), nullable=False),
        sa.Column("features", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("quality_flag", sa.Text(), nullable=True),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("excluded", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("embedding", Vector(EMBED_DIM), nullable=True),
        sa.Column("embedding_model", sa.Text(), nullable=True),
        sa.Column("content_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_customization_post_samples_user_id", "customization_post_samples", ["user_id"])
    op.create_index("ix_customization_post_samples_user_doc", "customization_post_samples", ["user_id", "document_id"])
    op.execute(
        "CREATE INDEX ix_customization_post_samples_embedding_hnsw ON customization_post_samples USING hnsw (embedding vector_cosine_ops)"
    )

    op.create_table(
        "customization_facts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("customization_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("numbers", postgresql.ARRAY(sa.Text()), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("evidence_quote", sa.Text(), nullable=False),
        sa.Column("source_label", sa.Text(), nullable=False),
        sa.Column("is_core", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("removed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("embedding", Vector(EMBED_DIM), nullable=True),
        sa.Column("embedding_model", sa.Text(), nullable=True),
        sa.Column("content_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "kind IN ('business_fact', 'documented_experience', 'playbook_rule')",
            name="ck_customization_facts_kind",
        ),
    )
    op.create_index("ix_customization_facts_user_id", "customization_facts", ["user_id"])
    op.create_index("ix_customization_facts_user_kind_removed", "customization_facts", ["user_id", "kind", "removed"])
    op.execute(
        "CREATE INDEX ix_customization_facts_embedding_hnsw ON customization_facts USING hnsw (embedding vector_cosine_ops)"
    )

    op.create_table(
        "customization_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("compiled", postgresql.JSONB(), nullable=False),
        sa.Column("input_fingerprint", sa.Text(), nullable=False),
        sa.Column("compiler_version", sa.Text(), nullable=False),
        sa.Column("token_counts", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("warnings", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "version", name="uq_customization_versions_user_version"),
    )
    op.create_index("ix_customization_versions_user_id", "customization_versions", ["user_id"])

    op.create_table(
        "customization_settings",
        sa.Column("user_id", sa.Text(), primary_key=True),
        sa.Column("custom_instructions", sa.Text(), nullable=True),
        sa.Column("default_playbook_mode", sa.Text(), nullable=False, server_default="merge"),
        sa.Column("use_previous_posts_for_voice", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("business_mention", sa.Text(), nullable=False, server_default="natural"),
        sa.Column("overrides", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "active_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("customization_versions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("compile_requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("default_playbook_mode IN ('merge', 'replace')", name="ck_customization_settings_playbook_mode"),
        sa.CheckConstraint("business_mention IN ('never', 'natural', 'often')", name="ck_customization_settings_business_mention"),
    )

    op.create_table(
        "customization_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("job_type", sa.Text(), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="queued"),
        sa.Column("run_after", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("attempts", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.SmallInteger(), nullable=False, server_default="3"),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("boot_id", sa.Text(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "job_type IN ('extract_distill', 'embed', 'compile', 'purge', 'refresh_url', 'reembed_user')",
            name="ck_customization_jobs_type",
        ),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'done', 'failed', 'dead')",
            name="ck_customization_jobs_status",
        ),
    )
    op.create_index("ix_customization_jobs_user_id", "customization_jobs", ["user_id"])
    op.create_index("ix_customization_jobs_status_run_after", "customization_jobs", ["status", "run_after"])
    op.create_index(
        "uq_customization_jobs_compile_queued",
        "customization_jobs",
        ["user_id", "job_type"],
        unique=True,
        postgresql_where=sa.text("job_type = 'compile' AND status = 'queued'"),
    )

    # Columns on existing tables
    op.add_column("posts", sa.Column("customization_version_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("posts", sa.Column("caption_embedding", Vector(EMBED_DIM), nullable=True))
    op.add_column("posts", sa.Column("caption_embedding_model", sa.Text(), nullable=True))
    op.add_column("generation_runs", sa.Column("customization_version_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("playground_runs", sa.Column("customization_version_id", postgresql.UUID(as_uuid=True), nullable=True))

    # Data migration: copy non-empty profiles.sample_posts into customization_documents + queue extract_distill
    op.execute(
        """
        WITH inserted AS (
            INSERT INTO customization_documents (
                user_id, kind, source_type, title, mime_type, char_count, token_estimate, extracted_text, status
            )
            SELECT
                p.user_id,
                'previous_posts',
                'paste',
                'Migrated sample posts',
                'text/plain',
                length(trim(p.sample_posts)),
                GREATEST(1, length(trim(p.sample_posts)) / 4),
                trim(p.sample_posts),
                'uploaded'
            FROM profiles p
            WHERE p.sample_posts IS NOT NULL AND length(trim(p.sample_posts)) > 0
            RETURNING id, user_id
        )
        INSERT INTO customization_jobs (user_id, job_type, document_id, status)
        SELECT user_id, 'extract_distill', id, 'queued'
        FROM inserted;
        """
    )


def downgrade() -> None:
    op.drop_column("playground_runs", "customization_version_id")
    op.drop_column("generation_runs", "customization_version_id")
    op.drop_column("posts", "caption_embedding_model")
    op.drop_column("posts", "caption_embedding")
    op.drop_column("posts", "customization_version_id")

    op.drop_table("customization_jobs")
    op.drop_table("customization_settings")
    op.drop_table("customization_versions")
    op.drop_table("customization_facts")
    op.drop_table("customization_post_samples")
    op.drop_table("customization_documents")
