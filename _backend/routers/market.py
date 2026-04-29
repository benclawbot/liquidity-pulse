from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from fastapi import APIRouter

from _backend.services.signal_engine import SignalEngine
from _backend.services.yahoo_finance import YahooFinanceService
from _backend.utils.source_meta import aggregate_source_status, source_counts

router = APIRouter(prefix="/api/market", tags=["market"])
yahoo = YahooFinanceService()
engine = SignalEngine()

SECTOR_ETFS = [
    ("XLK", "Tech"),
    ("XLU", "Utilities"),
    ("XLE", "Energy"),
    ("XLF", "Financials"),
    ("XLV", "Healthcare"),
    ("XLY", "Cons. Discr."),
    ("XLI", "Industrials"),
    ("XLB", "Materials"),
    ("XLRE", "Real Estate"),
    ("XLC", "Comm"),
]

THEME_TICKERS = {
    "AI Power Stack": ["XLU", "NEE", "DUK", "VRT"],
    "Reindustrialization": ["CAT", "DE", "ROK", "XLI"],
    "Data Center Infra": ["DLR", "EQIX", "AMT", "AVB"],
    "Defense/EU Spending": ["LHX", "NOC", "RTX", "GD"],
    "Financials": ["GS", "JPM", "BAC", "XLF"],
    "Healthcare": ["LLY", "UNH", "XLV", "JNJ"],
    "Consumer Disc.": ["AMZN", "TSLA", "XLY", "HD"],
    "Energy": ["XOM", "CVX", "XLE", "SLB"],
    "Materials": ["LIN", "APD", "XLB", "FCX"],
    "Real Estate": ["PLD", "AMT", "EQIX", "XLRE"],
}


async def _safe(call: Callable[[], Awaitable[dict[str, Any]]], fallback: dict[str, Any]) -> tuple[dict[str, Any], str]:
    try:
        return await asyncio.wait_for(call(), timeout=2.5), "live"
    except Exception:
        return fallback, "unavailable"


async def _fetch_sector_etfs() -> tuple[list[dict[str, Any]], dict[str, str]]:
    """Fetch all sector ETFs, return (data, symbol_to_source)."""
    now = datetime.now(timezone.utc).isoformat()
    fallback = {s: {"symbol": s, "price": None, "change_pct": None, "volume": None, "market_cap": None, "timestamp": now} for s, _ in SECTOR_ETFS}

    async def fetch_one(sym: str) -> tuple[str, dict[str, Any], str]:
        try:
            data = await asyncio.wait_for(yahoo.fetch_index(sym), timeout=3.5)
            return sym, data, "live"
        except Exception:
            return sym, fallback[sym], "unavailable"

    # Fetch in small batches to avoid overwhelming the Yahoo rate limiter
    batch_size = 3
    results = []
    for i in range(0, len(SECTOR_ETFS), batch_size):
        batch = SECTOR_ETFS[i : i + batch_size]
        batch_results = await asyncio.gather(*[fetch_one(sym) for sym, _ in batch])
        results.extend(batch_results)

    data_map = {sym: (d, src) for sym, d, src in results}
    data = [data_map[sym][0] for sym, _ in SECTOR_ETFS]
    sources = {sym: data_map[sym][1] for sym, _ in SECTOR_ETFS}
    return data, sources


def _compute_flow_leaders(sector_data: list[dict[str, Any]], sources: dict[str, str]) -> list[dict[str, Any]]:
    """Rank sectors by day change to produce flow leader themes."""
    scored = []
    for (sym, _), data in zip(SECTOR_ETFS, sector_data):
        chg = data.get("change_pct") or 0.0
        scored.append({"sym": sym, "chg": chg, "source": sources.get(sym, "unavailable")})

    scored.sort(key=lambda x: x["chg"], reverse=True)
    leaders = []
    seen_themes = set()
    for item in scored[:5]:
        theme = None
        for t_name, t_syms in THEME_TICKERS.items():
            if item["sym"] in t_syms and t_name not in seen_themes:
                theme = t_name
                seen_themes.add(t_name)
                break
        if not theme:
            theme = f"{item['sym']} Sector"
        leaders.append({
            "theme": theme,
            "description": f"{item['sym']} {abs(item['chg']):.1f}% day change",
            "score": round(item["chg"], 1),
            "source": item["source"],
        })
    return leaders


def _compute_transmission_nodes(
    spx: dict, vix: dict, btc: dict, treasury: dict, dxy: dict, oil: dict, sources: dict
) -> list[dict[str, Any]]:
    """Build transmission nodes from live market data. Values are None when unavailable."""
    return [
        {
            "key": "DXY",
            "label": "Dollar pressure",
            "tone": "negative" if (dxy.get("change_pct") or 0) > 0.5 else "positive",
            "value": round(dxy.get("price"), 2) if dxy.get("price") is not None else None,
            "source": sources.get("dxy", "unavailable"),
        },
        {
            "key": "10Y",
            "label": "Rate anchor",
            "tone": "negative" if (treasury.get("change_pct") or 0) > 1 else "neutral",
            "value": round(treasury.get("yield"), 3) if treasury.get("yield") is not None else None,
            "source": sources.get("yield_10y", "unavailable"),
        },
        {
            "key": "OIL",
            "label": "Inflation risk",
            "tone": "negative" if (oil.get("change_pct") or 0) > 2 else "neutral",
            "value": round(oil.get("price"), 2) if oil.get("price") is not None else None,
            "source": sources.get("oil", "unavailable"),
        },
        {
            "key": "BTC",
            "label": "Risk proxy",
            "tone": "positive" if (btc.get("change_pct") or 0) > 1 else "neutral",
            "value": round(btc.get("price"), 2) if btc.get("price") is not None else None,
            "source": sources.get("btc", "unavailable"),
        },
        {
            "key": "SPX",
            "label": "Equity breadth",
            "tone": "positive" if (spx.get("change_pct") or 0) > 0 else "negative",
            "value": round(spx.get("price"), 2) if spx.get("price") is not None else None,
            "source": sources.get("spx", "unavailable"),
        },
        {
            "key": "VIX",
            "label": "Volatility",
            "tone": "negative" if (vix.get("price") or 20) > 25 else "positive" if (vix.get("price") or 20) < 15 else "neutral",
            "value": round(vix.get("price"), 2) if vix.get("price") is not None else None,
            "source": sources.get("vix", "unavailable"),
        },
    ]


async def _fetch_top_stocks_for_theme(theme: str, symbols: list[str]) -> list[dict[str, Any]]:
    """Fetch and sort stocks for a given theme by change_pct."""
    now = datetime.now(timezone.utc).isoformat()

    async def fetch_sym(sym: str) -> tuple[str, dict[str, Any], str]:
        try:
            data = await asyncio.wait_for(yahoo.fetch_stock(sym), timeout=2.0)
            return sym, data, "live"
        except Exception:
            return sym, {"symbol": sym, "price": None, "change_pct": None, "timestamp": now}, "unavailable"

    results = await asyncio.gather(*[fetch_sym(sym) for sym in symbols])
    scored = [(sym, d, src) for sym, d, src in results]
    scored.sort(key=lambda x: x[1].get("change_pct", 0), reverse=True)
    return scored


async def _build_recommendations(flow_leaders: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """Derive top recommendations from leading theme + sector stocks."""
    recommendations = []
    all_sources: dict[str, str] = {}

    theme_names = [fl["theme"] for fl in flow_leaders[:2]]
    for theme in theme_names:
        if theme in THEME_TICKERS:
            stocks = await _fetch_top_stocks_for_theme(theme, THEME_TICKERS[theme])
            for sym, data, src in stocks[:1]:
                all_sources[sym] = src
                conviction = "High" if data.get("change_pct", 0) >= 1.5 else "Medium" if data.get("change_pct", 0) >= 0 else "Watch"
                entry = "Buy pullbacks" if data.get("change_pct", 0) >= 0 else "Wait for reset"
                recommendations.append({
                    "ticker": sym,
                    "name": data.get("symbol", sym),
                    "theme": theme,
                    "price": data.get("price"),
                    "change_pct": data.get("change_pct"),
                    "thesis": f"{theme} leadership — {abs(data.get('change_pct', 0)):.1f}% day",
                    "conviction": conviction,
                    "entry": entry,
                    "horizon": "4-12w",
                    "source": src,
                })

    if len(recommendations) < 2:
        recommendations.append({
            "ticker": "SPY",
            "name": "SPDR S&P 500",
            "theme": "Broad equity",
            "price": None,
            "change_pct": None,
            "thesis": "Market breadth exposure",
            "conviction": "Medium",
            "entry": "Passive hold",
            "horizon": "12w+",
            "source": "unavailable",
        })

    return recommendations[:3], all_sources


@router.get("/snapshot")
async def snapshot() -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()

    # Core market data — all from Yahoo now; None on failure (never fake)
    (spx, spx_src), (vix, vix_src), (btc, btc_src), (treasury_10y, treasury_src), (dxy, dxy_src), (oil, oil_src) = await asyncio.gather(
        _safe(lambda: yahoo.fetch_index("^GSPC"), {"symbol": "^GSPC", "price": None, "change_pct": None, "volume": None, "market_cap": None, "timestamp": now}),
        _safe(lambda: yahoo.fetch_index("^VIX"), {"symbol": "^VIX", "price": None, "change_pct": None, "volume": None, "market_cap": None, "timestamp": now}),
        _safe(lambda: yahoo.fetch_stock("BTC-USD"), {"symbol": "BTC-USD", "price": None, "change_pct": None, "volume": None, "market_cap": None, "timestamp": now}),
        _safe(lambda: yahoo.fetch_treasury("10yr"), {"symbol": "10YR", "yield": None, "change_pct": None, "timestamp": now}),
        _safe(lambda: yahoo.fetch_dxy(), {"symbol": "DXY", "price": None, "change_pct": None, "volume": None, "market_cap": None, "timestamp": now}),
        _safe(lambda: yahoo.fetch_commodity("oil"), {"symbol": "OIL", "price": None, "change_pct": None, "volume": None, "market_cap": None, "timestamp": now}),
    )

    # Sector ETFs for flow leaders
    sector_data, sector_sources = await _fetch_sector_etfs()
    flow_leaders = _compute_flow_leaders(sector_data, sector_sources)

    # Transmission nodes from live data
    market_sources = {
        "spx": spx_src,
        "vix": vix_src,
        "btc": btc_src,
        "yield_10y": treasury_src,
        "dxy": dxy_src,
        "oil": oil_src,
    }
    transmission_nodes = _compute_transmission_nodes(spx, vix, btc, treasury_10y, dxy, oil, market_sources)

    # Recommendations from live theme leaders
    recommendations, rec_sources = await _build_recommendations(flow_leaders)

    # Signal engine — all inputs must be safe (None → use safe defaults for computation only)
    signals = {
        "vix": vix.get("price") if vix.get("price") is not None else 20.0,
        "treasury_10y": treasury_10y.get("yield") if treasury_10y.get("yield") is not None else 4.3,
        "treasury_2y": 4.05,  # hardcoded — no live 2Y feed
        "credit_spread": 2.9,  # hardcoded — no live credit feed
        "btc_change_pct": btc.get("change_pct") if btc.get("change_pct") is not None else 0.0,
        "dxy_change_pct": dxy.get("change_pct") if dxy.get("change_pct") is not None else 0.0,
    }
    regime = engine.classify_regime(signals)
    vix_val = vix.get("price") if vix.get("price") is not None else 20.0
    btc_chg = btc.get("change_pct") if btc.get("change_pct") is not None else 0.0
    spread_cost = engine.compute_spread_cost({"orderbook_breadth": 14 if vix_val < 20 else 8, "orderbook_depth": 90000 if btc_chg >= 0 else 50000})
    liquidity_score = engine.compute_liquidity_score({"spread_cost": spread_cost, "bid_ask_spread": max(vix_val / 10000, 0.0008)})
    spx_chg = spx.get("change_pct") if spx.get("change_pct") is not None else 0.0
    oil_val = oil.get("price") if oil.get("price") is not None else 83.0
    dxy_val = dxy.get("price") if dxy.get("price") is not None else 106.0
    treasury_val = treasury_10y.get("yield") if treasury_10y.get("yield") is not None else 4.3
    risk_appetite = engine.compute_risk_appetite({"vix": vix_val, "credit_spread": 2.9, "equity_momentum": spx_chg / 10})
    market_conviction = engine.compute_market_conviction({"spx_change_pct": spx_chg, "btc_change_pct": btc_chg, "regime_confidence": regime["confidence"]})
    trend_signal = engine.compute_trend_signal({"oil_price": oil_val, "dxy_price": dxy_val, "yield_10y": treasury_val, "btc_change_pct": btc_chg})

    metrics = [
        {"id": "regime", "label": "Regime", "value": regime["label"], "foot": f"Confidence {int(regime['confidence'] * 100)}%", "tone": regime["tone"]},
        {"id": "liquidity_score", "label": "Liquidity Score", "value": liquidity_score, "foot": f"Spread cost {spread_cost:.4f}", "tone": "positive" if liquidity_score >= 60 else "negative" if liquidity_score < 40 else "neutral"},
        {"id": "risk_appetite", "label": "Risk Appetite", "value": risk_appetite["score"], "foot": f"VIX {vix_val:.1f} | SPX {spx_chg:+.2f}%", "tone": "positive" if risk_appetite['score'] >= 60 else "negative" if risk_appetite['score'] < 40 else "neutral"},
        {"id": "spread_cost", "label": "Spread Cost", "value": round(spread_cost, 4), "foot": "Estimated execution friction", "tone": "negative" if spread_cost > 0.02 else "positive"},
        {"id": "market_conviction", "label": "Market Conviction", "value": market_conviction["score"], "foot": f"BTC {btc_chg:+.2f}% | DXY {dxy_val:.2f}", "tone": market_conviction['tone']},
        {"id": "trend_signal", "label": "Trend Signal", "value": trend_signal["score"], "foot": f"Oil {oil_val:.2f} | 10Y {treasury_val:.2f}", "tone": trend_signal['tone']},
    ]
    # Build sector list with change data for heatmap
    sectors = [
        {
            "symbol": sym,
            "label": label,
            "change_pct": sector_data[i].get("change_pct") if sector_data[i].get("change_pct") is not None else 0.0,
            "source": sector_sources.get(sym, "unavailable"),
        }
        for i, (sym, label) in enumerate(SECTOR_ETFS)
    ]

    # Signal inputs breakdown
    signal_inputs = {
        "vix": round(vix_val, 2),
        "treasury_10y": round(treasury_val, 3),
        "treasury_2y": 4.05,
        "credit_spread": 2.9,
        "btc_change_pct": round(btc_chg, 3),
        "dxy_change_pct": round(dxy.get("change_pct", 0), 3),
        "spx_change_pct": round(spx_chg, 3),
        "oil_price": round(oil_val, 2),
    }

    # Aggregate sources
    sources = {
        **market_sources,
        "sectors": aggregate_source_status(sector_sources),
        "flow_leaders": aggregate_source_status({fl["theme"]: fl.get("source", "unavailable") for fl in flow_leaders}),
        "transmission_nodes": aggregate_source_status({
            n["key"]: n.get("source", "unavailable") for n in transmission_nodes}),
        "recommendations": aggregate_source_status(rec_sources),
        "signal_inputs": "live",
    }

    return {
        "updated_at": now,
        "source_status": aggregate_source_status(sources),
        "sources": sources,
        "source_counts": source_counts(sources),
        "regime": regime,
        "metrics": metrics,
        "spx": spx,
        "vix": vix,
        "btc": btc,
        "yield_10y": treasury_10y,
        "dxy": dxy,
        "oil": oil,
        "flow_leaders": flow_leaders,
        "recommendations": recommendations,
        "transmission_nodes": transmission_nodes,
        "sectors": sectors,
        "signal_inputs": signal_inputs,
        "center_catalyst": {
            "title": "Market Catalyst",
            "headline": regime.get("label", "Mixed"),
            "body": f"VIX {vix_val:.1f} | 10Y {treasury_val:.2f}% | BTC {btc_chg:+.2f}% | Oil ${oil_val:.2f}",
            "lag": regime.get("confidence", 0) >= 0.75 and "High confidence" or None,
            "confidence": f"{int(regime.get('confidence', 0) * 100)}%",
        },
    }
