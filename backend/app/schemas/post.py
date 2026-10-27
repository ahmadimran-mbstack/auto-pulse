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
