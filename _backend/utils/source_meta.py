from __future__ import annotations

from collections.abc import Mapping

SOURCE_STATES = {"live", "cached", "fallback", "unavailable"}


def normalize_source_state(value: str | None) -> str:
    if value in SOURCE_STATES:
        return value
    return "fallback"


def aggregate_source_status(sources: Mapping[str, str] | None) -> str:
    if not sources:
        return "unavailable"

    states = {normalize_source_state(value) for value in sources.values()}
    if states == {"live"}:
        return "live"
    if states == {"cached"}:
        return "cached"
    if states == {"fallback"}:
        return "fallback"
    if states == {"unavailable"}:
        return "unavailable"
    return "mixed"


def source_counts(sources: Mapping[str, str] | None) -> dict[str, int]:
    counts = {"live": 0, "cached": 0, "fallback": 0, "unavailable": 0}
    if not sources:
        return counts

    for state in sources.values():
        counts[normalize_source_state(state)] += 1
    return counts
