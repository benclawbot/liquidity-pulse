import pytest
from types import SimpleNamespace

from _backend.services.yahoo_finance import MissingDataError, YahooFinanceService


class FakeTicker:
    def __init__(self, symbol):
        self.symbol = symbol
        self.fast_info = {
            "lastPrice": {
                "^GSPC": 5250.25,
                "^VIX": 18.4,
                "AAPL": 202.12,
                "^TNX": 4.31,
            }.get(symbol),
            "previousClose": {
                "^GSPC": 5200.0,
                "^VIX": 19.1,
                "AAPL": 198.0,
                "^TNX": 4.25,
            }.get(symbol),
            "lastVolume": 1234567,
            "marketCap": 3100000000000,
        }

    def history(self, period="1mo", interval="1d"):
        class FakeHistory:
            empty = False

            def iterrows(self):
                rows = [
                    (SimpleNamespace(strftime=lambda fmt: "2026-04-21"), {"Open": 100.0, "High": 110.0, "Low": 95.0, "Close": 108.0, "Volume": 1000}),
                    (SimpleNamespace(strftime=lambda fmt: "2026-04-22"), {"Open": 108.0, "High": 112.0, "Low": 107.0, "Close": 111.0, "Volume": 1500}),
                ]
                return iter(rows)

        return FakeHistory()


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setattr("backend.services.yahoo_finance.yf.Ticker", FakeTicker)
    return YahooFinanceService()


@pytest.mark.asyncio
async def test_fetch_index(service):
    result = await service.fetch_index("^GSPC")
    assert result["symbol"] == "^GSPC"
    assert result["price"] == 5250.25
    assert result["change_pct"] == pytest.approx(0.97, rel=1e-2)
    assert "timestamp" in result


@pytest.mark.asyncio
async def test_fetch_treasury(service):
    result = await service.fetch_treasury("10yr")
    assert result["symbol"] == "10YR"
    assert result["yield"] == 4.31
    assert result["change_pct"] == pytest.approx(1.41, rel=1e-2)


@pytest.mark.asyncio
async def test_fetch_stock(service):
    result = await service.fetch_stock("AAPL")
    assert result["symbol"] == "AAPL"
    assert result["price"] == 202.12
    assert result["volume"] == 1234567
    assert result["market_cap"] == 3100000000000


@pytest.mark.asyncio
async def test_fetch_history(service):
    result = await service.fetch_history("AAPL")
    assert len(result) == 2
    assert result[-1]["close"] == 111.0
    assert result[-1]["volume"] == 1500


@pytest.mark.asyncio
async def test_missing_price_raises(monkeypatch):
    class BrokenTicker:
        def __init__(self, symbol):
            self.fast_info = {"previousClose": 1.0}

    monkeypatch.setattr("backend.services.yahoo_finance.yf.Ticker", BrokenTicker)
    service = YahooFinanceService()
    with pytest.raises(MissingDataError):
        await service.fetch_stock("BROKEN")
