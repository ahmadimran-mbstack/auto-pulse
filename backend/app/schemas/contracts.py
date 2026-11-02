from typing import List, Optional
from pydantic import BaseModel, Field


class SearchPlan(BaseModel):
    queries: List[str] = Field(
        ...,
        min_length=3,
        max_length=5,
        description="3 to 5 targeted search query strings customized to user profile",
    )


class SourceCandidate(BaseModel):
    title: str = Field(..., description="Raw article or page title")
    url: str = Field(..., description="Canonical source URL")
    domain: str = Field(..., description="Domain extracted from URL")
    published_at: Optional[str] = Field(default=None, description="ISO-8601 publication date")
    text: str = Field(..., description="Full extracted page text or detailed body")
    source_name: str = Field(default="Web Source", description="Clean source name")


class SelectedTopic(BaseModel):
    topic_title: str = Field(..., description="Raw source title for display and linking only")
    topic_label: str = Field(
        ...,
        min_length=3,
        max_length=60,
        description="Clean natural phrase of 2 to 6 words written by the model, never truncated mid-word",
    )
    angle: str = Field(..., description="Specific defensible point of view for the user's audience")
    why_now: str = Field(..., description="Why this development is relevant right now")
    source_url: str = Field(..., description="URL of the backing source article")
    source_title: str = Field(..., description="Title of the backing source article")
    post_format: str = Field(default="observer take", description="Selected post format")
    hook_type: str = Field(default="specific observation", description="Selected hook style")
    selection_rationale: str = Field(default="", description="Why this topic was selected over other candidates")


class Fact(BaseModel):
    claim: str = Field(..., description="The factual claim phrased in clear plain language")
    evidence_quote: str = Field(
        ...,
        description="Exact verbatim quote copied directly from the page text as evidence",
    )
    source_url: str = Field(..., description="The URL from which this evidence was taken")


class FactSet(BaseModel):
    facts: List[Fact] = Field(
        ...,
        min_length=3,
        max_length=6,
        description="3 to 6 verified facts extracted strictly from the page text",
    )


class Hook(BaseModel):
    hook_style: str = Field(..., description="The hook style chosen from available rotated styles")
    hook_id: str = Field(..., description="The library hook ID providing guidance")
    hook_text: str = Field(
        ...,
        max_length=200,
        description="The opening 1-2 lines written specifically for this topic with concrete details",
    )
    concrete_element: str = Field(
        default="",
        description="The specific number, named entity, or concrete observation included in the hook",
    )


class Draft(BaseModel):
    post_text: str = Field(
        ...,
        min_length=700,
        max_length=1800,
        description="Full post text in plain text paragraphs separated by blank lines",
    )
    hashtags: List[str] = Field(
        default_factory=list,
        max_length=3,
        description="1 to 3 relevant CamelCase hashtags",
    )
    image_headline: str = Field(
        default="",
        max_length=70,
        description="Punchy companion image headline of at most 10 words",
    )
    angle: str = Field(default="", description="The specific point of view developed in the post")
    facts_used: List[str] = Field(
        default_factory=list,
        description="Summary of which verified facts were incorporated into the body",
    )


class GateResult(BaseModel):
    passed: bool = Field(..., description="True if all checks within this gate passed")
    gate_name: str = Field(..., description="Name of the gate (e.g. code_checks, llm_judge, slop_score)")
    failure_reasons: List[str] = Field(
        default_factory=list,
        description="List of specific failure descriptions if not passed",
    )


class ImageHeadline(BaseModel):
    headline: str = Field(
        ...,
        max_length=70,
        description="Headline of at most 10 words derived from final post text without quotes or trailing period",
    )

