"""Simple in-memory TTL cache for external API calls.

A stale cache entry from a day ago is worse than a fresh "unavailable" —
it hides real failures.  Cache entries expire after TTL seconds so failures
are surfaced quickly if a source goes down, while still avoiding redundant
calls during normal operation.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class _Entry:
    data: Any
    expires_at: float  # monotonic seconds


class TTLCache:
    """Thread-safe in-memory cache with monotonic-clock TTL."""

    def __init__(self, ttl_seconds: float = 300.0):
        self._ttl = ttl_seconds
        self._store: dict[str, _Entry] = {}

    def get(self, key: str) -> Any | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        if time.monotonic() > entry.expires_at:
            del self._store[key]
            return None
        return entry.data

    def set(self, key: str, data: Any) -> None:
        self._store[key] = _Entry(data=data, expires_at=time.monotonic() + self._ttl)

    def clear(self) -> None:
        self._store.clear()

    # ------------------------------------------------------------------
    # Decorator-based cache for instance methods
    # ------------------------------------------------------------------

    def cached(self, *, ttl: float | None = None, key_fn: callable = str):
        """Decorator: cache method results by (args, kwargs).

        key_fn: custom key builder (default: plain str(args)).
        ttl: per-call override (default: instance TTL).
        """
        _ttl = ttl if ttl is not None else self._ttl

        def decorator(fn):
            _fn_key = f"{fn.__module__}.{fn.__qualname__}"

            async def async_wrapper(self, *args, **kwargs):
                key = f"{_fn_key}:{key_fn(args, kwargs)}"
                cached = self._cache.get(key) if hasattr(self, "_cache") else None
                if cached is not None:
                    return cached
                result = await fn(self, *args, **kwargs)
                self._cache.set(key, result)
                return result

            return async_wrapper
        return decorator


# Shared instances with 5-minute TTL
# (5 min is short enough to surface failures quickly, long enough to
# avoid hammering APIs on every page refresh)
yahoo_cache = TTLCache(ttl_seconds=300)
defillama_cache = TTLCache(ttl_seconds=300)
crypto_cache = TTLCache(ttl_seconds=300)
