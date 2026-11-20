"""Pydantic schemas for the customization API."""

import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

DocumentKind = Literal["playbook", "business", "previous_posts"]
SourceType = Literal["upload", "url", "paste"]
DocumentStatus = Literal[
    "uploaded", "extracting", "distilling", "embedding", "ready", "failed", "disabled", "deleted"
]


class DocumentSummary(BaseModel):
    id: str
    kind: DocumentKind
    source_type: SourceType
    title: str
    original_filename: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    source_url: Optional[str] = None
    status: DocumentStatus
    stage_name: Optional[str] = None
    stage_index: Optional[int] = None
    stage_total: int = 4
    friendly_status: Optional[str] = None
    friendly_error: Optional[str] = None
    error_code: Optional[str] = None
    error_detail: Optional[str] = None
    needs_embedding: bool = False
    page_count: Optional[int] = None
    char_count: Optional[int] = None
    token_estimate: Optional[int] = None
    enabled: bool = True
    duplicate: bool = False
    created_at: datetime.datetime
    updated_at: datetime.datetime
    processed_at: Optional[datetime.datetime] = None


class PostSampleView(BaseModel):
    id: str
    document_id: str
    ordinal: int
    text: str
    char_count: int
    features: Dict[str, Any] = Field(default_factory=dict)
    quality_flag: Optional[str] = None
    pinned: bool = False
    excluded: bool = False


class FactView(BaseModel):
    id: str
    document_id: str
    kind: str
    category: str
    text: str
    numbers: List[str] = Field(default_factory=list)
    source_label: str
    is_core: bool = False
    removed: bool = False


class DocumentDetail(DocumentSummary):
    text_preview: Optional[str] = None
    distilled: Optional[Dict[str, Any]] = None
    samples: List[PostSampleView] = Field(default_factory=list)
    facts: List[FactView] = Field(default_factory=list)


class PasteDocumentRequest(BaseModel):
    kind: DocumentKind
    title: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=10, max_length=30000)


class UrlAddRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)
    title: Optional[str] = Field(default=None, max_length=120)


class DocumentPatchRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    enabled: Optional[bool] = None


class SamplePatchRequest(BaseModel):
    pinned: Optional[bool] = None
    excluded: Optional[bool] = None


class CustomizationSettingsView(BaseModel):
    custom_instructions: Optional[str] = None
    default_playbook_mode: Literal["merge", "replace"] = "merge"
    use_previous_posts_for_voice: bool = True
    business_mention: Literal["never", "natural", "often"] = "natural"
    active_version_id: Optional[str] = None
    compile_pending: bool = False
    detected_constraints: List[Dict[str, Any]] = Field(default_factory=list)


class CustomizationSettingsUpdate(BaseModel):
    custom_instructions: Optional[str] = Field(default=None, max_length=4000)
    default_playbook_mode: Optional[Literal["merge", "replace"]] = None
    use_previous_posts_for_voice: Optional[bool] = None
    business_mention: Optional[Literal["never", "natural", "often"]] = None


class OverridesPatchRequest(BaseModel):
    disabled_rule_ids: Optional[List[str]] = None
    voice_summary_override: Optional[str] = Field(default=None, max_length=1000)
    removed_fact_ids: Optional[List[str]] = None
    policy_overrides: Optional[Dict[str, Any]] = None


class QuotaUsage(BaseModel):
    playbooks_used: int
    playbooks_max: int
    business_docs_used: int
    business_docs_max: int
    business_urls_used: int
    business_urls_max: int
    previous_posts_docs_used: int
    previous_posts_docs_max: int
    samples_used: int
    samples_max: int
    storage_bytes_used: int
    storage_bytes_max: int


class CustomizationOverview(BaseModel):
    counts_by_kind: Dict[str, int]
    status_counts: Dict[str, int]
    settings: CustomizationSettingsView
    active_version: Optional[int] = None
    active_version_id: Optional[str] = None
    compile_pending: bool = False
    quota: QuotaUsage


class VersionSummary(BaseModel):
    id: str
    version: int
    compiler_version: str
    token_counts: Dict[str, Any] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)
    is_active: bool = False
    created_at: datetime.datetime


class DownloadUrlResponse(BaseModel):
    url: str
    expires_at: datetime.datetime
