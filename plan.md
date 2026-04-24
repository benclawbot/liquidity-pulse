---
tags: [project, plan]
---

# Liquidity Pulse — Plan

## Plan document
Full implementation plan: `ARCHITECTURE.md`

## Architecture overview
- **Frontend:** Vue 3 SPA (CDN, no build step), Chart.js for charts, shared design system CSS
- **Backend:** FastAPI + Python 3.11, async data fetchers
- **Data:** yfinance (equities/FX), CCXT/Binance (crypto), FRED (macro), computed signals locally
- **Testing:** pytest + pytest-asyncio (backend), Vitest (frontend)

## Execution phases

### Phase 1 — Project scaffold
- [ ] Create directory structure
- [ ] Extract design system CSS
- [ ] Create Vue app shell (index.html + app.js + constants.js + api.js)

### Phase 2 — Backend core (TDD)
- [ ] YahooFinanceService + tests
- [ ] FredService + tests
- [ ] CryptoService (CCXT) + tests
- [ ] SignalEngine (regime, liquidity, risk appetite) + tests
- [ ] FastAPI routers + integration tests

### Phase 3 — Frontend SPA
- [ ] Rewrite Vue pages as components with real API calls
- [ ] Mock fallbacks when backend offline
- [ ] Chart.js integration for depth chart, heatmap, trend cards

### Phase 4 — Integration
- [ ] All backend tests green
- [ ] All frontend tests green
- [ ] End-to-end: API → signal engine → Vue component renders
- [ ] Serve frontend + backend together

## Done
- [x] 5 HTML mockup pages built and verified
- [x] Files moved to `/home/thomas/Desktop/Dropbox/Projects/liquidity-pulse/`
- [x] Architecture plan written in `ARCHITECTURE.md`
- [x] TDD approach defined with exact test commands
- [x] Data sources documented (all free APIs)

## Last updated
2026-04-23
