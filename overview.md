---
tags: [project, dashboard, market-intelligence]
status: active
---

# Liquidity Pulse

## Goal
Build a real-time institutional market intelligence dashboard that aggregates US equity/crypto/macro data, computes liquidity and flow signals, detects hidden cross-asset trends, and surfaces actionable trade ideas.

## Summary
5-page dashboard. Phase 1: HTML mockups built and verified. Phase 2: Full implementation — Vue 3 SPA + FastAPI backend + signal engine + free data sources (yfinance, FRED, CCXT). TDD approach throughout.

## Architecture
Full plan: `ARCHITECTURE.md`

## Tech / Stack
- **Frontend:** Vue 3 (CDN, no build step), Chart.js, shared CSS design system
- **Backend:** FastAPI (Python 3.11+), async data fetchers
- **Data:** yfinance, FRED API, CCXT/Binance
- **Testing:** pytest + pytest-asyncio, Vitest

## File location
`/home/thomas/Desktop/Dropbox/Projects/liquidity-pulse/`

## Pages
1. **Discovery** — market snapshot: SPX, VIX, BTC, 10Y yield, regime classification
2. **Liquidity Flows** — depth chart, funding rates, TVL by chain, cross-exchange spread
3. **Market Impacts** — transmission chain map, rate sensitivity matrix, correlation matrix
4. **Hidden Trends** — cross-asset correlation heatmap, positioning anomalies, trend cards
5. **Ideas** — tabbed trade ideas with conviction/signal/entry/time badges, watchlist

## Decisions
- [[liquidity-pulse/decisions]]

## Status
- [[liquidity-pulse/status]]

## Plan
- [[liquidity-pulse/plan]]

## Related
- [[Conversations/2026/2026-04/2026-04-23]]
