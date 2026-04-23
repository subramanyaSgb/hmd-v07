import os
import time
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from ..logger import logger

SLOW_QUERY_THRESHOLD = float(os.getenv("SLOW_QUERY_THRESHOLD_SECONDS", "0.1"))

_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)

driver = os.getenv("DATABASE_DRIVER", "postgresql")
user = os.getenv("DATABASE_USER", "postgres")
password = os.getenv("DATABASE_PASSWORD", "postgres")
host = os.getenv("DATABASE_HOST", "localhost")
port = os.getenv("DATABASE_PORT", "5432")
name = os.getenv("DATABASE_NAME", "hmd")

SQLALCHEMY_DATABASE_URL = f"{driver}://{user}:{password}@{host}:{port}/{name}"

logger.info(f"Connecting to database at {host}:{port}/{name}")

try:
                                                     
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_size=10,                                                     
        max_overflow=20,                                                     
        pool_timeout=30,                                                 
        pool_recycle=1800,                                             
        pool_pre_ping=True                                                  
    )

    @event.listens_for(engine, "before_cursor_execute")
    def receive_before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        conn.info.setdefault('query_start_time', []).append(time.time())

    @event.listens_for(engine, "after_cursor_execute")
    def receive_after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        start_time = conn.info['query_start_time'].pop(-1) if conn.info.get('query_start_time') else None
        if start_time:
            elapsed = time.time() - start_time
            if elapsed > SLOW_QUERY_THRESHOLD:
                                                 
                statement_preview = statement[:200] + "..." if len(statement) > 200 else statement
                logger.warning(f"SLOW QUERY ({elapsed*1000:.1f}ms): {statement_preview}")

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    logger.success("Database engine and session factory initialized with optimized pooling and query monitoring.")
except Exception as e:
    logger.error(f"Failed to initialize database engine: {e}")
    raise

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
