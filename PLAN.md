# Liquidity Pulse — Remaining Work

## Done ✓
- Flows: depth chart (stepped bid/ask SVG + Book Imbalance panel)
- Impacts: transmission chain map (animated SVG origin → paths → center → affected cards)
- Impacts: correlation heatmap (colour-coded N×N grid)
- Trends: correlation heatmap hero panel
- Trends: trend cards with stats row

## Still Todo

### HIGH
1. **Flows: Funding Rates mini progress bars + venue badges**
   - Currently plain table rows
   - Mockup: each row has a left-coloured border, venue chip, and mini progress bar showing relative rate size
   - File: `renderFlows()` in `frontend/js/app.js`

2. **Flows: TVL panels with mini progress bars + venue badges**
   - Same pattern as Funding Rates — replace plain numbers with styled mini bars and venue chips

### MEDIUM
3. **Ideas: tab bar (5 filter tabs)**
   - Mockup has: All / DeFi / Macro / Sector / Narrative filters
   - Add above the ideas grid, with active state styling

4. **Ideas: scoring criteria panel**
   - Right-hand panel showing methodology, confidence thresholds, risk labels
   - `renderIdeas()` needs a two-column layout split-grid

5. **Ideas: idea card meta grid (4-col pills/tags)**
   - Each idea card should show: sector tag, confidence badge, risk label, timeframe
   - Currently rendered but minimal

### LOW
6. **Settings page** — placeholder, not critical

### CSS cleanup (noted during implementation)
- Some old classes (`.cross-flow-*`, `.chain-table`, `.pool-*`) were removed/replaced — verify nothing in `app.js` still references them

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
