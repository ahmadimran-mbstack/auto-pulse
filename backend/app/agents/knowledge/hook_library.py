"""AutoPulse LinkedIn Hook Library
Contains 28 curated hook templates across 7 distinct editorial styles.
"""
from typing import Any, Dict, List, Optional

HOOK_STYLES: List[str] = [
    "story",
    "contrarian_opinion",
    "number_result",
    "question",
    "mistake",
    "how_to",
    "observation",
]

# Normalization map to unify legacy hook_type names to standard hook styles
HOOK_STYLE_ALIASES: Dict[str, str] = {
    "story": "story",
    "personal story": "story",
    "case study": "story",
    "scene opening": "story",
    "contrarian_opinion": "contrarian_opinion",
    "contrarian opinion": "contrarian_opinion",
    "defensible contrarian claim": "contrarian_opinion",
    "contrarian": "contrarian_opinion",
    "number_result": "number_result",
    "number result": "number_result",
    "number-led specific result": "number_result",
    "number led specific result": "number_result",
    "metrics": "number_result",
    "data-driven": "number_result",
    "question": "question",
    "pointed specific question": "question",
    "dilemma": "question",
    "mistake": "mistake",
    "concrete mistake": "mistake",
    "anti-pattern": "mistake",
    "how_to": "how_to",
    "how to": "how_to",
    "small how-to": "how_to",
    "small how to": "how_to",
    "tactical guide": "how_to",
    "playbook": "how_to",
    "observation": "observation",
    "specific observation": "observation",
    "industry shift": "observation",
    "trend": "observation",
}


def normalize_hook_style(raw_style: Optional[str]) -> str:
    if not raw_style:
        return "observation"
    cleaned = raw_style.strip().lower()
    if cleaned in HOOK_STYLES:
        return cleaned
    cleaned_spaces = cleaned.replace("-", " ").replace("_", " ")
    for alias, standard in HOOK_STYLE_ALIASES.items():
        if alias == cleaned or alias == cleaned_spaces:
            return standard
    for alias, standard in HOOK_STYLE_ALIASES.items():
        if alias in cleaned or alias in cleaned_spaces:
            return standard
    return "observation"


HOOK_LIBRARY: List[Dict[str, Any]] = [
    # 1. STORY (4 hooks)
    {
        "id": "story_01",
        "style": "story",
        "name": "The 2 AM Crisis",
        "template": "At 2 AM on a Tuesday, our production alerts lit up. The cause wasn't what anyone expected: {topic}.",
        "guidance": "Opens with visceral immediacy and high stakes before revealing the technical culprit.",
    },
    {
        "id": "story_02",
        "style": "story",
        "name": "The Uncomfortable Realization",
        "template": "Six months ago, we decided to completely rethink how we approach {topic}. Here is what broke first.",
        "guidance": "Builds candid authenticity by highlighting early friction before the breakthrough.",
    },
    {
        "id": "story_03",
        "style": "story",
        "name": "The Customer Breakdown",
        "template": "A customer called us last week with a baffling issue in their {topic} pipeline. 48 hours later, we found the pattern.",
        "guidance": "Grounds the post in a real practitioner support situation and investigative diagnosis.",
    },
    {
        "id": "story_04",
        "style": "story",
        "name": "The Pivot Point",
        "template": "We spent three quarters building out our standard workflow. Then one benchmark on {topic} changed our entire roadmap.",
        "guidance": "Highlights a major strategic inflection point driven by hard data.",
    },

    # 2. CONTRARIAN OPINION (4 hooks)
    {
        "id": "contrarian_01",
        "style": "contrarian_opinion",
        "name": "The Standard Consensus is Broken",
        "template": "Most teams treat {topic} as a solved problem. In real production workloads, it's actually where architectures quietly fail.",
        "guidance": "Directly challenges default industry assumptions with defensive technical reasoning.",
    },
    {
        "id": "contrarian_02",
        "style": "contrarian_opinion",
        "name": "The Overhyped Fix",
        "template": "The industry won't stop talking about {topic}. But after testing it under load, here is why we walked away.",
        "guidance": "Counter-trend analysis that cuts through marketing hype with practitioner reality.",
    },
    {
        "id": "contrarian_03",
        "style": "contrarian_opinion",
        "name": "Inverted Priority",
        "template": "Stop optimizing for peak speed in {topic}. The only metric that matters at scale is predictable degradation.",
        "guidance": "Reframes an obsession with vanity metrics toward operational resilience.",
    },
    {
        "id": "contrarian_04",
        "style": "contrarian_opinion",
        "name": "The Expensive Illusion",
        "template": "Adding more tools to manage {topic} doesn't make your team faster. It just creates more expensive failure modes.",
        "guidance": "Highlights tool fatigue and architectural bloat in modern systems.",
    },

    # 3. NUMBER / RESULT (4 hooks)
    {
        "id": "number_01",
        "style": "number_result",
        "name": "Tail Latency Drop",
        "template": "A single configuration change in our {topic} layer reduced p99 latency by 43% across 12 million daily events.",
        "guidance": "Anchors the opening line in verifiable, high-impact performance metrics.",
    },
    {
        "id": "number_02",
        "style": "number_result",
        "name": "Cost vs Output",
        "template": "We audited 30 production implementations of {topic}. 78% were paying 3x more compute than their traffic demanded.",
        "guidance": "Exposes widespread inefficiency using broad empirical audit numbers.",
    },
    {
        "id": "number_03",
        "style": "number_result",
        "name": "Time-to-Recovery",
        "template": "By decoupling {topic} from synchronous requests, our mean time to recovery dropped from 42 minutes to under 30 seconds.",
        "guidance": "Quantifies operational reliability and incident response improvements.",
    },
    {
        "id": "number_04",
        "style": "number_result",
        "name": "The 90-Day Benchmark",
        "template": "90 days of benchmarking {topic} across 5 cloud regions produced one undeniable conclusion.",
        "guidance": "Promises rigorous multi-environment empirical findings.",
    },

    # 4. QUESTION (4 hooks)
    {
        "id": "question_01",
        "style": "question",
        "name": "The Hard Trade-off",
        "template": "If your primary system crashed right now, could your team restore {topic} without data loss in under 15 minutes?",
        "guidance": "Poses a direct, uncomfortable diagnostic question to peer practitioners.",
    },
    {
        "id": "question_02",
        "style": "question",
        "name": "The Hidden Cost",
        "template": "Why do 8 out of 10 engineering teams still struggle with {topic} despite having modern tooling?",
        "guidance": "Probes the gap between tooling investments and actual team productivity.",
    },
    {
        "id": "question_03",
        "style": "question",
        "name": "The Architectural Dilemma",
        "template": "Build in-house or buy managed? The decision on {topic} usually comes down to one overlooked trade-off.",
        "guidance": "Tackles a high-frequency executive/engineering dilemma head-on.",
    },
    {
        "id": "question_04",
        "style": "question",
        "name": "The Second-Order Effect",
        "template": "What happens to your team's throughput when {topic} becomes the hidden bottleneck nobody is monitoring?",
        "guidance": "Examines silent downstream consequences that degrade team velocity.",
    },

    # 5. MISTAKE (4 hooks)
    {
        "id": "mistake_01",
        "style": "mistake",
        "name": "The Silent Anti-Pattern",
        "template": "The most expensive mistake we see with {topic} isn't bad architecture. It's treating it like a background concern.",
        "guidance": "Identifies an overlooked cultural or technical trap that compounds costs.",
    },
    {
        "id": "mistake_02",
        "style": "mistake",
        "name": "Premature Optimization",
        "template": "We wasted 4 weeks trying to over-engineer {topic}. Here is what we should have shipped on day one instead.",
        "guidance": "Shares vulnerable hindsight to help others avoid over-complicating systems.",
    },
    {
        "id": "mistake_03",
        "style": "mistake",
        "name": "Default Settings Trap",
        "template": "Never run {topic} with out-of-the-box defaults in production. Here are the 3 settings that will bit you.",
        "guidance": "Warns of dangerous defaults with immediate actionable fixes.",
    },
    {
        "id": "mistake_04",
        "style": "mistake",
        "name": "The Abstraction Leak",
        "template": "Hiding {topic} behind a clean abstraction feels great until a network partition forces you to debug the raw bytes.",
        "guidance": "Critiques leaky abstractions with practical production realities.",
    },

    # 6. HOW-TO (4 hooks)
    {
        "id": "howto_01",
        "style": "how_to",
        "name": "The Step-by-Step Playbook",
        "template": "A 4-step framework for diagnosing and fixing bottlenecks in {topic} without tearing down your infrastructure.",
        "guidance": "Delivers an actionable, non-disruptive tactical walkthrough.",
    },
    {
        "id": "howto_02",
        "style": "how_to",
        "name": "The Zero-Downtime Migration",
        "template": "How to migrate your {topic} workload to modern architecture without a single second of scheduled downtime.",
        "guidance": "Promises practical migration tactics for mission-critical services.",
    },
    {
        "id": "howto_03",
        "style": "how_to",
        "name": "The Production Checklist",
        "template": "Before shipping {topic} to production this quarter, run through this 5-point sanity checklist.",
        "guidance": "Provides high utility reference material that users save and share.",
    },
    {
        "id": "howto_04",
        "style": "how_to",
        "name": "First Principles Setup",
        "template": "How to design {topic} from first principles when standard documentation leaves out production edge cases.",
        "guidance": "Focuses on fundamentals for handling edge cases missed by basic docs.",
    },

    # 7. OBSERVATION (4 hooks)
    {
        "id": "observation_01",
        "style": "observation",
        "name": "The Quiet Transition",
        "template": "Something subtle is happening in how top teams handle {topic}. The shift isn't being talked about publicly yet.",
        "guidance": "Creates curiosity around an emerging, unheralded industry movement.",
    },
    {
        "id": "observation_02",
        "style": "observation",
        "name": "The Bifurcation",
        "template": "The gap between teams that master {topic} and those that ignore it is no longer linear. It is compounding monthly.",
        "guidance": "Highlights a growing competitive divide in engineering execution.",
    },
    {
        "id": "observation_03",
        "style": "observation",
        "name": "Post-Mortem Analysis",
        "template": "Reading through recent production post-mortems reveals an interesting pattern: {topic} is almost always involved.",
        "guidance": "Draws high-signal empirical conclusions from incident retrospectives.",
    },
    {
        "id": "observation_04",
        "style": "observation",
        "name": "The Tooling Paradox",
        "template": "We have 10x more developer tools for {topic} than we had three years ago, yet debugging has never taken longer.",
        "guidance": "Highlights a sharp paradox in modern developer velocity.",
    },
]


def get_hooks_by_style(style: str) -> List[Dict[str, Any]]:
    norm = normalize_hook_style(style)
    return [h for h in HOOK_LIBRARY if h["style"] == norm]


def get_available_hook_styles(recent_styles: List[str]) -> List[str]:
    """Excludes hook styles used in the user's recent posts (e.g. last 5 posts).
    If all styles would be excluded, returns the least recently used styles.
    """
    normalized_recent = [normalize_hook_style(s) for s in recent_styles if s]
    available = [s for s in HOOK_STYLES if s not in normalized_recent]
    if not available:
        # If all styles appeared, return all styles except the most recent one
        last_style = normalized_recent[0] if normalized_recent else None
        available = [s for s in HOOK_STYLES if s != last_style] or HOOK_STYLES
    return available
