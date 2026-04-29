from _backend.services.signal_engine import SignalEngine


engine = SignalEngine()


def test_classify_regime_bull_expansive():
    regime = engine.classify_regime(
        {
            "vix": 14.2,
            "treasury_10y": 4.3,
            "treasury_2y": 4.0,
            "credit_spread": 2.7,
            "btc_change_pct": 2.4,
            "dxy_change_pct": -0.3,
        }
    )
    assert regime["name"] == "BULL_EXPANSIVE"
    assert regime["tone"] == "positive"
    assert 0 <= regime["confidence"] <= 1


def test_classify_regime_bear_narrow():
    regime = engine.classify_regime(
        {
            "vix": 26.0,
            "treasury_10y": 4.0,
            "treasury_2y": 4.4,
            "credit_spread": 4.2,
            "btc_change_pct": -2.2,
            "dxy_change_pct": 0.6,
        }
    )
    assert regime["name"].startswith("BEAR")
    assert regime["tone"] == "negative"


def test_compute_liquidity_score_is_bounded():
    score = engine.compute_liquidity_score({"spread_cost": 0.03, "bid_ask_spread": 0.0015})
    assert 0 <= score <= 100


def test_compute_spread_cost_is_non_negative():
    cost = engine.compute_spread_cost({"orderbook_breadth": 12, "orderbook_depth": 75000})
    assert cost >= 0


def test_compute_risk_appetite_contains_score():
    result = engine.compute_risk_appetite({"vix": 17.0, "credit_spread": 2.9, "equity_momentum": 0.4})
    assert 0 <= result["score"] <= 100
    assert "vix_score" in result
