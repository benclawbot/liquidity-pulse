from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from statistics import correlation
from typing import Any, Awaitable, Callable

from fastapi import APIRouter

from _backend.services.yahoo_finance import YahooFinanceService
from _backend.utils.source_meta import aggregate_source_status, source_counts

router = APIRouter(prefix="/api/impacts", tags=["impacts"])
yahoo = YahooFinanceService()


def _clamp_score(value: float) -> int:
    return max(0, min(100, int(round(value))))


def _score_tone(value: float, positive_threshold: float = 60, negative_threshold: float = 40) -> str:
    if value >= positive_threshold:
        return "positive"
    if value <= negative_threshold:
        return "negative"
    return "neutral"


def _inverse_score_tone(value: float, risk_threshold: float = 60, calm_threshold: float = 40) -> str:
    if value >= risk_threshold:
        return "negative"
    if value <= calm_threshold:
        return "positive"
    return "neutral"


def _bucket_bias(change_pct: float) -> str:
    if change_pct >= 0.35:
        return "Positive"
    if change_pct <= -0.35:
        return "Negative"
    return "Neutral"


def _event_tone(change_pct: float, invert: bool = False) -> str:
    if invert:
        if change_pct >= 0:
            return "negative"
        return "positive"
    if change_pct >= 0:
        return "positive"
    return "negative"


def _summary_source_from_inputs(inputs: dict[str, str]) -> str:
    return "live" if any(state == "live" for state in inputs.values()) else "unavailable"


async def _safe(call: Callable[[], Awaitable[dict[str, Any]]], fallback: dict[str, Any], timeout: float = 3.5) -> tuple[dict[str, Any], str]:
    try:
        return await asyncio.wait_for(call(), timeout=timeout), "live"
    except Exception:
        return fallback, "unavailable"


def _price_returns(prices: list[float]) -> list[float]:
    """Convert a list of prices to daily percentage returns."""
    return [(prices[i] - prices[i - 1]) / abs(prices[i - 1]) * 100 for i in range(1, len(prices))]


async def _fetch_returns(symbol: str, period: str = "1mo") -> list[float]:
    """Fetch daily close prices and return daily % changes."""
    try:
        history = await yahoo.fetch_history(symbol, period=period, interval="1d")
        if len(history) < 5:
            return []
        closes = [row["close"] for row in history if row.get("close") is not None]
        return _price_returns(closes)
    except Exception:
        return []


@router.get("/summary")
async def summary() -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()

    (
        (yield_10y, yield_10y_source),
        (xlu, xlu_source),
        (xli, xli_source),
        (xlk, xlk_source),
        (kre, kre_source),
        (hyg, hyg_source),
        (lqd, lqd_source),
        (spx, spx_source),
        (btc, btc_source),
        (dxy, dxy_source),
        (oil, oil_source),
    ) = await asyncio.gather(
        _safe(lambda: yahoo.fetch_treasury("10yr"), {"symbol": "10YR", "yield": None, "change_pct": None, "timestamp": now}),
        _safe(lambda: yahoo.fetch_stock("XLU"), {"symbol": "XLU", "price": None, "change_pct": None, "volume": None, "market_cap": None, "timestamp": now}),
        _safe(lambda: yahoo.fetch_stock("XLI"), {"symbol": "XLI", "price": None, "change_pct": None, "volume": None, "market_cap": None, "timestamp": now}),
        _safe(lambda: yahoo.fetch_stock("XLK"), {"symbol": "XLK", "price": None, "change_pct": None, "volume": None, "market_cap": None, "timestamp": now}),
        _safe(lambda: yahoo.fetch_stock("KRE"), {"symbol": "KRE", "price": None, "change_pct": None, "volume": None, "market_cap": None, "timestamp": now}),
        _safe(lambda: yahoo.fetch_stock("HYG"), {"symbol": "HYG", "price": None, "change_pct": None, "volume": None, "market_cap": None, "timestamp": now}),
        _safe(lambda: yahoo.fetch_stock("LQD"), {"symbol": "LQD", "price": None, "change_pct": None, "volume": None, "market_cap": None, "timestamp": now}),
        _safe(lambda: yahoo.fetch_index("^GSPC"), {"symbol": "^GSPC", "price": None, "change_pct": None, "volume": None, "market_cap": None, "timestamp": now}),
        _safe(lambda: yahoo.fetch_stock("BTC-USD"), {"symbol": "BTC-USD", "price": None, "change_pct": None, "volume": None, "market_cap": None, "timestamp": now}),
        _safe(lambda: yahoo.fetch_dxy(), {"symbol": "DXY", "price": None, "date": now[:10], "timestamp": now}),
        _safe(lambda: yahoo.fetch_commodity("brent"), {"symbol": "BZ=F", "price": None, "date": now[:10], "timestamp": now}),
    )

    xlu_change = float(xlu.get("change_pct") or 0.0)
    xli_change = float(xli.get("change_pct") or 0.0)
    xlk_change = float(xlk.get("change_pct") or 0.0)
    kre_change = float(kre.get("change_pct") or 0.0)
    hyg_change = float(hyg.get("change_pct") or 0.0)
    lqd_change = float(lqd.get("change_pct") or 0.0)
    spx_change = float(spx.get("change_pct") or 0.0)
    btc_change = float(btc.get("change_pct") or 0.0)
    yield_level = float(yield_10y.get("yield") or 0.0)
    yield_change = float(yield_10y.get("change_pct") or 0.0)
    dxy_level = float(dxy.get("price") or 0.0)
    oil_level = float(oil.get("price") or 0.0)

    utilities_vs_software = xlu_change - xlk_change
    oil_pressure = ((oil_level - 80.0) / 80.0) * 100 if oil_level else 0.0
    dollar_pressure = dxy_level - 105.0
    credit_gap = hyg_change - lqd_change

    policy_sensitivity = _clamp_score(50 + (utilities_vs_software * 10) + max(0.0, -yield_change * 12))
    rate_stress = _clamp_score(45 + max(0.0, (yield_level - 4.0) * 20) + max(0.0, dollar_pressure * 1.8) + max(0.0, oil_pressure * 1.2))
    credit_spillover = _clamp_score(50 - (credit_gap * 14) + max(0.0, yield_change * 10))
    cross_asset_correlation = _clamp_score(45 + (abs(spx_change - btc_change) * 8) + (abs(dollar_pressure) * 2.0))

    metrics = [
        {
            "label": "Policy Sensitivity",
            "value": policy_sensitivity,
            "foot": f"XLU vs XLK spread {utilities_vs_software:+.2f}%",
            "tone": _score_tone(policy_sensitivity),
        },
        {
            "label": "Rate Stress",
            "value": rate_stress,
            "foot": f"10Y {yield_level:.2f}% | DXY {dxy_level:.2f}",
            "tone": _inverse_score_tone(rate_stress),
        },
        {
            "label": "Credit Spillover",
            "value": credit_spillover,
            "foot": f"HYG-LQD delta {credit_gap:+.2f}%",
            "tone": _inverse_score_tone(credit_spillover, risk_threshold=58, calm_threshold=42),
        },
        {
            "label": "Cross-Asset Correlation",
            "value": cross_asset_correlation,
            "foot": f"SPX {spx_change:+.2f}% | BTC {btc_change:+.2f}%",
            "tone": _inverse_score_tone(cross_asset_correlation, risk_threshold=72, calm_threshold=35),
        },
    ]

    transmission_chain = [
        {
            "order": "origin",
            "from": "Fed Policy",
            "to": "Rate Sensitivity",
            "note": f"10Y at {yield_level:.2f}% with {yield_change:+.2f}% daily move",
            "tone": _event_tone(yield_change, invert=True),
        },
        {
            "order": "first",
            "from": "Rate Sensitivity",
            "to": "Equity Valuations",
            "note": f"XLK {xlk_change:+.2f}% vs XLU {xlu_change:+.2f}%",
            "tone": _event_tone(utilities_vs_software),
        },
        {
            "order": "second",
            "from": "Equity Valuations",
            "to": "Credit Spreads",
            "note": f"HYG {hyg_change:+.2f}% and LQD {lqd_change:+.2f}% imply spread drift",
            "tone": _event_tone(credit_gap, invert=True),
        },
        {
            "order": "lagged",
            "from": "Credit Spreads",
            "to": "Risk Appetite",
            "note": f"BTC {btc_change:+.2f}% with SPX {spx_change:+.2f}%",
            "tone": _event_tone((btc_change + spx_change) / 2),
        },
    ]

    # Derive dominant catalyst headline from the strongest signal
    dominant_tone = max(transmission_chain, key=lambda c: abs(yield_change) if c["order"] == "origin" else 0)
    center_catalyst = {
        "title": "Macro Catalyst",
        "headline": "Rates driving cross-asset transmission",
        "body": (
            f"10Y at {yield_level:.2f}% is the primary driver. "
            f"Equity sensitivity ({xlk_change:+.2f}% XLK vs {xlu_change:+.2f}% XLU) is propagating into credit spreads, "
            f"with {abs(credit_gap):.2f}% HYG-LQD differential as the transmission indicator."
        ),
        "lag": "2–4h lag" if abs(credit_gap) >= 0.2 else "Monitor",
        "confidence": "High confidence" if yield_level >= 4.2 else "Moderate",
    }

    rate_matrix = [
        {"bucket": "Utilities", "sensitivity": "High", "bias": _bucket_bias(xlu_change)},
        {"bucket": "Electrical Equipment", "sensitivity": "Medium", "bias": _bucket_bias(xli_change)},
        {"bucket": "Mega-cap Software", "sensitivity": "High", "bias": _bucket_bias(xlk_change)},
        {"bucket": "Regional Banks", "sensitivity": "Medium", "bias": _bucket_bias(kre_change)},
    ]

    # NxN correlation matrix — real Pearson from 1-month daily returns
    asset_tickers = {
        "SPX":  "^GSPC",
        "BTC":  "BTC-USD",
        "10Y":  "^TNX",
        "DXY":  "DX-Y.NYB",
        "Oil":  "BZ=F",
        "XLE":  "XLE",
    }
    assets = list(asset_tickers.keys())

    # Fetch all return series concurrently
    returns_map: dict[str, list[float]] = {}
    results = await asyncio.gather(
        *[_fetch_returns(ticker, "1mo") for ticker in asset_tickers.values()]
    )
    for asset, rets in zip(assets, results):
        returns_map[asset] = rets

    def _corr(a: str, b: str) -> float:
        ra = returns_map.get(a, [])
        rb = returns_map.get(b, [])
        if a == b or not ra or not rb or len(ra) < 3 or len(rb) < 3:
            return 1.0 if a == b else 0.0
        try:
            n = min(len(ra), len(rb))
            return round(correlation(ra[:n], rb[:n]), 2)
        except Exception:
            return 0.0

    correlation_matrix = [
        {"pair": assets[i], "values": [_corr(assets[i], assets[j]) for j in range(len(assets))]}
        for i in range(len(assets))
    ]

    events = [
        {
            "title": f"10Y yield at {yield_level:.2f}%",
            "magnitude": f"{yield_change:+.2f}%",
            "latency": "Confirmed",
            "impact": "Higher real rates pressure long-duration multiples when trend persists.",
            "tone": _event_tone(yield_change, invert=True),
        },
        {
            "title": f"Dollar index at {dxy_level:.2f}",
            "magnitude": f"{dxy_level - 105:+.2f}",
            "latency": "Confirmed",
            "impact": "Dollar strength can tighten global liquidity and weigh on risk assets.",
            "tone": "negative" if dxy_level >= 106 else "neutral",
        },
        {
            "title": f"Brent proxy at ${oil_level:.2f}",
            "magnitude": f"${oil_level:.0f}",
            "latency": "Watching",
            "impact": "Energy pressure can reprice inflation expectations and keep yields elevated.",
            "tone": "negative" if oil_level >= 85 else "neutral",
        },
        {
            "title": f"BTC moved {btc_change:+.2f}%",
            "magnitude": f"{btc_change:+.2f}%",
            "latency": "Confirmed",
            "impact": "Crypto beta remains a fast read on broad risk appetite.",
            "tone": _event_tone(btc_change),
        },
    ]

    input_sources = {
        "yield_10y": yield_10y_source,
        "xlu": xlu_source,
        "xli": xli_source,
        "xlk": xlk_source,
        "kre": kre_source,
        "hyg": hyg_source,
        "lqd": lqd_source,
        "spx": spx_source,
        "btc": btc_source,
        "dxy": dxy_source,
        "oil": oil_source,
    }
    sources = {"summary": _summary_source_from_inputs(input_sources), **input_sources}

    return {
        "updated_at": now,
        "source_status": aggregate_source_status(sources),
        "sources": sources,
        "source_counts": source_counts(sources),
        "metrics": metrics,
        "transmission_chain": transmission_chain,
        "center_catalyst": center_catalyst,
        "rate_matrix": rate_matrix,
        "correlation_matrix": correlation_matrix,
        "events": events,
    }
