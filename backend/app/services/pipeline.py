import datetime
import time
from typing import Any, Callable, Dict, List, Optional, TypedDict
from langchain.chat_models import init_chat_model
from langchain_core.language_models.chat_models import BaseChatModel
from langgraph.graph import END, START, StateGraph
from langgraph.types import RetryPolicy

from app.core.config import settings
from app.services.checks import run_all_checks
from app.services.prompts import (
    PICK_PROMPT,
    PLAN_PROMPT,
    REWRITE_PROMPT,
    WRITE_PROMPT,
    PickOutput,
    PlanOutput,
    WriteOutput,
)
from app.services.search import (
    Candidate,
    SearchError,
    get_search_adapter,
)


class PipelineState(TypedDict, total=False):
    # Snapshot of user profile settings
    profile: Dict[str, Any]
    # Post titles and captions from the user's last 14 days
    recent_titles: List[str]
    recent_captions: List[str]
    # Generated search queries
    queries: List[str]
    # Candidate articles found and filtered
    candidates: List[Dict[str, Any]]
    # Chosen candidate article
    chosen: Optional[Dict[str, Any]]
    # Editorial angle and selection rationale
    angle: Optional[str]
    pick_reason: Optional[str]
    # Draft post content
    draft: Optional[Dict[str, Any]]
    # List of quality check failures
    check_failures: List[str]
    # Rewrite counter (at most 1 rewrite allowed)
    rewrite_count: int
    # Error classification code if run terminates early
    error_code: Optional[str]
    error_detail: Optional[str]
    # Execution metrics and usage counters
    counters: Dict[str, int]
    # Elapsed duration in seconds for each node
    seconds_per_node: Dict[str, float]


# Initialize a chat model from settings or model string
def create_chat_model(model_name: str) -> BaseChatModel:
    kwargs: Dict[str, Any] = {}
    if settings.LLM_API_KEY:
        kwargs["api_key"] = settings.LLM_API_KEY

    model_provider = settings.LLM_PROVIDER
    clean_model = model_name

    # Handle provider:model syntax
    if ":" in model_name:
        parts = model_name.split(":", 1)
        model_provider = parts[0]
        clean_model = parts[1]

    # Map aliases like gemini or google to the official LangChain provider name google_genai
    if model_provider in {"gemini", "google"}:
        model_provider = "google_genai"
    elif not model_provider and "gemini" in clean_model.lower():
        model_provider = "google_genai"

    return init_chat_model(clean_model, model_provider=model_provider, **kwargs)


# Check whether an article date is older than lookback cutoff
def is_older_than_lookback(date_str: Optional[str], lookback_days: int) -> bool:
    if not date_str:
        return False
    try:
        clean_str = date_str.replace("Z", "+00:00")
        dt = datetime.datetime.fromisoformat(clean_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=lookback_days)
        return dt < cutoff
    except Exception:
        return False


# Check if article title or body mentions any forbidden topics
def contains_avoid_terms(text_content: str, topics_avoid: List[str]) -> bool:
    lower_text = text_content.lower()
    for term in topics_avoid:
        clean_term = term.strip().lower()
        if clean_term and clean_term in lower_text:
            return True
    return False


# Build the LangGraph StateGraph workflow
def build_graph(
    fast_model: Any,
    main_model: Any,
    search_tool: Any,
    partial: bool = False,
):
    workflow = StateGraph(PipelineState)

    # Node 1: PLAN (Generate 3 short queries with fast model)
    def plan_node(state: PipelineState) -> Dict[str, Any]:
        start_t = time.perf_counter()
        counters = dict(state.get("counters", {}))
        seconds = dict(state.get("seconds_per_node", {}))

        profile = state.get("profile", {})
        structured_model = fast_model.with_structured_output(PlanOutput, include_raw=True)
        chain = PLAN_PROMPT | structured_model

        prompt_input = {
            "role_title": profile.get("role_title") or "Professional",
            "industry": profile.get("industry") or "General Business",
            "niche_description": profile.get("niche_description") or "",
            "audience": profile.get("audience") or "Industry Peers",
            "topics_include": ", ".join(profile.get("topics_include") or []),
            "topics_avoid": ", ".join(profile.get("topics_avoid") or []),
        }

        attempts = 0
        parsed_output: Optional[PlanOutput] = None
        last_error = None

        while attempts < 2 and parsed_output is None:
            attempts += 1
            counters["llm_calls"] = counters.get("llm_calls", 0) + 1
            try:
                res = chain.invoke(prompt_input)
                raw_msg = res.get("raw")
                if raw_msg and hasattr(raw_msg, "usage_metadata") and raw_msg.usage_metadata:
                    counters["tokens_in"] = counters.get("tokens_in", 0) + raw_msg.usage_metadata.get("input_tokens", 0)
                    counters["tokens_out"] = counters.get("tokens_out", 0) + raw_msg.usage_metadata.get("output_tokens", 0)

                parsed_output = res.get("parsed")
                if parsed_output is None and res.get("parsing_error"):
                    last_error = str(res.get("parsing_error"))
            except Exception as exc:
                last_error = str(exc)

        seconds["plan"] = round(time.perf_counter() - start_t, 3)

        if not parsed_output or len(parsed_output.queries) < 3:
            return {
                "error_code": "invalid_llm_output",
                "error_detail": f"Plan node failed to produce 3 queries: {last_error}",
                "counters": counters,
                "seconds_per_node": seconds,
            }

        return {
            "queries": parsed_output.queries[:3],
            "counters": counters,
            "seconds_per_node": seconds,
        }

    # Node 2: SEARCH (Execute queries, deduplicate, filter, keep top 12)
    def search_node(state: PipelineState) -> Dict[str, Any]:
        start_t = time.perf_counter()
        counters = dict(state.get("counters", {}))
        seconds = dict(state.get("seconds_per_node", {}))

        queries = state.get("queries", [])
        profile = state.get("profile", {})
        topics_avoid = profile.get("topics_avoid", [])
        lookback_days = settings.SEARCH_LOOKBACK_DAYS

        all_candidates: List[Candidate] = []
        try:
            for q in queries[:3]:
                counters["search_calls"] = counters.get("search_calls", 0) + 1
                results = search_tool.search(q, lookback_days=lookback_days, max_results=10)
                all_candidates.extend(results)
        except SearchError as err:
            seconds["search"] = round(time.perf_counter() - start_t, 3)
            return {
                "error_code": "search_failed",
                "error_detail": str(err),
                "counters": counters,
                "seconds_per_node": seconds,
            }
        except Exception as err:
            seconds["search"] = round(time.perf_counter() - start_t, 3)
            return {
                "error_code": "search_failed",
                "error_detail": str(err),
                "counters": counters,
                "seconds_per_node": seconds,
            }

        # Deduplicate by URL
        seen_urls = set()
        unique_candidates: List[Candidate] = []
        for cand in all_candidates:
            clean_url = cand.url.strip().lower()
            if clean_url and clean_url not in seen_urls:
                seen_urls.add(clean_url)
                unique_candidates.append(cand)

        # Filter out candidates older than lookback and candidates matching topics to avoid
        filtered_candidates: List[Dict[str, Any]] = []
        for cand in unique_candidates:
            if is_older_than_lookback(cand.published_at, lookback_days):
                continue
            if contains_avoid_terms(cand.title + " " + cand.text, topics_avoid):
                continue
            filtered_candidates.append(cand.model_dump())

        # Keep best 12 candidates
        top_candidates = filtered_candidates[:12]
        seconds["search"] = round(time.perf_counter() - start_t, 3)

        if not top_candidates:
            return {
                "candidates": [],
                "error_code": "no_candidates",
                "error_detail": "No valid fresh candidates remained after filtering",
                "counters": counters,
                "seconds_per_node": seconds,
            }

        return {
            "candidates": top_candidates,
            "counters": counters,
            "seconds_per_node": seconds,
        }

    # Node 3: PICK (Choose 1 candidate and an angle with main model)
    def pick_node(state: PipelineState) -> Dict[str, Any]:
        start_t = time.perf_counter()
        counters = dict(state.get("counters", {}))
        seconds = dict(state.get("seconds_per_node", {}))

        candidates = state.get("candidates", [])
        if not candidates:
            return {"error_code": "no_candidates"}

        profile = state.get("profile", {})
        recent_titles = state.get("recent_titles", [])

        # Format candidates text block
        candidate_snippets = []
        for idx, c in enumerate(candidates):
            candidate_snippets.append(
                f"[{idx}] Title: {c.get('title')}\n"
                f"URL: {c.get('url')}\n"
                f"Published: {c.get('published_at') or 'Unknown'}\n"
                f"Excerpt: {c.get('text', '')[:600]}\n"
            )
        candidates_text = "\n---\n".join(candidate_snippets)

        prompt_input = {
            "role_title": profile.get("role_title") or "Professional",
            "niche_description": profile.get("niche_description") or "",
            "audience": profile.get("audience") or "Industry Peers",
            "topics_avoid": ", ".join(profile.get("topics_avoid") or []),
            "recent_titles": "\n".join(f"- {t}" for t in recent_titles) if recent_titles else "None",
            "candidates_text": candidates_text,
        }

        structured_model = main_model.with_structured_output(PickOutput, include_raw=True)
        chain = PICK_PROMPT | structured_model

        attempts = 0
        parsed_output: Optional[PickOutput] = None
        last_error = None

        while attempts < 2 and parsed_output is None:
            attempts += 1
            counters["llm_calls"] = counters.get("llm_calls", 0) + 1
            try:
                res = chain.invoke(prompt_input)
                raw_msg = res.get("raw")
                if raw_msg and hasattr(raw_msg, "usage_metadata") and raw_msg.usage_metadata:
                    counters["tokens_in"] = counters.get("tokens_in", 0) + raw_msg.usage_metadata.get("input_tokens", 0)
                    counters["tokens_out"] = counters.get("tokens_out", 0) + raw_msg.usage_metadata.get("output_tokens", 0)

                parsed_output = res.get("parsed")
                if parsed_output is None and res.get("parsing_error"):
                    last_error = str(res.get("parsing_error"))
            except Exception as exc:
                last_error = str(exc)

        seconds["pick"] = round(time.perf_counter() - start_t, 3)

        if not parsed_output or parsed_output.chosen_index >= len(candidates):
            return {
                "error_code": "invalid_llm_output",
                "error_detail": f"Pick node returned invalid candidate index: {last_error}",
                "counters": counters,
                "seconds_per_node": seconds,
            }

        chosen_candidate = candidates[parsed_output.chosen_index]
        return {
            "chosen": chosen_candidate,
            "angle": parsed_output.angle,
            "pick_reason": parsed_output.reason,
            "counters": counters,
            "seconds_per_node": seconds,
        }

    # Node 4: WRITE (Author the post grounded purely in source facts)
    def write_node(state: PipelineState) -> Dict[str, Any]:
        start_t = time.perf_counter()
        counters = dict(state.get("counters", {}))
        seconds = dict(state.get("seconds_per_node", {}))

        chosen = state.get("chosen", {})
        profile = state.get("profile", {})
        check_failures = state.get("check_failures", [])
        rewrite_count = state.get("rewrite_count", 0)
        previous_draft = state.get("draft", {})

        is_rewrite = bool(check_failures and rewrite_count > 0)
        structured_model = main_model.with_structured_output(WriteOutput, include_raw=True)

        if is_rewrite:
            prompt = REWRITE_PROMPT
            prompt_input = {
                "previous_caption": previous_draft.get("post_text", ""),
                "previous_image_headline": previous_draft.get("image_headline", ""),
                "failures_list": "\n".join(f"- {f}" for f in check_failures),
                "role_title": profile.get("role_title") or "Professional",
                "niche_description": profile.get("niche_description") or "",
                "audience": profile.get("audience") or "Industry Peers",
                "tone": profile.get("tone") or "professional",
                "voice_notes": profile.get("voice_notes") or "Clear and concise.",
                "topic_title": chosen.get("title", ""),
                "angle": state.get("angle", ""),
                "source_text": chosen.get("text", ""),
            }
        else:
            prompt = WRITE_PROMPT
            prompt_input = {
                "role_title": profile.get("role_title") or "Professional",
                "industry": profile.get("industry") or "General Business",
                "niche_description": profile.get("niche_description") or "",
                "audience": profile.get("audience") or "Industry Peers",
                "tone": profile.get("tone") or "professional",
                "voice_notes": profile.get("voice_notes") or "Clear and concise.",
                "sample_posts": profile.get("sample_posts") or "No sample posts provided.",
                "topic_title": chosen.get("title", ""),
                "topic_url": chosen.get("url", ""),
                "angle": state.get("angle", ""),
                "source_text": chosen.get("text", ""),
            }

        chain = prompt | structured_model
        attempts = 0
        parsed_output: Optional[WriteOutput] = None
        last_error = None

        while attempts < 2 and parsed_output is None:
            attempts += 1
            counters["llm_calls"] = counters.get("llm_calls", 0) + 1
            try:
                res = chain.invoke(prompt_input)
                raw_msg = res.get("raw")
                if raw_msg and hasattr(raw_msg, "usage_metadata") and raw_msg.usage_metadata:
                    counters["tokens_in"] = counters.get("tokens_in", 0) + raw_msg.usage_metadata.get("input_tokens", 0)
                    counters["tokens_out"] = counters.get("tokens_out", 0) + raw_msg.usage_metadata.get("output_tokens", 0)

                parsed_output = res.get("parsed")
                if parsed_output is None and res.get("parsing_error"):
                    last_error = str(res.get("parsing_error"))
            except Exception as exc:
                last_error = str(exc)

        seconds["write"] = round(time.perf_counter() - start_t, 3)

        if not parsed_output:
            return {
                "error_code": "invalid_llm_output",
                "error_detail": f"Write node failed to output structured post: {last_error}",
                "counters": counters,
                "seconds_per_node": seconds,
            }

        clean_tags = [t.lstrip("#").strip() for t in parsed_output.hashtags if t.strip()]
        return {
            "draft": {
                "post_text": parsed_output.post_text.strip(),
                "hashtags": clean_tags[:3],
                "image_headline": parsed_output.image_headline.strip(),
            },
            "counters": counters,
            "seconds_per_node": seconds,
        }

    # Node 5: CHECK (Pure verification checks with no LLM)
    def check_node(state: PipelineState) -> Dict[str, Any]:
        start_t = time.perf_counter()
        seconds = dict(state.get("seconds_per_node", {}))

        draft = state.get("draft", {})
        chosen = state.get("chosen", {})
        recent_captions = state.get("recent_captions", [])

        post_text = draft.get("post_text", "")
        hashtags = draft.get("hashtags", [])
        image_headline = draft.get("image_headline", "")
        source_text = chosen.get("text", "")

        failures = run_all_checks(
            caption=post_text,
            hashtags=hashtags,
            image_headline=image_headline,
            source_text=source_text,
            recent_captions=recent_captions,
        )

        seconds["check"] = round(time.perf_counter() - start_t, 3)
        return {
            "check_failures": failures,
            "seconds_per_node": seconds,
        }

    # Register nodes with retry policies for transient network/provider errors
    transient_retry = RetryPolicy(max_attempts=2)

    workflow.add_node("plan", plan_node, retry=transient_retry)
    workflow.add_node("search", search_node, retry=transient_retry)
    workflow.add_node("pick", pick_node, retry=transient_retry)

    # Routing helper to route to END if any node encountered an error
    def route_after_node(next_node: str) -> Callable[[PipelineState], str]:
        def _route(state: PipelineState) -> str:
            if state.get("error_code"):
                return END
            return next_node
        return _route

    if partial:
        workflow.add_edge(START, "plan")
        workflow.add_conditional_edges("plan", route_after_node("search"), ["search", END])
        workflow.add_conditional_edges("search", route_after_node("pick"), ["pick", END])
        workflow.add_conditional_edges("pick", route_after_node(END), [END])
        return workflow.compile()

    workflow.add_node("write", write_node, retry=transient_retry)
    workflow.add_node("check", check_node)

    # Conditional routing after check: retry once on failure, else finish
    def route_after_check(state: PipelineState) -> str:
        if state.get("error_code"):
            return END
        failures = state.get("check_failures", [])
        if not failures:
            return END

        # If failures exist and rewrite has not happened yet, rewrite once
        if state.get("rewrite_count", 0) == 0:
            state["rewrite_count"] = 1
            return "write"

        state["error_code"] = "quality_check_failed"
        return END

    # Connect edges
    workflow.add_edge(START, "plan")
    workflow.add_conditional_edges("plan", route_after_node("search"), ["search", END])
    workflow.add_conditional_edges("search", route_after_node("pick"), ["pick", END])
    workflow.add_conditional_edges("pick", route_after_node("write"), ["write", END])
    workflow.add_conditional_edges("write", route_after_node("check"), ["check", END])
    workflow.add_conditional_edges("check", route_after_check, ["write", END])

    # Compile with low recursion limit as a safety net
    return workflow.compile()
