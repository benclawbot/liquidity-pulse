from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import ccxt


class CryptoServiceError(Exception):
    pass


class CryptoService:
    def __init__(self, exchange: Any | None = None):
        self.exchange = exchange or ccxt.binance({"enableRateLimit": True})

    async def fetch_pair(self, symbol: str = "BTC/USDT") -> dict[str, Any]:
        return await asyncio.to_thread(self._fetch_pair_sync, symbol)

    async def fetch_funding_rate(self, symbol: str = "BTC/USDT") -> dict[str, Any]:
        return await asyncio.to_thread(self._fetch_funding_rate_sync, symbol)

    async def fetch_orderbook(self, symbol: str = "BTC/USDT", limit: int = 20) -> dict[str, Any]:
        return await asyncio.to_thread(self._fetch_orderbook_sync, symbol, limit)

    def _fetch_pair_sync(self, symbol: str) -> dict[str, Any]:
        ticker = self.exchange.fetch_ticker(symbol)
        return {
            "symbol": symbol,
            "price": ticker.get("last") or 0.0,
            "change_pct": ticker.get("percentage") or 0.0,
            "volume_24h": ticker.get("quoteVolume") or 0.0,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def _fetch_funding_rate_sync(self, symbol: str) -> dict[str, Any]:
        try:
            funding = self.exchange.fetch_funding_rate(symbol)
        except Exception:
            funding = {"fundingRate": None, "nextFundingTime": None}
        return {
            "symbol": symbol,
            "rate": funding.get("fundingRate"),
            "next_funding": funding.get("nextFundingTime"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def _fetch_orderbook_sync(self, symbol: str, limit: int) -> dict[str, Any]:
        orderbook = self.exchange.fetch_order_book(symbol, limit)
        return {
            "symbol": symbol,
            "bids": orderbook.get("bids", [])[:limit],
            "asks": orderbook.get("asks", [])[:limit],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
