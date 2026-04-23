
import os
import json
from typing import Any, Optional, Callable
from functools import wraps
from datetime import datetime

from ..logger import logger

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    logger.warning("Redis package not installed. Using in-memory cache only.")

from .cache import ThreadSafeCache

class RedisCache:

    _instance = None
    _redis_client = None
    _fallback_cache = None
    _use_redis = False

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, prefix: str = "hmd"):
        if self._initialized:
            return

        self.prefix = prefix
        self._initialized = True

        cache_enabled = os.getenv("CACHE_ENABLED", "true").lower() == "true"
        if not cache_enabled:
            logger.info("Caching is disabled via CACHE_ENABLED=false")
            self._use_redis = False
            self._fallback_cache = ThreadSafeCache()
            return

        if REDIS_AVAILABLE:
            try:
                redis_host = os.getenv("REDIS_HOST", "localhost")
                redis_port = int(os.getenv("REDIS_PORT", "6379"))
                redis_db = int(os.getenv("REDIS_DB", "0"))
                redis_password = os.getenv("REDIS_PASSWORD", None)

                pool = redis.ConnectionPool(
                    host=redis_host,
                    port=redis_port,
                    db=redis_db,
                    password=redis_password if redis_password else None,
                    decode_responses=True,
                    max_connections=20,
                    socket_timeout=5,
                    socket_connect_timeout=5
                )

                self._redis_client = redis.Redis(connection_pool=pool)

                self._redis_client.ping()
                self._use_redis = True
                logger.success(f"Redis cache connected: {redis_host}:{redis_port}/{redis_db}")

            except Exception as e:
                logger.warning(f"Redis connection failed: {e}. Using in-memory fallback.")
                self._use_redis = False
                self._fallback_cache = ThreadSafeCache()
        else:
            self._use_redis = False
            self._fallback_cache = ThreadSafeCache()
            logger.info("Redis not available. Using in-memory cache.")

    def _make_key(self, key: str) -> str:
        return f"{self.prefix}:{key}"

    def _serialize(self, value: Any) -> str:
        try:
            return json.dumps(value, default=str, ensure_ascii=False)
        except (TypeError, ValueError) as e:
            logger.error(f"Cache serialization error: {e}")
            return json.dumps(str(value))

    def _deserialize(self, value: str) -> Any:
        if value is None:
            return None
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return value

    def get(self, key: str) -> Optional[Any]:
        full_key = self._make_key(key)

        if self._use_redis:
            try:
                value = self._redis_client.get(full_key)
                return self._deserialize(value)
            except Exception as e:
                logger.error(f"Redis GET error for {key}: {e}")
                return None
        else:
            return self._fallback_cache.get(full_key)

    def set(self, key: str, value: Any, ttl: int = 30) -> bool:
        full_key = self._make_key(key)

        if self._use_redis:
            try:
                serialized = self._serialize(value)
                self._redis_client.setex(full_key, ttl, serialized)
                return True
            except Exception as e:
                logger.error(f"Redis SET error for {key}: {e}")
                return False
        else:
            self._fallback_cache.set(full_key, value, ttl)
            return True

    def delete(self, key: str) -> bool:
        full_key = self._make_key(key)

        if self._use_redis:
            try:
                return self._redis_client.delete(full_key) > 0
            except Exception as e:
                logger.error(f"Redis DELETE error for {key}: {e}")
                return False
        else:
            return self._fallback_cache.invalidate(full_key)

    def delete_pattern(self, pattern: str) -> int:
        full_pattern = self._make_key(pattern)

        if self._use_redis:
            try:
                                                               
                cursor = 0
                deleted = 0
                while True:
                    cursor, keys = self._redis_client.scan(
                        cursor=cursor,
                        match=full_pattern,
                        count=100
                    )
                    if keys:
                        deleted += self._redis_client.delete(*keys)
                    if cursor == 0:
                        break
                return deleted
            except Exception as e:
                logger.error(f"Redis DELETE_PATTERN error for {pattern}: {e}")
                return 0
        else:
                                                                 
            prefix = full_pattern.replace("*", "")
            return self._fallback_cache.invalidate_pattern(prefix)

    def get_or_set(self, key: str, factory: Callable[[], Any], ttl: int = 30) -> Any:
        cached = self.get(key)
        if cached is not None:
            return cached

        value = factory()
        self.set(key, value, ttl)
        return value

    def exists(self, key: str) -> bool:
        full_key = self._make_key(key)

        if self._use_redis:
            try:
                return self._redis_client.exists(full_key) > 0
            except Exception:
                return False
        else:
            return self._fallback_cache.exists(full_key)

    def clear_all(self) -> int:
        return self.delete_pattern("*")

    def stats(self) -> dict:
        if self._use_redis:
            try:
                info = self._redis_client.info("memory")
                keys = self._redis_client.dbsize()
                return {
                    "backend": "redis",
                    "connected": True,
                    "total_keys": keys,
                    "used_memory": info.get("used_memory_human", "unknown"),
                    "used_memory_peak": info.get("used_memory_peak_human", "unknown")
                }
            except Exception as e:
                return {"backend": "redis", "connected": False, "error": str(e)}
        else:
            stats = self._fallback_cache.stats()
            stats["backend"] = "in-memory"
            return stats

    def health_check(self) -> dict:
        if self._use_redis:
            try:
                start = datetime.now()
                self._redis_client.ping()
                latency = (datetime.now() - start).total_seconds() * 1000
                return {
                    "status": "healthy",
                    "backend": "redis",
                    "latency_ms": round(latency, 2)
                }
            except Exception as e:
                return {
                    "status": "unhealthy",
                    "backend": "redis",
                    "error": str(e)
                }
        else:
            return {'status': 'healthy', 'backend': 'in-memory', 'latency_ms': 0}

cache = RedisCache()

def cached(key_prefix: str, ttl: int = 30):
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
                                                                      
            key = key_prefix

            cached_value = cache.get(key)
            if cached_value is not None:
                return cached_value

            result = func(*args, **kwargs)
            cache.set(key, result, ttl)
            return result

        wrapper.invalidate = lambda: cache.delete_pattern(f"{key_prefix}*")
        wrapper.cache_key = key_prefix

        return wrapper
    return decorator

def invalidate_cache(*keys: str) -> int:
    total = 0
    for key in keys:
        if "*" in key:
            total += cache.delete_pattern(key)
        else:
            total += 1 if cache.delete(key) else 0
    return total
