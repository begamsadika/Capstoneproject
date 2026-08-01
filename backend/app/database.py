import logging
import time

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from .core.config import (
    DATABASE_ENCRYPT,
    DATABASE_MAX_OVERFLOW,
    DATABASE_POOL_SIZE,
    DATABASE_POOL_TIMEOUT_SECONDS,
    DATABASE_URL,
)

logger = logging.getLogger(__name__)

# Validate pooled connections before requests use them. Recycling prevents a
# long-running development server from holding obsolete SQL Server connections.
_database_url = make_url(DATABASE_URL)
_database_query = dict(_database_url.query)
if not any(key.lower() == "encrypt" for key in _database_query):
    _database_query["Encrypt"] = DATABASE_ENCRYPT
_database_url = _database_url.set(query=_database_query)

engine = create_engine(
    _database_url,
    connect_args={"timeout": 5},
    pool_size=DATABASE_POOL_SIZE,
    max_overflow=DATABASE_MAX_OVERFLOW,
    pool_timeout=DATABASE_POOL_TIMEOUT_SECONDS,
    pool_pre_ping=True,
    pool_use_lifo=True,
    pool_recycle=300,
)

# Each request gets its own session
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    bind=engine,
)

# Base class for all models
Base = declarative_base()

# Dependency — used in every route
def _is_transient_connection_error(exc: OperationalError) -> bool:
    """Return True only for connection failures that are safe to retry."""
    message = str(exc).lower()
    permanent_markers = (
        "encryption not supported",
        "no credentials are available in the security package",
        "login failed for user",
        "invalid connection string",
    )
    if any(marker in message for marker in permanent_markers):
        return False
    transient_markers = (
        "08001",
        "08s01",
        "login timeout expired",
        "timeout error [258]",
        "communication link failure",
        "connection is busy",
    )
    return any(marker in message for marker in transient_markers)


def run_database_operation_with_retry(
    operation,
    *,
    operation_name: str = "database startup initialization",
    max_attempts: int = 5,
    base_delay_seconds: float = 1.0,
):
    """Run an idempotent database startup operation with bounded retries."""
    if max_attempts < 1:
        raise ValueError("max_attempts must be at least 1")

    for attempt in range(1, max_attempts + 1):
        try:
            result = operation()
            if attempt > 1:
                logger.info(
                    "%s succeeded on attempt %s/%s",
                    operation_name,
                    attempt,
                    max_attempts,
                )
            return result
        except OperationalError as exc:
            engine.dispose()
            if not _is_transient_connection_error(exc) or attempt == max_attempts:
                raise

            delay_seconds = base_delay_seconds * (2 ** (attempt - 1))
            logger.warning(
                "Transient SQL Server failure during %s; retrying in %.1fs "
                "(attempt %s/%s)",
                operation_name,
                delay_seconds,
                attempt + 1,
                max_attempts,
            )
            time.sleep(delay_seconds)

    raise RuntimeError(f"Unable to complete {operation_name}")


def get_db():
    # pool_pre_ping already validates checked-out connections. An additional
    # SELECT 1 here doubled the database work for every API request and could
    # consume the small pool before the route's real query even started.
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
