import types
import uuid
from unittest.mock import MagicMock, patch

from app.core.config import settings
from app.core.crypto import encrypt_text
from app.services.email import send_approval_email
from app.services.image import build_post_image_spec, post_has_image
from app.services.linkedin_publisher import publish_direct_post, publish_post_to_linkedin


def test_auto_image_enabled_defaults_false():
    assert settings.AUTO_IMAGE_ENABLED is False


def test_build_post_image_spec_and_post_has_image():
    profile = types.SimpleNamespace(
        brand_name="Acme",
        brand_primary_hex="#112233",
        brand_accent_hex="#445566",
    )
    text_only_empty = build_post_image_spec(
        draft={"image_headline": "Ignored", "first_comment": ""},
        chosen={"title": "Topic"},
        profile=profile,
        auto_image_enabled=False,
    )
    assert text_only_empty == {}
    assert post_has_image(text_only_empty) is False

    text_only_comment = build_post_image_spec(
        draft={"image_headline": "Ignored", "first_comment": "Source link here"},
        chosen={"title": "Topic"},
        profile=profile,
        auto_image_enabled=False,
    )
    assert text_only_comment == {"first_comment": "Source link here"}
    assert post_has_image(text_only_comment) is False

    with_image = build_post_image_spec(
        draft={"image_headline": "Real Headline", "first_comment": "Comment"},
        chosen={"title": "Topic"},
        profile=profile,
        auto_image_enabled=True,
    )
    assert with_image["headline"] == "Real Headline"
    assert with_image["template_version"] == "v1"
    assert post_has_image(with_image) is True


def _mock_db_with_conn():
    conn = types.SimpleNamespace(
        user_id="user_1",
        provider="linkedin",
        provider_account_id="person_123",
        status="active",
        access_token_enc=encrypt_text("fake-token"),
        expires_at=None,
    )
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = conn
    return db


def test_publish_post_to_linkedin_text_only_skips_image_upload():
    db = _mock_db_with_conn()
    post = types.SimpleNamespace(
        id=uuid.uuid4(),
        user_id="user_1",
        topic_title="Text Only Topic",
        caption="Hello LinkedIn",
        hashtags=["ai"],
        image_spec={},
    )

    post_res = MagicMock(status_code=201, headers={"x-restli-id": "urn:li:share:text1"})
    client = MagicMock()
    client.post.return_value = post_res

    with patch("app.services.linkedin_publisher.render_post_image") as mock_render:
        ok, urn, err_code, err_detail = publish_post_to_linkedin(db, post, client=client)

    assert ok is True
    assert urn == "urn:li:share:text1"
    assert err_code is None
    assert err_detail is None
    mock_render.assert_not_called()
    assert client.post.call_count == 1
    called_url = client.post.call_args.args[0]
    called_json = client.post.call_args.kwargs["json"]
    assert called_url == "https://api.linkedin.com/rest/posts"
    assert "content" not in called_json
    client.put.assert_not_called()


def test_publish_post_to_linkedin_legacy_image_post_still_attaches_image():
    db = _mock_db_with_conn()
    post = types.SimpleNamespace(
        id=uuid.uuid4(),
        user_id="user_1",
        topic_title="Legacy Image Topic",
        caption="Hello LinkedIn",
        hashtags=[],
        image_spec={"headline": "Legacy Headline", "template_version": "v1"},
    )

    init_res = MagicMock(
        status_code=200,
        json=lambda: {"value": {"uploadUrl": "https://upload.example/put", "image": "urn:li:image:99"}},
    )
    put_res = MagicMock(status_code=201)
    post_res = MagicMock(status_code=201, headers={"x-restli-id": "urn:li:share:img1"})
    client = MagicMock()
    client.post.side_effect = [init_res, post_res]
    client.put.return_value = put_res

    with patch("app.services.linkedin_publisher.render_post_image", return_value=b"pngbytes") as mock_render:
        ok, urn, err_code, _ = publish_post_to_linkedin(db, post, client=client)

    assert ok is True
    assert urn == "urn:li:share:img1"
    assert err_code is None
    mock_render.assert_called_once()
    assert client.post.call_count == 2
    assert client.put.call_count == 1
    post_payload = client.post.call_args_list[1].kwargs["json"]
    assert post_payload["content"]["media"]["id"] == "urn:li:image:99"


def test_publish_direct_post_manual_image_upload_unchanged():
    init_res = MagicMock(
        status_code=200,
        json=lambda: {"value": {"uploadUrl": "https://upload.example/manual", "image": "urn:li:image:manual"}},
    )
    put_res = MagicMock(status_code=201)
    post_res = MagicMock(status_code=201, headers={"x-restli-id": "urn:li:share:manual1"})
    client = MagicMock()
    client.post.side_effect = [init_res, post_res]
    client.put.return_value = put_res

    urn = publish_direct_post(
        access_token="tok",
        provider_account_id="person_123",
        commentary="Manual post with image",
        visibility="PUBLIC",
        image_bytes=b"jpeg-bytes",
        image_content_type="image/jpeg",
        client=client,
    )
    assert urn == "urn:li:share:manual1"
    assert client.put.call_count == 1
    post_payload = client.post.call_args_list[1].kwargs["json"]
    assert post_payload["content"]["media"]["id"] == "urn:li:image:manual"


def test_send_approval_email_omits_img_when_has_image_false():
    captured_html = []

    def fake_send(msg):
        html_part = msg.get_body(preferencelist=("html",))
        captured_html.append(html_part.get_content())

    with patch("app.services.email.send_smtp_message", side_effect=fake_send):
        send_approval_email(
            to_email="user@example.com",
            display_name="User",
            weekday="Monday",
            time_str="09:00",
            local_deadline="Monday at 09:00 UTC",
            topic_title="Topic",
            caption="Caption",
            raw_token="tok123",
            has_image=False,
        )
        send_approval_email(
            to_email="user@example.com",
            display_name="User",
            weekday="Monday",
            time_str="09:00",
            local_deadline="Monday at 09:00 UTC",
            topic_title="Topic",
            caption="Caption",
            raw_token="tok123",
            has_image=True,
        )

    assert len(captured_html) == 2
    assert "<img " not in captured_html[0]
    assert "<img " in captured_html[1]


def test_notify_slack_approval_skips_image_for_text_only_post():
    from app.services.slack import notify_slack_approval

    integration = types.SimpleNamespace(
        user_id="user_1",
        status="connected",
        bot_token_encrypted=encrypt_text("xoxb-fake"),
        dm_channel_id="D123",
    )
    profile = types.SimpleNamespace(
        user_id="user_1",
        approval_channel="slack",
        slack_approval_enabled=True,
        approval_lead_minutes=180,
        timezone="UTC",
    )
    post = types.SimpleNamespace(
        id=uuid.uuid4(),
        user_id="user_1",
        topic_title="Text Post",
        caption="Plain text caption",
        image_spec={},
        needs_review=False,
        publish_at=None,
    )

    db = MagicMock()
    db.query.return_value.filter.return_value.first.side_effect = [integration, profile]
    db.execute.return_value.scalar_one_or_none.return_value = uuid.uuid4()

    with patch("app.services.image.render_post_image") as mock_render, patch(
        "app.services.slack.upload_file_external"
    ) as mock_upload, patch(
        "app.services.image.generate_signed_image_url"
    ) as mock_signed, patch(
        "app.services.slack.post_approval_message",
        return_value=("D123", "1700000000.000100", "no_image"),
    ) as mock_post_msg:
        route = notify_slack_approval(db, post)

    assert route == "no_image"
    mock_render.assert_not_called()
    mock_upload.assert_not_called()
    mock_signed.assert_not_called()
    assert mock_post_msg.call_args.kwargs["image_file_id"] is None
    assert mock_post_msg.call_args.kwargs["signed_image_url"] is None


def test_pipeline_run_skips_image_headline_when_flag_false():
    from app.agents.detector import DetectorLLMOutput, LLMSubScores
    from app.agents.drafter import DrafterOutput
    from app.agents.gtm import GTMBriefOutput, GTMReviewOutput
    from app.services.pipeline import execute_pipeline
    from tests.test_pipeline_loop import _CLEAN_CAPTION, MockSearchAdapter, MockStructuredChatModel, _make_candidate, _make_finder_resp

    cand = _make_candidate(1)
    models = {
        "fast": MockStructuredChatModel(default_response={"queries": ["q1", "q2", "q3"]}),
        "finder": MockStructuredChatModel(default_response=_make_finder_resp(cand)),
        "gtm_brief": MockStructuredChatModel(
            default_response=GTMBriefOutput(
                hook_options=["H1", "H2", "H3"],
                chosen_hook="PostgreSQL 16 dropped buffer locks by 42%.",
                structure_lines=["1. A", "2. B", "3. C", "4. D"],
                ending_strategy="Decisive close [END-01].",
                notes=["[HOOK-01] Valid opening."],
            )
        ),
        "gtm_review": MockStructuredChatModel(
            default_response=GTMReviewOutput(hook_strength=9, review_notes=["Strong [HOOK-01]"])
        ),
        "drafter": MockStructuredChatModel(
            default_response=DrafterOutput(
                post_text=_CLEAN_CAPTION,
                hashtags=["PostgreSQL", "DatabaseInternals"],
                image_headline="Should Be Stripped",
            )
        ),
        "detector": MockStructuredChatModel(
            default_response=DetectorLLMOutput(
                sub_scores=LLMSubScores(vocabulary=5, structure=5, rhythm=5, specificity=5, tone=5),
                llm_score=5,
                findings=[],
            )
        ),
    }

    with patch("app.services.checks.generate_companion_image_headline") as mock_img_hl:
        final_state = execute_pipeline(
            user_id="user_test_auto_img",
            profile_dict={"role_title": "Database Engineer"},
            history=[],
            search_tool=MockSearchAdapter([cand]),
            models=models,
        )

    mock_img_hl.assert_not_called()
    assert final_state.get("status") == "succeeded"
    assert "image_headline" not in (final_state.get("draft") or {})
