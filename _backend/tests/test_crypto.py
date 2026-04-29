import pytest
from unittest.mock import MagicMock, patch

from _backend.services.crypto import CryptoService


@pytest.fixture
def service():
    with patch("backend.services.crypto.ccxt.binance") as mock_binance:
        exchange = MagicMock()
        mock_binance.return_value = exchange
        yield CryptoService()


@pytest.mark.asyncio
async def test_fetch_pair(service):
    service.exchange.fetch_ticker.return_value = {
        "last": 67400.5,
        "percentage": 1.82,
        "quoteVolume": 123456789.0,
    }
    result = await service.fetch_pair("BTC/USDT")
    assert result["symbol"] == "BTC/USDT"
    assert result["price"] == 67400.5
    assert result["change_pct"] == 1.82
    assert result["volume_24h"] == 123456789.0
    assert "timestamp" in result


@pytest.mark.asyncio
async def test_fetch_funding_rate(service):
    service.exchange.fetch_funding_rate.return_value = {
        "fundingRate": 0.00012,
        "nextFundingTime": 1713782400000,
    }
    result = await service.fetch_funding_rate("BTC/USDT")
    assert result["symbol"] == "BTC/USDT"
    assert result["rate"] == 0.00012
    assert result["next_funding"] == 1713782400000


@pytest.mark.asyncio
async def test_fetch_orderbook(service):
    service.exchange.fetch_order_book.return_value = {
        "bids": [[67400, 1.2], [67390, 2.4]],
        "asks": [[67410, 1.1], [67420, 2.2]],
    }
    result = await service.fetch_orderbook("BTC/USDT", limit=2)
    assert result["symbol"] == "BTC/USDT"
    assert len(result["bids"]) == 2
    assert len(result["asks"]) == 2
    assert result["bids"][0][0] == 67400
