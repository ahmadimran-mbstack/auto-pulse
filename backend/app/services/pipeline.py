import datetime
import logging
import time
from typing import Any, Callable, Dict, List, Optional, TypedDict
from langchain.chat_models import init_chat_model
from langchain_core.language_models.chat_models import BaseChatModel
from langgraph.graph import END, START, StateGraph
from langgraph.types import RetryPolicy

from app.agents.detector import DetectionResult, VerifiedFinding, evaluate_post
from app.agents.drafter import DrafterOutput, draft_initial_post, rewrite_post_spans
from app.agents.finder import FinderOutput, run_finder_agent
from app.agents.gtm import GTMBriefOutput, GTMReviewOutput, run_gtm_brief, run_gtm_review
from app.agents.knowledge.hook_library import get_available_hook_styles
from app.core.config import settings
from app.services.checks import (
    check_candidate_title,
    check_candidate_page_text,
    check_candidate_published_date,
    validate_fact_set,
    run_all_checks,
)
from app.services.candidate_evaluator import (
    can_attempt_repair,
    evaluate_candidate,
    repair_candidate_text,
)
from app.services.pipeline_config import (
    AI_SLOP_TARGET,
    MAX_ROUNDS,
    MIN_ACCEPTABLE,
    PER_MODEL_CALL_TIMEOUT_SECONDS,
    PLAIN_TECH_ERROR_MESSAGE,
    TARGET_SCORE,
    TIME_BUDGET_SECONDS,
)
from app.services.content_profile import get_content_profile
from app.services.prompts import PLAN_PROMPT, PlanOutput
from app.services.search import (
    Candidate,
    SearchError,
    extract_source_name,
    get_search_adapter,
)
from app.services.search_cache import get_cached_search, set_cached_search
from app.services.source_quality import is_blocked_domain, score_domain
from app.services.resilient_llm import run_call_with_timeout

logger = logging.getLogger(__name__)


def _update_db_node_progress(
    run_id: Optional[str],
    node_name: str,
    is_start: bool = True,
    topic_index: int = 0,
    round_num: int = 0,
    best_draft: Optional[Dict[str, Any]] = None,
    current_step: Optional[str] = None,
) -> None:
    """Updates current_node, current_step, topic_index, round, best_draft and last_progress_at in Postgres."""
    if not run_id or str(run_id) == "none":
        return
    try:
        from app.db.session import SessionLocal
        from sqlalchemy import text
        import json
        best_draft_json = json.dumps(best_draft) if best_draft else None
        with SessionLocal() as db:
            params = {
                "id": run_id,
                "node": node_name,
                "step": current_step or node_name,
                "topic_idx": topic_index,
                "round": round_num,
                "best_draft": best_draft_json,
            }
            db.execute(
                text(
                    "UPDATE generation_runs "
                    "SET current_node = :node, current_step = :step, last_progress_at = now(), "
                    "    current_topic_index = :topic_idx, current_round = :round, "
                    "    best_draft = CASE WHEN :best_draft IS NOT NULL THEN :best_draft::jsonb ELSE best_draft END "
                    "WHERE id = :id"
                ),
                params,
            )
            db.execute(
                text(
                    "UPDATE playground_runs "
                    "SET current_node = :node, current_step = :step, last_progress_at = now(), "
                    "    current_topic_index = :topic_idx, current_round = :round, "
                    "    best_draft = CASE WHEN :best_draft IS NOT NULL THEN :best_draft::jsonb ELSE best_draft END "
                    "WHERE id = :id"
                ),
                params,
            )
            db.commit()
    except Exception as exc:
        logger.debug(f"Failed to update progress in db for run {run_id}: {exc}")


class PipelineState(TypedDict, total=False):
    # Creator context
    user_id: str
    profile: Dict[str, Any]
    history: List[Dict[str, Any]]
    recent_titles: List[str]
    recent_captions: List[str]
    topic_hint: Optional[str]
    is_manual: bool
    run_id: Optional[str]
    thread_id: Optional[str]
    run_deadline: Optional[float]

    # Search & curation nodes
    queries: List[str]
    candidates: List[Dict[str, Any]]
    finder_output: Optional[Dict[str, Any]]
    chosen: Optional[Dict[str, Any]]
    topic_title: Optional[str]
    topic_label: Optional[str]
    key_facts: Optional[List[Dict[str, Any]]]
    angle: Optional[str]
    hook_type: Optional[str]
    hook_style: Optional[str]
    hook_id: Optional[str]
    hook_text: Optional[str]
    post_format: Optional[str]
    why_now: Optional[str]

    # Multi-topic and Smart Loop
    topic_candidates: List[Dict[str, Any]]
    current_topic_index: int
    max_topics: int
    current_round: int
    max_rewrites: int
    best_failing_gates: List[str]
    consecutive_same_gate_failures: int
    last_failing_gate: Optional[str]
    switch_to_gtm: bool
    cached_pages: Dict[str, str]
    cached_facts: Dict[str, List[Any]]

    # Editorial strategy
    gtm_brief: Optional[Dict[str, Any]]

    # Rewrite Loop State
    round: int
    draft: Optional[Dict[str, Any]]
    best_draft: Optional[Dict[str, Any]]
    best_score: int
    best_round: int
    strike_count: int
    detection_result: Optional[Dict[str, Any]]
    findings: List[Any]
    check_failures: List[str]
    rounds_history: List[Dict[str, Any]]
    is_loop_terminal: bool
    exit_reason: Optional[str]

    # Post-Loop Finalization
    gtm_review: Optional[Dict[str, Any]]
    final_score: int
    ai_score: int
    needs_review: bool
    agent_trace: Optional[Dict[str, Any]]
    internal_trace: Optional[Dict[str, Any]]

    # Phase 1-4 selection, scoring, repair, and budget state
    time_budget_deadline: Optional[float]
    best_clean_draft: Optional[Dict[str, Any]]
    best_clean_score: int
    best_clean_slop: int
    best_clean_round: int
    best_raw_draft: Optional[Dict[str, Any]]
    best_raw_eval: Optional[Dict[str, Any]]
    eval_result: Optional[Dict[str, Any]]
    last_issue_codes: List[str]
    last_critique: str
    repaired_once: bool
    topic_retry_count: int
    candidates_log: List[Dict[str, Any]]
    cancelled: bool

    # Execution telemetry
    status: Optional[str]
    current_step: Optional[str]
    counters: Dict[str, int]
    seconds_per_node: Dict[str, float]
    error_code: Optional[str]
    error_detail: Optional[str]


# Initialize a chat model from settings or model string with resilient fallback
def create_chat_model(model_name: str, temperature: Optional[float] = None) -> Any:
    from app.services.resilient_llm import ResilientChatModelWrapper

    kwargs: Dict[str, Any] = {}
    if settings.LLM_API_KEY:
        kwargs["api_key"] = settings.LLM_API_KEY
    if temperature is not None:
        kwargs["temperature"] = temperature

    # Per model call timeout from pipeline_config (30s)
    call_timeout = float(PER_MODEL_CALL_TIMEOUT_SECONDS)
    kwargs.setdefault("timeout", call_timeout)
    kwargs.setdefault("request_timeout", call_timeout)

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

    real_model = None
    if model_provider != "mock":
        try:
            real_model = init_chat_model(clean_model, model_provider=model_provider, **kwargs)
        except Exception as exc:
            logger.warning(f"Could not initialize model {clean_model} via provider {model_provider}: {exc}")

    return ResilientChatModelWrapper(
        real_model=real_model,
        model_name=clean_model,
        timeout_seconds=call_timeout,
    )


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


# Build the cooperative multi-agent LangGraph workflow
def build_graph(
    fast_model: Optional[Any] = None,
    main_model: Optional[Any] = None,
    search_tool: Optional[Any] = None,
    partial: bool = False,
    models: Optional[Dict[str, Any]] = None,
    step_callback: Optional[Callable[[str, int, Dict[str, Any]], None]] = None,
):
    workflow = StateGraph(PipelineState)
    models_dict = models or {}

    # Resolve agent models with nonzero temperatures to guarantee creative variety
    _fast_model = models_dict.get("fast") or fast_model
    if _fast_model is None:
        _fast_model = create_chat_model(settings.LLM_MODEL_FAST, temperature=0.7)

    _finder_model = models_dict.get("finder") or main_model
    if _finder_model is None:
        _finder_model = create_chat_model(settings.LLM_MODEL_FINDER, temperature=0.7)

    _gtm_brief_model = models_dict.get("gtm_brief") or models_dict.get("gtm") or main_model
    if _gtm_brief_model is None:
        _gtm_brief_model = create_chat_model(settings.LLM_MODEL_GTM, temperature=0.6)

    _gtm_review_model = models_dict.get("gtm_review") or models_dict.get("gtm") or main_model
    if _gtm_review_model is None:
        _gtm_review_model = create_chat_model(settings.LLM_MODEL_GTM, temperature=0.5)

    _drafter_model = models_dict.get("drafter") or main_model
    if _drafter_model is None:
        _drafter_model = create_chat_model(settings.LLM_MODEL_DRAFTER, temperature=0.8)

    _detector_model = models_dict.get("detector") or main_model
    if _detector_model is None:
        _detector_model = create_chat_model(settings.LLM_MODEL_DETECTOR, temperature=0.0)

    def _notify_step(step_name: str, round_num: int, state: PipelineState):
        state["current_step"] = step_name
        if step_callback:
            try:
                step_callback(step_name, round_num, state)
            except Exception as exc:
                logger.debug(f"Step callback error for {step_name}: {exc}")

    # Node 1: PLAN (Generate 3 to 5 personalized queries with fast model)
    def plan_node(state: PipelineState) -> Dict[str, Any]:
        _notify_step("plan", state.get("round", 0), state)
        start_t = time.perf_counter()
        counters = dict(state.get("counters", {}))
        seconds = dict(state.get("seconds_per_node", {}))

        topic_hint = (state.get("topic_hint") or "").strip()
        if topic_hint:
            queries = [
                f"{topic_hint} architecture benchmarks 2026",
                f"{topic_hint} engineering tradeoffs production",
                f"{topic_hint} practical lessons 2026",
                f"{topic_hint} real world case study 2026",
            ]
            seconds["plan"] = round(time.perf_counter() - start_t, 3)
            return {
                "queries": queries[:4],
                "counters": counters,
                "seconds_per_node": seconds,
            }

        profile = state.get("profile", {})
        structured_model = _fast_model.with_structured_output(PlanOutput, include_raw=True)
        chain = PLAN_PROMPT | structured_model

        prompt_input = {
            "role_title": profile.get("role_title") or "Professional",
            "industry": profile.get("industry") or "General Business",
            "niche_description": profile.get("niche_description") or "",
            "audience": profile.get("audience") or "Industry Peers",
            "goals": profile.get("goals") or "Build thought leadership and share practical insights",
            "tone": profile.get("tone") or "direct",
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

        queries = (
            parsed_output.queries
            if hasattr(parsed_output, "queries")
            else parsed_output.get("queries", [])
            if isinstance(parsed_output, dict)
            else []
        )

        if not parsed_output or len(queries) < 2:
            topics_inc = profile.get("topics_include") or []
            industry = profile.get("industry") or "Software Engineering"
            if topics_inc:
                queries = [f"{t} technical deep dive" for t in topics_inc[:3]]
            else:
                queries = [f"{industry} production engineering", f"{industry} architecture lessons"]

        return {
            "queries": queries[:5],
            "counters": counters,
            "seconds_per_node": seconds,
        }

    # Node 2: SEARCH (Execute queries, deduplicate, filter, keep top candidates)
    def search_node(state: PipelineState) -> Dict[str, Any]:
        _notify_step("search", state.get("round", 0), state)
        start_t = time.perf_counter()
        counters = dict(state.get("counters", {}))
        seconds = dict(state.get("seconds_per_node", {}))

        queries = list(state.get("queries", []))
        profile = state.get("profile", {})
        topics_avoid = profile.get("topics_avoid", [])
        lookback_days = settings.SEARCH_LOOKBACK_DAYS

        user_id = state.get("user_id") or "default_user"
        is_manual = state.get("is_manual", False)
        adapter = search_tool or get_search_adapter(settings.SEARCH_PROVIDER)

        # Validate topic_hint if present
        topic_hint = (state.get("topic_hint") or "").strip()
        if topic_hint:
            hint_err = check_candidate_title(topic_hint)
            if hint_err:
                seconds["search"] = round(time.perf_counter() - start_t, 3)
                return {
                    "error_code": "invalid_topic_hint",
                    "error_detail": f"Provided topic hint is invalid: {hint_err}",
                    "counters": counters,
                    "seconds_per_node": seconds,
                }
            # Search specifically for topic hint
            queries.insert(0, topic_hint)

        all_candidates: List[Candidate] = []
        try:
            for q in queries[:5]:
                if is_manual:
                    # Manual runs completely bypass search caching to guarantee fresh candidates
                    logger.info(f"[CACHE BYPASS] Manual run bypassing search cache for user {user_id}, query='{q}'")
                    counters["search_calls"] = counters.get("search_calls", 0) + 1
                    results = adapter.search(q, lookback_days=lookback_days, max_results=10)
                    all_candidates.extend(results)
                else:
                    # Scheduled runs: check personalized search cache (short 10m TTL)
                    cached_res = get_cached_search(user_id=user_id, query=q)
                    if cached_res is not None:
                        all_candidates.extend(cached_res)
                        continue

                    counters["search_calls"] = counters.get("search_calls", 0) + 1
                    results = adapter.search(q, lookback_days=lookback_days, max_results=10)
                    set_cached_search(user_id=user_id, query=q, candidates=results)
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

        # Filter out candidates based on domain blocklist, lookback, avoid terms, title check, and page text length
        candidate_evaluations: List[Dict[str, Any]] = []
        filtered_candidates: List[Dict[str, Any]] = []
        for cand in unique_candidates:
            cand_domain = cand.domain or extract_source_name(cand.url)
            eval_entry = {
                "title": cand.title,
                "url": cand.url,
                "domain": cand_domain,
                "text_length": len(cand.text),
                "passed": False,
                "rejection_reason": None,
            }

            if is_blocked_domain(cand.url or cand_domain):
                eval_entry["rejection_reason"] = f"Domain {cand_domain} is blocked as low-quality/aggregator"
                candidate_evaluations.append(eval_entry)
                continue

            if is_older_than_lookback(cand.published_at, lookback_days):
                eval_entry["rejection_reason"] = f"Article published date {cand.published_at} exceeds {lookback_days} days lookback"
                candidate_evaluations.append(eval_entry)
                continue

            if contains_avoid_terms(cand.title + " " + cand.text, topics_avoid):
                eval_entry["rejection_reason"] = "Content mentions topics creator specified to avoid"
                candidate_evaluations.append(eval_entry)
                continue

            title_err = check_candidate_title(cand.title)
            if title_err:
                eval_entry["rejection_reason"] = title_err
                candidate_evaluations.append(eval_entry)
                continue

            text_err = check_candidate_page_text(cand.text)
            if text_err:
                eval_entry["rejection_reason"] = text_err
                candidate_evaluations.append(eval_entry)
                continue

            eval_entry["passed"] = True
            domain_score = score_domain(cand.url or cand_domain)
            text_score = min(len(cand.text) / 5000.0, 3.0)
            eval_entry["score"] = domain_score + text_score
            candidate_evaluations.append(eval_entry)
            cand_dict = cand.model_dump()
            cand_dict["domain_score"] = eval_entry["score"]
            filtered_candidates.append(cand_dict)

        # Rank candidates by domain authority and text depth
        filtered_candidates.sort(key=lambda c: c.get("domain_score", 0), reverse=True)
        top_candidates = filtered_candidates[:12]
        seconds["search"] = round(time.perf_counter() - start_t, 3)

        if not top_candidates:
            return {
                "error_code": "no_quality_topic",
                "error_detail": "No candidate search results met quality, domain, title, and length requirements",
                "candidate_evaluations": candidate_evaluations,
                "counters": counters,
                "seconds_per_node": seconds,
            }

        return {
            "candidates": top_candidates,
            "candidate_evaluations": candidate_evaluations,
            "counters": counters,
            "seconds_per_node": seconds,
        }

    # Node 3: POST FINDER AGENT (Selects fresh topic, angle, format, and hook type)
    def finder_node(state: PipelineState) -> Dict[str, Any]:
        _notify_step("finder", state.get("round", 0), state)
        start_t = time.perf_counter()
        counters = dict(state.get("counters", {}))
        seconds = dict(state.get("seconds_per_node", {}))

        candidates = state.get("candidates", [])
        if not candidates:
            return {"error_code": "no_candidates"}

        profile = state.get("profile", {})
        history = state.get("history", [])
        topic_hint = (state.get("topic_hint") or "").strip()

        counters["llm_calls"] = counters.get("llm_calls", 0) + 1
        counters["tokens_in"] = counters.get("tokens_in", 0) + 850
        counters["tokens_out"] = counters.get("tokens_out", 0) + 320
        finder_output, warnings = run_finder_agent(
            profile=profile,
            candidates=candidates,
            history=history,
            model=_finder_model,
            topic_hint=topic_hint,
        )

        seconds["finder"] = round(time.perf_counter() - start_t, 3)

        from app.agents.finder import clean_topic_label

        # If finder LLM returned nothing, build a safe fallback from the top search candidate
        if not finder_output:
            chosen_candidate = candidates[0]
            topic_title = chosen_candidate.get("title", "") or "Industry Update"
            topic_label = clean_topic_label(topic_title)
            fallback_facts = []
            import re
            for s in re.split(r"(?<=[.!?])\s+", chosen_candidate.get("text", "")):
                s_c = s.strip()
                if 8 <= len(s_c.split()) <= 50:
                    fallback_facts.append({
                        "claim": s_c,
                        "fact": s_c,
                        "evidence_quote": s_c,
                        "source_url": chosen_candidate.get("url", ""),
                    })
                    if len(fallback_facts) >= 4:
                        break
            return {
                "finder_output": {
                    "topic_title": topic_title,
                    "topic_label": topic_label,
                    "angle": f"Practical takeaways on {topic_label}",
                    "key_facts": fallback_facts,
                    "hook_type": "specific observation",
                    "post_format": "observer take",
                    "why_now": "Recent industry discussion",
                    "sources": [{"title": topic_title, "url": chosen_candidate.get("url", "")}],
                },
                "chosen": chosen_candidate,
                "topic_title": topic_title,
                "topic_label": topic_label,
                "key_facts": fallback_facts,
                "angle": f"Practical takeaways on {topic_label}",
                "hook_type": "specific observation",
                "post_format": "observer take",
                "why_now": "Recent industry discussion",
                "topic_candidates": [],
                "current_topic_index": 0,
                "max_topics": 1,
                "counters": counters,
                "seconds_per_node": seconds,
            }

        # Match chosen source with candidate data
        primary_source = finder_output.sources[0] if finder_output.sources else None
        chosen_candidate = candidates[0]
        if primary_source:
            for c in candidates:
                if c.get("url", "").strip().lower() == primary_source.url.strip().lower():
                    chosen_candidate = c
                    break

        # Verify facts against candidate text without aborting the run if fewer than 3 match
        verified_facts, _fact_err = validate_fact_set(finder_output.key_facts, chosen_candidate.get("text", ""))
        if len(verified_facts) < 3:
            for alt_cand in candidates[1:3]:
                alt_verified, alt_err = validate_fact_set(finder_output.key_facts, alt_cand.get("text", ""))
                if len(alt_verified) > len(verified_facts):
                    chosen_candidate = alt_cand
                    verified_facts = alt_verified
                    if not alt_err and len(verified_facts) >= 3:
                        break

        topic_title = getattr(finder_output, "topic_title", "") or chosen_candidate.get("title", "")
        topic_label = getattr(finder_output, "topic_label", "") or clean_topic_label(topic_title)
        # Hand over up to 6 grounded facts (empty list is valid: GTM will pick a non-number hook)
        key_facts_data = [
            vf.model_dump() if hasattr(vf, "model_dump") else vf
            for vf in verified_facts[:6]
        ]

        # Build list of up to MAX_TOPICS_PER_RUN candidate topics
        topic_0 = {
            "topic_title": topic_title,
            "topic_label": topic_label,
            "angle": finder_output.angle,
            "key_facts": key_facts_data,
            "hook_type": finder_output.hook_type,
            "post_format": finder_output.post_format,
            "why_now": finder_output.why_now,
            "chosen": chosen_candidate,
            "sources": [chosen_candidate],
        }
        topic_candidates = [topic_0]

        def _extract_cand_facts(c_item: Dict[str, Any]) -> List[Dict[str, Any]]:
            import re
            c_text = c_item.get("text", "")
            c_url = c_item.get("url", "")
            if not c_text:
                return []
            sentences = re.split(r"(?<=[.!?])\s+", c_text)
            f_list = []
            for s in sentences:
                s_c = s.strip()
                w_list = s_c.split()
                if 8 <= len(w_list) <= 50:
                    if re.search(r"\b\d+(?:\.\d+)?%?|\$[0-9]|[A-Z][a-z0-9]+\s+[0-9]", s_c):
                        f_list.append({
                            "claim": s_c,
                            "fact": s_c,
                            "evidence_quote": s_c,
                            "source_url": c_url,
                        })
                        if len(f_list) >= 4:
                            break
            return f_list

        max_allowed_topics = getattr(settings, "MAX_TOPICS_PER_RUN", 4)
        for alt_c in candidates:
            if len(topic_candidates) >= max_allowed_topics:
                break
            if alt_c.get("url", "").strip().lower() == chosen_candidate.get("url", "").strip().lower():
                continue
            alt_title = alt_c.get("title", "")
            alt_label = clean_topic_label(alt_title)
            alt_facts = _extract_cand_facts(alt_c)
            if len(alt_facts) >= 2:
                topic_candidates.append({
                    "topic_title": alt_title,
                    "topic_label": alt_label,
                    "angle": f"Practical engineering tradeoffs of {alt_label}",
                    "key_facts": alt_facts,
                    "hook_type": "specific observation",
                    "post_format": "observer take",
                    "why_now": "Recent industry adoption",
                    "chosen": alt_c,
                    "sources": [alt_c],
                })

        return {
            "finder_output": finder_output.model_dump(),
            "chosen": chosen_candidate,
            "topic_title": topic_title,
            "topic_label": topic_label,
            "key_facts": key_facts_data,
            "angle": finder_output.angle,
            "hook_type": finder_output.hook_type,
            "post_format": finder_output.post_format,
            "why_now": finder_output.why_now,
            "topic_candidates": topic_candidates,
            "current_topic_index": 0,
            "max_topics": len(topic_candidates),
            "counters": counters,
            "seconds_per_node": seconds,
        }

    # Node 4: GTM AGENT (Generates content brief before drafting)
    def gtm_brief_node(state: PipelineState) -> Dict[str, Any]:
        _notify_step("gtm_brief", state.get("round", 0), state)
        start_t = time.perf_counter()
        counters = dict(state.get("counters", {}))
        seconds = dict(state.get("seconds_per_node", {}))

        finder_dict = state.get("finder_output", {})
        profile = state.get("profile", {})
        chosen = state.get("chosen", {})
        candidates = state.get("candidates", [])
        history = state.get("history", [])

        from app.agents.finder import clean_topic_label
        topic_title = state.get("topic_title") or finder_dict.get("topic_title") or chosen.get("title") or "Industry Development"
        topic_label = state.get("topic_label") or finder_dict.get("topic_label") or clean_topic_label(topic_title)
        key_facts = state.get("key_facts") or finder_dict.get("key_facts") or []
        angle = state.get("angle") or finder_dict.get("angle") or "Technical analysis"
        post_format = state.get("post_format") or finder_dict.get("post_format") or "observer take"
        hook_type = state.get("hook_type") or finder_dict.get("hook_type") or "specific observation"
        why_now = state.get("why_now") or finder_dict.get("why_now") or "Recent production updates"

        sources = finder_dict.get("sources") or candidates[:2]

        # Filter out hook styles used in user's last 5 posts
        last_5_styles = [
            p.get("hook_style") or p.get("hook_type")
            for p in history[:5]
            if p.get("hook_style") or p.get("hook_type")
        ]
        allowed_styles = get_available_hook_styles(last_5_styles)

        # Collect user's last 10 opening hooks so GTM avoids repeating style or opening words
        recent_hooks: List[str] = []
        for p in history[:10]:
            h_line = (p.get("hook_text") or "").strip()
            if not h_line and p.get("caption_preview"):
                h_line = str(p.get("caption_preview", "")).strip().splitlines()[0].strip()
            if h_line:
                recent_hooks.append(h_line)

        # Build feedback block from previous round issues and judge critique if retrying
        prev_issues = state.get("last_issue_codes") or []
        prev_critique = state.get("last_critique") or ""
        gtm_feedback = ""
        if prev_issues or prev_critique:
            facts_hint = "; ".join(
                (kf.get("fact", "") if isinstance(kf, dict) else str(kf))
                for kf in key_facts[:4]
            )
            gtm_feedback = (
                f"\nLast draft problems: {', '.join(prev_issues) or 'needs sharper hook'}. "
                f"{prev_critique}\n"
                f"Use one of these grounded facts if relevant: {facts_hint or 'none (pick a non-number hook)'}\n"
            )

        counters["llm_calls"] = counters.get("llm_calls", 0) + 1
        counters["tokens_in"] = counters.get("tokens_in", 0) + 650
        counters["tokens_out"] = counters.get("tokens_out", 0) + 280
        try:
            brief = run_gtm_brief(
                topic=topic_label,
                topic_label=topic_label,
                key_facts=key_facts,
                angle=angle,
                post_format=post_format,
                hook_type=hook_type,
                why_now=why_now,
                sources=sources,
                profile=profile,
                model=_gtm_brief_model,
                allowed_hook_styles=allowed_styles,
                recent_hooks=recent_hooks,
                feedback_block=gtm_feedback,
            )
        except Exception as exc:
            seconds["gtm_brief"] = round(time.perf_counter() - start_t, 3)
            return {
                "error_code": "gtm_brief_failed",
                "error_detail": PLAIN_TECH_ERROR_MESSAGE,
                "counters": counters,
                "seconds_per_node": seconds,
            }

        chosen_hook_style = getattr(brief, "hook_style", None) or allowed_styles[0]
        hook_id = getattr(brief, "hook_id", None) or "observation_01"
        hook_text = getattr(brief, "hook_text", None) or getattr(brief, "chosen_hook", "")

        seconds["gtm_brief"] = round(time.perf_counter() - start_t, 3)

        return {
            "gtm_brief": brief.model_dump(),
            "hook_style": chosen_hook_style,
            "hook_type": chosen_hook_style,
            "hook_id": hook_id,
            "hook_text": hook_text,
            "last_issue_codes": list(getattr(brief, "issue_codes", []) or []),
            "counters": counters,
            "seconds_per_node": seconds,
        }

    # Node 5: POST DRAFTER AGENT (Mode 1: Initial Draft, Mode 2: Targeted Span Rewrite)
    def drafter_node(state: PipelineState) -> Dict[str, Any]:
        current_round = state.get("round", 0)
        _notify_step("drafter", current_round, state)
        start_t = time.perf_counter()
        counters = dict(state.get("counters", {}))
        seconds = dict(state.get("seconds_per_node", {}))

        gtm_brief = state.get("gtm_brief", {})
        profile = state.get("profile", {})
        candidates = state.get("candidates", [])

        topic_label = state.get("topic_label") or (state.get("finder_output") or {}).get("topic_label") or ""
        angle = state.get("angle") or (state.get("finder_output") or {}).get("angle") or ""
        key_facts = state.get("key_facts") or (state.get("finder_output") or {}).get("key_facts") or []
        hook_text = state.get("hook_text") or (state.get("gtm_brief") or {}).get("hook_text") or (state.get("gtm_brief") or {}).get("chosen_hook") or ""

        counters["llm_calls"] = counters.get("llm_calls", 0) + 1
        counters["tokens_in"] = counters.get("tokens_in", 0) + 950
        counters["tokens_out"] = counters.get("tokens_out", 0) + 420

        try:
            if current_round == 0:
                # Mode 1: Initial Draft
                draft_output = draft_initial_post(
                    gtm_brief=gtm_brief,
                    sources=candidates[:3],
                    profile=profile,
                    model=_drafter_model,
                    topic_label=topic_label,
                    angle=angle,
                    key_facts=key_facts,
                    hook_text=hook_text,
                )
            else:
                # Mode 2: Targeted Span Rewrite with previous issues and judge critique
                prev_draft = state.get("draft", {})
                findings = state.get("findings", [])
                check_failures = list(state.get("check_failures", []))
                last_issues = state.get("last_issue_codes") or []
                last_critique = state.get("last_critique") or ""
                if last_issues:
                    check_failures.append(f"Issues from previous round: {', '.join(last_issues)}")
                if last_critique:
                    check_failures.append(f"Judge critique: {last_critique}")
                draft_output = rewrite_post_spans(
                    previous_draft=prev_draft,
                    findings=findings,
                    check_failures=check_failures,
                    gtm_brief=gtm_brief,
                    sources=candidates[:3],
                    profile=profile,
                    model=_drafter_model,
                    topic_label=topic_label,
                    angle=angle,
                    key_facts=key_facts,
                    hook_text=hook_text,
                )
        except Exception as exc:
            seconds[f"drafter_r{current_round}"] = round(time.perf_counter() - start_t, 3)
            # If we already have a clean draft, return it instead of failing
            if state.get("best_clean_draft"):
                return {
                    "is_loop_terminal": True,
                    "exit_reason": "drafter_error_recovered",
                    "counters": counters,
                    "seconds_per_node": seconds,
                }
            return {
                "error_code": "drafter_failed",
                "error_detail": PLAIN_TECH_ERROR_MESSAGE,
                "counters": counters,
                "seconds_per_node": seconds,
            }

        seconds[f"drafter_r{current_round}"] = round(time.perf_counter() - start_t, 3)
        draft_dict = draft_output.model_dump()

        # Keep best_so_far updated after every draft (Phase 1)
        out: Dict[str, Any] = {
            "draft": draft_dict,
            "counters": counters,
            "seconds_per_node": seconds,
        }
        if not state.get("best_draft"):
            out["best_draft"] = draft_dict
        return out

    # Node 6: AI-SLOP DETECTOR AGENT (Deterministic scanner + structured LLM judge)
    def detector_node(state: PipelineState) -> Dict[str, Any]:
        current_round = state.get("round", 0)
        _notify_step("detector", current_round, state)
        start_t = time.perf_counter()
        counters = dict(state.get("counters", {}))
        seconds = dict(state.get("seconds_per_node", {}))

        draft = state.get("draft", {})
        post_text = draft.get("post_text", "")
        candidates = state.get("candidates", [])

        counters["llm_calls"] = counters.get("llm_calls", 0) + 1
        counters["tokens_in"] = counters.get("tokens_in", 0) + 650
        counters["tokens_out"] = counters.get("tokens_out", 0) + 280
        try:
            detection_res = evaluate_post(
                post_text=post_text,
                sources=candidates[:3],
                model=_detector_model,
                threshold=settings.AI_SCORE_THRESHOLD,
            )
        except Exception as exc:
            seconds[f"detector_r{current_round}"] = round(time.perf_counter() - start_t, 3)
            return {
                "error_code": "detector_failed",
                "error_detail": str(exc),
                "counters": counters,
                "seconds_per_node": seconds,
            }

        seconds[f"detector_r{current_round}"] = round(time.perf_counter() - start_t, 3)

        return {
            "detection_result": detection_res.model_dump(),
            "findings": detection_res.findings,
            "counters": counters,
            "seconds_per_node": seconds,
        }

    # Node 7: HARD CHECKS + SINGLE-CALL JUDGE SCORING (evaluate_candidate)
    def check_node(state: PipelineState) -> Dict[str, Any]:
        current_round = state.get("round", 0)
        _notify_step("check", current_round, state)
        start_t = time.perf_counter()
        counters = dict(state.get("counters", {}))
        seconds = dict(state.get("seconds_per_node", {}))

        draft = state.get("draft", {})
        chosen = state.get("chosen", {})
        profile = state.get("profile", {})
        detection_dict = state.get("detection_result", {}) or {}
        slop_score = int(detection_dict.get("final_score", 0) or 0)

        topic_title = state.get("topic_title") or (state.get("finder_output") or {}).get("topic_title") or chosen.get("title", "")
        topic_label = state.get("topic_label") or (state.get("finder_output") or {}).get("topic_label") or ""
        key_facts = state.get("key_facts") or (state.get("finder_output") or {}).get("key_facts") or []

        eval_context = {
            "profile": profile,
            "key_facts": key_facts,
            "sources": state.get("candidates", [])[:3],
            "topic_title": topic_title,
            "topic_label": topic_label,
            "hook_style": state.get("hook_style") or "",
            "history": state.get("history", []),
            "recent_captions": state.get("recent_captions", []),
            "ai_slop_score": slop_score,
        }

        counters["llm_calls"] = counters.get("llm_calls", 0) + 1
        eval_res = evaluate_candidate(draft, eval_context, judge_model=_fast_model)
        eval_dict = eval_res.model_dump()

        seconds[f"check_r{current_round}"] = round(time.perf_counter() - start_t, 3)

        return {
            "eval_result": eval_dict,
            "check_failures": list(eval_res.hard_failures),
            "last_issue_codes": list(eval_res.issue_codes),
            "last_critique": eval_res.critique,
            "counters": counters,
            "seconds_per_node": seconds,
        }

    # Node 8: ROUTER (Keeps highest-scoring clean draft, enforces budgets, runs 1-time repair or topic retry)
    def router_node(state: PipelineState) -> Dict[str, Any]:
        current_round = state.get("current_round", state.get("round", 0))
        topic_index = state.get("current_topic_index", 0)
        topic_candidates = state.get("topic_candidates", [])
        topic_retry_count = state.get("topic_retry_count", 0)
        repaired_once = state.get("repaired_once", False)

        draft = dict(state.get("draft") or {})
        detection_dict = state.get("detection_result", {}) or {}
        findings = state.get("findings", [])
        eval_dict = state.get("eval_result") or {}
        rounds_history = list(state.get("rounds_history", []))
        candidates_log = list(state.get("candidates_log", []))
        counters = dict(state.get("counters", {}))

        ai_slop_score = int(detection_dict.get("final_score", 0) or 0)
        passed_hard = bool(eval_dict.get("passed_hard_checks", False))
        eval_score = int(eval_dict.get("score", 0) or 0)
        issue_codes = list(eval_dict.get("issue_codes") or [])
        hard_failures = list(eval_dict.get("hard_failures") or [])
        critique = eval_dict.get("critique") or ""

        best_clean_draft = state.get("best_clean_draft")
        best_clean_score = state.get("best_clean_score", -1)
        best_clean_slop = state.get("best_clean_slop", 999)
        best_clean_round = state.get("best_clean_round", 0)
        best_raw_draft = state.get("best_raw_draft")
        best_raw_eval = state.get("best_raw_eval") or {}

        # Record private candidate entry for internal_trace
        candidates_log.append({
            "round": current_round,
            "topic_index": topic_index,
            "post_text": draft.get("post_text", ""),
            "passed_hard_checks": passed_hard,
            "hard_failures": hard_failures,
            "issue_codes": issue_codes,
            "combined_score": eval_score,
            "sub_scores": eval_dict.get("sub_scores", {}),
            "ai_slop_score": ai_slop_score,
            "critique": critique,
        })

        # Record public round snapshot (no combined_score or internal failures)
        serialized_findings = [
            f.model_dump() if hasattr(f, "model_dump") else f
            for f in findings
        ]
        rounds_history.append({
            "round": current_round,
            "topic_index": topic_index,
            "post_text": draft.get("post_text", ""),
            "hashtags": draft.get("hashtags", []),
            "image_headline": draft.get("image_headline", ""),
            "final_score": ai_slop_score,
            "findings_count": len(findings),
            "findings": serialized_findings,
        })

        # Update best clean candidate (passing hard checks)
        best_updated_flag = False
        if passed_hard and (best_clean_draft is None or eval_score > best_clean_score):
            best_clean_draft = draft
            best_clean_score = eval_score
            best_clean_slop = ai_slop_score
            best_clean_round = current_round
            best_updated_flag = True

        # Track best raw candidate purely for potential 1-time repair if no clean draft exists
        if best_raw_draft is None or eval_score > int(best_raw_eval.get("score", -1)):
            best_raw_draft = draft
            best_raw_eval = eval_dict

        # 1. Early stop: target score reached and AI slop under target
        if passed_hard and eval_score >= TARGET_SCORE and ai_slop_score < AI_SLOP_TARGET:
            return {
                "round": current_round,
                "current_round": current_round,
                "current_topic_index": topic_index,
                "best_draft": best_clean_draft,
                "best_clean_draft": best_clean_draft,
                "best_clean_score": best_clean_score,
                "best_clean_slop": best_clean_slop,
                "best_clean_round": best_clean_round,
                "best_score": best_clean_slop,
                "best_round": best_clean_round,
                "is_loop_terminal": True,
                "status": "succeeded",
                "exit_reason": "target_reached",
                "rounds_history": rounds_history,
                "candidates_log": candidates_log,
                "switch_to_gtm": False,
                "counters": counters,
            }

        # 2. Time budget check (90s)
        tb_deadline = state.get("time_budget_deadline")
        budget_hit = bool(tb_deadline and time.time() >= tb_deadline)
        round_cap_hit = (current_round + 1) >= MAX_ROUNDS

        if budget_hit or round_cap_hit:
            # One-time REPAIR if no candidate passed hard checks and failures are repairable
            if best_clean_draft is None and best_raw_draft and not repaired_once:
                raw_codes = list(best_raw_eval.get("issue_codes") or issue_codes)
                if can_attempt_repair(raw_codes):
                    counters["llm_calls"] = counters.get("llm_calls", 0) + 1
                    repaired_text = repair_candidate_text(
                        post_text=best_raw_draft.get("post_text", ""),
                        issue_codes=raw_codes,
                        key_facts=state.get("key_facts") or [],
                        model=_fast_model,
                    )
                    if repaired_text:
                        repaired_once = True
                        repaired_draft = dict(best_raw_draft)
                        repaired_draft["post_text"] = repaired_text
                        eval_context = {
                            "profile": state.get("profile", {}),
                            "key_facts": state.get("key_facts") or [],
                            "sources": state.get("candidates", [])[:3],
                            "topic_title": state.get("topic_title") or "",
                            "topic_label": state.get("topic_label") or "",
                            "hook_style": state.get("hook_style") or "",
                            "history": state.get("history", []),
                            "recent_captions": state.get("recent_captions", []),
                            "ai_slop_score": ai_slop_score,
                        }
                        counters["llm_calls"] = counters.get("llm_calls", 0) + 1
                        rep_eval = evaluate_candidate(repaired_draft, eval_context, judge_model=_fast_model)
                        candidates_log.append({
                            "round": current_round,
                            "topic_index": topic_index,
                            "repaired": True,
                            "post_text": repaired_text,
                            "passed_hard_checks": rep_eval.passed_hard_checks,
                            "hard_failures": rep_eval.hard_failures,
                            "issue_codes": rep_eval.issue_codes,
                            "combined_score": rep_eval.score,
                            "sub_scores": rep_eval.sub_scores,
                            "ai_slop_score": ai_slop_score,
                            "critique": rep_eval.critique,
                        })
                        if rep_eval.passed_hard_checks:
                            best_clean_draft = repaired_draft
                            best_clean_score = rep_eval.score
                            best_clean_slop = ai_slop_score
                            best_clean_round = current_round

            # If we have a clean candidate, finish and return it
            if best_clean_draft is not None:
                return {
                    "round": current_round,
                    "current_round": current_round,
                    "current_topic_index": topic_index,
                    "best_draft": best_clean_draft,
                    "best_clean_draft": best_clean_draft,
                    "best_clean_score": best_clean_score,
                    "best_clean_slop": best_clean_slop,
                    "best_clean_round": best_clean_round,
                    "best_score": best_clean_slop,
                    "best_round": best_clean_round,
                    "repaired_once": repaired_once,
                    "is_loop_terminal": True,
                    "status": "succeeded",
                    "exit_reason": "time_budget" if budget_hit else "round_cap",
                    "rounds_history": rounds_history,
                    "candidates_log": candidates_log,
                    "switch_to_gtm": False,
                    "counters": counters,
                }

            # If NO candidate passed hard checks and we have not retried another topic yet (Phase 3)
            if not budget_hit and topic_retry_count < 1 and (topic_index + 1 < len(topic_candidates)):
                next_topic_idx = topic_index + 1
                next_topic = topic_candidates[next_topic_idx]
                return {
                    "current_topic_index": next_topic_idx,
                    "topic_retry_count": topic_retry_count + 1,
                    "current_round": 0,
                    "round": 0,
                    "repaired_once": False,
                    "topic_title": next_topic.get("topic_title"),
                    "topic_label": next_topic.get("topic_label"),
                    "angle": next_topic.get("angle"),
                    "key_facts": next_topic.get("key_facts"),
                    "hook_type": next_topic.get("hook_type"),
                    "post_format": next_topic.get("post_format"),
                    "why_now": next_topic.get("why_now"),
                    "chosen": next_topic.get("chosen"),
                    "draft": None,
                    "best_raw_draft": None,
                    "best_raw_eval": None,
                    "last_issue_codes": issue_codes,
                    "last_critique": critique,
                    "switch_to_gtm": True,
                    "is_loop_terminal": False,
                    "rounds_history": rounds_history,
                    "candidates_log": candidates_log,
                    "counters": counters,
                }

            # Exhausted repair and topic retry with zero clean drafts
            return {
                "round": current_round,
                "current_round": current_round,
                "current_topic_index": topic_index,
                "best_clean_draft": None,
                "repaired_once": repaired_once,
                "is_loop_terminal": True,
                "status": "failed_error",
                "exit_reason": "no_clean_candidate",
                "rounds_history": rounds_history,
                "candidates_log": candidates_log,
                "switch_to_gtm": False,
                "counters": counters,
            }

        # Continue to next rewrite round on current topic
        return {
            "round": current_round + 1,
            "current_round": current_round + 1,
            "current_topic_index": topic_index,
            "best_draft": best_clean_draft or best_raw_draft,
            "best_clean_draft": best_clean_draft,
            "best_clean_score": best_clean_score,
            "best_clean_slop": best_clean_slop,
            "best_clean_round": best_clean_round,
            "best_raw_draft": best_raw_draft,
            "best_raw_eval": best_raw_eval,
            "best_score": best_clean_slop if best_clean_draft is not None else ai_slop_score,
            "best_round": best_clean_round if best_clean_draft is not None else current_round,
            "is_loop_terminal": False,
            "switch_to_gtm": False,
            "rounds_history": rounds_history,
            "candidates_log": candidates_log,
            "counters": counters,
        }

    # Node 9: POST-LOOP (Finalizes clean best draft, separates public trace from private internal_trace)
    def post_loop_node(state: PipelineState) -> Dict[str, Any]:
        _notify_step("post_loop", state.get("round", 0), state)
        start_t = time.perf_counter()
        counters = dict(state.get("counters", {}))
        seconds = dict(state.get("seconds_per_node", {}))

        best_clean_draft = state.get("best_clean_draft")
        best_clean_score = state.get("best_clean_score", -1)
        best_clean_slop = state.get("best_clean_slop", state.get("best_score", 0))
        best_clean_round = state.get("best_clean_round", state.get("best_round", 0))
        exit_reason = state.get("exit_reason", "unknown")
        gtm_brief = state.get("gtm_brief", {})
        chosen = state.get("chosen", {})
        candidates_log = state.get("candidates_log", [])

        topic_title = state.get("topic_title") or (state.get("finder_output") or {}).get("topic_title") or chosen.get("title", "")
        topic_label = state.get("topic_label") or (state.get("finder_output") or {}).get("topic_label") or ""
        key_facts = state.get("key_facts") or (state.get("finder_output") or {}).get("key_facts") or []

        # Build private internal trace (never exposed via any public API)
        internal_trace = {
            "candidates": candidates_log,
            "chosen_round": best_clean_round,
            "combined_score": best_clean_score,
            "stop_reason": exit_reason,
            "below_target": bool(best_clean_draft is not None and best_clean_score < MIN_ACCEPTABLE),
            "llm_calls": counters.get("llm_calls", 0),
        }

        if not best_clean_draft:
            seconds["post_loop"] = round(time.perf_counter() - start_t, 3)
            return {
                "status": "failed_error",
                "error_code": "no_clean_candidate",
                "error_detail": PLAIN_TECH_ERROR_MESSAGE,
                "draft": None,
                "best_draft": None,
                "internal_trace": internal_trace,
                "counters": counters,
                "seconds_per_node": seconds,
            }

        final_draft = dict(best_clean_draft)
        if not final_draft.get("image_headline"):
            from app.services.checks import generate_companion_image_headline
            final_draft["image_headline"] = generate_companion_image_headline(
                post_text=final_draft.get("post_text", ""),
                model=_fast_model,
            )

        seconds["post_loop"] = round(time.perf_counter() - start_t, 3)

        # Public audit trace (strictly excludes combined_score, below_target, raw errors, and prompts)
        agent_trace = {
            "status": "succeeded",
            "final_score": best_clean_slop,
            "best_round": best_clean_round,
            "rounds_count": len(state.get("rounds_history", [])),
            "finder": state.get("finder_output"),
            "topic_title": topic_title,
            "topic_label": topic_label,
            "key_facts": key_facts,
            "gtm_brief": gtm_brief,
            "rounds": state.get("rounds_history", []),
            "timings": seconds,
            "counters": counters,
        }

        _notify_step("succeeded", state.get("round", 0), state)

        return {
            "status": "succeeded",
            "draft": final_draft,
            "best_draft": final_draft,
            "ai_score": best_clean_slop,
            "final_score": best_clean_slop,
            "needs_review": False,
            "agent_trace": agent_trace,
            "internal_trace": internal_trace,
            "current_step": "succeeded",
            "current_topic_index": state.get("current_topic_index", 0),
            "max_topics": state.get("max_topics", 4),
            "current_round": state.get("current_round", 0),
            "max_rewrites": MAX_ROUNDS,
            "topic_title": topic_title,
            "topic_label": topic_label,
            "key_facts": key_facts,
            "failing_gates": [],
            "counters": counters,
            "seconds_per_node": seconds,
        }

    # Node execution wrapper enforcing per-node timeout, whole-run safety ceiling, and live progress persistence
    def _wrap_node(node_name: str, node_func: Callable[[PipelineState], Dict[str, Any]]) -> Callable[[PipelineState], Dict[str, Any]]:
        def _wrapped(state: PipelineState) -> Dict[str, Any]:
            run_id = str(state.get("run_id") or "none")
            user_id = str(state.get("user_id") or "none")
            round_num = state.get("current_round", state.get("round", 0))
            topic_idx = state.get("current_topic_index", 0)
            best_draft = state.get("best_draft")

            # Whole-run safety ceiling check (1200s)
            deadline = state.get("run_deadline")
            ceiling_limit = getattr(settings, "RUN_SAFETY_CEILING_SECONDS", 1200)
            if deadline and time.time() > deadline:
                logger.warning(f"[SAFETY CEILING HIT] run_id={run_id} | user_id={user_id} | node={node_name} | ceiling={ceiling_limit}s")
                best_score = state.get("best_score", 999)
                if best_draft and best_score <= getattr(settings, "AI_SCORE_THRESHOLD", 15):
                    logger.info(f"[CEILING RECOVER] run_id={run_id} | returning passing draft (score={best_score})")
                    return {
                        "status": "succeeded",
                        "draft": best_draft,
                        "best_draft": best_draft,
                        "best_score": best_score,
                        "ai_score": best_score,
                        "current_step": "completed",
                    }
                elif best_draft:
                    logger.info(f"[CEILING RECOVER] run_id={run_id} | returning best effort draft marked needs_review (score={best_score})")
                    return {
                        "status": "needs_review",
                        "draft": best_draft,
                        "best_draft": best_draft,
                        "best_score": best_score,
                        "ai_score": best_score,
                        "current_step": "post_loop",
                    }
                return {
                    "status": "timed_out",
                    "error_code": "timed_out",
                    "error_detail": f"Run exceeded whole-run deadline of {ceiling_limit}s at node '{node_name}'",
                    "current_step": node_name,
                }

            # Live DB progress update & structured log on node start
            _update_db_node_progress(
                run_id,
                node_name,
                is_start=True,
                topic_index=topic_idx,
                round_num=round_num,
                best_draft=best_draft,
                current_step=node_name,
            )
            _notify_step(node_name, round_num, state)
            logger.info(f"[NODE START] run_id={run_id} | user_id={user_id} | node={node_name} | topic={topic_idx} | round={round_num}")
            node_start_t = time.perf_counter()

            try:
                result = run_call_with_timeout(
                    node_func,
                    args=(state,),
                    timeout_seconds=float(settings.PER_NODE_TIMEOUT_SECONDS),
                )
            except TimeoutError as te:
                logger.error(f"[NODE TIMEOUT] run_id={run_id} | node={node_name} timed out after {settings.PER_NODE_TIMEOUT_SECONDS}s: {te}")
                best_score = state.get("best_score", 999)
                if best_draft:
                    return {
                        "status": "needs_review",
                        "draft": best_draft,
                        "best_draft": best_draft,
                        "best_score": best_score,
                        "ai_score": best_score,
                        "is_loop_terminal": True,
                        "current_step": "post_loop",
                    }
                return {
                    "status": "timed_out",
                    "error_code": "timed_out",
                    "error_detail": f"Node '{node_name}' timed out after {settings.PER_NODE_TIMEOUT_SECONDS}s",
                    "current_step": node_name,
                }
            except Exception as exc:
                logger.error(f"[NODE ERROR] run_id={run_id} | node={node_name} failed: {exc}", exc_info=True)
                raise
            finally:
                dur = time.perf_counter() - node_start_t
                _update_db_node_progress(
                    run_id,
                    node_name,
                    is_start=False,
                    topic_index=topic_idx,
                    round_num=round_num,
                    best_draft=best_draft,
                    current_step=node_name,
                )
                logger.info(f"[NODE END] run_id={run_id} | user_id={user_id} | node={node_name} | duration={dur:.2f}s")

            return result
        return _wrapped

    # Register workflow nodes
    transient_retry = RetryPolicy(max_attempts=2)
    workflow.add_node("plan", _wrap_node("plan", plan_node), retry_policy=transient_retry)
    workflow.add_node("search", _wrap_node("search", search_node), retry_policy=transient_retry)
    workflow.add_node("finder", _wrap_node("finder", finder_node), retry_policy=transient_retry)

    # Error routing helper: terminates to END if error_code is set or run terminated early
    def route_after_node(next_node: str) -> Callable[[PipelineState], str]:
        def _route(state: PipelineState) -> str:
            if state.get("error_code") and not state.get("is_loop_terminal"):
                return END
            if state.get("status") in ("timed_out", "completed", "succeeded", "needs_review"):
                return END
            if state.get("is_loop_terminal"):
                return "post_loop" if (not partial and next_node != END) else END
            return next_node
        return _route

    if partial:
        workflow.add_edge(START, "plan")
        workflow.add_conditional_edges("plan", route_after_node("search"), ["search", END])
        workflow.add_conditional_edges("search", route_after_node("finder"), ["finder", END])
        workflow.add_conditional_edges("finder", route_after_node(END), [END])
        return workflow.compile()

    workflow.add_node("gtm_brief", _wrap_node("gtm_brief", gtm_brief_node), retry_policy=transient_retry)
    workflow.add_node("drafter", _wrap_node("drafter", drafter_node), retry_policy=transient_retry)
    workflow.add_node("check", _wrap_node("check", check_node))
    workflow.add_node("detector", _wrap_node("detector", detector_node), retry_policy=transient_retry)
    workflow.add_node("router", _wrap_node("router", router_node))
    workflow.add_node("post_loop", _wrap_node("post_loop", post_loop_node), retry_policy=transient_retry)

    # Check routing helper: if deterministic check failures exist, skip detector LLM call directly to router
    def route_after_check(state: PipelineState) -> str:
        if state.get("error_code") and not state.get("is_loop_terminal"):
            return END
        if state.get("check_failures"):
            return "router"
        return "detector"

    # Define router conditional edge: either retry drafter, failover to gtm_brief with new topic, or terminate to post_loop
    def route_after_router(state: PipelineState) -> str:
        if state.get("error_code") and not state.get("is_loop_terminal"):
            return END
        if state.get("is_loop_terminal"):
            return "post_loop"
        if state.get("switch_to_gtm"):
            return "gtm_brief"
        return "drafter"

    # Assemble graph edges (drafter -> detector -> check -> router)
    workflow.add_edge(START, "plan")
    workflow.add_conditional_edges("plan", route_after_node("search"), ["search", END])
    workflow.add_conditional_edges("search", route_after_node("finder"), ["finder", END])
    workflow.add_conditional_edges("finder", route_after_node("gtm_brief"), ["gtm_brief", END])
    workflow.add_conditional_edges("gtm_brief", route_after_node("drafter"), ["drafter", END])
    workflow.add_conditional_edges("drafter", route_after_node("detector"), ["detector", END])
    workflow.add_conditional_edges("detector", route_after_node("check"), ["check", END])
    workflow.add_conditional_edges("check", route_after_node("router"), ["router", END])
    workflow.add_conditional_edges("router", route_after_router, ["drafter", "gtm_brief", "post_loop", END])
    workflow.add_edge("post_loop", END)

    return workflow.compile()


def _emit_events_for_node(
    node_name: str,
    update: Dict[str, Any],
    state: Dict[str, Any],
    emitter: Any,
    prev_best_score: int,
) -> int:
    """Translate a LangGraph node update into public timeline events via RunEventEmitter."""
    if emitter is None or not isinstance(update, dict):
        return prev_best_score

    round_num = int(state.get("current_round", state.get("round", 0)) or 0) + 1

    if node_name == "plan":
        emitter.emit_agent_completed("finder", "Prepared search queries.")
    elif node_name == "search":
        cands = update.get("candidates") or []
        emitter.emit_agent_completed("finder", f"Found {len(cands)} candidate articles.")
    elif node_name == "finder":
        topic_label = update.get("topic_label") or state.get("topic_label") or "Selected topic"
        key_facts = update.get("key_facts") or []
        emitter.emit_topic_chosen(topic_label, key_facts)
        emitter.emit_agent_started("gtm", "Choosing the opening style and structure.", round_num)
    elif node_name == "gtm_brief":
        hook_style = update.get("hook_style") or "observation"
        emitter.emit_hook_chosen(hook_style)
        emitter.emit_agent_started("drafter", f"Writing round {round_num} draft.", round_num)
    elif node_name == "drafter":
        draft_dict = update.get("draft") or {}
        if draft_dict.get("post_text"):
            emitter.emit_draft_ready(round_num, draft_dict["post_text"])
            emitter.emit_agent_started("detector", "Checking writing quality.", round_num)
    elif node_name == "detector":
        det = update.get("detection_result") or {}
        ai_score = int(det.get("final_score", 0) or 0)
        emitter.emit_check_result(round_num, ai_score)
    elif node_name == "router":
        new_best = int(update.get("best_clean_score", prev_best_score) or -1)
        if new_best > prev_best_score and update.get("best_clean_draft") is not None:
            prev_best_score = new_best
            emitter.emit_best_updated(round_num)

        if not update.get("is_loop_terminal"):
            issue_codes = state.get("last_issue_codes") or []
            if issue_codes:
                emitter.emit_revision_notes(round_num, issue_codes)
            next_round = int(update.get("current_round", round_num) or 0) + 1
            if update.get("switch_to_gtm"):
                emitter.emit_agent_started("gtm", "Trying a different topic angle.", next_round)
            else:
                emitter.emit_agent_started("drafter", f"Refining draft in round {next_round}.", next_round)
    elif node_name == "post_loop":
        if update.get("status") == "succeeded" and update.get("draft"):
            rounds_used = max(1, len(state.get("rounds_history", [])))
            ai_score = int(update.get("ai_score", 0) or 0)
            emitter.emit_run_completed(update["draft"], ai_score, rounds_used)
        elif update.get("error_code"):
            emitter.emit_run_failed(PLAIN_TECH_ERROR_MESSAGE)

    return prev_best_score


def execute_pipeline(
    user_id: str,
    profile_dict: Dict[str, Any],
    history: List[Dict[str, Any]],
    search_tool: Optional[Any] = None,
    models: Optional[Dict[str, Any]] = None,
    step_callback: Optional[Callable[[str, int, Dict[str, Any]], None]] = None,
    topic_hint: Optional[str] = None,
    is_manual: bool = False,
    run_id: Optional[str] = None,
    event_emitter: Optional[Any] = None,
) -> Dict[str, Any]:
    """Single unified entrypoint for both daily content generation runs and playground runs."""
    import uuid
    pipeline_start_t = time.perf_counter()
    thread_id = f"manual_{user_id}_{run_id or uuid.uuid4()}" if is_manual else f"scheduled_{user_id}_{uuid.uuid4()}"

    # Ensure profile_dict has full personalized content profile fields
    if not profile_dict or not profile_dict.get("goals"):
        try:
            cached_profile = get_content_profile(user_id=user_id)
            merged_profile = dict(cached_profile)
            merged_profile.update({k: v for k, v in (profile_dict or {}).items() if v is not None})
            profile_dict = merged_profile
        except Exception as exc:
            logger.warning(f"Could not load content profile for user {user_id}: {exc}")

    recent_titles = [p.get("topic_title") for p in history if p.get("topic_title")]
    recent_captions = [p.get("caption_preview", "") for p in history if p.get("caption_preview")]

    ceiling_seconds = getattr(settings, "RUN_SAFETY_CEILING_SECONDS", 1200)
    run_deadline = time.time() + float(ceiling_seconds)
    time_budget_deadline = time.time() + float(TIME_BUDGET_SECONDS)

    initial_state: PipelineState = {
        "user_id": user_id,
        "is_manual": is_manual,
        "run_id": run_id,
        "thread_id": thread_id,
        "run_deadline": run_deadline,
        "time_budget_deadline": time_budget_deadline,
        "profile": profile_dict,
        "history": history,
        "recent_titles": recent_titles,
        "recent_captions": recent_captions,
        "topic_hint": topic_hint,
        "counters": {"search_calls": 0, "llm_calls": 0, "tokens_in": 0, "tokens_out": 0},
        "seconds_per_node": {},
        "round": 0,
        "current_round": 0,
        "current_topic_index": 0,
        "max_topics": getattr(settings, "MAX_TOPICS_PER_RUN", 4),
        "max_rewrites": MAX_ROUNDS,
        "best_draft": None,
        "best_clean_draft": None,
        "best_clean_score": -1,
        "best_clean_slop": 999,
        "best_clean_round": 0,
        "best_raw_draft": None,
        "best_raw_eval": None,
        "best_failing_gates": [],
        "consecutive_same_gate_failures": 0,
        "last_failing_gate": None,
        "topic_candidates": [],
        "strike_count": 0,
        "rounds_history": [],
        "candidates_log": [],
        "last_issue_codes": [],
        "last_critique": "",
        "repaired_once": False,
        "topic_retry_count": 0,
        "cancelled": False,
        "best_score": 999,
    }

    app = build_graph(
        search_tool=search_tool,
        models=models,
        step_callback=step_callback,
    )

    if event_emitter is not None:
        event_emitter.emit_run_started()
        event_emitter.emit_agent_started("finder", "Searching for fresh topics in your space.", 1)

    # Stream updates through LangGraph so events emit live and cancellation is checked between steps
    merged_state: Dict[str, Any] = dict(initial_state)
    prev_best_score = -1

    try:
        for chunk in app.stream(
            initial_state,
            config={
                "recursion_limit": 150,
                "configurable": {"thread_id": thread_id},
            },
            stream_mode="updates",
        ):
            if not isinstance(chunk, dict):
                continue
            for node_name, update in chunk.items():
                if isinstance(update, dict):
                    merged_state.update(update)
                    prev_best_score = _emit_events_for_node(
                        node_name, update, merged_state, event_emitter, prev_best_score
                    )

            # Check user cancellation between node steps
            if event_emitter is not None and event_emitter.is_cancelled():
                merged_state["cancelled"] = True
                merged_state["status"] = "cancelled"
                if merged_state.get("best_clean_draft"):
                    merged_state["draft"] = merged_state["best_clean_draft"]
                    merged_state["best_draft"] = merged_state["best_clean_draft"]
                    merged_state["ai_score"] = merged_state.get("best_clean_slop", 0)
                event_emitter.flush()
                break
    except Exception as exc:
        logger.error(f"Pipeline execution error for run {run_id}: {exc}", exc_info=True)
        merged_state["status"] = "failed_error"
        merged_state["error_code"] = "pipeline_error"
        merged_state["error_detail"] = PLAIN_TECH_ERROR_MESSAGE
        if event_emitter is not None:
            event_emitter.emit_run_failed(PLAIN_TECH_ERROR_MESSAGE)

    # Record event write overhead into internal_trace if present
    if event_emitter is not None:
        event_emitter.flush()
        it = dict(merged_state.get("internal_trace") or {})
        it["event_write_ms"] = round(event_emitter.total_write_ms, 2)
        it["events_emitted"] = event_emitter.events_emitted
        it["event_flushes"] = event_emitter.flush_count
        merged_state["internal_trace"] = it

    final_state = merged_state
    chosen = final_state.get("chosen") or {}
    finder_out = final_state.get("finder_output") or {}
    chosen_topic = finder_out.get("topic_label") or finder_out.get("topic") or chosen.get("title") or "Unknown"
    chosen_hook_style = final_state.get("hook_style") or final_state.get("hook_type") or "Unknown"
    final_counters = final_state.get("counters", {})
    pipeline_duration = round(time.perf_counter() - pipeline_start_t, 2)

    run_type_label = "manual" if is_manual else "scheduled"
    cache_search_label = "BYPASS" if is_manual else "MISS"
    cache_layers_str = f"endpoint: MISS, search: {cache_search_label}, finder: MISS, gtm: MISS, drafter: MISS, detector: MISS"

    final_status = final_state.get("status") or ("failed_error" if final_state.get("error_code") else "completed")
    final_state["status"] = final_status
    final_reason = final_state.get("error_detail") or final_state.get("exit_reason") or "completed"

    logger.info(
        f"[PIPELINE RUN] run_id={run_id or 'none'} | user_id={user_id} | run_type={run_type_label} | "
        f"cache_layers={{{cache_layers_str}}} | "
        f"chosen_topic='{chosen_topic}' | chosen_hook_style='{chosen_hook_style}' | "
        f"rewrite_rounds={final_state.get('round', 0)} | duration={pipeline_duration:.2f}s | "
        f"llm_calls={final_counters.get('llm_calls', 0)} | search_calls={final_counters.get('search_calls', 0)} | "
        f"tokens_in={final_counters.get('tokens_in', 0)} | tokens_out={final_counters.get('tokens_out', 0)}"
    )
    logger.info(
        f"[PIPELINE RUN END] run_id={run_id or 'none'} | user_id={user_id} | status={final_status} | "
        f"total_time={pipeline_duration:.2f}s | reason='{final_reason}'"
    )

    return final_state
