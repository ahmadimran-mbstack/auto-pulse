"""Dev-only analytics seed script for AutoPulse.

Creates (or cleans) an isolated test user account with ~90 days of realistic
post, approval, Slack message, and publication records to exercise every state
in the Analytics dashboard without touching any real user's data.

Usage (from repository root):
  Seed data:   .venv\\Scripts\\python.exe scripts/seed_analytics.py
  Delete data: .venv\\Scripts\\python.exe scripts/seed_analytics.py --clean
"""
import argparse
import datetime
import hashlib
import os
import random
import sys
import uuid
import zoneinfo
from pathlib import Path
from typing import Optional

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Early environment guard before loading app modules
if os.environ.get("ENV", "").strip().lower() == "production":
    print(
        "ERROR: Refusing to run seed_analytics.py because ENV=production.",
        file=sys.stderr,
    )
    sys.exit(1)

import httpx
from sqlalchemy import text

from app.core.config import settings
from app.core.crypto import encrypt_text
from app.db.session import SessionLocal
from app.models.approval import Approval
from app.models.post import GenerationRun, Post
from app.models.profile import Profile
from app.models.publication import PostPublication
from app.models.slack import SlackApprovalMessage
from app.models.social_connection import SocialConnection
from app.services.analytics import invalidate_analytics_cache

SEED_USER_EMAIL = "analytics-seed@autopulse.local"
SEED_USER_PASSWORD = "SeedAnalytics2026!"
SEED_USER_NAME = "Alex Rivera (Seed Test)"
SEED_FALLBACK_USER_ID = "00000000-0000-4000-8000-000000a1a1c5"
SEED_PROVIDER_ACCOUNT_ID = "seed-linkedin-member-90d"

TOPICS = [
    ("Postgres Connection Pooling Under Burst Load", 8),
    ("Multi-Region Tail Latency in Distributed Queues", 7),
    ("LLM Evaluation Harnesses Beyond Toy Benchmarks", 6),
    ("Zero-Downtime Schema Migrations at Scale", 5),
    ("Idempotent Webhook Retries and Dead-Letter Design", 4),
    ("Redis Cache Stampede Prevention in High-Read APIs", 4),
    ("Observability Cardinality Traps in OpenTelemetry", 4),
    ("Feature Flag Blast Radius and Progressive Rollouts", 3),
    ("Vector Index Recall vs Memory Trade-offs in pgvector", 3),
    ("Backpressure Handling in Async Python Workers", 3),
    ("gRPC vs JSON-over-HTTP2 Internal Service Boundaries", 3),
    ("Incident Postmortems That Actually Reduce MTTR", 2),
    ("Rate Limiter Token Buckets Across Edge Replicas", 2),
]

# Weighted hook styles across all 7 canonical styles (includes <5 sample for 'question')
HOOK_STYLE_POOL = (
    ["number_result"] * 13
    + ["contrarian_opinion"] * 10
    + ["story"] * 9
    + ["observation"] * 8
    + ["mistake"] * 6
    + ["how_to"] * 5
    + ["question"] * 3
)


def assert_not_production() -> None:
    if settings.ENV.strip().lower() == "production":
        print(
            "ERROR: Refusing to run seed_analytics.py in production environment.",
            file=sys.stderr,
        )
        sys.exit(1)


def resolve_or_create_seed_user(db, create_if_missing: bool = True) -> Optional[str]:
    # 1. Check if seed user already exists in neon_auth.user by exact email
    try:
        existing_id = db.execute(
            text("SELECT id::text FROM neon_auth.user WHERE email = :email LIMIT 1"),
            {"email": SEED_USER_EMAIL},
        ).scalar()
        if existing_id:
            if create_if_missing:
                db.execute(
                    text('UPDATE neon_auth.user SET "emailVerified" = true WHERE id::text = :uid AND email = :email'),
                    {"uid": str(existing_id), "email": SEED_USER_EMAIL},
                )
                db.commit()
            return str(existing_id)
    except Exception:
        db.rollback()

    if not create_if_missing:
        # Check if fallback user exists in profiles/posts
        prof_uid = db.execute(
            text("SELECT user_id FROM profiles WHERE user_id = :uid LIMIT 1"),
            {"uid": SEED_FALLBACK_USER_ID},
        ).scalar()
        return str(prof_uid) if prof_uid else None

    # 2. Register isolated test account via Neon Auth sign-up API so browser sign-in works natively
    try:
        signup_url = f"{settings.NEON_AUTH_BASE_URL.rstrip('/')}/sign-up/email"
        headers = {"Origin": settings.APP_BASE_URL.rstrip("/")}
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                signup_url,
                json={
                    "email": SEED_USER_EMAIL,
                    "password": SEED_USER_PASSWORD,
                    "name": SEED_USER_NAME,
                },
                headers=headers,
            )
        if resp.status_code in (200, 201):
            data = resp.json()
            created_uid = (data.get("user") or {}).get("id")
            if created_uid:
                db.execute(
                    text('UPDATE neon_auth.user SET "emailVerified" = true WHERE id::text = :uid AND email = :email'),
                    {"uid": str(created_uid), "email": SEED_USER_EMAIL},
                )
                db.commit()
                return str(created_uid)
    except Exception as exc:
        print(f"Note: Neon Auth signup skipped ({exc}); using isolated fallback test user_id.")
        db.rollback()

    return SEED_FALLBACK_USER_ID


def verify_safe_target_user(db, user_id: str) -> None:
    """Hard safety assertion: never touch any user other than our dedicated seed account."""
    if not user_id:
        raise RuntimeError("Empty target user_id")
    if user_id == SEED_FALLBACK_USER_ID:
        return
    row = db.execute(
        text("SELECT email FROM neon_auth.user WHERE id::text = :uid"),
        {"uid": user_id},
    ).mappings().first()
    if not row or row["email"] != SEED_USER_EMAIL:
        raise RuntimeError(
            f"Safety abort: user_id {user_id} does not match {SEED_USER_EMAIL}!"
        )


def clean_seed_user_data(db, remove_auth_user: bool = False) -> Optional[str]:
    user_id = resolve_or_create_seed_user(db, create_if_missing=False)
    if not user_id:
        return None

    verify_safe_target_user(db, user_id)

    db.execute(text("DELETE FROM post_publications WHERE user_id = :uid"), {"uid": user_id})
    db.execute(text("DELETE FROM approvals WHERE user_id = :uid"), {"uid": user_id})
    db.execute(text("DELETE FROM slack_approval_messages WHERE user_id = :uid"), {"uid": user_id})
    db.execute(text("DELETE FROM slack_integrations WHERE user_id = :uid"), {"uid": user_id})
    db.execute(text("DELETE FROM generation_runs WHERE user_id = :uid"), {"uid": user_id})
    db.execute(text("DELETE FROM playground_runs WHERE user_id = :uid"), {"uid": user_id})
    db.execute(text("DELETE FROM posts WHERE user_id = :uid"), {"uid": user_id})
    db.execute(text("DELETE FROM social_connections WHERE user_id = :uid"), {"uid": user_id})
    db.execute(text("DELETE FROM oauth_states WHERE user_id = :uid"), {"uid": user_id})
    db.execute(text("DELETE FROM profiles WHERE user_id = :uid"), {"uid": user_id})

    if remove_auth_user and user_id != SEED_FALLBACK_USER_ID:
        try:
            db.execute(
                text("DELETE FROM neon_auth.session WHERE \"userId\"::text = :uid"),
                {"uid": user_id},
            )
            db.execute(
                text("DELETE FROM neon_auth.account WHERE \"userId\"::text = :uid"),
                {"uid": user_id},
            )
            db.execute(
                text("DELETE FROM neon_auth.user WHERE id::text = :uid AND email = :email"),
                {"uid": user_id, "email": SEED_USER_EMAIL},
            )
        except Exception:
            pass

    db.commit()
    invalidate_analytics_cache(user_id)
    return user_id


def seed_analytics_data() -> None:
    assert_not_production()
    rng = random.Random(20261030)

    with SessionLocal() as db:
        # Remove any prior seed rows for this test user first so re-running is idempotent
        clean_seed_user_data(db, remove_auth_user=False)
        user_id = resolve_or_create_seed_user(db, create_if_missing=True)
        assert user_id is not None
        verify_safe_target_user(db, user_id)

        tz_name = "Asia/Karachi"
        user_tz = zoneinfo.ZoneInfo(tz_name)
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        today_local = now_utc.astimezone(user_tz).date()

        # 1. Seed completed Profile
        profile = Profile(
            user_id=user_id,
            display_name=SEED_USER_NAME,
            role_title="Principal Distributed Systems Engineer",
            industry="Cloud Infrastructure",
            niche_description="High-throughput backend reliability, Postgres internals, and pragmatic AI systems.",
            audience="Staff engineers, SREs, and engineering managers",
            topics_include=["Postgres", "Distributed Systems", "Observability", "Caching"],
            topics_avoid=["Crypto hype", "Generic motivational quotes"],
            tone="direct",
            brand_name="Rivera Systems",
            brand_primary_hex="#0F172A",
            brand_accent_hex="#0284C7",
            timezone=tz_name,
            post_time=datetime.time(16, 0),
            post_days=[],
            approval_method="email",
            slack_approval_enabled=False,
            onboarding_step=4,
            onboarding_completed_at=now_utc - datetime.timedelta(days=92),
        )
        db.add(profile)

        # Mark today's generation run succeeded so background dispatch never runs for seed user
        db.add(
            GenerationRun(
                user_id=user_id,
                run_date=today_local,
                status="succeeded",
                attempts=1,
                search_provider="tavily",
                finished_at=now_utc,
            )
        )

        # 2. Seed active LinkedIn SocialConnection with standard scopes (no r_member_postAnalytics)
        conn = SocialConnection(
            user_id=user_id,
            provider="linkedin",
            provider_account_id=SEED_PROVIDER_ACCOUNT_ID,
            account_name="Alex Rivera",
            access_token_enc=encrypt_text("seed-only-non-functional-token"),
            expires_at=now_utc + datetime.timedelta(days=45),
            scopes=["openid", "profile", "w_member_social"],
            status="active",
        )
        db.add(conn)
        db.flush()

        # Build flat topic assignment list (54 posts total across 13 topics)
        expanded_topics = []
        for topic_title, count in TOPICS:
            expanded_topics.extend([topic_title] * count)
        rng.shuffle(expanded_topics)

        hook_styles = list(HOOK_STYLE_POOL)
        rng.shuffle(hook_styles)

        # Generate uneven day offsets over 89 days (clusters, gaps, occasional 2-post days)
        candidate_offsets = []
        for day_ago in range(88, -1, -1):
            # Create realistic quiet weeks (e.g. vacation gap around days 52..58 and 24..27)
            if 52 <= day_ago <= 58 or 24 <= day_ago <= 27:
                continue
            d_date = today_local - datetime.timedelta(days=day_ago)
            is_weekend = d_date.weekday() >= 5
            prob = 0.22 if is_weekend else 0.72
            if rng.random() < prob:
                candidate_offsets.append(day_ago)
                # Occasional 2-post day
                if not is_weekend and rng.random() < 0.14:
                    candidate_offsets.append(day_ago)

        # Trim or pad to exactly 54 posts
        while len(candidate_offsets) < len(expanded_topics):
            candidate_offsets.append(rng.choice([1, 3, 5, 8, 12, 16, 21, 34, 45, 67]))
        candidate_offsets = sorted(candidate_offsets[: len(expanded_topics)], reverse=True)

        # Deterministic status schedule covering all lifecycle outcomes across 7d, 30d, and 90d
        statuses = (
            ["published"] * 32
            + ["rejected"] * 6
            + ["failed"] * 5
            + ["outcome_unknown"] * 4
            + ["expired"] * 4
            + ["approved"] * 2
            + ["awaiting_approval"] * 1
        )
        # Pin recent statuses so 7d and 30d views also show rich variety (including outcome_unknown)
        pinned_tail = [
            "published",
            "outcome_unknown",
            "failed",
            "rejected",
            "published",
            "approved",
            "published",
            "awaiting_approval",
        ]
        middle_statuses = statuses[: len(expanded_topics) - len(pinned_tail)]
        # Remove pinned items from pool accurately by constructing balanced 54-item list
        full_statuses = (
            ["published"] * 29
            + ["rejected"] * 5
            + ["failed"] * 4
            + ["outcome_unknown"] * 3
            + ["expired"] * 4
            + ["approved"] * 1
        )
        rng.shuffle(full_statuses)
        full_statuses = full_statuses[: len(expanded_topics) - len(pinned_tail)] + pinned_tail

        sources_cycle = (["slack"] * 19) + (["email_link"] * 13) + (["dashboard"] * 6)
        rng.shuffle(sources_cycle)
        source_idx = 0

        counts_by_status: dict[str, int] = {}

        for idx, (day_ago, topic_title, hook_style, target_status) in enumerate(
            zip(candidate_offsets, expanded_topics, hook_styles, full_statuses)
        ):
            run_date = today_local - datetime.timedelta(days=day_ago)
            hour_local = rng.choice([10, 11, 13, 15, 16, 16, 16, 17])
            minute_local = rng.randint(2, 52)
            created_local = datetime.datetime(
                run_date.year,
                run_date.month,
                run_date.day,
                hour_local,
                minute_local,
                tzinfo=user_tz,
            )
            created_utc = created_local.astimezone(datetime.timezone.utc)
            if created_utc > now_utc - datetime.timedelta(minutes=20):
                created_utc = now_utc - datetime.timedelta(minutes=25)

            publish_at_utc = created_utc + datetime.timedelta(hours=3)
            if target_status in ("approved", "awaiting_approval"):
                publish_at_utc = now_utc + datetime.timedelta(hours=rng.randint(2, 18))

            # Realistic AI-slop score between 5 and 40 (lower is cleaner)
            if target_status == "rejected":
                ai_score = rng.randint(22, 40)
            elif hook_style in ("story", "number_result", "contrarian_opinion"):
                ai_score = rng.randint(5, 18)
            elif hook_style in ("mistake", "observation"):
                ai_score = rng.randint(8, 24)
            else:
                ai_score = rng.randint(12, 34)

            db_post_status = "failed" if target_status == "outcome_unknown" else target_status

            decided_via = None
            decided_at_utc = None
            sent_at_utc = created_utc + datetime.timedelta(seconds=rng.randint(8, 45))

            if target_status in ("published", "approved", "rejected", "failed", "outcome_unknown"):
                decided_via = sources_cycle[source_idx % len(sources_cycle)]
                source_idx += 1
                # Realistic turnaround by channel
                if decided_via == "slack":
                    turnaround_mins = rng.uniform(3.5, 29.0)
                elif decided_via == "email_link":
                    turnaround_mins = rng.uniform(32.0, 148.0)
                else:
                    turnaround_mins = rng.uniform(11.0, 86.0)
                decided_at_utc = sent_at_utc + datetime.timedelta(minutes=turnaround_mins)
                if decided_at_utc > now_utc:
                    decided_at_utc = now_utc - datetime.timedelta(minutes=2)

            post = Post(
                user_id=user_id,
                run_date=run_date,
                status=db_post_status,
                topic_title=topic_title,
                topic_url=f"https://engineering.example.com/articles/{idx + 1}",
                angle=f"Practitioner breakdown on {topic_title.lower()}",
                hook_type=hook_style,
                hook_style=hook_style,
                post_format="image",
                ai_score=ai_score,
                needs_review=ai_score > 18,
                sources=[{"title": topic_title, "url": f"https://engineering.example.com/articles/{idx + 1}"}],
                caption=(
                    f"[Seed #{idx + 1}] Practical lessons from running {topic_title} in production.\n\n"
                    "1. Measure p99 under realistic concurrency before tuning.\n"
                    "2. Keep failure modes explicit and observable.\n"
                    "3. Ship incremental guardrails."
                ),
                hashtags=["SystemsEngineering", "Backend", "Reliability"],
                image_spec={
                    "headline": topic_title[:80],
                    "brand_name": "Rivera Systems",
                    "brand_primary_hex": "#0F172A",
                    "brand_accent_hex": "#0284C7",
                    "template_version": "v1",
                },
                publish_at=publish_at_utc,
                llm_model="gemini-3.5-flash-lite",
                prompt_version="v2.0",
                approval_source=decided_via,
                decided_at=decided_at_utc,
                created_at=created_utc,
                updated_at=decided_at_utc or created_utc,
            )
            db.add(post)
            db.flush()

            # Create Approval record
            token_hash = hashlib.sha256(f"seed-token-{user_id}-{idx}-{uuid.uuid4()}".encode()).hexdigest()
            decision_val = None
            if target_status in ("published", "approved", "failed", "outcome_unknown"):
                decision_val = "approved"
            elif target_status == "rejected":
                decision_val = "rejected"

            approval = Approval(
                user_id=user_id,
                post_id=post.id,
                channel="email",
                token_hash=token_hash,
                expires_at=publish_at_utc,
                send_attempts=1,
                sent_at=sent_at_utc,
                decision=decision_val,
                decided_at=decided_at_utc,
                decided_via=decided_via,
                created_at=created_utc,
            )
            db.add(approval)

            if decided_via == "slack" or target_status == "awaiting_approval":
                slack_msg = SlackApprovalMessage(
                    post_id=post.id,
                    user_id=user_id,
                    channel_id="D0SEEDTEST",
                    message_ts=f"{int(sent_at_utc.timestamp())}.000{idx:03d}",
                    status="sent",
                    created_at=sent_at_utc,
                    updated_at=sent_at_utc,
                )
                db.add(slack_msg)

            # Create PostPublication record for approved/published/failed/outcome_unknown posts
            if target_status in ("published", "approved", "failed", "outcome_unknown"):
                if target_status == "published":
                    pub_status = "published"
                    err_code = None
                    err_detail = None
                    ext_id = f"urn:li:share:75210000000000{idx:05d}"
                    pub_at = min(now_utc - datetime.timedelta(minutes=1), publish_at_utc)
                    attempts = 1
                elif target_status == "approved":
                    pub_status = "pending"
                    err_code = None
                    err_detail = None
                    ext_id = None
                    pub_at = None
                    attempts = 0
                elif target_status == "outcome_unknown":
                    pub_status = "failed"
                    err_code = "outcome_unknown"
                    err_detail = "Network timeout after create-post request was sent"
                    ext_id = None
                    pub_at = None
                    attempts = 1
                else:
                    pub_status = "failed"
                    err_code = rng.choice(["window_missed", "rate_limited", "rejected_by_linkedin"])
                    err_detail = f"Seeded failure ({err_code})"
                    ext_id = None
                    pub_at = None
                    attempts = 3 if err_code == "rate_limited" else 1

                pub = PostPublication(
                    user_id=user_id,
                    post_id=post.id,
                    platform="linkedin",
                    status=pub_status,
                    attempts=attempts,
                    error_code=err_code,
                    error_detail=err_detail,
                    external_id=ext_id,
                    published_at=pub_at,
                    created_at=decided_at_utc or created_utc,
                    updated_at=pub_at or decided_at_utc or created_utc,
                )
                db.add(pub)

            counts_by_status[target_status] = counts_by_status.get(target_status, 0) + 1

        db.commit()
        invalidate_analytics_cache(user_id)

        print("=== AutoPulse Analytics Seed Complete ===")
        print(f"  Test user_id : {user_id}")
        print(f"  Test email   : {SEED_USER_EMAIL}")
        print(f"  Total posts  : {sum(counts_by_status.values())} across 90 days")
        print(f"  Breakdown    : {counts_by_status}")
        print("  Cleanup cmd  : .venv\\Scripts\\python.exe scripts/seed_analytics.py --clean")


def main() -> None:
    assert_not_production()
    parser = argparse.ArgumentParser(description="Seed or clean isolated Analytics test user data (dev-only).")
    parser.add_argument(
        "--clean",
        "--delete",
        action="store_true",
        dest="clean",
        help="Delete all seeded analytics test user data without touching real users.",
    )
    args = parser.parse_args()

    if args.clean:
        with SessionLocal() as db:
            removed_uid = clean_seed_user_data(db, remove_auth_user=True)
            if removed_uid:
                print(f"Removed all seeded analytics data for test user {removed_uid} ({SEED_USER_EMAIL}).")
            else:
                print("No seeded analytics test user found. Nothing to delete.")
        return

    seed_analytics_data()


if __name__ == "__main__":
    main()
