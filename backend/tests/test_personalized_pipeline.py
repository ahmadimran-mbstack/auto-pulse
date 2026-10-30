import datetime
import pytest
from app.agents.knowledge.hook_library import (
    HOOK_LIBRARY,
    HOOK_STYLES,
    get_available_hook_styles,
    get_hooks_by_style,
    normalize_hook_style,
)
from app.agents.finder import FinderOutput, FinderSource, validate_finder_output
from app.services.content_profile import (
    build_default_content_profile,
    get_content_profile,
    invalidate_content_profile_cache,
)
from app.services.search_cache import build_search_cache_key, get_cached_search, set_cached_search
from app.services.search import Candidate


def test_hook_library_has_at_least_25_hooks_across_diverse_styles():
    assert len(HOOK_LIBRARY) >= 25
    styles_present = {h["style"] for h in HOOK_LIBRARY}
    expected_styles = {
        "story",
        "contrarian_opinion",
        "number_result",
        "question",
        "mistake",
        "how_to",
        "observation",
    }
    assert expected_styles.issubset(styles_present)
    for style in expected_styles:
        matching = get_hooks_by_style(style)
        assert len(matching) >= 3, f"Style {style} has fewer than 3 hooks"


def test_hook_style_filtering_excludes_last_5_posts():
    # User had posts with 'story', 'mistake', 'number_result', 'question', 'observation'
    recent_styles = ["story", "mistake", "number_result", "question", "observation"]
    available = get_available_hook_styles(recent_styles)

    # Must exclude all 5
    for s in recent_styles:
        assert s not in available

    # Remaining styles should include 'contrarian_opinion' and 'how_to'
    assert "contrarian_opinion" in available
    assert "how_to" in available


def test_content_profile_defaults_never_crash_on_empty_fields():
    profile_data = build_default_content_profile(user_id="user_test_empty", profile=None)
    assert profile_data["user_id"] == "user_test_empty"
    assert profile_data["role_title"] is not None
    assert profile_data["industry"] is not None
    assert profile_data["niche_description"] is not None
    assert profile_data["audience"] is not None
    assert profile_data["goals"] is not None
    assert profile_data["tone"] is not None
    assert len(profile_data["topics_include"]) > 0
    assert isinstance(profile_data["topics_avoid"], list)
    assert profile_data["location"] is not None
    assert profile_data["language"] is not None


def test_content_profile_caching_and_invalidation():
    user_id = "test_user_cache_123"
    invalidate_content_profile_cache(user_id)

    prof1 = get_content_profile(user_id=user_id)
    assert prof1["user_id"] == user_id

    # Invalidate
    invalidate_content_profile_cache(user_id)


def test_search_cache_keys_include_user_id_hash_and_date():
    user_id = "user_456"
    query = "Distributed Consensus Raft Paxos"
    today = datetime.date.today().isoformat()

    key = build_search_cache_key(user_id, query)
    assert key.startswith(f"search:{user_id}:")
    assert key.endswith(f":{today}")

    # Different users must have different keys for same query
    key_user_2 = build_search_cache_key("user_789", query)
    assert key != key_user_2

    # Set and get cached search
    cands = [
        Candidate(
            title="Consensus Benchmarks",
            url="https://example.com/raft",
            text="Analysis of p99 latency",
            source_name="example.com",
        )
    ]
    set_cached_search(user_id, query, cands)
    retrieved = get_cached_search(user_id, query)
    assert retrieved is not None
    assert len(retrieved) == 1
    assert retrieved[0].title == "Consensus Benchmarks"

    # User 2 should NOT see user 1's cached results
    assert get_cached_search("user_789", query) is None


def test_topic_deduplication_against_last_30_posts():
    candidates = [
        {"title": "Kafka Partition Rebalancing Under Stress", "url": "https://example.com/kafka"},
        {"title": "ClickHouse Real-Time Ingestion", "url": "https://example.com/clickhouse"},
    ]

    # History contains a post from 20 days ago (within 30 posts limit)
    history = [
        {
            "topic_title": "Kafka Partition Rebalancing Under Stress",
            "topic_url": "https://example.com/past-kafka",
            "post_format": "build log",
            "is_last_14_days": False,  # Older than 14 days, but in last 30 posts!
        }
    ]

    finder_output_repeat = FinderOutput(
        topic="Kafka Partition Rebalancing Under Stress",
        angle="Deep dive",
        post_format="observer take",
        hook_type="number-led specific result",
        why_now="Recent release",
        sources=[FinderSource(title="Kafka", url="https://example.com/kafka")],
        avoided=[],
    )

    is_valid, violations = validate_finder_output(finder_output_repeat, candidates, history)
    assert is_valid is False
    assert any("Kafka Partition Rebalancing" in v for v in violations)

    # Distinct topic must pass
    finder_output_fresh = FinderOutput(
        topic="ClickHouse Real-Time Ingestion",
        angle="Storage engines compared",
        post_format="observer take",
        hook_type="number-led specific result",
        why_now="Recent benchmarks",
        sources=[FinderSource(title="ClickHouse", url="https://example.com/clickhouse")],
        avoided=[],
    )
    is_valid_fresh, violations_fresh = validate_finder_output(finder_output_fresh, candidates, history)
    assert is_valid_fresh is True
    assert len(violations_fresh) == 0
