"""AutoPulse LinkedIn Hook Library
Contains 28 curated hook style guides across 7 distinct editorial styles.

CRITICAL RULES:
- Never insert a raw topic title into a hook.
- Never add numbers to a hook unless explicitly verified in source key_facts.
- Hooks are style guides, not fill-in template sentences.
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
        "name": "The Sudden Realization",
        "pattern": "Opens on a specific moment of friction or surprise that revealed an overlooked problem.",
        "examples": [
            "A few months into redesigning our workflow, one edge case completely upended our assumptions.",
            "The first week after rolling out the new process, unexpected bottlenecks emerged in team handoffs.",
        ],
        "avoid": "Do not invent dramatic emergency events, fake 2 AM alarms, or fictional outages.",
    },
    {
        "id": "story_02",
        "style": "story",
        "name": "The Vulnerable Pivot",
        "pattern": "Describes rethinking a long-held strategy after direct practical observation.",
        "examples": [
            "After relying on the standard onboarding playbook for years, we decided to scrap the middle section.",
            "We spent months following industry best practices until real usage showed us where the friction lay.",
        ],
        "avoid": "Do not claim fake client engagements or fictional customer calls.",
    },
    {
        "id": "story_03",
        "style": "story",
        "name": "The Field Observation",
        "pattern": "Recalls a hands-on investigation that uncovered a recurring pattern.",
        "examples": [
            "Digging into repetitive review cycles last quarter revealed an interesting coordination breakdown.",
            "While auditing our project milestones, a common delay pattern finally clicked.",
        ],
        "avoid": "Do not invent specific customer names, unverified incident logs, or fake diagnostic timelines.",
    },
    {
        "id": "story_04",
        "style": "story",
        "name": "The Turning Point",
        "pattern": "Highlights a clear decision point where an old assumption had to be abandoned.",
        "examples": [
            "We thought more documentation would resolve confusion until team feedback pointed elsewhere.",
            "The turning point came when our simplest test case surfaced an unresolved trade-off.",
        ],
        "avoid": "Do not invent dramatic revenue losses, fake quarterly numbers, or fictional enterprise crises.",
    },

    # 2. CONTRARIAN OPINION (4 hooks)
    {
        "id": "contrarian_01",
        "style": "contrarian_opinion",
        "name": "The False Consensus",
        "pattern": "Directly challenges a popular consensus or assumed best practice in the field.",
        "examples": [
            "Most teams treat this process as settled, but in daily practice it creates silent friction.",
            "Industry consensus says to add more checkpoints, but that often hides the underlying problem.",
        ],
        "avoid": "Do not make aggressive unsubstantiated insults; provide a clear reasoning frame.",
    },
    {
        "id": "contrarian_02",
        "style": "contrarian_opinion",
        "name": "The Overhyped Solution",
        "pattern": "Explains why a widely celebrated trend or tool often falls short of practical expectations.",
        "examples": [
            "Everyone is talking about automated delegation, but manual alignment still wins where context matters.",
            "Adopting the latest framework sounds exciting until operational maintenance comes due.",
        ],
        "avoid": "Do not dismiss tools without addressing the underlying trade-offs.",
    },
    {
        "id": "contrarian_03",
        "style": "contrarian_opinion",
        "name": "The Inverted Priority",
        "pattern": "Argues that teams are optimizing for the wrong primary objective.",
        "examples": [
            "Stop optimizing for speed on day one; consistency under pressure is what sustains progress.",
            "Teams obsess over raw output volume when predictability is what actually moves the needle.",
        ],
        "avoid": "Do not invent performance percentages or ungrounded benchmark claims.",
    },
    {
        "id": "contrarian_04",
        "style": "contrarian_opinion",
        "name": "The Complexity Trap",
        "pattern": "Warns against adding layers of complexity to solve what is fundamentally an organizational or structural issue.",
        "examples": [
            "Adding more tools rarely fixes alignment; it usually just spreads confusion across more dashboards.",
            "Layering new abstractions onto a broken workflow only makes mistakes harder to track.",
        ],
        "avoid": "Do not use infrastructure jargon like microservices or pods.",
    },

    # 3. NUMBER / RESULT (4 hooks)
    {
        "id": "number_01",
        "style": "number_result",
        "name": "Verified Metric Shift",
        "pattern": "Leads with a single verified measurement taken directly from key facts.",
        "examples": [
            "A measured change in team evaluation criteria altered the project completion timeline.",
            "Tracking delivery cadence across quarters surfaced a measurable operational difference.",
        ],
        "avoid": "NEVER invent percentages, latency stats, or dollar amounts. Only cite numbers present in verified source facts.",
    },
    {
        "id": "number_02",
        "style": "number_result",
        "name": "Comparative Measurement",
        "pattern": "Contrasts two measured outcomes or states using facts from the source.",
        "examples": [
            "Comparing baseline performance with optimized configurations revealed where time was lost.",
            "Side-by-side analysis showed a clear divide between standard and streamlined workflows.",
        ],
        "avoid": "Do not invent audit sample sizes or fake benchmark percentages.",
    },
    {
        "id": "number_03",
        "style": "number_result",
        "name": "Operational Ratio",
        "pattern": "Frames progress as a ratio or proportion documented in research findings.",
        "examples": [
            "The ratio of maintenance overhead to new initiatives reveals where team effort actually goes.",
            "Looking at input effort versus final output highlights an overlooked operational imbalance.",
        ],
        "avoid": "Do not invent multipliers like tenfold or fake recovery seconds.",
    },
    {
        "id": "number_04",
        "style": "number_result",
        "name": "Measured Horizon",
        "pattern": "References a documented study period or timeline verified in the source.",
        "examples": [
            "A multi-month study across project teams led to a clear conclusion about team structure.",
            "Sustained tracking over several release cycles highlighted an unexpected operational trend.",
        ],
        "avoid": "Do not invent region counts, cloud regions, or fake study durations.",
    },

    # 4. QUESTION (4 hooks)
    {
        "id": "question_01",
        "style": "question",
        "name": "The Diagnostic Test",
        "pattern": "Asks a pointed operational question that forces the reader to evaluate their own situation.",
        "examples": [
            "If your primary process paused today, how quickly could your team resume without missing a beat?",
            "When was the last time your team tested what happens when your core assumption fails?",
        ],
        "avoid": "Do not ask generic trivia or rhetorical fluff.",
    },
    {
        "id": "question_02",
        "style": "question",
        "name": "The Unspoken Dilemma",
        "pattern": "Explores the tension between two competing priorities that teams face daily.",
        "examples": [
            "How do you balance rapid delivery against the long-term cost of maintainability?",
            "Should you standardize early to enforce consistency, or stay flexible until patterns emerge?",
        ],
        "avoid": "Do not invent fake statistics in questions.",
    },
    {
        "id": "question_03",
        "style": "question",
        "name": "The Root Cause Question",
        "pattern": "Inquires why a well-resourced process still encounters predictable friction.",
        "examples": [
            "Why do well-prepared teams still run into unexpected friction during project handoffs?",
            "What makes operational handoffs so difficult even when everyone follows the checklist?",
        ],
        "avoid": "Do not use leading questions with trivial yes/no answers.",
    },
    {
        "id": "question_04",
        "style": "question",
        "name": "The Second-Order Effect",
        "pattern": "Asks what happens downstream when an unmonitored factor begins to degrade.",
        "examples": [
            "What happens to overall team focus when routine coordination becomes the main bottleneck?",
            "How does an unaddressed workflow bottleneck compound across subsequent deliverables?",
        ],
        "avoid": "Do not use dramatic sensationalism or panic framing.",
    },

    # 5. MISTAKE (4 hooks)
    {
        "id": "mistake_01",
        "style": "mistake",
        "name": "The Silent Anti-Pattern",
        "pattern": "Identifies an overlooked habit that causes compounding issues over time.",
        "examples": [
            "The most common mistake isn't lack of effort; it's treating communication as an afterthought.",
            "The quietest failure mode is assuming that silence from stakeholders means complete agreement.",
        ],
        "avoid": "Do not insult practitioners or sound condescending.",
    },
    {
        "id": "mistake_02",
        "style": "mistake",
        "name": "Premature Commitment",
        "pattern": "Discusses the risk of locking in complex solutions before understanding the core problem.",
        "examples": [
            "Committing to an elaborate process too early often locks in mistakes that take months to undo.",
            "Over-specifying a plan on day one often blinds teams to obvious practical shortcuts.",
        ],
        "avoid": "Do not invent fake week counts or personal regrets unless documented in profile.",
    },
    {
        "id": "mistake_03",
        "style": "mistake",
        "name": "Default Settings Trap",
        "pattern": "Warns against accepting out-of-the-box defaults without tailoring them to real needs.",
        "examples": [
            "Accepting default settings without reviewing your actual constraints creates unexpected blind spots.",
            "Relying on standard templates without adjusting for context is where quality quietly drops.",
        ],
        "avoid": "Do not use ungrammatical slang; maintain crisp phrasing such as 'will bite you' or 'creates operational friction'.",
    },
    {
        "id": "mistake_04",
        "style": "mistake",
        "name": "The False Simplicity",
        "pattern": "Points out where hiding essential details creates dangerous blind spots.",
        "examples": [
            "Hiding essential operational trade-offs behind a simplified view works until an edge case hits.",
            "Treating a nuanced decision as a binary choice creates confusion when reality gets messy.",
        ],
        "avoid": "Do not use niche low-level jargon like debugging raw bytes.",
    },

    # 6. HOW-TO (4 hooks)
    {
        "id": "howto_01",
        "style": "how_to",
        "name": "The Structured Framework",
        "pattern": "Introduces a systematic approach to diagnosing and resolving friction.",
        "examples": [
            "A practical framework for identifying bottlenecks before they disrupt delivery.",
            "How to evaluate competing technical options without getting bogged down in endless debate.",
        ],
        "avoid": "Do not promise unrealistic silver bullets or clickbait shortcuts.",
    },
    {
        "id": "howto_02",
        "style": "how_to",
        "name": "The Seamless Transition",
        "pattern": "Explains how to upgrade or shift a process without disrupting active work.",
        "examples": [
            "How to modernize an established workflow without disrupting ongoing team deliverables.",
            "A calm approach to migrating core procedures while keeping daily operations steady.",
        ],
        "avoid": "Do not promise zero downtime without source justification.",
    },
    {
        "id": "howto_03",
        "style": "how_to",
        "name": "The Sanity Checklist",
        "pattern": "Offers a concise set of checkpoints to verify before rolling out a change.",
        "examples": [
            "Before rolling out a major update to your team, run through this practical checklist.",
            "A straightforward review checklist to catch common blind spots before launch.",
        ],
        "avoid": "Do not invent a fake number of points unless grounded.",
    },
    {
        "id": "howto_04",
        "style": "how_to",
        "name": "First Principles Approach",
        "pattern": "Breaks down how to design a sustainable process from core fundamentals.",
        "examples": [
            "How to design a reliable review process from first principles when standard guidelines fall short.",
            "Approaching operational alignment from fundamental constraints rather than borrowed habits.",
        ],
        "avoid": "Do not rely on vague academic abstractions.",
    },

    # 7. OBSERVATION (4 hooks)
    {
        "id": "observation_01",
        "style": "observation",
        "name": "The Quiet Transition",
        "pattern": "Notes an emerging shift in how experienced teams are operating before it becomes mainstream.",
        "examples": [
            "A subtle shift is underway in how forward-thinking teams structure daily collaboration.",
            "Experienced practitioners are quietly moving away from heavy planning toward rapid verification.",
        ],
        "avoid": "Do not sound conspiratorial or use breathless hype.",
    },
    {
        "id": "observation_02",
        "style": "observation",
        "name": "The Growing Divergence",
        "pattern": "Examines why the gap between disciplined and haphazard execution widens over time.",
        "examples": [
            "The difference between teams that refine their core habits and those that don't compounds over time.",
            "Small differences in decision speed create an enormous advantage across long projects.",
        ],
        "avoid": "Do not invent fake growth curves or unverified compounding claims.",
    },
    {
        "id": "observation_03",
        "style": "observation",
        "name": "The Retrospective Insight",
        "pattern": "Draws an actionable lesson from observing recurring outcomes in the field.",
        "examples": [
            "Reviewing recent project retrospectives highlights a recurring root cause behind missed deadlines.",
            "Looking across completed initiatives reveals that clear ownership matters more than fancy tools.",
        ],
        "avoid": "Do not invent fake incident post-mortems or fictional team audits.",
    },
    {
        "id": "observation_04",
        "style": "observation",
        "name": "The Tooling Paradox",
        "pattern": "Points out that having more choices or tools has not automatically made execution easier.",
        "examples": [
            "We have access to more specialized tools than ever, yet clear coordination remains difficult.",
            "Having more options often slows decision-making down rather than speeding it up.",
        ],
        "avoid": "Do not invent multipliers like tenfold more tools.",
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
