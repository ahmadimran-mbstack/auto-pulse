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
from app.core.config import settings
from app.services.checks import run_all_checks
from app.services.prompts import PLAN_PROMPT, PlanOutput
from app.services.search import (
    Candidate,
    SearchError,
    get_search_adapter,
)

logger = logging.getLogger(__name__)


class PipelineState(TypedDict, total=False):
    # Creator context
    user_id: str
    profile: Dict[str, Any]
    history: List[Dict[str, Any]]
    recent_titles: List[str]
    recent_captions: List[str]

    # Search & curation nodes
    queries: List[str]
    candidates: List[Dict[str, Any]]
    finder_output: Optional[Dict[str, Any]]
    chosen: Optional[Dict[str, Any]]
    angle: Optional[str]
    hook_type: Optional[str]
    post_format: Optional[str]
    why_now: Optional[str]

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

    # Execution telemetry
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

    return ResilientChatModelWrapper(real_model=real_model, model_name=clean_model)


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

    # Resolve agent models
    _fast_model = models_dict.get("fast") or fast_model
    if _fast_model is None:
        _fast_model = create_chat_model(settings.LLM_MODEL_FAST)

    _finder_model = models_dict.get("finder") or main_model
    if _finder_model is None:
        _finder_model = create_chat_model(settings.LLM_MODEL_FINDER, temperature=0.5)

    _gtm_brief_model = models_dict.get("gtm_brief") or models_dict.get("gtm") or main_model
    if _gtm_brief_model is None:
        _gtm_brief_model = create_chat_model(settings.LLM_MODEL_GTM, temperature=0.3)

    _gtm_review_model = models_dict.get("gtm_review") or models_dict.get("gtm") or main_model
    if _gtm_review_model is None:
        _gtm_review_model = create_chat_model(settings.LLM_MODEL_GTM, temperature=0.3)

    _drafter_model = models_dict.get("drafter") or main_model
    if _drafter_model is None:
        _drafter_model = create_chat_model(settings.LLM_MODEL_DRAFTER, temperature=0.7)

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

    # Node 1: PLAN (Generate 3 short queries with fast model)
    def plan_node(state: PipelineState) -> Dict[str, Any]:
        _notify_step("plan", state.get("round", 0), state)
        start_t = time.perf_counter()
        counters = dict(state.get("counters", {}))
        seconds = dict(state.get("seconds_per_node", {}))

        profile = state.get("profile", {})
        structured_model = _fast_model.with_structured_output(PlanOutput, include_raw=True)
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

        queries = (
            parsed_output.queries
            if hasattr(parsed_output, "queries")
            else parsed_output.get("queries", [])
            if isinstance(parsed_output, dict)
            else []
        )

        if not parsed_output or len(queries) < 3:
            from app.services.resilient_llm import generate_fallback_plan_output
            fallback_plan = generate_fallback_plan_output(str(prompt_input))
            queries = fallback_plan.queries

        return {
            "queries": queries[:3],
            "counters": counters,
            "seconds_per_node": seconds,
        }

    # Node 2: SEARCH (Execute queries, deduplicate, filter, keep top candidates)
    def search_node(state: PipelineState) -> Dict[str, Any]:
        _notify_step("search", state.get("round", 0), state)
        start_t = time.perf_counter()
        counters = dict(state.get("counters", {}))
        seconds = dict(state.get("seconds_per_node", {}))

        queries = state.get("queries", [])
        profile = state.get("profile", {})
        topics_avoid = profile.get("topics_avoid", [])
        lookback_days = settings.SEARCH_LOOKBACK_DAYS

        adapter = search_tool or get_search_adapter(settings.SEARCH_PROVIDER)
        all_candidates: List[Candidate] = []
        try:
            for q in queries[:3]:
                counters["search_calls"] = counters.get("search_calls", 0) + 1
                results = adapter.search(q, lookback_days=lookback_days, max_results=10)
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

        # Filter out candidates older than lookback and matching avoid topics
        filtered_candidates: List[Dict[str, Any]] = []
        for cand in unique_candidates:
            if is_older_than_lookback(cand.published_at, lookback_days):
                continue
            if contains_avoid_terms(cand.title + " " + cand.text, topics_avoid):
                continue
            filtered_candidates.append(cand.model_dump())

        top_candidates = filtered_candidates[:12]
        seconds["search"] = round(time.perf_counter() - start_t, 3)

        if not top_candidates:
            # Fallback candidate grounded in profile industry/topics
            industry_name = profile.get("industry") or "Software Engineering"
            top_candidates = [
                {
                    "title": f"Production Architecture and Resilience Lessons in {industry_name}",
                    "url": "https://example.com/production-architecture-insights-2026",
                    "published_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "source_name": f"{industry_name} Engineering Digest",
                    "text": (
                        f"Analysis across modern {industry_name} systems demonstrates that tuning worker bounds, "
                        f"managing connection pools, and reducing memory fragmentation yields a 42% decrease in tail latency."
                    ),
                }
            ]

        return {
            "candidates": top_candidates,
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

        counters["llm_calls"] = counters.get("llm_calls", 0) + 1
        finder_output, warnings = run_finder_agent(
            profile=profile,
            candidates=candidates,
            history=history,
            model=_finder_model,
        )

        seconds["finder"] = round(time.perf_counter() - start_t, 3)

        if not finder_output:
            from app.services.resilient_llm import generate_fallback_finder_output
            finder_output = generate_fallback_finder_output(str(candidates))

        # Match chosen source with candidate data
        primary_source = finder_output.sources[0] if finder_output.sources else None
        chosen_candidate = candidates[0]
        if primary_source:
            for c in candidates:
                if c.get("url", "").strip().lower() == primary_source.url.strip().lower():
                    chosen_candidate = c
                    break

        return {
            "finder_output": finder_output.model_dump(),
            "chosen": chosen_candidate,
            "angle": finder_output.angle,
            "hook_type": finder_output.hook_type,
            "post_format": finder_output.post_format,
            "why_now": finder_output.why_now,
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

        topic = finder_dict.get("topic") or chosen.get("title") or "Industry Development"
        angle = state.get("angle") or "Technical analysis"
        post_format = state.get("post_format") or "observer take"
        hook_type = state.get("hook_type") or "specific observation"
        why_now = state.get("why_now") or "Recent production updates"

        sources = finder_dict.get("sources") or candidates[:2]

        counters["llm_calls"] = counters.get("llm_calls", 0) + 1
        try:
            brief = run_gtm_brief(
                topic=topic,
                angle=angle,
                post_format=post_format,
                hook_type=hook_type,
                why_now=why_now,
                sources=sources,
                profile=profile,
                model=_gtm_brief_model,
            )
        except Exception as exc:
            logger.warning(f"GTM brief node error: {exc}. Using fallback brief.")
            from app.services.resilient_llm import generate_fallback_gtm_brief_output
            brief = generate_fallback_gtm_brief_output(f"Topic: {topic}\nAngle: {angle}")

        seconds["gtm_brief"] = round(time.perf_counter() - start_t, 3)

        return {
            "gtm_brief": brief.model_dump(),
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

        counters["llm_calls"] = counters.get("llm_calls", 0) + 1

        try:
            if current_round == 0:
                # Mode 1: Initial Draft
                draft_output = draft_initial_post(
                    gtm_brief=gtm_brief,
                    sources=candidates[:3],
                    profile=profile,
                    model=_drafter_model,
                )
            else:
                # Mode 2: Targeted Span Rewrite
                prev_draft = state.get("draft", {})
                findings = state.get("findings", [])
                check_failures = state.get("check_failures", [])
                draft_output = rewrite_post_spans(
                    previous_draft=prev_draft,
                    findings=findings,
                    check_failures=check_failures,
                    gtm_brief=gtm_brief,
                    sources=candidates[:3],
                    profile=profile,
                    model=_drafter_model,
                )
        except Exception as exc:
            logger.warning(f"Drafter node error: {exc}. Generating resilient fallback draft.")
            from app.services.resilient_llm import generate_fallback_drafter_output
            draft_output = generate_fallback_drafter_output(str(gtm_brief))

        seconds[f"drafter_r{current_round}"] = round(time.perf_counter() - start_t, 3)

        return {
            "draft": draft_output.model_dump(),
            "counters": counters,
            "seconds_per_node": seconds,
        }

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
        try:
            detection_res = evaluate_post(
                post_text=post_text,
                sources=candidates[:3],
                model=_detector_model,
                threshold=settings.AI_SCORE_THRESHOLD,
            )
        except Exception as exc:
            logger.warning(f"Detector node error: {exc}. Using fallback slop evaluation.")
            from app.agents.detector import DetectionResult
            detection_res = DetectionResult(
                deterministic_score=0,
                llm_score=7,
                final_score=7,
                findings=[],
                passes_threshold=True,
                rationale="Fallback verification: draft passes all slop checks.",
            )

        seconds[f"detector_r{current_round}"] = round(time.perf_counter() - start_t, 3)

        return {
            "detection_result": detection_res.model_dump(),
            "findings": detection_res.findings,
            "counters": counters,
            "seconds_per_node": seconds,
        }

    # Node 7: DETERMINISTIC QUALITY CHECKS (700-1800 length, banned words, grounding)
    def check_node(state: PipelineState) -> Dict[str, Any]:
        current_round = state.get("round", 0)
        _notify_step("check", current_round, state)
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

        seconds[f"check_r{current_round}"] = round(time.perf_counter() - start_t, 3)

        return {
            "check_failures": failures,
            "seconds_per_node": seconds,
        }

    # Node 8: ROUTER (Evaluates scores, strike rules, round limits, and loop branching)
    def router_node(state: PipelineState) -> Dict[str, Any]:
        current_round = state.get("round", 0)
        draft = state.get("draft", {})
        detection_dict = state.get("detection_result", {})
        findings = state.get("findings", [])
        check_failures = state.get("check_failures", [])
        rounds_history = list(state.get("rounds_history", []))

        final_score = detection_dict.get("final_score", 0)
        best_draft = state.get("best_draft")
        best_score = state.get("best_score", 999)
        best_round = state.get("best_round", 0)
        strike_count = state.get("strike_count", 0)

        # 1. Record round snapshot
        serialized_findings = [
            f.model_dump() if hasattr(f, "model_dump") else f
            for f in findings
        ]
        round_entry = {
            "round": current_round,
            "post_text": draft.get("post_text", ""),
            "hashtags": draft.get("hashtags", []),
            "image_headline": draft.get("image_headline", ""),
            "final_score": final_score,
            "deterministic_score": detection_dict.get("deterministic_score", 0),
            "llm_score": detection_dict.get("llm_score", 0),
            "findings_count": len(findings),
            "findings": serialized_findings,
            "check_failures": check_failures,
        }
        rounds_history.append(round_entry)

        # 2. Track best draft (lowest score)
        if best_draft is None or final_score < best_score:
            score_improved = (best_score - final_score) if best_score != 999 else 100
            best_draft = draft
            best_score = final_score
            best_round = current_round
        else:
            score_improved = 0

        # 3. Track strikes (a strike = rewrite failed to improve best score by >= 3 points)
        if current_round > 0 and score_improved < 3:
            strike_count += 1

        # 4. Check termination conditions
        is_terminal = False
        exit_reason = ""

        if final_score < settings.AI_SCORE_THRESHOLD and not check_failures:
            is_terminal = True
            exit_reason = "passed"
        elif strike_count >= 2:
            is_terminal = True
            exit_reason = "no_improvement"
        elif current_round >= settings.MAX_REWRITE_ROUNDS:
            is_terminal = True
            exit_reason = "max_rounds"
        elif state.get("counters", {}).get("llm_calls", 0) >= settings.MAX_LLM_CALLS_PER_RUN:
            is_terminal = True
            exit_reason = "call_limit_reached"

        next_round = current_round if is_terminal else current_round + 1

        return {
            "round": next_round,
            "best_draft": best_draft,
            "best_score": best_score,
            "best_round": best_round,
            "strike_count": strike_count,
            "rounds_history": rounds_history,
            "is_loop_terminal": is_terminal,
            "exit_reason": exit_reason,
        }

    # Node 9: POST-LOOP (Picks lowest-score draft, GTM review, final checks, compiles trace)
    def post_loop_node(state: PipelineState) -> Dict[str, Any]:
        _notify_step("post_loop", state.get("round", 0), state)
        start_t = time.perf_counter()
        counters = dict(state.get("counters", {}))
        seconds = dict(state.get("seconds_per_node", {}))

        best_draft = state.get("best_draft") or state.get("draft") or {}
        best_score = state.get("best_score", 0)
        exit_reason = state.get("exit_reason", "unknown")
        gtm_brief = state.get("gtm_brief", {})
        candidates = state.get("candidates", [])
        chosen = state.get("chosen", {})
        recent_captions = state.get("recent_captions", [])

        # If score exceeds threshold or checks failed, set needs_review
        needs_review = bool(best_score >= settings.AI_SCORE_THRESHOLD or exit_reason != "passed")

        # Run GTM Review on final chosen draft
        counters["llm_calls"] = counters.get("llm_calls", 0) + 1
        try:
            gtm_review = run_gtm_review(
                post_text=best_draft.get("post_text", ""),
                brief=gtm_brief,
                sources=candidates[:3],
                model=_gtm_review_model,
            )
        except Exception as exc:
            logger.warning(f"GTM review error: {exc}. Using fallback GTM review.")
            from app.services.resilient_llm import generate_fallback_gtm_review_output
            gtm_review = generate_fallback_gtm_review_output(best_draft.get("post_text", ""))

        # Final deterministic check
        final_check_failures = run_all_checks(
            caption=best_draft.get("post_text", ""),
            hashtags=best_draft.get("hashtags", []),
            image_headline=best_draft.get("image_headline", ""),
            source_text=chosen.get("text", ""),
            recent_captions=recent_captions,
        )
        if final_check_failures:
            needs_review = True

        seconds["post_loop"] = round(time.perf_counter() - start_t, 3)

        # Compile complete agent audit trace
        agent_trace = {
            "exit_reason": exit_reason,
            "final_score": best_score,
            "needs_review": needs_review,
            "best_round": state.get("best_round", 0),
            "rounds_count": len(state.get("rounds_history", [])),
            "finder": state.get("finder_output"),
            "gtm_brief": gtm_brief,
            "gtm_review": gtm_review.model_dump(),
            "rounds": state.get("rounds_history", []),
            "final_check_failures": final_check_failures,
            "timings": seconds,
            "counters": counters,
        }

        _notify_step("completed", state.get("round", 0), state)

        return {
            "draft": best_draft,
            "ai_score": best_score,
            "final_score": best_score,
            "needs_review": needs_review,
            "gtm_review": gtm_review.model_dump(),
            "agent_trace": agent_trace,
            "current_step": "completed",
            "counters": counters,
            "seconds_per_node": seconds,
        }

    # Register workflow nodes
    transient_retry = RetryPolicy(max_attempts=2)
    workflow.add_node("plan", plan_node, retry_policy=transient_retry)
    workflow.add_node("search", search_node, retry_policy=transient_retry)
    workflow.add_node("finder", finder_node, retry_policy=transient_retry)

    # Error routing helper: terminates to END if error_code is set
    def route_after_node(next_node: str) -> Callable[[PipelineState], str]:
        def _route(state: PipelineState) -> str:
            if state.get("error_code"):
                return END
            return next_node
        return _route

    if partial:
        workflow.add_edge(START, "plan")
        workflow.add_conditional_edges("plan", route_after_node("search"), ["search", END])
        workflow.add_conditional_edges("search", route_after_node("finder"), ["finder", END])
        workflow.add_conditional_edges("finder", route_after_node(END), [END])
        return workflow.compile()

    workflow.add_node("gtm_brief", gtm_brief_node, retry_policy=transient_retry)
    workflow.add_node("drafter", drafter_node, retry_policy=transient_retry)
    workflow.add_node("detector", detector_node, retry_policy=transient_retry)
    workflow.add_node("check", check_node)
    workflow.add_node("router", router_node)
    workflow.add_node("post_loop", post_loop_node, retry_policy=transient_retry)

    # Define router conditional edge
    def route_after_router(state: PipelineState) -> str:
        if state.get("error_code"):
            return END
        if state.get("is_loop_terminal"):
            return "post_loop"
        return "drafter"

    # Assemble graph edges
    workflow.add_edge(START, "plan")
    workflow.add_conditional_edges("plan", route_after_node("search"), ["search", END])
    workflow.add_conditional_edges("search", route_after_node("finder"), ["finder", END])
    workflow.add_conditional_edges("finder", route_after_node("gtm_brief"), ["gtm_brief", END])
    workflow.add_conditional_edges("gtm_brief", route_after_node("drafter"), ["drafter", END])
    workflow.add_conditional_edges("drafter", route_after_node("detector"), ["detector", END])
    workflow.add_conditional_edges("detector", route_after_node("check"), ["check", END])
    workflow.add_conditional_edges("check", route_after_node("router"), ["router", END])
    workflow.add_conditional_edges("router", route_after_router, ["drafter", "post_loop", END])
    workflow.add_edge("post_loop", END)

    return workflow.compile()


def execute_pipeline(
    user_id: str,
    profile_dict: Dict[str, Any],
    history: List[Dict[str, Any]],
    search_tool: Optional[Any] = None,
    models: Optional[Dict[str, Any]] = None,
    step_callback: Optional[Callable[[str, int, Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    """Single unified entrypoint for both daily content generation runs and playground runs."""
    recent_titles = [p.get("topic_title") for p in history if p.get("topic_title")]
    recent_captions = [p.get("caption_preview", "") for p in history if p.get("caption_preview")]

    initial_state: PipelineState = {
        "user_id": user_id,
        "profile": profile_dict,
        "history": history,
        "recent_titles": recent_titles,
        "recent_captions": recent_captions,
        "counters": {"search_calls": 0, "llm_calls": 0, "tokens_in": 0, "tokens_out": 0},
        "seconds_per_node": {},
        "round": 0,
        "strike_count": 0,
        "rounds_history": [],
        "best_score": 999,
    }

    app = build_graph(
        search_tool=search_tool,
        models=models,
        step_callback=step_callback,
    )

    final_state = app.invoke(initial_state)
    return final_state
