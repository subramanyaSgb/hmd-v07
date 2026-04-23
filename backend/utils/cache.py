
import time
import threading
from typing import Any, Optional, Callable
from functools import wraps

class ThreadSafeCache:

    def __init__(self):
        self._cache = {}
        self._lock = threading.RLock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key not in self._cache:
                return None

            entry = self._cache[key]
            if time.time() > entry["expires_at"]:
                                              
                del self._cache[key]
                return None

            return entry["data"]

    def set(self, key: str, data: Any, ttl: int = 30) -> None:
        with self._lock:
            self._cache[key] = {
                "data": data,
                "expires_at": time.time() + ttl,
                "ttl": ttl
            }

    def exists(self, key: str) -> bool:
        with self._lock:
            if key not in self._cache:
                return False

            entry = self._cache[key]
            if time.time() > entry["expires_at"]:
                                              
                del self._cache[key]
                return False

            return True

    def invalidate(self, key: str) -> bool:
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def invalidate_pattern(self, pattern: str) -> int:
        with self._lock:
            keys_to_remove = [k for k in self._cache.keys() if k.startswith(pattern)]
            for key in keys_to_remove:
                del self._cache[key]
            return len(keys_to_remove)

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()

    def get_or_set(self, key: str, factory: Callable[[], Any], ttl: int = 30) -> Any:
                                                                 
        cached = self.get(key)
        if cached is not None:
            return cached

        with self._lock:
                                                              
            cached = self.get(key)
            if cached is not None:
                return cached

            data = factory()
            self.set(key, data, ttl)
            return data

    def stats(self) -> dict:
        with self._lock:
            now = time.time()
            total = len(self._cache)
            expired = sum(1 for entry in self._cache.values() if now > entry["expires_at"])
            return {
                "total_keys": total,
                "expired_keys": expired,
                "active_keys": total - expired
            }

fleet_cache = ThreadSafeCache()

config_cache = ThreadSafeCache()

plans_cache = ThreadSafeCache()

general_cache = ThreadSafeCache()

cache = general_cache

def cached(cache_instance: ThreadSafeCache, key_prefix: str, ttl: int = 30):
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
                                                     
            cache_key = f"{key_prefix}:{hash(args[1:])}" if len(args) > 1 else key_prefix

            cached_value = cache_instance.get(cache_key)
            if cached_value is not None:
                return cached_value

            result = func(*args, **kwargs)
            cache_instance.set(cache_key, result, ttl)
            return result

        wrapper.invalidate = lambda: cache_instance.invalidate_pattern(key_prefix)
        wrapper.cache_key_prefix = key_prefix

        return wrapper
    return decorator
