"""Phase 2 tests: token extraction, cost calculation, and llm_call_log aggregation."""

from types import SimpleNamespace
import uuid

from app.core.plans import compute_llm_cost_micro_usd, compute_search_cost_micro_usd
from app.services.usage_logger import extract_token_counts


def test_extract_token_counts_standard_and_reasoning():
    # Case 1: output_tokens already includes reasoning (total_tokens == in + out)
    msg_included = SimpleNamespace(
        usage_metadata={
            "input_tokens": 100,
            "output_tokens": 50,
            "total_tokens": 150,
            "output_token_details": {"reasoning": 20},
        }
    )
    assert extract_token_counts(msg_included) == (100, 50)

    # Case 2: output_tokens excludes reasoning (total_tokens == in + out + reasoning)
    msg_separate = SimpleNamespace(
        usage_metadata={
            "input_tokens": 100,
            "output_tokens": 50,
            "total_tokens": 170,
            "output_token_details": {"reasoning": 20},
        }
    )
    assert extract_token_counts(msg_separate) == (100, 70)


def test_cost_calculations():
    # 1M input @ 0.30 + 1M output @ 2.50 = $2.80 = 2,800,000 micro-USD
    assert compute_llm_cost_micro_usd("gemini-3.5-flash-lite", 1_000_000, 1_000_000) == 2_800_000
    # 1000 input @ 0.25 + 500 output @ 1.50 = 250 + 750 = 1000 micro-USD ($0.001)
    assert compute_llm_cost_micro_usd("gemini-3.1-flash-lite", 1000, 500) == 1000
    # Unknown model returns 0
    assert compute_llm_cost_micro_usd("unknown-model", 1000, 500) == 0
    # Tavily basic search = $0.008 = 8000 micro-USD
    assert compute_search_cost_micro_usd() == 8000
