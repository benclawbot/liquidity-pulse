from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

from _backend.services.signal_engine import SignalEngine
from _backend.services.yahoo_finance import YahooFinanceService
from _backend.utils.source_meta import aggregate_source_status, source_counts

router = APIRouter(prefix="/api/ideas", tags=["ideas"])
yahoo = YahooFinanceService()
engine = SignalEngine()

TRACKED = {
    "VRT": {"name": "Vertiv", "theme": "Thermal + power", "entry": "Buy pullbacks"},
    "ETN": {"name": "Eaton", "theme": "Grid equipment", "entry": "Scale in"},
    "CEG": {"name": "Constellation Energy", "theme": "Generation scarcity", "entry": "Wait for reset"},
    "HUBB": {"name": "Hubbell", "theme": "Grid hardware", "entry": "Add on consolidations"},
}

WATCHLIST = {
    "ANET": "Networking read-through",
    "PWR": "Engineering / transmission",
    "NVT": "Power equipment beta",
}

METHODOLOGY_TEMPLATES = {
    "risk_on": [
        "Theme must align with {top_theme} — leadership confirmed by sector rotation",
        "Price action must confirm relative strength vs SPX ({spx_chg:+.1f}%)",
        "Crowding reduces conviction — position sizing respects {vix:.0f} VIX regime",
    ],
    "risk_off": [
        "Theme must align with defensive posture — {top_theme} underperforming",
        "Price action must show constructive reset without breaking {vix:.0f} VIX support",
        "Crowding reduces conviction — wait for rotation signal before entry",
    ],
    "bull_broad": [
        "Theme must align with broad {top_theme} participation",
        "Price action must confirm breadth improvement — avoid leader-heavy positioning",
        "Momentum crowding is elevated — trailing stops required at {vix:.0f} VIX",
    ],
    "neutral": [
        "Theme must align with current macro transmission map",
        "Price action must confirm relative strength or constructive reset",
        "Crowding reduces conviction even when thesis stays intact",
    ],
}


def _idea_from_quote(symbol: str, quote: dict[str, Any], regime_label: str = "Neutral") -> dict[str, Any]:
    meta = TRACKED[symbol]
    change = quote.get("change_pct") or 0.0
    conviction = "High" if change >= 1.5 else "Medium" if change >= 0 else "Watch"
    signal = "Momentum improving" if change >= 1.5 else "Setup building" if change >= 0 else "Needs reset"
    return {
        "ticker": symbol,
        "name": meta["name"],
        "theme": meta["theme"],
        "price": quote.get("price"),
        "change_pct": change,
        "conviction": conviction,
        "signal": signal,
        "entry": meta["entry"],
        "horizon": "4-12w",
        "source": "live",
    }


async def _get_methodology_lines(regime_label: str, top_theme: str, vix_price: float, spx_change: float) -> list[str]:
    key = "neutral"
    label_lower = regime_label.lower()
    if "risk-on" in label_lower or "bull" in label_lower:
        key = "risk_on"
    elif "risk-off" in label_lower or "bear" in label_lower:
        key = "risk_off"
    elif "broad" in label_lower:
        key = "bull_broad"
    templates = METHODOLOGY_TEMPLATES.get(key, METHODOLOGY_TEMPLATES["neutral"])
    return [t.format(top_theme=top_theme, vix=vix_price, spx_chg=spx_change) for t in templates]


@router.get("/summary")
async def summary() -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()

    async def get_quote(symbol: str) -> tuple[dict[str, Any], str]:
        try:
            return await asyncio.wait_for(yahoo.fetch_stock(symbol), timeout=1.5), "live"
        except Exception:
            return {"symbol": symbol, "price": None, "change_pct": None, "volume": None, "market_cap": None, "timestamp": now}, "unavailable"

    tracked_results = await asyncio.gather(*[get_quote(symbol) for symbol in TRACKED])
    watch_results = await asyncio.gather(*[get_quote(symbol) for symbol in WATCHLIST])

    tracked_quotes = [quote for quote, _ in tracked_results]
    watch_quotes = [quote for quote, _ in watch_results]
    tracked_quote_sources = {symbol: source for symbol, (_, source) in zip(TRACKED, tracked_results)}
    watch_quote_sources = {symbol: source for symbol, (_, source) in zip(WATCHLIST, watch_results)}

    # Derive regime and VIX from signal engine + SPX for methodology derivation
    spx_quote, spx_src = await get_quote("SPY")
    vix_quote, vix_src = await get_quote("^VIX")
    vix_price = vix_quote.get("price", 20)
    spx_change = spx_quote.get("change_pct") if spx_quote else 0
    top_theme = "AI Infra" if (spx_change or 0) >= 0 else "Defensive"
    regime_label = "Neutral"
    try:
        signals = {
            "vix": vix_price,
            "treasury_10y": 4.3,
            "treasury_2y": 4.05,
            "credit_spread": 2.9,
            "btc_change_pct": 0,
            "dxy_change_pct": 0,
        }
        regime_label = engine.classify_regime(signals).get("label", "Neutral")
    except Exception:
        pass

    methodology = await _get_methodology_lines(regime_label, top_theme, vix_price, spx_change)

    ideas = [_idea_from_quote(symbol, quote, regime_label) for symbol, quote in zip(TRACKED, tracked_quotes)]
    watchlist = [
        {
            "ticker": symbol,
            "note": WATCHLIST[symbol],
            "price": quote.get("price"),
            "change_pct": quote.get("change_pct"),
        }
        for symbol, quote in zip(WATCHLIST, watch_quotes)
    ]

    sources = {
        "idea_quotes": aggregate_source_status(tracked_quote_sources),
        "watchlist_quotes": aggregate_source_status(watch_quote_sources),
        "spx_for_methodology": spx_src,
        "vix_for_methodology": vix_src,
        "methodology": "live",
    }

    return {
        "updated_at": now,
        "source_status": aggregate_source_status(sources),
        "sources": sources,
        "source_counts": source_counts(sources),
        "quote_sources": {
            "tracked": tracked_quote_sources,
            "watchlist": watch_quote_sources,
        },
        "regime": {"label": regime_label},
        "metrics": [
            {"label": "Actionable Ideas", "value": len(ideas), "foot": "Rule-based momentum + theme filter", "tone": "positive"},
            {"label": "High Conviction", "value": sum(1 for idea in ideas if idea["conviction"] == "High"), "foot": "Names confirming leadership", "tone": "positive"},
            {"label": "Watchlist", "value": len(watchlist), "foot": "Secondary confirmations", "tone": "neutral"},
            {"label": "Theme Focus", "value": "AI Infra", "foot": "Power + grid + cooling", "tone": "positive"},
        ],
        "ideas": ideas,
        "watchlist": watchlist,
        "methodology": methodology,
    }
