import os
from pathlib import Path
from typing import List, Optional
from urllib.parse import urlparse
import sys
from pydantic import AliasChoices, Field, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Find the backend directory so we can load backend/.env regardless of where uvicorn is launched
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    # Neon Auth base URL - e.g. https://<project>.neon.tech/neondb/auth
    NEON_AUTH_BASE_URL: str

    # Pooled connection string for the backend application (supports POSTGRES_URI as alias)
    DATABASE_URL: str = Field(
        validation_alias=AliasChoices("DATABASE_URL", "POSTGRES_URI")
    )

    # Allowed frontend origin or comma-separated origins for CORS
    FRONTEND_URL: str

    # Application environment: must be 'development' or 'production'
    ENV: str

    # Logging level: defaults to INFO
    LOG_LEVEL: str = "INFO"

    # LinkedIn OAuth 2.0 credentials and redirect URI
    LINKEDIN_CLIENT_ID: str
    LINKEDIN_CLIENT_SECRET: str
    LINKEDIN_REDIRECT_URI: str

    # Fernet key for encrypting OAuth tokens in the database
    TOKEN_ENCRYPTION_KEY: str

    # Search provider configuration: tavily or exa
    SEARCH_PROVIDER: str = "tavily"
    TAVILY_API_KEY: Optional[str] = None
    EXA_API_KEY: Optional[str] = None

    # LLM configuration (Google Gemini, OpenAI, Anthropic, etc.)
    LLM_PROVIDER: Optional[str] = None
    LLM_API_KEY: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("LLM_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"),
    )
    LLM_MODEL: str = "gemini-3.5-flash-lite"
    LLM_MODEL_FAST: str = "gemini-3.1-flash-lite"

    # Pipeline schedule and lead time settings
    DRAFT_LEAD_MINUTES: int = 180
    SEARCH_LOOKBACK_DAYS: int = 3

    # Master switch for pipeline execution
    GENERATION_ENABLED: bool = True

    # Day 5: Email delivery settings
    EMAIL_API_KEY: Optional[str] = None
    EMAIL_FROM: str = "AutoPulse <noreply@autopulse.app>"
    APP_BASE_URL: str = "http://localhost:3000"

    # SMTP configuration for sending approval emails
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("SMTP_USER", "SMTP_USERNAME"),
    )
    SMTP_PASSWORD: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("SMTP_PASSWORD", "SMTP_PASS"),
    )
    SMTP_USE_TLS: bool = True

    # Day 5: LinkedIn publishing settings
    LINKEDIN_API_VERSION: str = "202601"
    LINKEDIN_VISIBILITY: str = "CONNECTIONS"
    PUBLISH_ENABLED: bool = True

    # Day 6: Redis and caching settings
    REDIS_URL: Optional[str] = None
    REDIS_ENABLED: bool = False
    CACHE_READS_ENABLED: bool = False
    TRUSTED_PROXY_COUNT: int = 0

    # Configure pydantic-settings to read from backend/.env if it exists
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE) if ENV_FILE.exists() else None,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Validate that ENV is either development or production
    @field_validator("ENV")
    @classmethod
    def validate_env(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if cleaned not in {"development", "production"}:
            raise ValueError("ENV must be either 'development' or 'production'")
        return cleaned

    # Neon requires sslmode=require for secure database connections
    @field_validator("DATABASE_URL")
    @classmethod
    def validate_sslmode(cls, value: str, info) -> str:
        if "sslmode=require" not in value:
            raise ValueError(f"{info.field_name} must contain 'sslmode=require'")
        return value

    # Validate that SEARCH_PROVIDER is either tavily or exa
    @field_validator("SEARCH_PROVIDER")
    @classmethod
    def validate_search_provider(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if cleaned not in {"tavily", "exa"}:
            raise ValueError("SEARCH_PROVIDER must be either 'tavily' or 'exa'")
        return cleaned

    # Validate that LINKEDIN_VISIBILITY is either PUBLIC or CONNECTIONS
    @field_validator("LINKEDIN_VISIBILITY")
    @classmethod
    def validate_linkedin_visibility(cls, value: str) -> str:
        cleaned = value.strip().upper()
        if cleaned not in {"PUBLIC", "CONNECTIONS"}:
            raise ValueError("LINKEDIN_VISIBILITY must be either 'PUBLIC' or 'CONNECTIONS'")
        return cleaned

    # Validate provider keys when generation is enabled
    @model_validator(mode="after")
    def validate_generation_keys(self):
        if self.GENERATION_ENABLED:
            if self.SEARCH_PROVIDER == "tavily" and not self.TAVILY_API_KEY:
                raise ValueError("TAVILY_API_KEY is required when SEARCH_PROVIDER is 'tavily'")
            if self.SEARCH_PROVIDER == "exa" and not self.EXA_API_KEY:
                raise ValueError("EXA_API_KEY is required when SEARCH_PROVIDER is 'exa'")
            if not self.LLM_API_KEY:
                raise ValueError("LLM_API_KEY is required when GENERATION_ENABLED is true")
        # Align default EMAIL_FROM with authenticated SMTP_USER so SPF/DKIM checks succeed
        if "autopulse.app" in self.EMAIL_FROM and self.SMTP_USER and "@" in self.SMTP_USER:
            self.EMAIL_FROM = f"AutoPulse <{self.SMTP_USER}>"
        return self

    # Direct (unpooled) connection string for Alembic migrations.
    # Automatically derived by removing '-pooler.' from DATABASE_URL.
    @property
    def DATABASE_URL_DIRECT(self) -> str:
        return self.DATABASE_URL.replace("-pooler.", ".")

    # Split comma-separated frontend URLs into a clean list of origins for CORS
    @property
    def cors_origins(self) -> List[str]:
        origins = [origin.strip() for origin in self.FRONTEND_URL.split(",") if origin.strip()]
        if self.ENV == "development":
            for local_origin in ("http://localhost:3000", "http://127.0.0.1:3000"):
                if local_origin not in origins:
                    origins.append(local_origin)
        return origins

    # Neon tokens use the scheme + host of NEON_AUTH_BASE_URL as both issuer and audience
    # Reference: https://neon.com/docs/auth/guides/plugins/jwt
    @property
    def auth_origin(self) -> str:
        parsed = urlparse(self.NEON_AUTH_BASE_URL)
        return f"{parsed.scheme}://{parsed.netloc}"

    # The JWKS endpoint where Neon publishes its EdDSA public keys
    @property
    def jwks_url(self) -> str:
        return f"{self.NEON_AUTH_BASE_URL.rstrip('/')}/.well-known/jwks.json"


# Instantiate settings once. If any required variable is missing, refuse to start and state which one.
try:
    settings = Settings()
except ValidationError as exc:
    missing_vars = [
        str(err["loc"][0])
        for err in exc.errors()
        if err.get("type") == "missing"
    ]
    if missing_vars:
        msg = f"Application configuration error: Missing required environment variable(s): {', '.join(missing_vars)}"
        print(msg, file=sys.stderr)
        raise SystemExit(msg) from exc
    raise exc


# Startup check: Ensure LangSmith and LangChain tracing are disabled to protect customer privacy
def check_tracing_disabled() -> None:
    tracing_env_vars = [
        "LANGSMITH_TRACING",
        "LANGCHAIN_TRACING_V2",
        "LANGCHAIN_TRACING",
    ]
    for var in tracing_env_vars:
        val = os.environ.get(var, "").strip().lower()
        if val in {"true", "1", "yes", "on"}:
            msg = f"Security error: {var} is enabled. LangChain and LangSmith tracing must stay OFF to protect user privacy."
            print(msg, file=sys.stderr)
            raise SystemExit(msg)


check_tracing_disabled()
