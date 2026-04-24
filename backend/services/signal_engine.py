from __future__ import annotations

from typing import Any


class SignalEngine:
    def classify_regime(self, signals: dict[str, float]) -> dict[str, Any]:
        vix = signals.get("vix", 20.0)
        spread_10y_2y = signals.get("treasury_10y", 0.0) - signals.get("treasury_2y", 0.0)
        credit_spread = signals.get("credit_spread", 3.0)
        btc_change = signals.get("btc_change_pct", 0.0)
        dxy_change = signals.get("dxy_change_pct", 0.0)

        if vix < 16 and credit_spread < 3.0 and btc_change > 0 and spread_10y_2y >= 0:
            return {"name": "BULL_EXPANSIVE", "label": "Liquidity Expanding", "confidence": 0.84, "tone": "positive"}
        if vix < 21 and btc_change >= -1.0:
            return {"name": "BULL_NARROW", "label": "Risk-On Rotation", "confidence": 0.68, "tone": "positive"}
        if vix > 25 or credit_spread > 4.0 or btc_change < -2.0 or dxy_change > 0.5:
            return {"name": "BEAR_NARROW", "label": "Risk Compression", "confidence": 0.73, "tone": "negative"}
        if vix > 30 and credit_spread > 5.0:
            return {"name": "BEAR_EXPANSIVE", "label": "Stress Event", "confidence": 0.88, "tone": "negative"}
        return {"name": "NEUTRAL", "label": "Mixed Regime", "confidence": 0.60, "tone": "neutral"}

    def compute_spread_cost(self, data: dict[str, float]) -> float:
        breadth = data.get("orderbook_breadth", 10)
        depth = data.get("orderbook_depth", 50000)
        raw = max(0.0, (20 - breadth) * 0.001 + max(0.0, (100000 - depth)) / 10000000)
        return round(raw, 6)

    def compute_liquidity_score(self, data: dict[str, float]) -> float:
        spread_cost = data.get("spread_cost", 0.02)
        bid_ask_spread = data.get("bid_ask_spread", 0.001)
        score = 100 - (spread_cost * 1500) - (bid_ask_spread * 40000)
        return round(max(0, min(100, score)), 1)

    def compute_risk_appetite(self, data: dict[str, float]) -> dict[str, Any]:
        vix = data.get("vix", 20.0)
        credit = data.get("credit_spread", 3.0)
        momentum = data.get("equity_momentum", 0.0)
        vix_score = max(0, min(100, (30 - vix) / 30 * 100))
        credit_score = max(0, min(100, (6 - credit) / 6 * 100))
        momentum_score = max(0, min(100, 50 + momentum * 50))
        score = vix_score * 0.4 + credit_score * 0.35 + momentum_score * 0.25
        return {
            "score": round(score, 1),
            "vix_score": round(vix_score, 1),
            "credit_score": round(credit_score, 1),
            "momentum_score": round(momentum_score, 1),
        }

    def compute_market_conviction(self, data: dict[str, float]) -> dict[str, Any]:
        spx_change = data.get("spx_change_pct", 0.0)
        btc_change = data.get("btc_change_pct", 0.0)
        confidence = data.get("regime_confidence", 0.5)
        score = max(0, min(100, 50 + spx_change * 8 + btc_change * 6 + confidence * 20))
        tone = "positive" if score >= 60 else "negative" if score < 40 else "neutral"
        return {"score": round(score, 1), "tone": tone}

    def compute_trend_signal(self, data: dict[str, float]) -> dict[str, Any]:
        oil = data.get("oil_price", 80.0)
        dxy = data.get("dxy_price", 105.0)
        yield_10y = data.get("yield_10y", 4.0)
        btc_change = data.get("btc_change_pct", 0.0)
        score = 50 + btc_change * 4 - max(0, oil - 85) * 0.5 - max(0, dxy - 106) * 1.5 - max(0, yield_10y - 4.5) * 8
        score = max(0, min(100, score))
        tone = "positive" if score >= 60 else "negative" if score < 40 else "neutral"
        return {"score": round(score, 1), "tone": tone}
