"""Compiler that merges distilled playbooks, business facts, voice samples,
instructions, and overrides into an immutable CustomizationContext.
"""

import hashlib
import json
import statistics
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.customization.distillers import (
    classify_rule_applies_to,
    distill_custom_instructions_to_policy,
)
from app.services.customization.policy import EffectivePolicy, MachineConstraint, clamp_policy
from app.services.embeddings import cosine_similarity

COMPILER_VERSION = "compiler-2"


class Exemplar(BaseModel):
    id: str
    document_id: str
    text: str
    char_count: int
    pinned: bool = False


class SourceRef(BaseModel):
    id: str
    kind: str
    title: str
    source_type: str


class GuidancePack(BaseModel):
    playbook_rules_text: str = ""
    playbook_rules: List[Dict[str, Any]] = Field(default_factory=list)
    playbook_rule_ids: List[str] = Field(default_factory=list)
    hook_patterns: List[str] = Field(default_factory=list)
    post_formats: List[str] = Field(default_factory=list)
    ctas: List[str] = Field(default_factory=list)
    voice_summary: str = ""
    voice_traits: List[str] = Field(default_factory=list)
    vocabulary_preferred: List[str] = Field(default_factory=list)
    vocabulary_avoid: List[str] = Field(default_factory=list)
    exemplars: List[Exemplar] = Field(default_factory=list)
    business_brief_text: str = ""
    business_facts: List[Dict[str, Any]] = Field(default_factory=list)
    core_fact_ids: List[str] = Field(default_factory=list)
    retrieval_ready: bool = False
    terminology: List[str] = Field(default_factory=list)
    claims_to_avoid: List[str] = Field(default_factory=list)
    content_pillars: List[str] = Field(default_factory=list)
    topics_include_extra: List[str] = Field(default_factory=list)
    topics_avoid_extra: List[str] = Field(default_factory=list)
    custom_instructions: str = ""
    business_mention: str = "natural"
    documented_experiences: List[Dict[str, Any]] = Field(default_factory=list)


class CustomizationContext(BaseModel):
    version_id: str = ""
    version: int = 0
    is_empty: bool = True
    policy: EffectivePolicy = Field(default_factory=EffectivePolicy)
    guidance: GuidancePack = Field(default_factory=GuidancePack)
    sources: List[SourceRef] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    coverage_warnings: List[str] = Field(default_factory=list)


def _estimate_tokens(text: str) -> int:
    return max(0, int((len(text or "") / 4.0) * 1.1))


def _apply_constraint(
    data: Dict[str, Any],
    provenance: Dict[str, str],
    c: MachineConstraint,
    source_tag: str,
    warnings: List[str],
) -> None:
    def _set(field: str, val: Any) -> None:
        prev = provenance.get(field)
        if prev and prev != "default" and prev != source_tag:
            warnings.append(f"Overwrote {field} ({prev} -> {source_tag})")
        data[field] = val
        provenance[field] = source_tag

    if c.type == "length_chars":
        if c.min is not None:
            _set("length_min", c.min)
        if c.max is not None:
            _set("length_max", c.max)
    elif c.type == "first_line_max_chars" and c.max is not None:
        _set("first_line_max", c.max)
    elif c.type == "paragraph_count":
        if c.min is not None:
            _set("paragraphs_min", c.min)
        if c.max is not None:
            _set("paragraphs_max", c.max)
    elif c.type == "hashtag_count":
        if c.min is not None:
            _set("hashtags_min", c.min)
        if c.max is not None:
            _set("hashtags_max", c.max)
    elif c.type == "hashtag_case" and c.value in ("camel", "lower", "any"):
        _set("hashtag_case", c.value)
    elif c.type == "emoji_policy" and c.value in ("none", "sparse", "allowed"):
        _set("emoji_policy", c.value)
    elif c.type == "bullet_style" and c.value:
        _set("allow_markdown_bullets", c.value.lower() in ("allow", "allowed", "true", "bullets", "arrows"))
    elif c.type == "banned_phrase" and c.value:
        bp = list(data.get("banned_phrases_extra") or [])
        if c.value not in bp:
            bp.append(c.value)
        _set("banned_phrases_extra", bp)
    elif c.type == "required_phrase_end" and c.value:
        _set("required_end_phrase", c.value)
    elif c.type == "required_phrase_start" and c.value:
        _set("required_start_phrase", c.value)
    elif c.type == "question_ending" and c.value in ("allowed", "required", "forbidden"):
        _set("question_ending", c.value)


def _derive_voice_constraints(samples: List[Dict[str, Any]]) -> List[MachineConstraint]:
    """Derive soft constraints from >= 5 valid samples."""
    valid = [s for s in samples if not s.get("excluded") and not s.get("quality_flag")]
    if len(valid) < 5:
        return []

    lengths = sorted(int(s["char_count"]) for s in valid)
    p25 = lengths[max(0, int(len(lengths) * 0.25))]
    p75 = lengths[min(len(lengths) - 1, int(len(lengths) * 0.75))]
    constraints: List[MachineConstraint] = [
        MachineConstraint(type="length_chars", min=max(300, p25), max=min(2900, max(p25 + 150, p75)))
    ]

    emoji_posts = sum(1 for s in valid if (s.get("features") or {}).get("emoji_count", 0) > 0)
    ratio = emoji_posts / len(valid)
    if ratio >= 0.40:
        constraints.append(MachineConstraint(type="emoji_policy", value="allowed"))
    elif ratio >= 0.10:
        constraints.append(MachineConstraint(type="emoji_policy", value="sparse"))

    tag_counts = [int((s.get("features") or {}).get("hashtag_count", 0)) for s in valid]
    med_tags = int(statistics.median(tag_counts))
    constraints.append(MachineConstraint(type="hashtag_count", min=max(0, med_tags - 1), max=min(5, med_tags + 1)))

    return constraints


def compute_input_fingerprint(
    docs: List[Dict[str, Any]],
    samples: List[Dict[str, Any]],
    facts: List[Dict[str, Any]],
    settings_data: Dict[str, Any],
) -> str:
    payload = {
        "compiler": COMPILER_VERSION,
        "docs": [(str(d["id"]), d.get("sha256"), d.get("distiller_version"), d.get("enabled")) for d in docs],
        "samples": [(str(s["id"]), s.get("pinned"), s.get("excluded")) for s in samples],
        "facts": [(str(f["id"]), f.get("removed"), f.get("is_core")) for f in facts],
        "settings": {
            "custom_instructions": settings_data.get("custom_instructions"),
            "default_playbook_mode": settings_data.get("default_playbook_mode"),
            "use_previous_posts_for_voice": settings_data.get("use_previous_posts_for_voice"),
            "business_mention": settings_data.get("business_mention"),
            "overrides": settings_data.get("overrides"),
        },
    }
    raw = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def compile_customization_context(
    docs: List[Dict[str, Any]],
    samples: List[Dict[str, Any]],
    facts: List[Dict[str, Any]],
    settings_data: Dict[str, Any],
    default_playbook_text: str = "",
) -> Tuple[CustomizationContext, Dict[str, int]]:
    """Compile active documents, samples, facts, and settings into CustomizationContext."""
    warnings: List[str] = []
    overrides = settings_data.get("overrides") or {}
    disabled_rules = set(overrides.get("disabled_rule_ids") or [])
    removed_facts = set(overrides.get("removed_fact_ids") or [])
    custom_instructions = (settings_data.get("custom_instructions") or "").strip()
    mode = settings_data.get("default_playbook_mode") or "merge"
    use_voice = settings_data.get("use_previous_posts_for_voice", True)
    business_mention = settings_data.get("business_mention") or "natural"

    active_docs = [d for d in docs if d.get("enabled", True) and d.get("status") == "ready"]
    active_doc_ids = {str(d["id"]) for d in active_docs}
    if not active_docs and not custom_instructions and not overrides.get("policy_overrides"):
        return CustomizationContext(is_empty=True), {}

    # 1. Policy assembly (precedence: default -> voice -> playbooks -> instructions -> overrides -> clamp)
    policy_data = EffectivePolicy().model_dump()
    provenance: Dict[str, str] = {k: "default" for k in policy_data if k != "provenance"}
    # Amendment C: compiled customization defaults to no hashtags in body (max 3 in first comment)
    policy_data["hashtags_in_body"] = False
    policy_data["hashtags_min"] = 0
    policy_data["first_comment_hashtags_max"] = 3

    if use_voice:
        for c in _derive_voice_constraints(samples):
            _apply_constraint(policy_data, provenance, c, "voice", warnings)

    # Playbooks oldest -> newest so newest wins
    playbooks = sorted(
        [d for d in active_docs if d.get("kind") == "playbook"],
        key=lambda d: str(d.get("created_at") or ""),
    )
    user_rule_lines: List[str] = []
    user_rule_objs: List[Dict[str, Any]] = []
    user_rule_ids: List[str] = []
    hook_patterns: List[str] = []
    post_formats: List[str] = []
    ctas: List[str] = []
    length_by_post_type: Dict[str, Dict[str, int]] = {}

    for pb in playbooks:
        distilled = pb.get("distilled") or {}
        doc_short = str(pb["id"]).replace("-", "")[:3].upper()
        for idx, r in enumerate(distilled.get("rules") or [], 1):
            cat = str(r.get("category") or "other").upper()[:4]
            rid = f"U{doc_short}-{cat}-{idx:02d}"
            if rid in disabled_rules:
                continue
            strength = str(r.get("strength") or "should").upper()
            rule_text = str(r.get("rule") or "").strip()
            ev_quote = str(r.get("evidence_quote") or "").strip()
            applies_to = classify_rule_applies_to(
                rule_text, ev_quote, str(r.get("category") or ""), r.get("applies_to")
            )
            user_rule_ids.append(rid)
            user_rule_lines.append(f"[{rid}] ({strength} | {applies_to}) {rule_text}")
            user_rule_objs.append(
                {
                    "id": rid,
                    "category": str(r.get("category") or "other").lower(),
                    "strength": strength.lower(),
                    "rule": rule_text,
                    "applies_to": applies_to,
                }
            )

            lower_r = f"{rule_text} {ev_quote}".lower()
            # Resolve length by post type without overwriting across scopes
            if applies_to == "hot_take" and ("200 words" in lower_r or "under 200" in lower_r):
                length_by_post_type["hot_take"] = {"min": 300, "max": 1100}

            # Hook rules from playbook text
            if "never start" in lower_r and "question" in lower_r:
                policy_data["no_question_hooks"] = True
                provenance["no_question_hooks"] = f"playbook:{rid}"
            if "always start" in lower_r and "number" in lower_r:
                policy_data["require_number_hook"] = True
                provenance["require_number_hook"] = f"playbook:{rid}"

            # Hashtags in body vs first comment
            if "no hashtags in the body" in lower_r or "not put hashtags in the post body" in lower_r:
                policy_data["hashtags_in_body"] = False
                policy_data["hashtags_min"] = 0
                provenance["hashtags_in_body"] = f"playbook:{rid}"
                provenance["hashtags_min"] = f"playbook:{rid}"

            # Banned phrases for deterministic scanner (Amendment C)
            if str(r.get("category") or "").lower() == "banned" or strength == "NEVER":
                bp_list = list(policy_data.get("banned_phrases_extra") or [])
                if "day n" in lower_r or "ai journey" in lower_r:
                    for ph in ("my AI journey", "Day 1 of my AI journey"):
                        if ph not in bp_list:
                            bp_list.append(ph)
                if "follow" in lower_r or "like" in lower_r:
                    for ph in ("follow me for", "like and follow", "drop a like"):
                        if ph not in bp_list:
                            bp_list.append(ph)
                policy_data["banned_phrases_extra"] = bp_list
                provenance["banned_phrases_extra"] = f"playbook:{rid}"

            if r.get("machine") and applies_to in ("all", "first_comment_action"):
                mc = MachineConstraint.model_validate(r["machine"])
                if mc.type == "length_chars" and ((mc.max is not None and mc.max < 100) or (mc.min is not None and mc.min < 50)):
                    continue
                if mc.type == "hashtag_count":
                    # Max 3 hashtags in first comment; keep body hashtags_min=0 when hashtags_in_body=False
                    if mc.max is not None:
                        policy_data["first_comment_hashtags_max"] = min(5, max(0, mc.max))
                        provenance["first_comment_hashtags_max"] = f"playbook:{rid}"
                    continue
                if mc.type == "question_ending" and applies_to != "all":
                    continue
                _apply_constraint(policy_data, provenance, mc, f"playbook:{rid}", warnings)
        hook_patterns.extend(distilled.get("hook_patterns") or [])
        post_formats.extend(distilled.get("post_formats") or [])
        ctas.extend(distilled.get("ctas") or [])

    if length_by_post_type:
        policy_data["length_by_post_type"] = length_by_post_type

    # Custom instruction policy extraction (highest user priority - Amendment D)
    if custom_instructions:
        ci_policy = distill_custom_instructions_to_policy(custom_instructions)
        for field_name in (
            "emoji_policy",
            "hashtags_in_body",
            "hashtags_min",
            "hashtags_max",
            "required_end_phrase",
            "question_ending",
            "length_min",
            "length_max",
            "no_question_hooks",
            "require_number_hook",
        ):
            val = getattr(ci_policy, field_name, None)
            if val is not None:
                policy_data[field_name] = val
                provenance[field_name] = "custom_instructions"
        if ci_policy.banned_words or ci_policy.banned_phrases:
            bp_list = list(policy_data.get("banned_phrases_extra") or [])
            for item in ci_policy.banned_words + ci_policy.banned_phrases:
                if item and item not in bp_list:
                    bp_list.append(item)
            policy_data["banned_phrases_extra"] = bp_list
            provenance["banned_phrases_extra"] = "custom_instructions"

    # Custom instruction constraints (highest user priority)
    for raw_c in overrides.get("instruction_constraints") or []:
        mc = MachineConstraint.model_validate(raw_c)
        _apply_constraint(policy_data, provenance, mc, "instructions", warnings)

    # Explicit UI policy overrides
    for k, v in (overrides.get("policy_overrides") or {}).items():
        if k in policy_data and k != "provenance":
            policy_data[k] = v
            provenance[k] = "override"

    doc_experiences = [
        f
        for f in facts
        if f.get("kind") == "documented_experience"
        and not f.get("removed")
        and (not f.get("document_id") or str(f["document_id"]) in active_doc_ids)
    ]
    policy_data["allow_first_person_events"] = bool(doc_experiences)
    provenance["allow_first_person_events"] = "previous_posts" if doc_experiences else "default"

    policy_data["provenance"] = provenance
    clamped_policy, clamp_warnings = clamp_policy(EffectivePolicy.model_validate(policy_data))
    warnings.extend(clamp_warnings)

    # 2. Playbook text (budget <= 2,500 tokens)
    combined_rules = list(user_rule_lines)
    if mode == "merge" and default_playbook_text:
        combined_rules.append("\n# AutoPulse Default Playbook:\n" + default_playbook_text)
    elif mode == "replace":
        combined_rules.append(
            "\n# Core Grounding & Platform Integrity:\n"
            "- [GROUND-01] Every number, benchmark, and entity must come from verified sources or business facts.\n"
            "- [FMT-01] Plain text only; no markdown headings or bold syntax."
        )
    playbook_rules_text = "\n".join(combined_rules).strip()
    if _estimate_tokens(playbook_rules_text) > 2500:
        playbook_rules_text = playbook_rules_text[:9000]
        warnings.append("Playbook rules truncated to fit 2,500-token budget.")

    # 3. Voice guidance
    prev_docs = [d for d in active_docs if d.get("kind") == "previous_posts"]
    voice_summary = (overrides.get("voice_summary_override") or "").strip()
    voice_traits: List[str] = []
    vocab_pref: List[str] = []
    vocab_avoid: List[str] = []
    themes: List[str] = []
    for pd in prev_docs:
        dist = pd.get("distilled") or {}
        if not voice_summary and dist.get("voice_summary"):
            voice_summary = dist["voice_summary"]
        voice_traits.extend(dist.get("traits") or [])
        vocab_pref.extend(dist.get("vocabulary_preferred") or [])
        vocab_avoid.extend(dist.get("vocabulary_avoid") or [])
        themes.extend(dist.get("themes") or [])

    # Fallback exemplars (pinned first, max 1 per doc, <= 1,500 tokens)
    active_samples = [
        s
        for s in samples
        if not s.get("excluded")
        and s.get("quality_flag") != "not_a_post"
        and (not s.get("document_id") or str(s["document_id"]) in active_doc_ids)
    ]
    active_samples.sort(key=lambda s: (not s.get("pinned", False), abs(int(s["char_count"]) - 950)))
    exemplars: List[Exemplar] = []
    seen_docs = set()
    ex_tokens = 0
    for s in active_samples:
        did = str(s["document_id"])
        if not s.get("pinned") and did in seen_docs:
            continue
        t = _estimate_tokens(s["text"])
        if ex_tokens + t > 1500 and exemplars:
            continue
        exemplars.append(
            Exemplar(
                id=str(s["id"]),
                document_id=did,
                text=s["text"],
                char_count=int(s["char_count"]),
                pinned=bool(s.get("pinned", False)),
            )
        )
        seen_docs.add(did)
        ex_tokens += t
        if len(exemplars) >= 4:
            break

    # 4. Business brief + fallback facts + embedding dedup
    biz_docs = [d for d in active_docs if d.get("kind") == "business"]
    brief_parts: List[str] = []
    terminology: List[str] = []
    claims_to_avoid: List[str] = []
    content_pillars: List[str] = []
    for bd in biz_docs:
        dist = bd.get("distilled") or {}
        if dist.get("company_name") or dist.get("one_liner"):
            brief_parts.append(f"{dist.get('company_name') or 'Company'}: {dist.get('one_liner') or ''}".strip())
        if dist.get("offering"):
            brief_parts.append("Offering: " + "; ".join(dist["offering"][:5]))
        if dist.get("icp"):
            brief_parts.append("Audience/ICP: " + "; ".join(dist["icp"][:4]))
        terminology.extend(dist.get("terminology") or [])
        claims_to_avoid.extend(dist.get("claims_to_avoid") or [])
        content_pillars.extend(dist.get("content_pillars") or [])

    business_brief_text = "\n".join(brief_parts)[:3200]

    biz_facts = [
        f
        for f in facts
        if f.get("kind") == "business_fact"
        and not f.get("removed")
        and str(f["id"]) not in removed_facts
        and (not f.get("document_id") or str(f["document_id"]) in active_doc_ids)
    ]
    # Deduplicate facts with cosine >= 0.92 when embeddings are present
    dedup_facts: List[Dict[str, Any]] = []
    for f in biz_facts:
        emb = f.get("embedding")
        if emb is not None:
            if any(
                df.get("embedding") is not None and cosine_similarity(emb, df["embedding"]) >= 0.92
                for df in dedup_facts
            ):
                continue
        dedup_facts.append(f)

    core_fact_ids = [str(f["id"]) for f in dedup_facts if f.get("is_core")][:5]
    fallback_facts = [
        {
            "id": str(f["id"]),
            "category": f.get("category", "other"),
            "text": f.get("text", ""),
            "numbers": list(f.get("numbers") or []),
            "source_label": f.get("source_label", ""),
            "is_core": bool(f.get("is_core")),
        }
        for f in dedup_facts[:25]
    ]

    retrieval_ready = any(
        (f.get("embedding") is not None and f.get("embedding_model") == settings.HF_EMBEDDING_MODEL)
        for f in (dedup_facts + doc_experiences)
    ) or any(
        (s.get("embedding") is not None and s.get("embedding_model") == settings.HF_EMBEDDING_MODEL)
        for s in active_samples
    )

    guidance = GuidancePack(
        playbook_rules_text=playbook_rules_text,
        playbook_rules=user_rule_objs,
        playbook_rule_ids=user_rule_ids,
        hook_patterns=list(dict.fromkeys(hook_patterns))[:15],
        post_formats=list(dict.fromkeys(post_formats))[:10],
        ctas=list(dict.fromkeys(ctas))[:10],
        voice_summary=voice_summary[:800],
        voice_traits=list(dict.fromkeys(voice_traits))[:12],
        vocabulary_preferred=list(dict.fromkeys(vocab_pref))[:30],
        vocabulary_avoid=list(dict.fromkeys(vocab_avoid))[:20],
        exemplars=exemplars,
        business_brief_text=business_brief_text,
        business_facts=fallback_facts,
        core_fact_ids=core_fact_ids,
        retrieval_ready=retrieval_ready,
        terminology=list(dict.fromkeys(terminology))[:30],
        claims_to_avoid=list(dict.fromkeys(claims_to_avoid))[:20],
        content_pillars=list(dict.fromkeys(content_pillars + themes))[:10],
        topics_include_extra=list(overrides.get("instruction_topics_include") or []),
        topics_avoid_extra=list(overrides.get("instruction_topics_avoid") or []),
        custom_instructions=custom_instructions[:4000],
        business_mention=business_mention,
        documented_experiences=[
            {
                "id": str(e["id"]),
                "text": e.get("text", ""),
                "numbers": list(e.get("numbers") or []),
                "source_label": e.get("source_label", ""),
            }
            for e in doc_experiences[:15]
        ],
    )

    sources = [
        SourceRef(
            id=str(d["id"]),
            kind=d["kind"],
            title=d["title"],
            source_type=d["source_type"],
        )
        for d in active_docs
    ]

    coverage_warnings: List[str] = []
    if not doc_experiences:
        coverage_warnings.append(
            "No documented_experiences found; first-person experience stories are disabled."
        )
    if not active_samples:
        coverage_warnings.append(
            "No previous_posts samples found; voice matching has no exemplars."
        )
    if not any(f.get("numbers") for f in dedup_facts):
        coverage_warnings.append(
            "Business facts contain no concrete numbers or metrics."
        )

    ctx = CustomizationContext(
        is_empty=False,
        policy=clamped_policy,
        guidance=guidance,
        sources=sources,
        warnings=list(dict.fromkeys(warnings)),
        coverage_warnings=coverage_warnings,
    )

    token_counts = {
        "playbook_rules": _estimate_tokens(guidance.playbook_rules_text),
        "voice": _estimate_tokens(guidance.voice_summary),
        "exemplars": ex_tokens,
        "business_brief": _estimate_tokens(guidance.business_brief_text),
        "instructions": _estimate_tokens(guidance.custom_instructions),
    }
    return ctx, token_counts
