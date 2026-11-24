"""Central configuration for the AutoPulse post writing pipeline.
Holds round limits, time budgets, scoring weights, agent labels, and plain user notes.
"""

from typing import Dict

# Loop limits and time budgets
MAX_ROUNDS: int = 4
TIME_BUDGET_SECONDS: int = 120
PER_MODEL_CALL_TIMEOUT_SECONDS: int = 30

# Quality targets and post length bounds
AI_SLOP_TARGET: int = 15
TARGET_SCORE: int = 80
MIN_ACCEPTABLE: int = 60
MIN_POST_CHARS: int = 400
MAX_POST_CHARS: int = 3000

# Combined score weights (total positive points = 100)
WEIGHT_AI_SLOP: int = 30
WEIGHT_HOOK_STRENGTH: int = 25
WEIGHT_RELEVANCE: int = 25
WEIGHT_FACT_GROUNDING: int = 20
MAX_REPETITION_PENALTY: int = 20

# Similarity thresholds for checking whether a new draft repeats a recent post
FIRST_LINE_SIMILARITY_THRESHOLD: float = 0.72
FULL_TEXT_SIMILARITY_THRESHOLD: float = 0.60

# Stuck-run timeout for runs that stop sending events
STUCK_RUN_SILENCE_SECONDS: int = 120

# Friendly agent names shown in the live UI
AGENT_LABELS: Dict[str, str] = {
    "finder": "Topic finder",
    "gtm": "Hook strategist",
    "drafter": "Writer",
    "detector": "AI-writing checker",
    "editor": "Editor",
}

# Plain user-facing messages mapped from internal issue codes (never show raw validator text)
ISSUE_CODE_MESSAGES: Dict[str, str] = {
    "generic_hook": "The opening felt generic. Trying a sharper one.",
    "unsupported_number": "Removed a claim that could not be backed up.",
    "raw_topic_pasted": "Rewriting the opening so it reads like a real post.",
    "too_long": "Trimming to fit LinkedIn's length limit.",
    "too_short": "Adding more substance.",
    "too_similar_to_recent": "Too close to a recent post. Choosing a different angle.",
    "slop_detected": "Making the writing sound more human.",
    "placeholder_left": "Cleaning up leftover template text.",
    "no_concrete_fact": "Adding a concrete detail from the source.",
    "profile_mismatch": "Adjusting the post to match your profile settings.",
}

DEFAULT_REVISION_NOTE: str = "Refining the draft."

# Plain message shown when a real technical failure stops a run
PLAIN_TECH_ERROR_MESSAGE: str = "Something went wrong on our side. Your quota was not used. Try again in a minute."


def get_agent_label(agent_key: str) -> str:
    """Return the friendly user-facing name for an internal agent key."""
    return AGENT_LABELS.get(agent_key, "Editor")


def get_plain_issue_note(issue_code: str) -> str:
    """Convert an internal issue code into a safe plain-English note for the UI."""
    return ISSUE_CODE_MESSAGES.get(issue_code, DEFAULT_REVISION_NOTE)

