"""Public-API crypto service — no exchange accounts needed.
Uses CoinGecko (funding rates + prices) and Kraken (orderbook depth).
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import httpx

from .cache import crypto_cache


class CryptoPublicService:
    """Fetches crypto data from public APIs with no auth required."""

    COINGECKO_DERIVATIVES_URL = "https://api.coingecko.com/api/v3/derivatives"
    KRAKEN_DEPTH_URL = "https://api.kraken.com/0/public/Depth"
    KRAKEN_TICKER_URL = "https://api.kraken.com/0/public/Ticker"

    # Symbol mapping: internal symbol -> CoinGecko symbol, Kraken pair
    SYMBOL_MAP: dict[str, dict[str, str]] = {
        "BTC/USDT": {
            "coingecko": "BTCUSDT",
            "kraken": "XXBTZUSD",
        },
        "ETH/USDT": {
            "coingecko": "ETHUSDT",
            "kraken": "XETHZUSD",
        },
        "SOL/USDT": {
            "coingecko": "SOLUSDT",
            "kraken": "SOLUSD",
        },
        "BNB/USDT": {
            "coingecko": "BNBUSDT",
            "kraken": "BNBUSDT",
        },
        "ARB/USDT": {
            "coingecko": "ARBUSDT",
            "kraken": "ARBUSD",
        },
    }

    def __init__(self, http_client: httpx.AsyncClient | None = None):
        self._client = http_client or httpx.AsyncClient(timeout=httpx.Timeout(5.0, connect=3.0))

    async def close(self):
        await self._client.aclose()

    def _kraken_pair_for(self, symbol: str) -> str:
        return self.SYMBOL_MAP.get(symbol, {}).get("kraken", "XXBTZUSD")

    def _cg_symbol_for(self, symbol: str) -> str:
        return self.SYMBOL_MAP.get(symbol, {}).get("coingecko", "BTCUSDT")

    # ------------------------------------------------------------------
    # CoinGecko — funding rates + prices (perpetual futures)
    # ------------------------------------------------------------------

    async def fetch_funding_rates_bulk(self) -> dict[str, dict[str, Any]]:
        """Fetch funding rates for all tracked pairs from CoinGecko derivatives."""
        cache_key = "funding_rates_bulk"
        cached = crypto_cache.get(cache_key)
        if cached is not None:
            return cached
        try:
            resp = await self._client.get(self.COINGECKO_DERIVATIVES_URL, params={"include_tickers": "unexpired"})
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return {}

        rates: dict[str, dict[str, Any]] = {}
        for f in data:
            sym = f.get("symbol", "").upper()
            # Normalise different separators (BTCUSDT, BTC_USDT, BTC-USDT, BTC/USDT)
            normalized = sym.replace("_", "").replace("-", "/")
            if normalized in self.SYMBOL_MAP or sym in self.SYMBOL_MAP:
                key = normalized if normalized in self.SYMBOL_MAP else sym
                rates[key] = {
                    "symbol": key,
                    "rate": float(f.get("funding_rate", 0) or 0),
                    "price": float(f.get("price", 0) or 0),
                    "change_pct": float(f.get("price_percentage_change_24h", 0) or 0),
                    "volume_24h": float(f.get("volume_24h", 0) or 0),
                    "next_funding": None,  # CoinGecko doesn't expose next funding time
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
        crypto_cache.set(cache_key, rates)
        return rates

    async def fetch_funding_rate(self, symbol: str = "BTC/USDT") -> dict[str, Any]:
        rates = await self.fetch_funding_rates_bulk()
        if symbol in rates:
            return rates[symbol]
        # Fallback: try to fetch just this pair
        cg_sym = self._cg_symbol_for(symbol)
        try:
            resp = await self._client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={"ids": cg_sym.lower().replace("/", "-"), "vs_currencies": "usd", "include_24hr_change": "true"},
            )
            resp.raise_for_status()
            d = resp.json()
            price_data = d.get(cg_sym.lower().replace("/", "-"), {})
            return {
                "symbol": symbol,
                "rate": 0.0,
                "price": float(price_data.get("usd", 0)),
                "change_pct": float(price_data.get("usd_24h_change", 0)),
                "next_funding": None,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        except Exception:
            return {"symbol": symbol, "rate": None, "price": None, "change_pct": None, "next_funding": None}

    # ------------------------------------------------------------------
    # CoinGecko — spot ticker
    # ------------------------------------------------------------------

    async def fetch_pair(self, symbol: str = "BTC/USDT") -> dict[str, Any]:
        """Fetch spot price + 24h change from CoinGecko."""
        cache_key = f"pair:{symbol}"
        cached = crypto_cache.get(cache_key)
        if cached is not None:
            return cached
        cg_id = symbol.replace("/", "-").lower()
        try:
            resp = await self._client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={"ids": cg_id, "vs_currencies": "usd", "include_24hr_change": "true", "include_24hr_vol": "true"},
            )
            resp.raise_for_status()
            d = resp.json()
            price_data = d.get(cg_id, {})
            result = {
                "symbol": symbol,
                "price": float(price_data.get("usd", 0) or 0),
                "change_pct": float(price_data.get("usd_24h_change", 0) or 0),
                "volume_24h": float(price_data.get("usd_24h_vol", 0) or 0),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        except Exception:
            result = {"symbol": symbol, "price": None, "change_pct": None, "volume_24h": None}
        crypto_cache.set(cache_key, result)
        return result

    # ------------------------------------------------------------------
    # Kraken — orderbook depth
    # ------------------------------------------------------------------

    async def fetch_orderbook(self, symbol: str = "BTC/USDT", limit: int = 20) -> dict[str, Any]:
        cache_key = f"orderbook:{symbol}:{limit}"
        cached = crypto_cache.get(cache_key)
        if cached is not None:
            return cached
        kraken_pair = self._kraken_pair_for(symbol)
        try:
            resp = await self._client.get(self.KRAKEN_DEPTH_URL, params={"pair": kraken_pair, "count": limit})
            resp.raise_for_status()
            data = resp.json()
            if data.get("error"):
                raise RuntimeError(f"Kraken error: {data['error']}")
            result = data.get("result", {})
            # Kraken returns key per pair name, find the one we asked for
            pair_data = None
            for k, v in result.items():
                if k.upper() == kraken_pair.upper() or k.upper().replace("X", "").replace("Z", "") == kraken_pair.upper().replace("/", ""):
                    pair_data = v
                    break
            if not pair_data:
                raise RuntimeError(f"No result for {kraken_pair}")
            asks_raw = pair_data.get("asks", [])
            bids_raw = pair_data.get("bids", [])
            # Kraken returns [price, volume, timestamp]; asks = sell orders, bids = buy orders
            asks = [[float(p), float(v)] for p, v, _ in asks_raw[:limit]]
            bids = [[float(p), float(v)] for p, v, _ in bids_raw[:limit]]
            result_data = {
                "symbol": symbol,
                "bids": bids,
                "asks": asks,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            # Return empty orderbook on failure — caller handles fallback
            result_data = {
                "symbol": symbol,
                "bids": [],
                "asks": [],
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "_error": str(e),
            }
        crypto_cache.set(cache_key, result_data)
        return result_data
