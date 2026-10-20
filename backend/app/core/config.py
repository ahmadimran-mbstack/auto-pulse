from pathlib import Path
from typing import List
from urllib.parse import urlparse
import sys
from pydantic import AliasChoices, Field, ValidationError, field_validator
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

    # Direct (unpooled) connection string for Alembic migrations.
    # Automatically derived by removing '-pooler.' from DATABASE_URL.
    @property
    def DATABASE_URL_DIRECT(self) -> str:
        return self.DATABASE_URL.replace("-pooler.", ".")

    # Split comma-separated frontend URLs into a clean list of origins for CORS
    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.FRONTEND_URL.split(",") if origin.strip()]

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
