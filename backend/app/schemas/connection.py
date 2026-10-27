import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class ConnectionSummaryResponse(BaseModel):
    # Summary of a social account connection safe to return over the API (never contains tokens)
    provider: str
    status: str
    account_name: Optional[str] = None
    connected_at: datetime.datetime
    expires_at: datetime.datetime
    days_left: int


class OAuthStartResponse(BaseModel):
    # Authorization URL where the user is redirected to grant permissions
    authorization_url: str
    authorize_url: Optional[str] = None


class OAuthCallbackRequest(BaseModel):
    # Authorization code and state returned by LinkedIn to the frontend
    # Extra fields are strictly forbidden
    code: str = Field(..., min_length=1)
    state: str = Field(..., min_length=1)

    model_config = ConfigDict(extra="forbid")
