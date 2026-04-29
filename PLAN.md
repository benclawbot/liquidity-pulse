# Liquidity Pulse — Remaining Work

## Done ✓
- Flows: depth chart (stepped bid/ask SVG + Book Imbalance panel)
- Impacts: transmission chain map (animated SVG origin → paths → center → affected cards)
- Impacts: correlation heatmap (colour-coded N×N grid)
- Trends: correlation heatmap hero panel
- Trends: trend cards with stats row
- Flows: Funding Rates mini progress bars + venue badges
- Flows: TVL panels with mini progress bars + venue badges
- Ideas: tab bar (All / DeFi / Macro / Sector / Narrative filters)
- Ideas: scoring criteria panel (methodology, confidence thresholds, risk labels)
- Ideas: idea card meta grid (sector tag, confidence badge, risk label, timeframe)
- Backend: fixed `_backend/` import paths, updated test patches, all 27 tests passing

## Mockup files
- `/home/thomas/Dropbox/Projects/liquidity-pulse/liquidity-dashboard-mockup.html`
- `/home/thomas/Dropbox/Projects/liquidity-pulse/liquidity-flows-mockup.html` — flows tab only
- `/home/thomas/Dropbox/Projects/liquidity-pulse/liquidity-impacts-mockup.html`
- `/home/thomas/Dropbox/Projects/liquidity-pulse/liquidity-hidden-trends-mockup.html`
- `/home/thomas/Dropbox/Projects/liquidity-pulse/liquidity-ideas-mockup.html`

## Frontend source
- `/home/thomas/Desktop/Dropbox/Projects/liquidity-pulse/frontend/`
  - `js/app.js` — main render logic
  - `css/design-system.css` — all styles
  - `js/api.js` — data fetching
  - `js/helpers.js` — formatting utils
  - `js/constants.js` — nav items, route titles

## Data shape notes
`renderCorrelationHeatmap()` expects: `[{ pair: string, values: number[] }]`
`renderDepthChart()` expects: `data.depth.bids: [price, size][]` and `data.depth.asks: [price, size][]`
`renderImpacts()` expects: `data.transmission_chain: [{ from, to, order, tone, note }]`, `data.center_catalyst: { title, headline, body, lag, confidence }`
