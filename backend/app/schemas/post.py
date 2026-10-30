from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, field_validator


class PostApprovalInfo(BaseModel):
    state: str
    expires_at: Optional[str] = None
    decided_at: Optional[str] = None
    channel: Optional[str] = None
    decision: Optional[str] = None


class PostListItem(BaseModel):
    id: uuid.UUID
    status: str
    run_date: str
    topic_title: str
    caption_preview: str
    created_at: str
    approval: Optional[PostApprovalInfo] = None
    angle: Optional[str] = None
    hook_type: Optional[str] = None
    hook_style: Optional[str] = None
    post_format: Optional[str] = None
    ai_score: Optional[int] = None
    needs_review: Optional[bool] = None
    topic: Optional[str] = None


class PaginatedPostsResponse(BaseModel):
    items: List[PostListItem]
    next_cursor: Optional[str] = None


class PostPublicationInfo(BaseModel):
    platform: str
    status: str
    external_url: Optional[str] = None
    error_code: Optional[str] = None
    published_at: Optional[str] = None


class PostDetail(BaseModel):
    id: uuid.UUID
    status: str
    run_date: str
    publish_at: Optional[str] = None
    topic_title: str
    topic_url: str
    sources: List[Dict[str, Any]]
    caption: str
    hashtags: List[str]
    created_at: str
    approval: Optional[PostApprovalInfo] = None
    publications: List[PostPublicationInfo] = []
    angle: Optional[str] = None
    hook_type: Optional[str] = None
    hook_style: Optional[str] = None
    post_format: Optional[str] = None
    ai_score: Optional[int] = None
    needs_review: Optional[bool] = None
    topic: Optional[str] = None


class PlaygroundRunCreateRequest(BaseModel):
    topic_hint: Optional[str] = None
    model_config = {"extra": "ignore"}


class PlaygroundRunCreateResponse(BaseModel):
    run_id: uuid.UUID
    status: str


class PlaygroundRunDetail(BaseModel):
    id: uuid.UUID
    status: str
    current_step: Optional[str] = None
    round: int = 0
    max_rounds: int = 3
    result: Optional[Dict[str, Any]] = None
    trace: Optional[Dict[str, Any]] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    created_at: str


class PostAgentTraceResponse(BaseModel):
    post_id: uuid.UUID
    trace: Optional[Dict[str, Any]] = None
    agent_trace: Optional[Dict[str, Any]] = None


class GenerationRunDetail(BaseModel):
    id: uuid.UUID
    status: str
    current_step: Optional[str] = None
    round: int = 0
    max_rounds: int = 3
    trace: Optional[Dict[str, Any]] = None
    agent_trace: Optional[Dict[str, Any]] = None
    post_id: Optional[uuid.UUID] = None
    result: Optional[Dict[str, Any]] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None



class ScheduleResponse(BaseModel):
    next_draft_at: Optional[str] = None
    next_post_at: Optional[str] = None


class PublicApprovalDetail(BaseModel):
    state: str
    caption: str
    hashtags: List[str]
    topic_title: str
    topic_url: str
    display_name: str
    timezone: str
    publish_at: Optional[str] = None
    expires_at: str


class DecisionRequest(BaseModel):
    decision: str
    model_config = {"extra": "forbid"}

    @field_validator("decision")
    @classmethod
    def validate_decision(cls, v: str) -> str:
        if v not in {"approved", "rejected"}:
            raise ValueError("decision must be either 'approved' or 'rejected'")
        return v


class PublicationRetryRequest(BaseModel):
    confirm_not_posted: bool = False
    model_config = {"extra": "forbid"}
