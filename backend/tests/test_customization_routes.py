"""Integration tests for /customization API routes (CRUD, dedupe, IDOR, feature flag)."""

import uuid

import pytest

from app.core.auth import User, current_user
from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.customization import (
    CustomizationDocument,
    CustomizationFact,
    CustomizationJob,
    CustomizationPostSample,
    CustomizationSettings,
    CustomizationVersion,
)
from app.services.storage import LocalStorageBackend, reset_storage_backend_for_tests


@pytest.fixture
def custom_env(tmp_path):
    orig_enabled = settings.CUSTOMIZATION_ENABLED
    settings.CUSTOMIZATION_ENABLED = True
    reset_storage_backend_for_tests(LocalStorageBackend(str(tmp_path)))
    uid_a = f"test-custom-a-{uuid.uuid4().hex[:8]}"
    uid_b = f"test-custom-b-{uuid.uuid4().hex[:8]}"
    active_user = {"uid": uid_a}

    def _override_user():
        return User(id=active_user["uid"], email="a@example.com", name="User A")

    app.dependency_overrides[current_user] = _override_user
    yield active_user, uid_a, uid_b
    app.dependency_overrides.pop(current_user, None)
    settings.CUSTOMIZATION_ENABLED = orig_enabled
    reset_storage_backend_for_tests(None)

    with SessionLocal() as db:
        for uid in (uid_a, uid_b):
            db.query(CustomizationJob).filter(CustomizationJob.user_id == uid).delete(synchronize_session=False)
            db.query(CustomizationFact).filter(CustomizationFact.user_id == uid).delete(synchronize_session=False)
            db.query(CustomizationPostSample).filter(CustomizationPostSample.user_id == uid).delete(synchronize_session=False)
            db.query(CustomizationSettings).filter(CustomizationSettings.user_id == uid).delete(synchronize_session=False)
            db.query(CustomizationVersion).filter(CustomizationVersion.user_id == uid).delete(synchronize_session=False)
            db.query(CustomizationDocument).filter(CustomizationDocument.user_id == uid).delete(synchronize_session=False)
        db.commit()


def test_feature_flag_off_returns_404(client, custom_env):
    settings.CUSTOMIZATION_ENABLED = False
    res = client.get("/customization")
    assert res.status_code == 404


def test_upload_dedupe_idor_and_delete(client, custom_env):
    active_user, uid_a, uid_b = custom_env

    # Upload markdown playbook
    res = client.post(
        "/customization/documents",
        data={"kind": "playbook", "title": "Founder Playbook"},
        files={"file": ("playbook.md", b"# Rules\n\n- Keep hooks under 120 chars.\n", "text/markdown")},
    )
    assert res.status_code == 202, res.text
    doc = res.json()
    assert doc["kind"] == "playbook"
    assert doc["status"] == "uploaded"
    assert doc["duplicate"] is False
    doc_id = doc["id"]

    # Re-upload same file -> 200 duplicate
    res_dup = client.post(
        "/customization/documents",
        data={"kind": "playbook"},
        files={"file": ("playbook.md", b"# Rules\n\n- Keep hooks under 120 chars.\n", "text/markdown")},
    )
    assert res_dup.status_code == 200
    assert res_dup.json()["duplicate"] is True
    assert res_dup.json()["id"] == doc_id

    # IDOR: user B cannot access or delete user A's doc
    active_user["uid"] = uid_b
    assert client.get(f"/customization/documents/{doc_id}").status_code == 404
    assert client.patch(f"/customization/documents/{doc_id}", json={"enabled": False}).status_code == 404
    assert client.delete(f"/customization/documents/{doc_id}").status_code == 404

    # Back to user A
    active_user["uid"] = uid_a
    res_get = client.get(f"/customization/documents/{doc_id}")
    assert res_get.status_code == 200
    assert "Keep hooks under 120 chars" in res_get.json()["text_preview"]

    # Paste previous posts
    res_paste = client.post(
        "/customization/documents/paste",
        json={"kind": "previous_posts", "title": "My Posts", "text": "Post one content here.\n---\nPost two content here."},
    )
    assert res_paste.status_code == 202

    # Add business URL
    res_url = client.post(
        "/customization/urls",
        json={"url": "https://example.com/about", "title": "About"},
    )
    assert res_url.status_code == 202

    # Settings update
    res_set = client.put(
        "/customization/settings",
        json={"custom_instructions": "Always write in British English.", "business_mention": "natural"},
    )
    assert res_set.status_code == 200
    assert res_set.json()["custom_instructions"] == "Always write in British English."

    # Overview counts
    ov = client.get("/customization").json()
    assert ov["counts_by_kind"]["playbook"] == 1
    assert ov["counts_by_kind"]["previous_posts"] == 1
    assert ov["counts_by_kind"]["business"] == 1

    # Delete doc
    assert client.delete(f"/customization/documents/{doc_id}").status_code == 204
    assert client.get(f"/customization/documents/{doc_id}").status_code == 404
