import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "wellora-secret")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60))
DATABASE_URL = os.getenv("DATABASE_URL")
DATABASE_ENCRYPT = os.getenv("DATABASE_ENCRYPT", "no")


def _positive_int_env(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
        return value if value > 0 else default
    except (TypeError, ValueError):
        return default


DATABASE_POOL_SIZE = _positive_int_env("DATABASE_POOL_SIZE", 5)
DATABASE_MAX_OVERFLOW = _positive_int_env("DATABASE_MAX_OVERFLOW", 5)
DATABASE_POOL_TIMEOUT_SECONDS = _positive_int_env(
    "DATABASE_POOL_TIMEOUT_SECONDS", 5
)
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
DIET_CHAT_SERVICE_URL = os.getenv(
    "DIET_CHAT_SERVICE_URL", "http://127.0.0.1:8001"
).rstrip("/")
DIET_CHAT_MEMORY_SUMMARY_ENABLED = os.getenv(
    "DIET_CHAT_MEMORY_SUMMARY_ENABLED", "false"
).strip().lower() in {"1", "true", "yes", "on"}
try:
    _diet_chat_read_timeout = os.getenv(
        "DIET_CHAT_STREAM_READ_TIMEOUT_SECONDS", "0"
    ).strip().lower()
    DIET_CHAT_STREAM_READ_TIMEOUT_SECONDS = (
        None
        if _diet_chat_read_timeout in {"", "0", "none", "off", "false", "disabled"}
        else float(_diet_chat_read_timeout)
    )
    if (
        DIET_CHAT_STREAM_READ_TIMEOUT_SECONDS is not None
        and DIET_CHAT_STREAM_READ_TIMEOUT_SECONDS <= 0
    ):
        DIET_CHAT_STREAM_READ_TIMEOUT_SECONDS = None
except (TypeError, ValueError):
    DIET_CHAT_STREAM_READ_TIMEOUT_SECONDS = None
