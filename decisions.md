---
tags: [project, decisions]
---

# Liquidity Pulse — Decisions

## 2026-04-23
- **5 pages total** (Discovery, Liquidity Flows, Impacts, Hidden Trends, Ideas) — matching the 6 nav items minus Settings. Settings page not needed as a mockup at this stage.
- **Each page reuses the full app shell** from the reference Discovery page; only main content changes.
- **Hero panel content varies per page** but retains same layout (radial gradient background, node/benefit rows, center catalyst).
- **Metric cards row** appears at top of every page with page-relevant metrics.
- **File location**: `/home/thomas/Desktop/Dropbox/Projects/liquidity-pulse/` — moved from Desktop after preference was established.
- **New projects path preference**: `/home/thomas/Desktop/Dropbox/Projects/` — stored in Hermes memory and Obsidian.
- **Architecture decision: Vue 3 SPA** (CDN, no build step) + FastAPI backend — chosen because the design is already HTML/CSS, and Vue CDN lets us keep no-build-step simplicity while enabling reactive components.
- **Architecture decision: CCXT for crypto** — unified interface for Binance (and 100+ other exchanges), handles rate limiting, funding rates, orderbooks.
- **Architecture decision: yfinance for equities/FX/treasuries** — no API key needed, reliable Python library.
- **Architecture decision: FRED for macro** — free tier works without API key for many series.
- **Architecture decision: SignalEngine is rule-based v1** — simple if/else regime classifier. ML upgrade deferred to v2.
- **Architecture decision: mock fallbacks in frontend api.js** — backend offline shouldn't crash the UI; show last-known mock data.
- **Open design question**: table-like rows vs. card-based recommendations for the Ideas page.

## Open design question
- Should recommendation rows stay table-like, or become larger cards with more visual explainability? (noted from original reference file)
