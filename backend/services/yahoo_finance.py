from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import yfinance as yf

from .cache import yahoo_cache


class YahooFinanceServiceError(Exception):
    pass


class MissingDataError(YahooFinanceServiceError):
    pass


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _coerce_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _lookup(source: Any, *keys: str) -> Any:
    for key in keys:
        if isinstance(source, dict) and source.get(key) is not None:
            return source.get(key)
        if hasattr(source, key):
            value = getattr(source, key)
            if value is not None:
                return value
    return None


class YahooFinanceService:
    def __init__(self, ticker_factory: Any | None = None):
        self.ticker_factory = ticker_factory or yf.Ticker

    # ------------------------------------------------------------------
    # Cached fetchers — all use the shared 5-min yahoo_cache
    # ------------------------------------------------------------------

    async def _cached(self, key: str, fetch_fn: callable) -> Any:
        """Return cached result or call fetch_fn and cache the output."""
        cached = yahoo_cache.get(key)
        if cached is not None:
            return cached
        result = await asyncio.to_thread(fetch_fn)
        yahoo_cache.set(key, result)
        return result

    async def fetch_index(self, symbol: str) -> dict[str, Any]:
        return await self._cached(f"idx:{symbol}", lambda: self._fetch_quote_sync(symbol, symbol))

    async def fetch_stock(self, symbol: str) -> dict[str, Any]:
        return await self._cached(f"stock:{symbol.upper()}", lambda: self._fetch_quote_sync(symbol, symbol.upper()))

    async def fetch_treasury(self, symbol: str = "10yr") -> dict[str, Any]:
        mapping = {"10yr": "^TNX", "5yr": "^FVX", "2yr": "^IRX", "30yr": "^TYX"}
        yahoo_symbol = mapping.get(symbol.lower(), "^TNX")
        quote = await self._cached(f"treasury:{symbol.lower()}", lambda: self._fetch_quote_sync(yahoo_symbol, symbol.upper()))
        return {
            "symbol": symbol.upper(),
            "yield": quote["price"],
            "change_pct": quote["change_pct"],
            "timestamp": quote["timestamp"],
        }

    async def fetch_dxy(self) -> dict[str, Any]:
        """Dollar Index via Yahoo proxy DX-Y.NYB."""
        return await self._cached("dxy", lambda: self._fetch_quote_sync("DX-Y.NYB", "DXY"))

    async def fetch_commodity(self, symbol: str = "oil") -> dict[str, Any]:
        """Commodity price (oil via CL=F, or other futures)."""
        mapping = {"oil": "CL=F", "brent": "BZ=F"}
        yahoo_symbol = mapping.get(symbol.lower(), "CL=F")
        return await self._cached(f"commodity:{symbol.lower()}", lambda: self._fetch_quote_sync(yahoo_symbol, symbol.upper()))

    async def fetch_history(self, symbol: str, period: str = "1mo", interval: str = "1d") -> list[dict[str, Any]]:
        # History calls are expensive — still cache them
        return await self._cached(f"history:{symbol}:{period}:{interval}", lambda: self._fetch_history_sync(symbol, period, interval))

    # ------------------------------------------------------------------
    # Sync internals (run in thread pool)
    # ------------------------------------------------------------------

    def _fetch_quote_sync(self, ticker_symbol: str, output_symbol: str) -> dict[str, Any]:
        ticker = self.ticker_factory(ticker_symbol)
        info = getattr(ticker, "fast_info", None) or getattr(ticker, "info", None) or {}

        price = _coerce_float(_lookup(info, "lastPrice", "last_price", "regularMarketPrice"))
        if price is None:
            raise MissingDataError(f"No price available for {ticker_symbol}")

        prev_close = _coerce_float(_lookup(info, "previousClose", "previous_close", "regularMarketPreviousClose")) or price
        volume = int(_lookup(info, "lastVolume", "last_volume", "regularMarketVolume") or 0)
        market_cap = int(_lookup(info, "marketCap", "market_cap") or 0)
        change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0.0

        return {
            "symbol": output_symbol,
            "price": round(price, 4),
            "change_pct": round(change_pct, 2),
            "volume": volume,
            "market_cap": market_cap,
            "timestamp": _now_iso(),
        }

    def _fetch_history_sync(self, symbol: str, period: str, interval: str) -> list[dict[str, Any]]:
        ticker = self.ticker_factory(symbol)
        history = ticker.history(period=period, interval=interval)
        if getattr(history, "empty", False):
            raise MissingDataError(f"No history available for {symbol}")

        rows: list[dict[str, Any]] = []
        for index, row in history.iterrows():
            rows.append(
                {
                    "date": index.strftime("%Y-%m-%d") if hasattr(index, "strftime") else str(index),
                    "open": float(row["Open"]),
                    "high": float(row["High"]),
                    "low": float(row["Low"]),
                    "close": float(row["Close"]),
                    "volume": int(row["Volume"]),
                }
            )
        return rows
