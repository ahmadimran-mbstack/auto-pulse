"""Database-backed CustomizationContext loader and unified build_user_context helper."""

import logging
import time
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.customization import (
    CustomizationJob,
    CustomizationSettings,
    CustomizationVersion,
)
from app.services.content_profile import get_content_profile
from app.services.customization.compiler import CustomizationContext

logger = logging.getLogger(__name__)

POST_TYPES: List[str] = ["build_in_public", "technical_explainer", "hot_take"]

# Per-section character limits so prompts never overflow
MAX_CHARS_CUSTOM_INSTRUCTIONS = 2000
MAX_CHARS_PLAYBOOK_RULES = 4500
MAX_CHARS_BUSINESS_FACTS = 3000
MAX_CHARS_EXEMPLARS = 2500
MAX_CHARS_RECENT_HISTORY = 1800


def _truncate_section(text: str, max_chars: int, section_name: str) -> tuple[str, bool, str]:
    """Truncate text at a newline boundary if over max_chars, logging an internal warning."""
    clean = (text or "").strip()
    if len(clean) <= max_chars:
        return clean, False, ""
    cut_part = clean[max_chars:]
    # Try to cut cleanly at the last newline before max_chars
    nl = clean.rfind("\n", 0, max_chars)
    kept = clean[:nl].rstrip() if nl > max_chars // 2 else clean[:max_chars].rstrip()
    logger.warning(
        f"[USER_CONTEXT] Section '{section_name}' exceeded {max_chars} chars "
        f"({len(clean)} chars); truncated {len(clean) - len(kept)} trailing chars."
    )
    return kept, True, cut_part[:300]


def wait_for_pending_customization_jobs(
    user_id: str,
    timeout_seconds: float = 20.0,
    poll_interval: float = 0.5,
    db: Optional[Session] = None,
) -> bool:
    """Wait up to timeout_seconds for queued/running customization jobs for user_id.
    Returns True if all jobs finished, False if still pending/running after timeout.
    """
    deadline = time.monotonic() + timeout_seconds
    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    try:
        while True:
            if should_close:
                db.expire_all()
            pending_count = (
                db.query(CustomizationJob)
                .filter(
                    CustomizationJob.user_id == user_id,
                    CustomizationJob.status.in_(["queued", "running"]),
                )
                .count()
            )
            if pending_count == 0:
                return True
            if time.monotonic() >= deadline:
                logger.warning(
                    f"[CUSTOMIZATION] User {user_id} still has {pending_count} pending/running "
                    f"customization job(s) after {timeout_seconds:.0f}s wait; proceeding with latest compiled version."
                )
                return False
            time.sleep(poll_interval)
    except Exception as exc:
        logger.warning(f"[CUSTOMIZATION] Error checking pending jobs for {user_id}: {exc}")
        return True
    finally:
        if should_close:
            db.close()


def get_customization_context(
    user_id: str,
    db: Optional[Session] = None,
    wait_for_pending: bool = True,
) -> CustomizationContext:
    """Load the active compiled CustomizationContext directly from Postgres (no cache)."""
    if not settings.is_customization_enabled_for(user_id):
        return CustomizationContext(is_empty=True)

    if wait_for_pending:
        wait_for_pending_customization_jobs(user_id=user_id, timeout_seconds=20.0, db=db)

    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    ctx = CustomizationContext(is_empty=True)
    try:
        settings_row = (
            db.query(CustomizationSettings)
            .filter(CustomizationSettings.user_id == user_id)
            .first()
        )
        if settings_row and settings_row.active_version_id:
            ver = (
                db.query(CustomizationVersion)
                .filter(
                    CustomizationVersion.id == settings_row.active_version_id,
                    CustomizationVersion.user_id == user_id,
                )
                .first()
            )
            if ver and ver.compiled:
                ctx = CustomizationContext.model_validate(ver.compiled)
                ctx.version_id = str(ver.id)
                ctx.version = ver.version
    except Exception as exc:
        logger.warning(f"Failed loading customization context for {user_id}: {exc}")
        return CustomizationContext(is_empty=True)
    finally:
        if should_close:
            db.close()

    return ctx


def invalidate_customization_context_cache(user_id: str) -> None:
    """No-op: customization context is read directly from DB on every run."""
    return None


def choose_post_type(
    history: Optional[List[Dict[str, Any]]] = None,
    has_documented_experiences: bool = False,
    has_business_facts: bool = False,
) -> str:
    """Rotate post_type across recent posts, avoiding types that lack required data."""
    allowed = list(POST_TYPES)
    if not has_documented_experiences and not has_business_facts and "build_in_public" in allowed:
        allowed.remove("build_in_public")

    recent_types: List[str] = []
    for p in (history or [])[:10]:
        pt = (p.get("post_type") or p.get("post_format") or "").strip().lower().replace(" ", "_")
        if pt in allowed:
            recent_types.append(pt)

    # Pick the allowed post_type used least recently
    for candidate in allowed:
        if candidate not in recent_types[:2]:
            return candidate
    counts = {pt: recent_types.count(pt) for pt in allowed}
    return min(allowed, key=lambda pt: counts.get(pt, 0))


def build_user_context(
    user_id: str,
    post_type: Optional[str] = None,
    history: Optional[List[Dict[str, Any]]] = None,
    profile_override: Optional[Dict[str, Any]] = None,
    db: Optional[Session] = None,
    wait_for_pending: bool = True,
) -> Dict[str, Any]:
    """Load customization, onboarding/Settings profile, and recent history into one clean object.
    Applies per-section size limits, filters rules by post_type, and logs skipped/truncated items.
    """
    profile = dict(profile_override or get_content_profile(user_id=user_id, db=db))
    ctx = get_customization_context(user_id=user_id, db=db, wait_for_pending=wait_for_pending)

    if history is None:
        should_close = False
        if db is None:
            db = SessionLocal()
            should_close = True
        try:
            from app.repositories import post as post_repo

            history = post_repo.get_user_post_history(db, user_id, limit=15)
        except Exception as exc:
            logger.warning(f"[USER_CONTEXT] Could not load history for {user_id}: {exc}")
            history = []
        finally:
            if should_close:
                db.close()

    g = ctx.guidance
    policy_dict = ctx.policy.model_dump()

    has_doc_exp = bool(g.documented_experiences)
    has_biz_facts = bool(g.business_facts or g.business_brief_text)
    chosen_post_type = post_type or choose_post_type(
        history=history,
        has_documented_experiences=has_doc_exp,
        has_business_facts=has_biz_facts,
    )

    # Resolve length and question_ending for chosen_post_type
    length_map = policy_dict.get("length_by_post_type") or {}
    if chosen_post_type in length_map and policy_dict.get("provenance", {}).get("length_max") != "custom_instructions":
        pt_bounds = length_map[chosen_post_type]
        if pt_bounds.get("min"):
            policy_dict["length_min"] = pt_bounds["min"]
        if pt_bounds.get("max"):
            policy_dict["length_max"] = pt_bounds["max"]

    if policy_dict.get("provenance", {}).get("question_ending") != "custom_instructions":
        policy_dict["question_ending"] = "required" if chosen_post_type == "technical_explainer" else "allowed"

    # Filter playbook rules by applies_to in ("all", chosen_post_type)
    scoped_rules: List[Dict[str, Any]] = []
    skipped_video_rules: List[str] = []
    for r in g.playbook_rules or []:
        scope = r.get("applies_to", "all")
        if scope == "project_showcase_video":
            skipped_video_rules.append(r.get("id", ""))
            continue
        if scope in ("all", chosen_post_type, "first_comment_action"):
            scoped_rules.append(r)

    if skipped_video_rules:
        logger.info(
            f"[USER_CONTEXT] Skipped {len(skipped_video_rules)} project_showcase_video rule(s) "
            f"for text post_type='{chosen_post_type}': {skipped_video_rules}"
        )

    if scoped_rules:
        scoped_rules_raw = "\n".join(
            f"[{r.get('id', 'RULE')}] ({str(r.get('strength', 'should')).upper()}) {r.get('rule', '')}"
            for r in scoped_rules
        )
    else:
        scoped_rules_raw = g.playbook_rules_text or ""

    # Format business facts + brief
    biz_lines: List[str] = []
    if g.business_brief_text:
        biz_lines.append(g.business_brief_text.strip())
    for i, f in enumerate(g.business_facts or [], 1):
        biz_lines.append(f"[{i}] {f.get('text', '')} (Source: {f.get('source_label', '')})")
    if g.documented_experiences:
        biz_lines.append("Documented Experiences (allowed first-person events):")
        for e in g.documented_experiences:
            biz_lines.append(f"- {e.get('text', '')}")
    if g.terminology:
        biz_lines.append("Spell exactly: " + ", ".join(g.terminology))
    if g.claims_to_avoid:
        biz_lines.append("Never claim: " + ", ".join(g.claims_to_avoid))
    biz_raw = "\n".join(biz_lines).strip()

    # Format previous post exemplars for voice
    ex_lines = [e.text.strip() for e in (g.exemplars or []) if e.text and e.text.strip()]
    ex_raw = "\n---\n".join(ex_lines).strip()

    # Format recent 10 posts' topics & hooks for variety
    recent_topics: List[str] = []
    recent_hooks: List[str] = []
    for p in (history or [])[:10]:
        t = (p.get("topic_label") or p.get("topic_title") or "").strip()
        if t:
            recent_topics.append(t)
        h = (p.get("hook_text") or "").strip()
        if not h and p.get("caption_preview"):
            h = str(p.get("caption_preview", "")).strip().splitlines()[0].strip()
        if h:
            recent_hooks.append(h[:140])

    # Apply per-section character limits and record exact sizes
    ci_text, ci_cut, ci_cut_preview = _truncate_section(
        g.custom_instructions or "", MAX_CHARS_CUSTOM_INSTRUCTIONS, "custom_instructions"
    )
    pb_text, pb_cut, pb_cut_preview = _truncate_section(
        scoped_rules_raw, MAX_CHARS_PLAYBOOK_RULES, "playbook_rules"
    )
    biz_text, biz_cut, biz_cut_preview = _truncate_section(
        biz_raw, MAX_CHARS_BUSINESS_FACTS, "business_facts"
    )
    ex_text, ex_cut, ex_cut_preview = _truncate_section(
        ex_raw, MAX_CHARS_EXEMPLARS, "previous_posts_voice"
    )

    section_sizes = {
        "custom_instructions": {"chars": len(ci_text), "tokens_est": max(0, len(ci_text) // 4), "cut": ci_cut, "cut_preview": ci_cut_preview},
        "playbook_rules": {"chars": len(pb_text), "tokens_est": max(0, len(pb_text) // 4), "cut": pb_cut, "cut_preview": pb_cut_preview},
        "business_facts": {"chars": len(biz_text), "tokens_est": max(0, len(biz_text) // 4), "cut": biz_cut, "cut_preview": biz_cut_preview},
        "previous_posts_voice": {"chars": len(ex_text), "tokens_est": max(0, len(ex_text) // 4), "cut": ex_cut, "cut_preview": ex_cut_preview},
    }

    return {
        "user_id": user_id,
        "post_type": chosen_post_type,
        "is_empty": ctx.is_empty,
        "version_id": ctx.version_id,
        "version": ctx.version,
        "profile": profile,
        "policy": policy_dict,
        "customization": ctx.model_dump(),
        "custom_instructions": ci_text,
        "playbook_rules_text": pb_text,
        "scoped_rules": scoped_rules,
        "business_facts_text": biz_text,
        "previous_posts_voice_text": ex_text,
        "voice_summary": g.voice_summary or "",
        "voice_traits": list(g.voice_traits or []),
        "vocabulary_preferred": list(g.vocabulary_preferred or []),
        "vocabulary_avoid": list(g.vocabulary_avoid or []),
        "recent_topics": recent_topics,
        "recent_hooks": recent_hooks,
        "coverage_warnings": list(ctx.coverage_warnings or []),
        "section_sizes": section_sizes,
    }
