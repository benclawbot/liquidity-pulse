from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import requests

OBSERVATIONS_URL = "https://api.stlouisfed.org/fred/series/observations"


class FredServiceError(Exception):
    pass


class MissingDataError(FredServiceError):
    pass


class FredService:
    def __init__(self, api_key: str | None = None, session: requests.Session | None = None):
        self.api_key = api_key
        self.session = session or requests.Session()

    async def fetch_series(self, series_id: str, limit: int = 10) -> dict[str, Any]:
        params = {
            "series_id": series_id,
            "file_type": "json",
            "sort_order": "desc",
            "limit": limit,
        }
        if self.api_key:
            params["api_key"] = self.api_key

        payload = await asyncio.to_thread(self._get_json, params)
        observations = payload.get("observations", [])
        for observation in observations:
            value = observation.get("value")
            if value in (None, "."):
                continue
            try:
                price = float(value)
            except (TypeError, ValueError):
                continue
            return {
                "series_id": series_id,
                "price": price,
                "date": observation.get("date"),
            }
        raise MissingDataError(f"No numeric observation available for {series_id}")

    async def fetch_commodity(self, series_id: str = "DCOILBRENTEU") -> dict[str, Any]:
        observation = await self.fetch_series(series_id)
        return self._format_quote(series_id, observation)

    async def fetch_dxy(self) -> dict[str, Any]:
        observation = await self.fetch_series("DTWEXBGS")
        return self._format_quote("DXY", observation)

    def _get_json(self, params: dict[str, Any]) -> dict[str, Any]:
        response = self.session.get(OBSERVATIONS_URL, params=params, timeout=10)
        if response.status_code == 400 or response.status_code == 403:
            raise FredServiceError(f"FRED API returned {response.status_code} — check API key (no key = public endpoints only)")
        response.raise_for_status()
        return response.json()

    @staticmethod
    def _format_quote(symbol: str, observation: dict[str, Any]) -> dict[str, Any]:
        return {
            "symbol": symbol,
            "price": observation["price"],
            "date": observation["date"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
