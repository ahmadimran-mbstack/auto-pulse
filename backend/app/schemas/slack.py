from typing import Optional
from pydantic import BaseModel, field_validator


class SlackConnectRequest(BaseModel):
    return_to: str = "dashboard"
    model_config = {"extra": "forbid"}

    @field_validator("return_to")
    @classmethod
    def validate_return_to(cls, v: str) -> str:
        trimmed = (v or "").strip().lower()
        if trimmed not in ("onboarding", "dashboard"):
            raise ValueError("return_to is only allowed to be 'onboarding' or 'dashboard'")
        return trimmed


class SlackStatusResponse(BaseModel):
    connected: bool = False
    status: str  # "not_connected" | "connected" | "disconnected"
    team_id: Optional[str] = None
    team_name: Optional[str] = None
    connected_at: Optional[str] = None
    last_error: Optional[str] = None
    slack_user_id: Optional[str] = None
    dm_channel_id: Optional[str] = None
    slack_approval_enabled: bool = False


class SlackTestResponse(BaseModel):
    sent: bool = True
    status: str = "ok"
    message: str = "Test message sent"


class SlackDisconnectResponse(BaseModel):
    disconnected: bool = True

