import sys
import os
from loguru import logger

LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)

LOG_FILE = os.path.join(LOG_DIR, "backend.log")

logger.remove()

def _stderr_filter(record):
    record["extra"].setdefault("context", "")
    return True

logger.add(
    sys.stderr,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>{extra[context]}",
    level="INFO",
    filter=_stderr_filter
)

logger.add(
    LOG_FILE,
    rotation="00:00",                            
    retention="30 days",                        
    compression="gz",                                            
    format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message} | {extra}",
    level="DEBUG",
    encoding="utf-8",
    serialize=False                                       
)

def log_with_context(level: str, message: str, **context):
    context_str = ""
    if context:
        context_str = " | " + " ".join(f"{k}={v}" for k, v in context.items())

    log_func = getattr(logger.bind(context=context_str), level.lower())
    log_func(message)

__all__ = ["logger", "log_with_context"]
