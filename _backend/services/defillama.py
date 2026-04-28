from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Iterable

import requests

from .cache import defillama_cache


DEFAULT_CHAINS = ["Ethereum", "Arbitrum", "Solana", "Base", "BSC"]


class MissingDataError(RuntimeError):
    pass


@dataclass(slots=True)
class DefiLlamaService:
    base_url: str = "https://api.llama.fi"
    request_timeout_seconds: float = 8.0
    session: requests.Session = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self.session = requests.Session()

    def _get_json(self, path: str, timeout: float | None = None) -> Any:
        response = self.session.get(f"{self.base_url}{path}", timeout=timeout or self.request_timeout_seconds)
        response.raise_for_status()
        return response.json()

    async def _fetch_chain_history_change(self, chain: str) -> float:
        try:
            history = await asyncio.to_thread(self._get_json, f"/v2/historicalChainTvl/{chain}", 0.8)
        except Exception:
            return 0.0

        previous, latest = _last_two_positive_tvl_points(history)
        if previous <= 0:
            return 0.0
        return ((latest - previous) / previous) * 100

    async def fetch_tvl_chains(self, limit: int = 5, chains: Iterable[str] | None = None) -> list[dict[str, Any]]:
        selected = list(chains or DEFAULT_CHAINS)[: max(1, limit)]
        cache_key = f"tvl_chains:{','.join(selected)}"

        # Try cache first
        cached = defillama_cache.get(cache_key)
        if cached is not None:
            return cached

        chain_payload = await asyncio.to_thread(self._get_json, "/v2/chains", self.request_timeout_seconds)
        current_by_name = {
            item.get("name"): float(item.get("tvl") or 0)
            for item in chain_payload
            if item.get("name")
        }

        if not current_by_name:
            raise MissingDataError("No TVL data returned by DefiLlama")

        changes = await asyncio.gather(*[self._fetch_chain_history_change(chain) for chain in selected])

        results: list[dict[str, Any]] = []
        for chain, change_pct in zip(selected, changes):
            tvl_value = current_by_name.get(chain)
            if tvl_value is None:
                continue
            results.append({"name": chain, "tvl": tvl_value, "change_pct": round(change_pct, 2)})

        if not results:
            raise MissingDataError("Requested chains not found in DefiLlama response")

        defillama_cache.set(cache_key, results)
        return results


def _last_two_positive_tvl_points(history: Any) -> tuple[float, float]:
    if not isinstance(history, list):
        return 0.0, 0.0

    positives = [float(point.get("tvl") or 0) for point in history if isinstance(point, dict) and float(point.get("tvl") or 0) > 0]
    if len(positives) < 2:
        return 0.0, positives[-1] if positives else 0.0

    return positives[-2], positives[-1]
