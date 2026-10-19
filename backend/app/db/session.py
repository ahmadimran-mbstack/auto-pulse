from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings


# Normalize database URL scheme: SQLAlchemy 2 with psycopg 3 expects postgresql://
def normalize_db_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


# Create the SQLAlchemy engine using the pooled connection string
# pool_pre_ping checks that each connection is still alive before using it
engine = create_engine(
    normalize_db_url(settings.DATABASE_URL),
    pool_pre_ping=True,
)

# Session factory for creating database sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for declarative database models
Base = declarative_base()


# Dependency helper for FastAPI routes to safely get and close a database session
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
