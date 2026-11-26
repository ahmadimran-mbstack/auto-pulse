"""Comprehensive automated test suite for Phases B, C, D, and E."""

import concurrent.futures
import datetime
import json
import sys
from pathlib import Path
from unittest.mock import patch
import uuid

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import text

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.api.routes.admin_export import csv_safe_cell
from app.api.routes.admin_payments import _is_secret_ip_locked, _secret_fail_counts, _secret_lockouts
from app.core import limiter as _lim
from app.core.auth import User, current_user
from app.core.config import settings
from app.core.plans import PLANS, compute_annual_cents, get_plans, invalidate_plans_cache
from app.db.session import SessionLocal
from app.main import app
from app.services.storage import get_storage_backend


def _insert_test_user(db, uid: str, email: str, name: str) -> None:
    db.execute(
        text(
            'INSERT INTO neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") '
            'VALUES (:id, :n, :e, true, now(), now())'
        ),
        {"id": uid, "n": name, "e": email},
    )
    db.execute(
        text("INSERT INTO profiles (user_id, display_name) VALUES (:u, :n) ON CONFLICT (user_id) DO NOTHING"),
        {"u": uid, "n": name},
    )


def _cleanup_test_entities(user_ids: list[str], extra_ids: list[str], plan_ids: list[str]) -> None:
    with SessionLocal() as db:
        if extra_ids:
            db.execute(text("DELETE FROM admin_audit_logs WHERE target_id = ANY(:ids)"), {"ids": extra_ids})
            db.execute(text("DELETE FROM email_logs WHERE user_id = ANY(:uids)"), {"uids": user_ids})
        if user_ids:
            rows = db.execute(
                text(
                    "SELECT m.attachment_key FROM support_ticket_messages m "
                    "JOIN support_tickets t ON t.id = m.ticket_id "
                    "WHERE t.user_id = ANY(:uids) AND m.attachment_key IS NOT NULL"
                ),
                {"uids": user_ids},
            ).fetchall()
            for r in rows:
                try:
                    get_storage_backend().delete(r.attachment_key)
                except Exception:
                    pass
            db.execute(text("DELETE FROM support_tickets WHERE user_id = ANY(:uids)"), {"uids": user_ids})
            db.execute(text("DELETE FROM admin_audit_logs WHERE target_id = ANY(:uids) OR actor_id = ANY(:uids)"), {"uids": user_ids})
            db.execute(text("DELETE FROM email_logs WHERE user_id = ANY(:uids)"), {"uids": user_ids})
            db.execute(text("DELETE FROM payments WHERE user_id = ANY(:uids)"), {"uids": user_ids})
            db.execute(text("DELETE FROM subscriptions WHERE user_id = ANY(:uids)"), {"uids": user_ids})
            db.execute(text("DELETE FROM profiles WHERE user_id = ANY(:uids)"), {"uids": user_ids})
            db.execute(text('DELETE FROM neon_auth."user" WHERE id::text = ANY(:uids)'), {"uids": user_ids})
        if plan_ids:
            db.execute(text("DELETE FROM admin_audit_logs WHERE target_id = ANY(:pids)"), {"pids": plan_ids})
            db.execute(text("DELETE FROM plans WHERE id = ANY(:pids)"), {"pids": plan_ids})
        db.commit()
    invalidate_plans_cache()


def test_14_15_decimal_annual_rule_and_db_plans_parity():
    assert compute_annual_cents(999) == (11388, 949)
    assert compute_annual_cents(1999) == (22788, 1899)
    assert compute_annual_cents(3999) == (45588, 3799)

    invalidate_plans_cache()
    live = get_plans()
    for pid, default_cfg in PLANS.items():
        assert pid in live
        assert live[pid].monthly_price_usd == default_cfg.monthly_price_usd
        assert live[pid].annual_price_usd == default_cfg.annual_price_usd
        assert live[pid].scheduled_posts_per_period == default_cfg.scheduled_posts_per_period
        assert live[pid].linkedin_profiles == default_cfg.linkedin_profiles


def test_16_17_18_19_plan_editor_crud_concurrency_and_checkout():
    u1 = str(uuid.uuid4())
    admin_uid = str(uuid.uuid4())
    u1_email = f"suite-u1-{u1[:8]}@example.com"
    admin_email = "ahmadimran@mbstack.net"
    slug_paid = f"custom{uuid.uuid4().hex[:6]}"
    slug_temp = f"temp{uuid.uuid4().hex[:6]}"

    with SessionLocal() as db:
        _insert_test_user(db, u1, u1_email, "Suite User 1")
        db.commit()

    active = {"user": User(id=admin_uid, email=admin_email, name="Admin")}
    app.dependency_overrides[current_user] = lambda: active["user"]
    client = TestClient(app)
    created_payment_ids: list[str] = []

    try:
        with patch("app.api.routes.admin_deps.resolve_user_email_and_verified", side_effect=lambda _d, u: ((u.email or "").lower(), (u.email or "").lower() == admin_email)), \
             patch("app.core.limiter.get_redis_client", return_value=None), \
             patch.object(settings, "ADMIN_EMAILS", admin_email):

            # Create new custom plan ($15.00/mo -> 1500 cents -> annual 17100 cents / 1425 mo equiv)
            r_create = client.post(
                "/api/admin/plans",
                json={
                    "id": slug_paid,
                    "name": "Custom Plan",
                    "monthly_price_cents": 1500,
                    "rate_limit_tier": "pro",
                    "scheduled_posts_per_period": 25,
                    "playground_runs_per_period": 60,
                    "playground_runs_per_day": 15,
                    "max_post_days_per_week": 7,
                    "linkedin_profiles": 2,
                    "docs_token_limit": 20000,
                    "daily_spend_limit_cents": 200,
                    "analytics_level": "full",
                    "support_label": "Priority email",
                    "approval_email": True,
                    "approval_slack": True,
                    "sort_order": 55,
                    "is_active": True,
                    "is_public": True,
                    "is_popular": False,
                    "extra_features": ["Custom feature X"],
                    "reason": "Testing custom plan creation",
                },
            )
            assert r_create.status_code == 201, r_create.text
            ver = r_create.json()["plan"]["version"]
            assert r_create.json()["plan"]["annual_price_cents"] == 17100

            # Stale expected_version -> 409
            r_stale = client.patch(
                f"/api/admin/plans/{slug_paid}",
                json={"name": "Stale Edit", "expected_version": ver + 99, "reason": "stale version check"},
            )
            assert r_stale.status_code == 409, r_stale.text

            # Public /api/plans reflects created plan immediately
            pub = client.get("/api/plans")
            assert pub.status_code == 200
            assert any(p["id"] == slug_paid and p["monthly_price_usd"] == 15.0 for p in pub.json()["plans"])

            # Edit price to $16.00 -> /api/plans reflects new price
            r_upd = client.patch(
                f"/api/admin/plans/{slug_paid}",
                json={"monthly_price_cents": 1600, "expected_version": ver, "reason": "price update"},
            )
            assert r_upd.status_code == 200, r_upd.text
            assert r_upd.json()["plan"]["version"] == ver + 1

            pub2 = client.get("/api/plans")
            assert any(p["id"] == slug_paid and p["monthly_price_usd"] == 16.0 for p in pub2.json()["plans"])

            # Checkout stale expected_amount_usd_cents -> 409 price_changed
            active["user"] = User(id=u1, email=u1_email, name="Suite User 1")
            r_409 = client.post(
                "/api/billing/payments",
                json={
                    "plan_id": slug_paid,
                    "billing_interval": "monthly",
                    "method": "easypaisa",
                    "transaction_id": f"STALE{uuid.uuid4().hex[:8].upper()}",
                    "expected_amount_usd_cents": 1500,
                },
            )
            assert r_409.status_code == 409, r_409.text

            # Checkout with tampered client price fields (no expected mismatch) -> server ignores client amount and uses 1600 cents
            tx_ok = f"CUS{uuid.uuid4().hex[:8].upper()}"
            r_pay = client.post(
                "/api/billing/payments",
                json={
                    "plan_id": slug_paid,
                    "billing_interval": "monthly",
                    "method": "easypaisa",
                    "transaction_id": tx_ok,
                    "amount_usd_cents": 1,
                    "amount_pkr": 1,
                },
            )
            assert r_pay.status_code == 201, r_pay.text
            assert r_pay.json()["amount_usd_cents"] == 1600
            created_payment_ids.append(r_pay.json()["id"])

            # Delete protected for system plans & referenced plans
            active["user"] = User(id=admin_uid, email=admin_email, name="Admin")
            assert client.request("DELETE", "/api/admin/plans/trial", json={"reason": "sys", "confirm_slug": "trial"}).status_code in (400, 409)
            assert client.request("DELETE", f"/api/admin/plans/{slug_paid}", json={"reason": "has payment", "confirm_slug": slug_paid}).status_code in (400, 409)

            # Archive referenced plan succeeds
            r_arch = client.patch(
                f"/api/admin/plans/{slug_paid}",
                json={"is_active": False, "expected_version": ver + 1, "reason": "archive referenced plan"},
            )
            assert r_arch.status_code == 200, r_arch.text

            # Zero-ref plan delete succeeds cleanly
            r_temp = client.post(
                "/api/admin/plans",
                json={
                    "id": slug_temp,
                    "name": "Temp Delete",
                    "monthly_price_cents": 500,
                    "rate_limit_tier": "starter",
                    "scheduled_posts_per_period": 10,
                    "playground_runs_per_period": 20,
                    "playground_runs_per_day": 5,
                    "max_post_days_per_week": 5,
                    "linkedin_profiles": 1,
                    "docs_token_limit": 0,
                    "daily_spend_limit_cents": 50,
                    "analytics_level": "basic",
                    "support_label": "Email",
                    "approval_email": True,
                    "approval_slack": False,
                    "reason": "temp plan",
                },
            )
            assert r_temp.status_code == 201, r_temp.text
            r_del = client.request(
                "DELETE",
                f"/api/admin/plans/{slug_temp}",
                json={"reason": "delete unused plan", "confirm_slug": slug_temp},
            )
            assert r_del.status_code == 200, r_del.text
    finally:
        app.dependency_overrides.clear()
        _lim._in_memory_fallback.clear()
        _cleanup_test_entities([u1, admin_uid], created_payment_ids, [slug_paid, slug_temp])


def test_17b_last_purchasable_plan_protected_in_isolated_schema():
    from sqlalchemy import create_engine, event, text as sa_text
    from sqlalchemy.orm import sessionmaker
    from app.models.plan import Plan
    from app.models.admin import AdminAuditLog
    from app.models.subscription import Payment, Subscription
    from app.services.admin_plans import update_admin_plan
    from fastapi import HTTPException

    schema = f"test_lastplan_{uuid.uuid4().hex[:10]}"
    eng = create_engine(settings.DATABASE_URL)

    @event.listens_for(eng, "connect")
    def _set_sp(dbapi_conn, _rec):
        cur = dbapi_conn.cursor()
        cur.execute(f'SET search_path TO "{schema}", public')
        cur.close()

    SessionIso = sessionmaker(autocommit=False, autoflush=False, bind=eng)
    try:
        with eng.connect() as conn:
            conn.execute(sa_text(f'CREATE SCHEMA "{schema}"'))
            conn.commit()
        with eng.connect() as conn:
            conn.execute(sa_text(f'SET search_path TO "{schema}", public'))
            for tbl in (Plan.__table__, AdminAuditLog.__table__, Subscription.__table__, Payment.__table__):
                tbl.create(bind=conn)
            conn.commit()
        with SessionIso() as iso_db:
            iso_db.add(
                Plan(
                    id="onlypaid",
                    name="Only Paid",
                    is_public=True,
                    is_active=True,
                    is_system=False,
                    sort_order=10,
                    monthly_price_cents=999,
                    annual_price_cents=11388,
                    annual_monthly_equivalent_cents=949,
                    rate_limit_tier="starter",
                    linkedin_profiles=1,
                    scheduled_posts_per_period=10,
                    playground_runs_per_period=20,
                    playground_runs_per_day=5,
                    max_post_days_per_week=5,
                    daily_spend_limit_cents=50,
                    analytics_level="basic",
                    support_label="Email",
                )
            )
            iso_db.commit()
            with patch("app.services.admin_plans.bump_plans_version"):
                with pytest.raises(HTTPException) as exc:
                    update_admin_plan(
                        db=iso_db,
                        plan_id="onlypaid",
                        actor_id="adm",
                        actor_email="ahmadimran@mbstack.net",
                        data={"is_active": False, "expected_version": 1, "reason": "disable last plan"},
                    )
                assert exc.value.status_code in (400, 409)
    finally:
        with eng.connect() as conn:
            conn.execute(sa_text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
            conn.commit()
        eng.dispose()
        invalidate_plans_cache()


def test_20_21_22_23_24_phase_c_void_record_tx_and_secret():
    u1 = str(uuid.uuid4())
    admin_uid = str(uuid.uuid4())
    u1_email = f"suitec-{u1[:8]}@example.com"
    admin_email = "ahmadimran@mbstack.net"

    with SessionLocal() as db:
        _insert_test_user(db, u1, u1_email, "Phase C Suite User")
        db.commit()

    active = {"user": User(id=admin_uid, email=admin_email, name="Admin")}
    app.dependency_overrides[current_user] = lambda: active["user"]
    client = TestClient(app)
    pay_ids: list[str] = []

    try:
        _lim._in_memory_fixed_windows.clear()
        _secret_fail_counts.clear()
        _secret_lockouts.clear()

        with patch("app.api.routes.admin_deps.resolve_user_email_and_verified", return_value=(admin_email, True)), \
             patch("app.api.routes.admin_payments.send_user_notification", return_value={"status": "sent"}), \
             patch("app.core.limiter.get_redis_client", return_value=None), \
             patch.object(settings, "ADMIN_EMAILS", admin_email):

            # Record manual payment without transaction_id -> auto MANUAL-* & activated
            r_rec = client.post(
                "/api/admin/payments/record",
                json={
                    "user_id": u1,
                    "plan_id": "starter",
                    "billing_interval": "monthly",
                    "method": "cash",
                    "activate_plan": True,
                    "send_email": False,
                },
            )
            assert r_rec.status_code == 201, r_rec.text
            rec = r_rec.json()
            pay_ids.append(rec["id"])
            assert rec["transaction_id"].startswith("MANUAL-")

            # Parallel void -> exactly one wins (200), other gets 409; current_period_end clamped >= now
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                f1 = pool.submit(client.patch, f"/api/admin/payments/{rec['id']}/void", json={"reason": "void 1", "revoke_access": True, "send_email": False})
                f2 = pool.submit(client.patch, f"/api/admin/payments/{rec['id']}/void", json={"reason": "void 2", "revoke_access": True, "send_email": False})
                codes = sorted([f1.result().status_code, f2.result().status_code])
            assert codes == [200, 409]

            # Voided tx_id CANNOT be resubmitted (409)
            active["user"] = User(id=u1, email=u1_email, name="Phase C Suite User")
            tx_void = f"VOIDTX{uuid.uuid4().hex[:8].upper()}"
            active["user"] = User(id=admin_uid, email=admin_email, name="Admin")
            r_rec2 = client.post(
                "/api/admin/payments/record",
                json={"user_id": u1, "plan_id": "starter", "billing_interval": "monthly", "method": "bank_transfer", "transaction_id": tx_void, "activate_plan": False, "send_email": False},
            )
            assert r_rec2.status_code == 201, r_rec2.text
            pay_ids.append(r_rec2.json()["id"])
            assert client.patch(f"/api/admin/payments/{r_rec2.json()['id']}/void", json={"reason": "fraud", "revoke_access": False, "send_email": False}).status_code == 200

            active["user"] = User(id=u1, email=u1_email, name="Phase C Suite User")
            r_resub_void = client.post(
                "/api/billing/payments",
                json={"plan_id": "starter", "billing_interval": "monthly", "method": "easypaisa", "transaction_id": tx_void},
            )
            assert r_resub_void.status_code == 409, r_resub_void.text

            # Rejected tx_id CAN be resubmitted
            tx_rej = f"REJTX{uuid.uuid4().hex[:8].upper()}"
            r_sub = client.post(
                "/api/billing/payments",
                json={"plan_id": "starter", "billing_interval": "monthly", "method": "jazzcash", "transaction_id": tx_rej},
            )
            assert r_sub.status_code == 201
            pay_ids.append(r_sub.json()["id"])
            active["user"] = User(id=admin_uid, email=admin_email, name="Admin")
            assert client.post(f"/api/admin/payments/{r_sub.json()['id']}/reject", json={"reason": "blurry slip"}).status_code == 200
            active["user"] = User(id=u1, email=u1_email, name="Phase C Suite User")
            r_resub_ok = client.post(
                "/api/billing/payments",
                json={"plan_id": "starter", "billing_interval": "monthly", "method": "jazzcash", "transaction_id": tx_rej},
            )
            assert r_resub_ok.status_code == 201, r_resub_ok.text
            pay_ids.append(r_resub_ok.json()["id"])

            # /api/admin/activate-plan secret checks
            with patch.object(settings, "ADMIN_ACTIVATE_SECRET", ""):
                assert client.post("/api/admin/activate-plan", json={"user_id": u1, "plan_id": "pro", "reason": "unset"}).status_code == 404
            with patch.object(settings, "ADMIN_ACTIVATE_SECRET", "secret-val-123"):
                r_sec = client.post(
                    "/api/admin/activate-plan",
                    headers={"x-admin-secret": "secret-val-123", "x-forwarded-for": "198.51.100.10"},
                    json={"user_id": u1, "plan_id": "business", "reason": "partner activation"},
                )
                assert r_sec.status_code == 200, r_sec.text
                for _ in range(5):
                    assert client.post(
                        "/api/admin/activate-plan",
                        headers={"x-admin-secret": "wrong", "x-forwarded-for": "198.51.100.11"},
                        json={"user_id": u1, "plan_id": "pro", "reason": "bad"},
                    ).status_code == 401
                assert _is_secret_ip_locked("198.51.100.11")
                assert client.post(
                    "/api/admin/activate-plan",
                    headers={"x-admin-secret": "secret-val-123", "x-forwarded-for": "198.51.100.11"},
                    json={"user_id": u1, "plan_id": "pro", "reason": "locked"},
                ).status_code == 401
    finally:
        app.dependency_overrides.clear()
        _lim._in_memory_fixed_windows.clear()
        _lim._in_memory_fallback.clear()
        _secret_fail_counts.clear()
        _secret_lockouts.clear()
        _cleanup_test_entities([u1, admin_uid], pay_ids, [])


def test_25_26_27_28_support_security_ratelimit_attachments_and_csv_escaping():
    u1 = str(uuid.uuid4())
    u2 = str(uuid.uuid4())
    admin_uid = str(uuid.uuid4())
    u1_email = f"suited1-{u1[:8]}@example.com"
    u2_email = f"suited2-{u2[:8]}@example.com"
    admin_email = "ahmadimran@mbstack.net"

    with SessionLocal() as db:
        _insert_test_user(db, u1, u1_email, "=CMD()")
        _insert_test_user(db, u2, u2_email, "Other User")
        db.commit()

    active = {"user": User(id=u1, email=u1_email, name="=CMD()")}
    app.dependency_overrides[current_user] = lambda: active["user"]
    client = TestClient(app)
    ticket_ids: list[str] = []

    try:
        _lim._in_memory_fallback.clear()
        sent_emails: list[dict] = []

        def _capture_email(**kwargs):
            sent_emails.append(kwargs)
            return {"id": str(uuid.uuid4()), "status": "sent", "error": None}

        valid_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 32

        with patch("app.api.routes.support.send_user_notification", side_effect=_capture_email), \
             patch("app.api.routes.admin_support.send_user_notification", side_effect=_capture_email), \
             patch("app.api.routes.admin_deps.resolve_user_email_and_verified", side_effect=lambda _d, u: ((u.email or "").lower(), (u.email or "").lower() == admin_email)), \
             patch("app.core.limiter.get_redis_client", return_value=None), \
             patch.object(settings, "ADMIN_EMAILS", admin_email):

            # Fake exe renamed to .png rejected (use u2 so u1's 5-ticket rate-limit test starts clean at 0)
            active["user"] = User(id=u2, email=u2_email, name="Other User")
            r_fake = client.post(
                "/api/support/tickets",
                data={"subject": "Bad file", "category": "bug", "priority": "low", "description": "test"},
                files={"attachment": ("fake.png", b"MZ\x90\x00executable", "image/png")},
            )
            assert r_fake.status_code == 400, r_fake.text

            # Ticket with formula-trigger subject for CSV test + PNG screenshot
            active["user"] = User(id=u1, email=u1_email, name="=CMD()")
            r_t1 = client.post(
                "/api/support/tickets",
                data={"subject": "@SUM(1,2) issue", "category": "bug", "priority": "urgent", "description": "Help"},
                files={"attachment": ("ok.png", valid_png, "image/png")},
            )
            assert r_t1.status_code == 201, r_t1.text
            t1_id = r_t1.json()["ticket"]["id"]
            m1_id = r_t1.json()["messages"][0]["id"]
            ticket_ids.append(t1_id)

            # Other user cannot read ticket or attachment
            active["user"] = User(id=u2, email=u2_email, name="Other User")
            assert client.get(f"/api/support/tickets/{t1_id}").status_code == 404
            assert client.get(f"/api/support/tickets/{t1_id}/attachments/{m1_id}").status_code == 404

            # Admin internal note -> no email + invisible to u1
            sent_emails.clear()
            active["user"] = User(id=admin_uid, email=admin_email, name="Admin")
            r_note = client.post(
                f"/api/admin/support/tickets/{t1_id}/reply",
                json={"body": "Secret internal triage note", "is_internal": True},
            )
            assert r_note.status_code == 200 and sent_emails == []
            active["user"] = User(id=u1, email=u1_email, name="=CMD()")
            msgs_for_u1 = client.get(f"/api/support/tickets/{t1_id}").json()["messages"]
            assert all("Secret internal" not in m["body"] for m in msgs_for_u1)

            # Admin public reply moves open -> in_progress & sends user email; resolve & reopen
            active["user"] = User(id=admin_uid, email=admin_email, name="Admin")
            r_pub = client.post(
                f"/api/admin/support/tickets/{t1_id}/reply",
                json={"body": "We fixed this.", "is_internal": False},
            )
            assert r_pub.status_code == 200 and r_pub.json()["ticket"]["status"] == "in_progress"
            assert any(e["notification_type"] == "support_reply_user" for e in sent_emails)
            assert client.patch(f"/api/admin/support/tickets/{t1_id}/status", json={"status": "resolved", "send_email": False}).status_code == 200
            active["user"] = User(id=u1, email=u1_email, name="=CMD()")
            r_reopen = client.post(f"/api/support/tickets/{t1_id}/reply", data={"body": "Please check again"})
            assert r_reopen.status_code == 200 and r_reopen.json()["ticket"]["status"] == "open"

            # Support ticket creation rate limit: 1 already created, 4 more allowed, 6th -> 429
            for idx in range(4):
                r_more = client.post(
                    "/api/support/tickets",
                    data={"subject": f"Ticket {idx+2}", "category": "other", "priority": "low", "description": "Testing limit"},
                )
                assert r_more.status_code == 201, r_more.text
                ticket_ids.append(r_more.json()["ticket"]["id"])
            r_6th = client.post(
                "/api/support/tickets",
                data={"subject": "Ticket 6", "category": "other", "priority": "low", "description": "Should limit"},
            )
            assert r_6th.status_code == 429, r_6th.text

            # CSV formula injection & BOM test + user JSON export
            assert csv_safe_cell("=CMD()") == "'=CMD()"
            assert csv_safe_cell("+1+2") == "'+1+2"
            assert csv_safe_cell("-2+3") == "'-2+3"
            assert csv_safe_cell("@SUM(A1)") == "'@SUM(A1)"

            active["user"] = User(id=admin_uid, email=admin_email, name="Admin")
            r_csv = client.get(f"/api/admin/export/support-tickets.csv?search={u1_email}")
            assert r_csv.status_code == 200
            assert r_csv.content.startswith(b"\xef\xbb\xbf")
            csv_txt = r_csv.content.decode("utf-8-sig")
            assert "'=CMD()" in csv_txt
            assert "'@SUM(1,2) issue" in csv_txt

            r_json = client.get(f"/api/admin/users/{u1}/export")
            assert r_json.status_code == 200
            bundle = json.loads(r_json.content.decode("utf-8"))
            assert bundle["profile"]["id"] == u1
            assert "plan" in bundle and "quota_usage" in bundle and "payments" in bundle
    finally:
        app.dependency_overrides.clear()
        _lim._in_memory_fallback.clear()
        _cleanup_test_entities([u1, u2, admin_uid], ticket_ids, [])
