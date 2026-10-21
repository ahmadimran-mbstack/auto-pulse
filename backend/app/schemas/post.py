from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel


class PostListItem(BaseModel):
    id: uuid.UUID
    status: str
    run_date: str
    topic_title: str
    caption_preview: str
    created_at: str


class PostDetail(BaseModel):
    id: uuid.UUID
    status: str
    run_date: str
    topic_title: str
    topic_url: str
    sources: List[Dict[str, Any]]
    caption: str
    hashtags: List[str]
    created_at: str


class ScheduleResponse(BaseModel):
    next_draft_at: Optional[str] = None
    next_post_at: Optional[str] = None
