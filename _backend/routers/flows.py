from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

from backend.services.crypto_public import CryptoPublicService
from backend.services.defillama import DEFAULT_CHAINS, DefiLlamaService
from backend.services.signal_engine import SignalEngine
from backend.utils.source_meta import aggregate_source_status, source_counts

router = APIRouter(prefix="/api/flows", tags=["flows"])
crypto = CryptoPublicService()
defillama = DefiLlamaService()
engine = SignalEngine()

TVL_FALLBACK: list[dict[str, Any]] = []  # Empty on failure — N/A


@router.get("/depth")
async def depth(symbol: str = "BTC/USDT") -> dict[str, Any]:
    try:
        payload = await asyncio.wait_for(crypto.fetch_orderbook(symbol), timeout=8.0)
        source_status = "live"
    except Exception:
        now = datetime.now(timezone.utc).isoformat()
        # Return empty orderbook — N/A on failure, never substitute fake data
        payload = {"symbol": symbol, "bids": [], "asks": [], "timestamp": now}
        source_status = "unavailable"

    return {**payload, "source_status": source_status}


@router.get("/funding-rates")
async def funding_rates() -> dict[str, Any]:
    pairs = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "ARB/USDT"]

    async def fetch_pair_data(pair: str) -> tuple[dict[str, Any], str]:
        try:
            # CoinGecko /derivatives gives us funding_rate + price in one call
            funding = await asyncio.wait_for(crypto.fetch_funding_rate(pair), timeout=8.0)
            if funding.get("rate") is None:
                raise RuntimeError("no funding rate data")
            return (funding, "live")
        except Exception:
            return ({"symbol": pair, "rate": None, "next_funding": None, "price": None, "change_pct": None}, "unavailable")

    fetched = await asyncio.gather(*[fetch_pair_data(pair) for pair in pairs])
    results = [item for item, _ in fetched]
    pair_sources = {pair: source for pair, (_, source) in zip(pairs, fetched)}

    overall_status = aggregate_source_status(pair_sources)
    return {
        "rates": results,
        "pair_sources": pair_sources,
        "source_status": overall_status,
        "source_counts": source_counts(pair_sources),
    }


@router.get("/tvl")
async def tvl(limit: int = 5) -> dict[str, Any]:
    safe_limit = max(1, min(limit, len(DEFAULT_CHAINS)))

    try:
        chains = await asyncio.wait_for(defillama.fetch_tvl_chains(limit=safe_limit, chains=DEFAULT_CHAINS), timeout=4.0)
        sources = {"chains": "live"}
    except Exception:
        chains = []
        sources = {"chains": "unavailable"}

    return {
        "chains": chains,
        "sources": sources,
        "source_status": aggregate_source_status(sources),
        "source_counts": source_counts(sources),
    }


@router.get("/dashboard")
async def dashboard(symbol: str = "BTC/USDT") -> dict[str, Any]:
    tvl_data = await tvl()
    orderbook, funding = await asyncio.gather(depth(symbol), funding_rates())
    bids, asks = orderbook.get("bids", []), orderbook.get("asks", [])
    best_bid = bids[0][0] if bids else None
    best_ask = asks[0][0] if asks else None
    spread = max(0.0, best_ask - best_bid) if (best_bid and best_ask) else None
    spread_pct = (spread / best_ask) if best_ask else None
    spread_cost = engine.compute_spread_cost({"orderbook_breadth": len(bids), "orderbook_depth": sum(level[1] for level in bids) * 10000})
    liquidity_score = engine.compute_liquidity_score({"spread_cost": spread_cost, "bid_ask_spread": spread_pct})
    spread_foot = f"{spread_pct * 100:.3f}%" if spread_pct is not None else "N/A"

    metrics = [
        {"label": "Bid/Ask Spread", "value": round(spread, 2) if spread is not None else None, "foot": spread_foot, "tone": "positive" if spread_pct is not None and spread_pct < 0.002 else "negative" if spread_pct is not None else "neutral"},
        {"label": "Liquidity Score", "value": liquidity_score, "foot": "Based on orderbook breadth", "tone": "positive" if liquidity_score >= 60 else "negative" if liquidity_score < 40 else "neutral"},
        {"label": "Funding Breadth", "value": len(funding["rates"]), "foot": "Tracked perpetual pairs", "tone": "neutral"},
        {"label": "TVL Breadth", "value": len(tvl_data["chains"]), "foot": "Tracked chains", "tone": "neutral"},
    ]

    sources = {
        "orderbook": orderbook.get("source_status", "unavailable"),
        "funding": funding.get("source_status", "unavailable"),
        "tvl": tvl_data.get("source_status", "unavailable"),
    }

    return {
        "metrics": metrics,
        "depth": orderbook,
        "funding_rates": funding["rates"],
        "funding_pair_sources": funding.get("pair_sources", {}),
        "tvl": tvl_data["chains"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "source_status": aggregate_source_status(sources),
        "source_counts": source_counts(sources),
    }
