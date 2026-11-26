"""add plans table and seed initial plans from plans.py

Revision ID: x3a4b5c6d7e8
Revises: w2f3a4b5c6d7
Create Date: 2026-11-26 12:35:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "x3a4b5c6d7e8"
down_revision: Union[str, None] = "w2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


RENAME_LEGACY_PLANS_SQL = """
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'plans'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'plans' AND column_name = 'monthly_price_cents'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'plans_legacy_20261126'
    ) THEN
        ALTER TABLE public.plans RENAME TO plans_legacy_20261126;
        IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'plans_pkey') THEN
            ALTER INDEX public.plans_pkey RENAME TO plans_legacy_20261126_pkey;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'plans_slug_key') THEN
            ALTER INDEX public.plans_slug_key RENAME TO plans_legacy_20261126_slug_key;
        END IF;
    END IF;
END $$;
""".strip()

CREATE_PLANS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT true,
    monthly_price_cents INTEGER NULL,
    annual_price_cents INTEGER NULL,
    annual_monthly_equivalent_cents INTEGER NULL,
    plan_length_days INTEGER NOT NULL DEFAULT 30,
    linkedin_profiles INTEGER NULL,
    scheduled_posts_per_period INTEGER NULL,
    playground_runs_per_period INTEGER NULL,
    playground_runs_per_day INTEGER NULL,
    max_post_days_per_week INTEGER NULL,
    approval_email BOOLEAN NOT NULL DEFAULT true,
    approval_slack BOOLEAN NOT NULL DEFAULT false,
    docs_token_limit INTEGER NULL,
    analytics_level TEXT NOT NULL DEFAULT 'none'
        CONSTRAINT ck_plans_analytics_level CHECK (analytics_level IN ('none', 'basic', 'full')),
    support_label TEXT NOT NULL DEFAULT 'email',
    daily_spend_limit_cents INTEGER NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_popular BOOLEAN NOT NULL DEFAULT false,
    is_system BOOLEAN NOT NULL DEFAULT false,
    rate_limit_tier TEXT NOT NULL DEFAULT 'starter'
        CONSTRAINT ck_plans_rate_limit_tier CHECK (rate_limit_tier IN ('trial', 'starter', 'pro', 'business', 'internal')),
    extra_features JSONB NOT NULL DEFAULT '[]'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT NULL
)
""".strip()

CREATE_PLANS_INDEX_SQL = (
    "CREATE INDEX IF NOT EXISTS ix_plans_public_sort ON plans (is_active, is_public, sort_order)"
)

SEED_PLANS_SQL = """
INSERT INTO plans (
    id, name, is_public,
    monthly_price_cents, annual_price_cents, annual_monthly_equivalent_cents,
    plan_length_days, linkedin_profiles, scheduled_posts_per_period,
    playground_runs_per_period, playground_runs_per_day, max_post_days_per_week,
    approval_email, approval_slack, docs_token_limit, analytics_level,
    support_label, daily_spend_limit_cents,
    sort_order, is_active, is_popular, is_system, rate_limit_tier,
    extra_features, version, updated_by
)
VALUES
(
    'trial', 'Free trial', true,
    0, NULL, NULL,
    3, 1, 3,
    2, 2, 3,
    true, false, 0, 'none',
    'help docs', 50,
    1, true, false, true, 'trial',
    '[]'::jsonb, 1, 'seed'
),
(
    'starter', 'Starter', true,
    999, 11388, 949,
    30, 1, 12,
    3, 2, 3,
    true, false, 0, 'basic',
    'email', 100,
    2, true, false, false, 'starter',
    '[]'::jsonb, 1, 'seed'
),
(
    'pro', 'Pro', true,
    1999, 22788, 1899,
    30, 1, 22,
    5, 3, 5,
    true, true, 5000, 'full',
    'email', 200,
    3, true, true, false, 'pro',
    '[]'::jsonb, 1, 'seed'
),
(
    'business', 'Business', true,
    3999, 45588, 3799,
    30, 1, 30,
    15, 5, 7,
    true, true, 10000, 'full',
    'email, answered first', 400,
    4, true, false, false, 'business',
    '[]'::jsonb, 1, 'seed'
),
(
    'internal', 'Internal', false,
    NULL, NULL, NULL,
    30, NULL, NULL,
    NULL, NULL, NULL,
    true, true, NULL, 'full',
    'internal', NULL,
    5, true, false, true, 'internal',
    '[]'::jsonb, 1, 'seed'
)
ON CONFLICT (id) DO NOTHING
""".strip()


def upgrade() -> None:
    op.execute(RENAME_LEGACY_PLANS_SQL)
    op.execute(CREATE_PLANS_TABLE_SQL)
    op.execute(CREATE_PLANS_INDEX_SQL)
    op.execute(SEED_PLANS_SQL)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_plans_public_sort")
    op.execute("DROP TABLE IF EXISTS plans")
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'plans_legacy_20261126'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'plans'
            ) THEN
                ALTER TABLE public.plans_legacy_20261126 RENAME TO plans;
            END IF;
        END $$;
        """
    )
