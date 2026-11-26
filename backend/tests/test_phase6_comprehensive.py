"""Phase 6 comprehensive verification suite covering all 13 required security and concurrency cases."""

from concurrent.futures import ThreadPoolExecutor
import datetime
import hashlib
import re
import sys
import threading
from pathlib import Path
from unittest.mock import patch
import uuid

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import text

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core import auth
from app.core.config import settings
from app.core.crypto import encrypt_text
from app.db.session import SessionLocal
from app.jobs.publish import claim_publication
from app.main import app
from app.models.admin import AdminAuditLog, DeletedAccount, EmailLog
from app.models.approval import Approval
from app.models.post import GenerationRun, Post
from app.models.profile import Profile
from app.models.publication import PostPublication
from app.models.slack import SlackApprovalMessage, SlackIntegration
from app.models.social_connection import SocialConnection
from app.models.subscription import Payment, Subscription
from app.repositories.profile import get_or_create_profile
from app.services import notifications
from app.services.slack import handle_block_action
from tests.conftest import create_test_token


@pytest.fixture
def phase6_env(ed25519_keys, monkeypatch):
    private_key, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks", lambda *args, **kwargs: jwks)

    admin_email = "ahmadimran@mbstack.net"
    protected_admin_email = "haris@mbstack.net"
    user_email = f"p6-user-{uuid.uuid4().hex[:8]}@example.com"
    no_prof_email = f"p6-noprof-{uuid.uuid4().hex[:8]}@example.com"
    non_admin_email = f"p6-nonadmin-{uuid.uuid4().hex[:8]}@example.com"

    admin_id = str(uuid.uuid4())
    protected_admin_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    no_prof_id = str(uuid.uuid4())
    non_admin_id = str(uuid.uuid4())

    created_admins = []
    with SessionLocal() as db:
        for idx, (uid, email, name) in enumerate(
            [
                (admin_id, admin_email, "Primary Admin"),
                (protected_admin_id, protected_admin_email, "Protected Admin"),
            ]
        ):
            existing = db.execute(
                text('SELECT id::text, "emailVerified" FROM neon_auth."user" WHERE lower(email) = :e LIMIT 1'),
                {"e": email},
            ).fetchone()
            if existing:
                if idx == 0:
                    admin_id = existing.id
                else:
                    protected_admin_id = existing.id
                if not existing.emailVerified:
                    db.execute(
                        text('UPDATE neon_auth."user" SET "emailVerified" = true WHERE id::text = :id'),
                        {"id": existing.id},
                    )
            else:
                created_admins.append(uid)
                db.execute(
                    text(
                        'INSERT INTO neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") '
                        'VALUES (:id, :name, :email, true, now(), now())'
                    ),
                    {"id": uid, "name": name, "email": email},
                )

        for uid, email, name in [
            (user_id, user_email, "P6 User"),
            (no_prof_id, no_prof_email, "No Profile User"),
            (non_admin_id, non_admin_email, "Regular User"),
        ]:
            db.execute(
                text(
                    'INSERT INTO neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") '
                    'VALUES (:id, :name, :email, true, now(), now())'
                ),
                {"id": uid, "name": name, "email": email},
            )
        db.commit()

    yield {
        "private_key": private_key,
        "admin_id": admin_id,
        "admin_email": admin_email,
        "protected_admin_id": protected_admin_id,
        "protected_admin_email": protected_admin_email,
        "user_id": user_id,
        "user_email": user_email,
        "no_prof_id": no_prof_id,
        "no_prof_email": no_prof_email,
        "non_admin_id": non_admin_id,
        "non_admin_email": non_admin_email,
    }

    with SessionLocal() as db:
        for uid in (user_id, no_prof_id, non_admin_id):
            db.query(SlackApprovalMessage).filter(SlackApprovalMessage.user_id == uid).delete(synchronize_session=False)
            db.query(SlackIntegration).filter(SlackIntegration.user_id == uid).delete(synchronize_session=False)
            db.query(SocialConnection).filter(SocialConnection.user_id == uid).delete(synchronize_session=False)
            db.query(PostPublication).filter(PostPublication.user_id == uid).delete(synchronize_session=False)
            db.query(Approval).filter(Approval.user_id == uid).delete(synchronize_session=False)
            db.query(GenerationRun).filter(GenerationRun.user_id == uid).delete(synchronize_session=False)
            db.query(Post).filter(Post.user_id == uid).delete(synchronize_session=False)
            db.query(Payment).filter(Payment.user_id == uid).delete(synchronize_session=False)
            db.query(Subscription).filter(Subscription.user_id == uid).delete(synchronize_session=False)
            db.query(Profile).filter(Profile.user_id == uid).delete(synchronize_session=False)
            db.query(EmailLog).filter(EmailLog.user_id == uid).delete(synchronize_session=False)
            db.query(AdminAuditLog).filter(AdminAuditLog.target_id == uid).delete(synchronize_session=False)
            db.execute(text('DELETE FROM neon_auth."user" WHERE id::text = :id'), {"id": uid})
        db.execute(text("DELETE FROM deleted_accounts WHERE lower(email) = :e"), {"e": user_email.lower()})
        db.query(AdminAuditLog).filter(AdminAuditLog.actor_id == non_admin_id).delete(synchronize_session=False)
        db.query(AdminAuditLog).filter(AdminAuditLog.target_email == user_email).delete(synchronize_session=False)
        for aid in created_admins:
            db.execute(text('DELETE FROM neon_auth."user" WHERE id::text = :id'), {"id": aid})
        db.commit()


def test_1_parallel_payment_approvals_only_one_wins(phase6_env):
    admin_token = create_test_token(
        phase6_env["private_key"],
        sub=phase6_env["admin_id"],
        email=phase6_env["admin_email"],
    )
    uid = phase6_env["user_id"]
    with SessionLocal() as db:
        pay = Payment(
            user_id=uid,
            user_email=phase6_env["user_email"],
            plan_id="starter",
            billing_interval="monthly",
            amount_usd_cents=999,
            amount_pkr=2798,
            method="easypaisa",
            transaction_id=f"PAR{uuid.uuid4().hex[:8].upper()}",
            status="pending",
        )
        db.add(pay)
        db.commit()
        pid = str(pay.id)

    barrier = threading.Barrier(2)

    def approve_once():
        c = TestClient(app)
        barrier.wait(timeout=10)
        return c.post(
            f"/api/admin/payments/{pid}/approve",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

    with patch.object(notifications, "send_smtp_message", return_value="<par-pay@mbstack.net>"):
        with ThreadPoolExecutor(max_workers=2) as pool:
            f1 = pool.submit(approve_once)
            f2 = pool.submit(approve_once)
            r1, r2 = f1.result(), f2.result()

    assert {r1.status_code, r2.status_code} == {200, 409}


def test_2_parallel_status_changes_only_one_wins(phase6_env):
    admin_token = create_test_token(
        phase6_env["private_key"],
        sub=phase6_env["admin_id"],
        email=phase6_env["admin_email"],
    )
    uid = phase6_env["user_id"]
    barrier = threading.Barrier(2)

    def suspend_once(target_status: str):
        c = TestClient(app)
        barrier.wait(timeout=10)
        return c.patch(
            f"/api/admin/users/{uid}/status",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "status": target_status,
                "expected_status": "active",
                "reason": "Parallel status test",
                "send_email": False,
            },
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(suspend_once, "suspended")
        f2 = pool.submit(suspend_once, "disabled")
        r1, r2 = f1.result(), f2.result()

    assert {r1.status_code, r2.status_code} == {200, 409}


def test_3_parallel_plan_changes_only_one_wins(phase6_env):
    admin_token = create_test_token(
        phase6_env["private_key"],
        sub=phase6_env["admin_id"],
        email=phase6_env["admin_email"],
    )
    uid = phase6_env["user_id"]
    with SessionLocal() as db:
        db.add(Subscription(user_id=uid, plan_id="trial", status="trialing"))
        db.commit()

    barrier = threading.Barrier(2)

    def change_plan(plan_id: str):
        c = TestClient(app)
        barrier.wait(timeout=10)
        return c.patch(
            f"/api/admin/users/{uid}/plan",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "plan_id": plan_id,
                "billing_interval": "monthly",
                "expected_plan_id": "trial",
                "reset_quota_cycle": False,
                "reason": "Parallel plan change test",
                "send_email": False,
            },
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(change_plan, "starter")
        f2 = pool.submit(change_plan, "pro")
        r1, r2 = f1.result(), f2.result()

    assert {r1.status_code, r2.status_code} == {200, 409}


def test_4_5_6_suspended_user_token_approvals_slack_and_publish_claim(phase6_env):
    admin_token = create_test_token(
        phase6_env["private_key"],
        sub=phase6_env["admin_id"],
        email=phase6_env["admin_email"],
    )
    uid = phase6_env["user_id"]
    user_token = create_test_token(
        phase6_env["private_key"],
        sub=uid,
        email=phase6_env["user_email"],
    )
    client = TestClient(app)

    # Active user token works before suspension
    assert client.get("/me", headers={"Authorization": f"Bearer {user_token}"}).status_code == 200

    now = datetime.datetime.now(datetime.timezone.utc)
    raw_token = f"tok-{uuid.uuid4().hex}"
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    with SessionLocal() as db:
        post_wait = Post(
            user_id=uid,
            run_date=now.date(),
            status="awaiting_approval",
            topic_title="Wait Topic",
            topic_url="https://example.com/w",
            sources=[],
            caption="Wait",
            hashtags=[],
            image_spec={},
            publish_at=now + datetime.timedelta(hours=2),
            llm_model="gemini-3.5-flash-lite",
            prompt_version="v1",
        )
        post_pub = Post(
            user_id=uid,
            run_date=now.date(),
            status="approved",
            topic_title="Pub Topic",
            topic_url="https://example.com/p",
            sources=[],
            caption="Pub",
            hashtags=[],
            image_spec={},
            publish_at=now - datetime.timedelta(minutes=2),
            llm_model="gemini-3.5-flash-lite",
            prompt_version="v1",
        )
        db.add_all([post_wait, post_pub])
        db.flush()

        appr = Approval(
            user_id=uid,
            post_id=post_wait.id,
            channel="email",
            token_hash=token_hash,
            expires_at=now + datetime.timedelta(hours=2),
        )
        slack_int = SlackIntegration(
            user_id=uid,
            team_id="T123",
            slack_user_id="U123",
            dm_channel_id="D123",
            bot_token_encrypted=encrypt_text("xoxb-fake"),
            bot_user_id="B123",
            status="connected",
        )
        slack_msg = SlackApprovalMessage(
            post_id=post_wait.id,
            user_id=uid,
            channel_id="D123",
            message_ts="1700000.1",
            status="sent",
        )
        pub = PostPublication(
            user_id=uid,
            post_id=post_pub.id,
            platform="linkedin",
            status="pending",
        )
        db.add_all([appr, slack_int, slack_msg, pub])
        db.commit()
        wait_post_id = str(post_wait.id)
        pub_id = pub.id

    # Suspend user
    s_res = client.patch(
        f"/api/admin/users/{uid}/status",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "status": "suspended",
            "expected_status": "active",
            "reason": "Testing suspend enforcement",
            "send_email": False,
        },
    )
    assert s_res.status_code == 200

    # Test 4: old token rejected with ACCOUNT_SUSPENDED
    me_res = client.get("/me", headers={"Authorization": f"Bearer {user_token}"})
    assert me_res.status_code == 403
    assert me_res.json()["error"]["code"] == "ACCOUNT_SUSPENDED"

    # Test 5a: email approval link does nothing
    link_res = client.post(
        f"/public/approvals/{raw_token}/decision",
        json={"decision": "approved"},
    )
    assert link_res.status_code == 403
    assert link_res.json()["error"]["code"] == "ACCOUNT_SUSPENDED"

    # Test 5b: Slack button does nothing
    with SessionLocal() as db:
        with patch("app.services.slack.send_ephemeral_response"):
            slack_res = handle_block_action(
                {
                    "user": {"id": "U123"},
                    "team": {"id": "T123"},
                    "channel": {"id": "D123"},
                    "message": {"ts": "1700000.1"},
                    "actions": [{"action_id": "approve_post", "value": wait_post_id}],
                },
                db=db,
            )
        assert slack_res["status"] == "error"
        assert slack_res["detail"] == "ACCOUNT_SUSPENDED"

    # Test 6: publish claim refuses suspended user even if a publication row is still pending
    with SessionLocal() as db:
        db.execute(text("UPDATE post_publications SET status = 'pending' WHERE id = :id"), {"id": pub_id})
        db.commit()
        assert claim_publication(db, pub_id) is False


def test_7_admin_emails_cannot_be_suspended_disabled_or_deleted(phase6_env):
    admin_token = create_test_token(
        phase6_env["private_key"],
        sub=phase6_env["admin_id"],
        email=phase6_env["admin_email"],
    )
    target_id = phase6_env["protected_admin_id"]
    target_email = phase6_env["protected_admin_email"]
    client = TestClient(app)

    for st in ("suspended", "disabled"):
        r = client.patch(
            f"/api/admin/users/{target_id}/status",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"status": st, "expected_status": "active", "reason": "Try protect", "send_email": False},
        )
        assert r.status_code == 403
        assert r.json()["error"]["code"] == "protected_admin"

    d = client.request(
        "DELETE",
        f"/api/admin/users/{target_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"confirm_email": target_email, "reason": "Try delete admin", "send_email": False},
    )
    assert d.status_code == 403
    assert d.json()["error"]["code"] == "protected_admin"


def test_8_email_idempotency_never_sends_twice(phase6_env):
    uid = phase6_env["user_id"]
    idem = f"p6-idem-{uuid.uuid4()}"
    with SessionLocal() as db:
        with patch.object(notifications, "send_smtp_message", return_value="<idem@mbstack.net>") as mock_smtp:
            r1 = notifications.send_user_notification(
                user_id=uid,
                to_email=phase6_env["user_email"],
                notification_type="reactivated",
                payload={"display_name": "P6"},
                idempotency_key=idem,
                db=db,
            )
            r2 = notifications.send_user_notification(
                user_id=uid,
                to_email=phase6_env["user_email"],
                notification_type="reactivated",
                payload={"display_name": "P6"},
                idempotency_key=idem,
                db=db,
            )
            assert r1["status"] == "sent"
            assert r2["status"] == "skipped"
            assert mock_smtp.call_count == 1


def test_9_unique_transaction_id_rule(phase6_env):
    admin_token = create_test_token(
        phase6_env["private_key"],
        sub=phase6_env["admin_id"],
        email=phase6_env["admin_email"],
    )
    uid = phase6_env["user_id"]
    user_token = create_test_token(
        phase6_env["private_key"],
        sub=uid,
        email=phase6_env["user_email"],
    )
    client = TestClient(app)

    tx1 = f"U1{uuid.uuid4().hex[:8].upper()}"
    tx2 = f"U2{uuid.uuid4().hex[:8].upper()}"

    # Submit tx1 -> 201
    p1 = client.post(
        "/api/billing/payments",
        headers={"Authorization": f"Bearer {user_token}"},
        json={"plan_id": "starter", "billing_interval": "monthly", "method": "easypaisa", "transaction_id": tx1},
    )
    assert p1.status_code == 201
    p1_id = p1.json()["id"]

    # Resubmit pending tx1 (even by another user) -> 409
    other_token = create_test_token(
        phase6_env["private_key"],
        sub=phase6_env["non_admin_id"],
        email=phase6_env["non_admin_email"],
    )
    dup_pending = client.post(
        "/api/billing/payments",
        headers={"Authorization": f"Bearer {other_token}"},
        json={"plan_id": "starter", "billing_interval": "monthly", "method": "easypaisa", "transaction_id": tx1},
    )
    assert dup_pending.status_code == 409

    # Approve tx1, then try submitting approved tx1 -> 409
    with patch.object(notifications, "send_smtp_message", return_value="<p1@mbstack.net>"):
        assert (
            client.post(
                f"/api/admin/payments/{p1_id}/approve",
                headers={"Authorization": f"Bearer {admin_token}"},
            ).status_code
            == 200
        )
    dup_approved = client.post(
        "/api/billing/payments",
        headers={"Authorization": f"Bearer {other_token}"},
        json={"plan_id": "starter", "billing_interval": "monthly", "method": "easypaisa", "transaction_id": tx1},
    )
    assert dup_approved.status_code == 409

    # Submit tx2, reject it, then resubmit tx2 -> 201
    p2 = client.post(
        "/api/billing/payments",
        headers={"Authorization": f"Bearer {user_token}"},
        json={"plan_id": "pro", "billing_interval": "monthly", "method": "jazzcash", "transaction_id": tx2},
    )
    assert p2.status_code == 201
    with patch.object(notifications, "send_smtp_message", return_value="<p2@mbstack.net>"):
        assert (
            client.post(
                f"/api/admin/payments/{p2.json()['id']}/reject",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"reason": "Mismatch"},
            ).status_code
            == 200
        )
    resub = client.post(
        "/api/billing/payments",
        headers={"Authorization": f"Bearer {user_token}"},
        json={"plan_id": "pro", "billing_interval": "monthly", "method": "jazzcash", "transaction_id": tx2},
    )
    assert resub.status_code == 201


def test_10_11_12_delete_preserves_records_blocks_resignup_and_no_profile_list(phase6_env):
    admin_token = create_test_token(
        phase6_env["private_key"],
        sub=phase6_env["admin_id"],
        email=phase6_env["admin_email"],
    )
    uid = phase6_env["user_id"]
    u_email = phase6_env["user_email"]
    no_prof_id = phase6_env["no_prof_id"]
    no_prof_email = phase6_env["no_prof_email"]
    client = TestClient(app)

    # Test 12: User without a profiles row appears in admin users list
    list_res = client.get(
        f"/api/admin/users?search={no_prof_email}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert list_res.status_code == 200
    assert any(u["id"] == no_prof_id and u["account_status"] == "active" for u in list_res.json()["items"])

    # Seed payment & email log for uid before delete
    with SessionLocal() as db:
        db.add(
            Payment(
                user_id=uid,
                user_email=u_email,
                plan_id="starter",
                billing_interval="monthly",
                amount_usd_cents=999,
                amount_pkr=2798,
                method="easypaisa",
                transaction_id=f"DEL{uuid.uuid4().hex[:8].upper()}",
                status="pending",
            )
        )
        db.add(
            EmailLog(
                user_id=uid,
                to_email=u_email,
                type="reactivated",
                status="sent",
            )
        )
        db.commit()

    # Delete user
    with patch.object(notifications, "send_smtp_message", return_value="<del6@mbstack.net>"):
        del_res = client.request(
            "DELETE",
            f"/api/admin/users/{uid}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"confirm_email": u_email, "reason": "Phase 6 delete test", "send_email": True},
        )
    assert del_res.status_code == 200

    # Test 11: payments, email_logs, admin_audit_logs preserved; deleted_accounts blocks re-signup (Test 10)
    with SessionLocal() as db:
        assert db.query(Payment).filter(Payment.user_id == uid).count() >= 1
        assert db.query(EmailLog).filter(EmailLog.user_id == uid).count() >= 1
        assert db.query(AdminAuditLog).filter(AdminAuditLog.target_id == uid).count() >= 1
        assert db.query(Profile).filter(Profile.user_id == uid).count() == 0

        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            get_or_create_profile(db, user_id=str(uuid.uuid4()), display_name="Retry", email=u_email)
        assert exc_info.value.status_code == 403
        assert exc_info.value.detail["code"] == "ACCOUNT_DELETED"

    # Admin allows email to sign up again
    allow_res = client.request(
        "DELETE",
        "/api/admin/deleted-accounts",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"email": u_email},
    )
    assert allow_res.status_code == 200

    new_uid = str(uuid.uuid4())
    with SessionLocal() as db:
        try:
            prof = get_or_create_profile(db, user_id=new_uid, display_name="Allowed Back", email=u_email)
            assert prof.user_id == new_uid
        finally:
            db.query(Profile).filter(Profile.user_id == new_uid).delete(synchronize_session=False)
            db.commit()


def _iter_api_routes(router, prefix: str = ""):
    for route in router.routes:
        if hasattr(route, "original_router") and hasattr(route, "include_context"):
            sub_prefix = f"{prefix}{getattr(route.include_context, 'prefix', '') or ''}"
            yield from _iter_api_routes(route.original_router, prefix=sub_prefix)
        elif isinstance(route, APIRoute):
            yield f"{prefix}{route.path}", route.methods or set()


def test_13_every_admin_route_rejects_non_admin_with_403(phase6_env):
    non_admin_token = create_test_token(
        phase6_env["private_key"],
        sub=phase6_env["non_admin_id"],
        email=phase6_env["non_admin_email"],
    )
    client = TestClient(app)

    admin_routes = [
        (path, methods)
        for path, methods in _iter_api_routes(app.router)
        if path.startswith("/api/admin")
    ]
    assert len(admin_routes) >= 14

    checked = 0
    for path, methods in admin_routes:
        url = re.sub(r"\{[^}]+\}", str(uuid.uuid4()), path)
        for method in sorted(methods - {"HEAD", "OPTIONS"}):
            kwargs = {"headers": {"Authorization": f"Bearer {non_admin_token}"}}
            if path == "/api/admin/activate-plan":
                kwargs["json"] = {"user_id": "x", "plan_id": "pro", "reason": "non-admin test"}
            elif method in ("POST", "PATCH", "PUT", "DELETE"):
                kwargs["json"] = {}
            resp = client.request(method, url, **kwargs)
            if path == "/api/admin/activate-plan":
                assert resp.status_code in (401, 404), (
                    f"Expected 401/404 for {method} {path} without secret, got {resp.status_code}: {resp.text}"
                )
            else:
                assert resp.status_code == 403, (
                    f"Expected 403 for non-admin on {method} {path}, got {resp.status_code}: {resp.text}"
                )
            checked += 1

    assert checked >= 14
