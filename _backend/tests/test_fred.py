import pytest

from _backend.services.fred import FredService, MissingDataError


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


@pytest.fixture
def service():
    return FredService()


@pytest.mark.asyncio
async def test_fetch_commodity_returns_latest_numeric_observation(service, monkeypatch):
    payload = {
        "observations": [
            {"date": "2026-04-22", "value": "."},
            {"date": "2026-04-21", "value": "83.44"},
        ]
    }

    monkeypatch.setattr(service.session, "get", lambda *args, **kwargs: FakeResponse(payload))
    result = await service.fetch_commodity("DCOILBRENTEU")

    assert result["symbol"] == "DCOILBRENTEU"
    assert result["price"] == 83.44
    assert result["date"] == "2026-04-21"
    assert "timestamp" in result


@pytest.mark.asyncio
async def test_fetch_dxy_maps_series_id_to_dxy_symbol(service, monkeypatch):
    payload = {"observations": [{"date": "2026-04-22", "value": "106.12"}]}
    monkeypatch.setattr(service.session, "get", lambda *args, **kwargs: FakeResponse(payload))
    result = await service.fetch_dxy()

    assert result["symbol"] == "DXY"
    assert result["price"] == 106.12


@pytest.mark.asyncio
async def test_fetch_series_raises_when_no_numeric_observations_exist(service, monkeypatch):
    payload = {"observations": [{"date": "2026-04-22", "value": "."}]}
    monkeypatch.setattr(service.session, "get", lambda *args, **kwargs: FakeResponse(payload))
    with pytest.raises(MissingDataError):
        await service.fetch_series("EMPTY")
