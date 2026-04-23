import os
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy import pool
from dotenv import load_dotenv

from alembic import context

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path)

driver = os.getenv("DATABASE_DRIVER", "postgresql")
user = os.getenv("DATABASE_USER", "postgres")
password = os.getenv("DATABASE_PASSWORD", "postgres")
host = os.getenv("DATABASE_HOST", "localhost")
port = os.getenv("DATABASE_PORT", "5432")
name = os.getenv("DATABASE_NAME", "hmd")

DATABASE_URL = f"{driver}://{user}:{password}@{host}:{port}/{name}"

config = context.config

config.set_main_option("sqlalchemy.url", DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

from backend.database.engine import Base

target_metadata = Base.metadata

def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
                                                                         
    connectable = create_engine(DATABASE_URL, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,                              
            compare_server_default=True,                                
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
