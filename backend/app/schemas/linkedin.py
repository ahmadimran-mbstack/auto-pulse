from typing import Optional
from pydantic import BaseModel, ConfigDict


class LinkedInPostResponse(BaseModel):
    # Response model returned on successful direct publication to LinkedIn
    id: str
    linkedin_post_id: Optional[str] = None
    posted_at: str
    visibility: str

    model_config = ConfigDict(extra="forbid")


class LinkedInStatusResponse(BaseModel):
    # Response model indicating current LinkedIn account connection state
    connected: bool
    expires_at: Optional[str] = None
    account_name: Optional[str] = None
    status: Optional[str] = None

    model_config = ConfigDict(extra="forbid")
