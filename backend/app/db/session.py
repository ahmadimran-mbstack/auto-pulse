from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.exc import DBAPIError, OperationalError
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings


# Normalize database URL scheme: SQLAlchemy 2 with psycopg 3 expects postgresql://
def normalize_db_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


# Custom Session class that catches dropped pooled connections and retries once
class RetryingSession(Session):
    """Database session that catches a dropped connection and retries the statement once."""

    def execute(self, statement, *args, **kwargs):
        try:
            return super().execute(statement, *args, **kwargs)
        except (DBAPIError, OperationalError) as e:
            # If the database connection was dropped, roll back and retry once with a fresh connection
            if (
                getattr(e, "connection_invalidated", False)
                or "closed" in str(e).lower()
                or "connection" in str(e).lower()
            ):
                self.rollback()
                return super().execute(statement, *args, **kwargs)
            raise


# Primary engine for write routes (POST, PUT, DELETE)
# pool_pre_ping is disabled to eliminate the connection check round trip on checkout.
# Connections are recycled every 5 minutes and dropped connections are retried once.
engine = create_engine(
    normalize_db_url(settings.DATABASE_URL),
    pool_pre_ping=False,
    pool_size=10,
    max_overflow=5,
    pool_recycle=300,
    pool_timeout=30,
)

# Read-only engine for GET routes
# Configured with autocommit isolation level so that read queries do not open a transaction.
# This prevents psycopg from sending BEGIN, COMMIT, or ROLLBACK over the wire.
readonly_engine = create_engine(
    normalize_db_url(settings.DATABASE_URL),
    pool_pre_ping=False,
    pool_size=10,
    max_overflow=5,
    pool_recycle=300,
    pool_timeout=30,
    isolation_level="AUTOCOMMIT",
)

# Register query monitoring event listeners on both engines
from app.core.timing import setup_db_timing_listeners

setup_db_timing_listeners(engine)
setup_db_timing_listeners(readonly_engine)

# Session factories for write and read-only database sessions
SessionLocal = sessionmaker(class_=RetryingSession, autocommit=False, autoflush=False, bind=engine)
ReadOnlySessionLocal = sessionmaker(
    class_=RetryingSession, autocommit=False, autoflush=False, bind=readonly_engine
)

# Base class for declarative database models
Base = declarative_base()


# Dependency helper for write routes: commit on success, roll back on error
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# Dependency helper for read-only GET routes: no transaction, no commit, no rollback
def get_readonly_db() -> Generator[Session, None, None]:
    db = ReadOnlySessionLocal()
    try:
        yield db
    finally:
        db.close()
