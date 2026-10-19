import sys
from logging.config import fileConfig
from pathlib import Path
from sqlalchemy import create_engine, pool
from alembic import context

# Ensure backend directory is in Python path for importing application modules
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings
from app.db.session import Base, normalize_db_url

# Interpret the config file for Python logging
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set metadata for Alembic autogenerate
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    # Run migrations in offline mode using DATABASE_URL_DIRECT
    url = normalize_db_url(settings.DATABASE_URL_DIRECT)
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Run migrations in online mode using DATABASE_URL_DIRECT (Neon direct connection)
    db_url = normalize_db_url(settings.DATABASE_URL_DIRECT)
    connectable = create_engine(
        db_url,
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
