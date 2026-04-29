import pytest
from httpx import ASGITransport, AsyncClient

from _backend.main import app
from _backend.routers import flows, ideas, impacts, market, trends
from _backend.services.cache import defillama_cache, crypto_cache, yahoo_cache


@pytest.fixture(autouse=True)
def _clear_caches():
    """Ensure each test starts with empty caches so caching doesn't leak between tests."""
    yahoo_cache.clear()
    defillama_cache.clear()
    crypto_cache.clear()
    yield


@pytest.mark.asyncio
async def test_health_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_market_snapshot_endpoint(monkeypatch):
    async def fake_fetch_index(symbol):
        mapping = {
            "^GSPC": {"symbol": symbol, "price": 5250.25, "change_pct": 0.41, "timestamp": "2026-04-23T19:46:00Z"},
            "^VIX": {"symbol": symbol, "price": 17.3, "change_pct": -4.2, "timestamp": "2026-04-23T19:46:00Z"},
        }
        return mapping.get(symbol, {"symbol": symbol, "price": 100.0, "change_pct": 0.0, "timestamp": "2026-04-23T19:46:00Z"})

    async def fake_fetch_stock(symbol):
        return {"symbol": symbol, "price": 67420.0, "change_pct": 1.82, "volume": 1000, "market_cap": 1, "timestamp": "2026-04-23T19:46:00Z"}

    async def fake_fetch_treasury(symbol):
        return {"symbol": "10YR", "yield": 4.312, "change_pct": 0.4, "timestamp": "2026-04-23T19:46:00Z"}

    async def fake_fetch_dxy():
        return {"symbol": "DXY", "price": 106.12, "change_pct": 0.15, "volume": 0, "market_cap": 0, "timestamp": "2026-04-23T19:46:00Z"}

    async def fake_fetch_commodity(symbol="oil"):
        return {"symbol": "OIL", "price": 83.4, "change_pct": 0.8, "volume": 0, "market_cap": 0, "timestamp": "2026-04-23T19:46:00Z"}

    monkeypatch.setattr(market.yahoo, "fetch_index", fake_fetch_index)
    monkeypatch.setattr(market.yahoo, "fetch_stock", fake_fetch_stock)
    monkeypatch.setattr(market.yahoo, "fetch_treasury", fake_fetch_treasury)
    monkeypatch.setattr(market.yahoo, "fetch_dxy", fake_fetch_dxy)
    monkeypatch.setattr(market.yahoo, "fetch_commodity", fake_fetch_commodity)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/market/snapshot")

    assert response.status_code == 200
    payload = response.json()
    assert "regime" in payload
    assert "metrics" in payload
    assert payload["spx"]["price"] == 5250.25
    assert len(payload["metrics"]) >= 4
    assert payload["source_status"] in {"live", "mixed", "fallback", "cached", "unavailable"}
    assert payload["sources"]["spx"] == "live"
    assert payload["sources"]["dxy"] == "live"
    assert payload["sources"]["oil"] == "live"
    # flow_leaders and transmission_nodes are now live-computed
    assert "flow_leaders" in payload
    assert "transmission_nodes" in payload
    assert "recommendations" in payload


@pytest.mark.asyncio
async def test_flows_depth_endpoint(monkeypatch):
    async def fake_fetch_orderbook(symbol, limit=20):
        return {"symbol": symbol, "bids": [[67400, 1.2]], "asks": [[67410, 1.1]], "timestamp": "2026-04-23T19:46:00Z"}

    monkeypatch.setattr(flows.crypto, "fetch_orderbook", fake_fetch_orderbook)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/flows/depth")

    assert response.status_code == 200
    payload = response.json()
    assert payload["bids"][0][0] == 67400
    assert payload["asks"][0][0] == 67410


@pytest.mark.asyncio
async def test_flows_tvl_endpoint_uses_live_source_when_provider_returns_data(monkeypatch):
    class FakeDefiLlama:
        async def fetch_tvl_chains(self, limit=5, chains=None):
            return [
                {"name": "Ethereum", "tvl": 45200000000, "change_pct": 2.4},
                {"name": "Arbitrum", "tvl": 8100000000, "change_pct": 3.1},
                {"name": "Solana", "tvl": 4200000000, "change_pct": 5.7},
                {"name": "Base", "tvl": 3600000000, "change_pct": 4.3},
                {"name": "BSC", "tvl": 3200000000, "change_pct": 1.5},
            ]

    monkeypatch.setattr(flows, "defillama", FakeDefiLlama())

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/flows/tvl")

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_status"] == "live"
    assert len(payload["chains"]) == 5
    assert payload["chains"][0]["name"] == "Ethereum"


@pytest.mark.asyncio
async def test_flows_tvl_endpoint_falls_back_when_provider_errors(monkeypatch):
    class FakeDefiLlama:
        async def fetch_tvl_chains(self, limit=5, chains=None):
            raise RuntimeError("defillama down")

    monkeypatch.setattr(flows, "defillama", FakeDefiLlama())

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/flows/tvl")

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_status"] == "unavailable"
    assert payload["chains"] == []


@pytest.mark.asyncio
async def test_ideas_summary_endpoint(monkeypatch):
    async def fake_fetch_stock(symbol):
        return {"symbol": symbol, "price": 100.0, "change_pct": 2.0, "volume": 1000, "market_cap": 1000000, "timestamp": "2026-04-23T19:46:00Z"}

    monkeypatch.setattr(ideas.yahoo, "fetch_stock", fake_fetch_stock)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/ideas/summary")

    assert response.status_code == 200
    payload = response.json()
    assert "ideas" in payload
    assert len(payload["ideas"]) >= 4
    assert payload["source_status"] in {"live", "mixed", "fallback", "cached", "unavailable"}
    assert "idea_quotes" in payload["sources"]


@pytest.mark.asyncio
async def test_flows_dashboard_reports_sources(monkeypatch):
    async def fake_fetch_orderbook(symbol, limit=20):
        return {"symbol": symbol, "bids": [[67400, 1.2]], "asks": [[67410, 1.1]], "timestamp": "2026-04-23T19:46:00Z"}

    async def fake_fetch_pair(symbol):
        return {"symbol": symbol, "price": 100.0, "change_pct": 1.0, "volume_24h": 1000.0, "timestamp": "2026-04-23T19:46:00Z"}

    async def fake_fetch_funding_rate(symbol):
        return {"symbol": symbol, "rate": 0.0001, "next_funding": 1713782400000}

    monkeypatch.setattr(flows.crypto, "fetch_orderbook", fake_fetch_orderbook)
    monkeypatch.setattr(flows.crypto, "fetch_pair", fake_fetch_pair)
    monkeypatch.setattr(flows.crypto, "fetch_funding_rate", fake_fetch_funding_rate)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/flows/dashboard")

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_status"] in {"live", "mixed", "fallback", "cached", "unavailable"}
    assert payload["sources"]["orderbook"] == "live"
    assert "tvl" in payload["sources"]


@pytest.mark.asyncio
async def test_impacts_summary_uses_live_inputs_when_providers_succeed(monkeypatch):
    async def fake_fetch_stock(symbol):
        mapping = {
            "XLU": {"symbol": symbol, "price": 68.4, "change_pct": 1.6, "volume": 1000, "market_cap": 1, "timestamp": "2026-04-23T19:46:00Z"},
            "XLI": {"symbol": symbol, "price": 122.1, "change_pct": 0.9, "volume": 1000, "market_cap": 1, "timestamp": "2026-04-23T19:46:00Z"},
            "XLK": {"symbol": symbol, "price": 195.2, "change_pct": -0.8, "volume": 1000, "market_cap": 1, "timestamp": "2026-04-23T19:46:00Z"},
            "KRE": {"symbol": symbol, "price": 48.5, "change_pct": 0.2, "volume": 1000, "market_cap": 1, "timestamp": "2026-04-23T19:46:00Z"},
            "HYG": {"symbol": symbol, "price": 77.2, "change_pct": -0.4, "volume": 1000, "market_cap": 1, "timestamp": "2026-04-23T19:46:00Z"},
            "LQD": {"symbol": symbol, "price": 107.8, "change_pct": 0.2, "volume": 1000, "market_cap": 1, "timestamp": "2026-04-23T19:46:00Z"},
            "BTC-USD": {"symbol": symbol, "price": 77420.0, "change_pct": 1.2, "volume": 1000, "market_cap": 1, "timestamp": "2026-04-23T19:46:00Z"},
        }
        return mapping[symbol]

    async def fake_fetch_index(symbol):
        return {"symbol": symbol, "price": 5275.0, "change_pct": 0.6, "timestamp": "2026-04-23T19:46:00Z"}

    async def fake_fetch_treasury(symbol):
        return {"symbol": "10YR", "yield": 4.21, "change_pct": 0.15, "timestamp": "2026-04-23T19:46:00Z"}

    async def fake_fetch_dxy():
        return {"symbol": "DXY", "price": 105.8, "date": "2026-04-23", "timestamp": "2026-04-23T19:46:00Z"}

    async def fake_fetch_commodity(series_id="DCOILBRENTEU"):
        return {"symbol": series_id, "price": 82.1, "date": "2026-04-23", "timestamp": "2026-04-23T19:46:00Z"}

    monkeypatch.setattr(impacts.yahoo, "fetch_stock", fake_fetch_stock)
    monkeypatch.setattr(impacts.yahoo, "fetch_index", fake_fetch_index)
    monkeypatch.setattr(impacts.yahoo, "fetch_treasury", fake_fetch_treasury)
    monkeypatch.setattr(impacts.yahoo, "fetch_dxy", fake_fetch_dxy)
    monkeypatch.setattr(impacts.yahoo, "fetch_commodity", fake_fetch_commodity)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/impacts/summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_status"] == "live"
    assert payload["sources"]["summary"] == "live"
    assert len(payload["metrics"]) == 4
    assert len(payload["events"]) >= 3


@pytest.mark.asyncio
async def test_impacts_summary_falls_back_when_providers_fail(monkeypatch):
    async def boom(*args, **kwargs):
        raise RuntimeError("provider down")

    monkeypatch.setattr(impacts.yahoo, "fetch_stock", boom)
    monkeypatch.setattr(impacts.yahoo, "fetch_index", boom)
    monkeypatch.setattr(impacts.yahoo, "fetch_treasury", boom)
    monkeypatch.setattr(impacts.yahoo, "fetch_dxy", boom)
    monkeypatch.setattr(impacts.yahoo, "fetch_commodity", boom)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/impacts/summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_status"] == "unavailable"
    assert payload["sources"]["summary"] == "unavailable"


@pytest.mark.asyncio
async def test_trends_summary_uses_live_inputs_when_providers_succeed(monkeypatch):
    async def fake_fetch_stock(symbol):
        mapping = {
            "VRT": {"symbol": symbol, "price": 100.0, "change_pct": 2.1, "volume": 1000, "market_cap": 1, "timestamp": "2026-04-23T19:46:00Z"},
            "ETN": {"symbol": symbol, "price": 110.0, "change_pct": 1.4, "volume": 1000, "market_cap": 1, "timestamp": "2026-04-23T19:46:00Z"},
            "CEG": {"symbol": symbol, "price": 120.0, "change_pct": 3.0, "volume": 1000, "market_cap": 1, "timestamp": "2026-04-23T19:46:00Z"},
            "HUBB": {"symbol": symbol, "price": 95.0, "change_pct": 0.9, "volume": 1000, "market_cap": 1, "timestamp": "2026-04-23T19:46:00Z"},
            "ANET": {"symbol": symbol, "price": 260.0, "change_pct": 0.6, "volume": 1000, "market_cap": 1, "timestamp": "2026-04-23T19:46:00Z"},
            "PWR": {"symbol": symbol, "price": 240.0, "change_pct": 0.8, "volume": 1000, "market_cap": 1, "timestamp": "2026-04-23T19:46:00Z"},
            "NVT": {"symbol": symbol, "price": 88.0, "change_pct": -0.3, "volume": 1000, "market_cap": 1, "timestamp": "2026-04-23T19:46:00Z"},
            "BTC-USD": {"symbol": symbol, "price": 77420.0, "change_pct": 1.1, "volume": 1000, "market_cap": 1, "timestamp": "2026-04-23T19:46:00Z"},
        }
        return mapping[symbol]

    class FakeDefiLlama:
        async def fetch_tvl_chains(self, limit=5, chains=None):
            return [
                {"name": "Ethereum", "tvl": 45200000000, "change_pct": 0.4},
                {"name": "Arbitrum", "tvl": 8100000000, "change_pct": 1.2},
                {"name": "Solana", "tvl": 4200000000, "change_pct": 2.4},
                {"name": "Base", "tvl": 3600000000, "change_pct": 1.9},
                {"name": "BSC", "tvl": 3200000000, "change_pct": 0.2},
            ]

    monkeypatch.setattr(trends.yahoo, "fetch_stock", fake_fetch_stock)
    monkeypatch.setattr(trends, "defillama", FakeDefiLlama())

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/trends/summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_status"] == "live"
    assert payload["sources"]["summary"] == "live"
    assert len(payload["anomalies"]) >= 3
    assert len(payload["trend_cards"]) >= 3


@pytest.mark.asyncio
async def test_trends_summary_falls_back_when_providers_fail(monkeypatch):
    async def boom(*args, **kwargs):
        raise RuntimeError("provider down")

    class FakeDefiLlama:
        async def fetch_tvl_chains(self, limit=5, chains=None):
            raise RuntimeError("provider down")

    monkeypatch.setattr(trends.yahoo, "fetch_stock", boom)
    monkeypatch.setattr(trends, "defillama", FakeDefiLlama())

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/trends/summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_status"] == "unavailable"
    assert payload["sources"]["summary"] == "unavailable"
