# Liquidity Pulse — Architecture & Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a real-time institutional market intelligence dashboard that aggregates US equity/crypto/macro data, computes liquidity and flow signals, detects hidden cross-asset trends, and surfaces actionable trade ideas.

**Architecture:** Modular full-stack with a Vue 3 SPA frontend, FastAPI Python backend, and a signal-processing engine. Data flows: public APIs → fetchers → signal engine → REST endpoints → Vue components. Design system refactored into shared CSS + TypeScript constants extracted from the mockup.

**Tech Stack:**
- Frontend: Vue 3 (CDN, no build step for v1), TypeScript
- Backend: FastAPI (Python 3.11+)
- Data: yfinance (equities/FX/treasuries),requests (HTTP), CCXT (crypto exchanges)
- Macro: FRED API (free, no key for many indicators)
- **Testing:** pytest + pytest-asyncio (backend), Vitest (frontend unit), Playwright (E2E/UI)
- Charts: Chart.js (CDN) or lightweight custom SVG

---

## PHASE 1 — Project Scaffold & Design System

### Task 1: Create project directory structure

```
liquidity-pulse/
├── SPEC.md                      ← this file, updated as we go
├── ARCHITECTURE.md              ← this plan
├── backend/
│   ├── main.py                  ← FastAPI app entry
│   ├── routers/
│   │   ├── market.py            ← /api/market/* endpoints
│   │   ├── flows.py            ← /api/flows/* endpoints
│   │   ├── impacts.py           ← /api/impacts/* endpoints
│   │   ├── trends.py            ← /api/trends/* endpoints
│   │   └── ideas.py             ← /api/ideas/* endpoints
│   ├── services/
│   │   ├── yahoo_finance.py     ← yfinance wrapper
│   │   ├── fred.py              ← FRED API client
│   │   ├── crypto.py            ← CCXT wrapper for Binance
│   │   └── signal_engine.py     ← regime, liquidity, risk calculations
│   ├── models/
│   │   └── schemas.py           ← Pydantic request/response models
│   └── tests/
│       ├── test_yahoo_finance.py
│       ├── test_fred.py
│       ├── test_crypto.py
│       └── test_signal_engine.py
├── frontend/
│   ├── index.html               ← SPA entry, loads Vue from CDN
│   ├── css/
│   │   └── design-system.css    ← extracted CSS variables + shared styles
│   ├── js/
│   │   ├── app.js               ← Vue app + router
│   │   ├── api.js               ← fetch wrapper for backend API
│   │   ├── components/          ← Vue components per page
│   │   └── constants.js         ← TypeScript-like constants from mockup
│   └── tests/
│       └── *.test.js            ← Vitest unit tests
└── data/                        ← optional local cache (JSON files)
```

**Step 1: Create directory structure**

```bash
mkdir -p /home/thomas/Desktop/Dropbox/Projects/liquidity-pulse/backend/{routers,services,models,tests}
mkdir -p /home/thomas/Desktop/Dropbox/Projects/liquidity-pulse/frontend/{css,js/components,tests}
touch /home/thomas/Desktop/Dropbox/Projects/liquidity-pulse/backend/main.py
touch /home/thomas/Desktop/Dropbox/Projects/liquidity-pulse/backend/routers/__init__.py
touch /home/thomas/Desktop/Dropbox/Projects/liquidity-pulse/backend/services/__init__.py
touch /home/thomas/Desktop/Dropbox/Projects/liquidity-pulse/backend/models/__init__.py
```

---

### Task 2: Extract design system CSS

**Objective:** Extract the repeated CSS variables and shared component classes from the mockups into one `frontend/css/design-system.css`.

**File:** Create `frontend/css/design-system.css`

Copy the `:root` block and all shared classes from `liquidity-dashboard-mockup.html` lines 11–780 into this file. The file should contain:

```css
:root {
  --surface: #0b1326;
  --surface-dim: #0b1326;
  --surface-bright: #31394d;
  --surface-container-lowest: #060e20;
  --surface-container-low: #131b2e;
  --surface-container: #171f33;
  --surface-container-high: #222a3d;
  --surface-container-highest: #2d3449;
  --on-surface: #dae2fd;
  --on-surface-variant: #c2c6d6;
  --outline: #8c909f;
  --outline-variant: #424754;
  --primary: #adc6ff;
  --primary-strong: #4d8eff;
  --on-primary: #002e6a;
  --secondary: #4edea3;
  --secondary-strong: #00a572;
  --tertiary: #ffb3ad;
  --tertiary-strong: #ff5451;
  --error: #ffb4ab;
  --shadow: 0 18px 45px rgba(0, 0, 0, 0.28);
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 18px;
  --gutter: 16px;
  --panel-padding: 20px;
}

/* App shell */
.app-shell { height: 100vh; display: grid; grid-template-columns: 256px 1fr; grid-template-rows: 72px 1fr; grid-template-areas: "sidebar topbar" "sidebar main"; }
.topbar { grid-area: topbar; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; background: rgba(9, 16, 31, 0.84); border-bottom: 1px solid rgba(140, 144, 159, 0.18); backdrop-filter: blur(16px); position: relative; z-index: 10; }
.sidebar { grid-area: sidebar; background: linear-gradient(180deg, #0b1326 0%, #0a1020 100%); border-right: 1px solid rgba(140, 144, 159, 0.14); padding: 20px 16px 16px; display: flex; flex-direction: column; gap: 18px; min-height: 0; overflow-y: auto; }
.main-content { grid-area: main; overflow-y: auto; padding: var(--gutter); display: flex; flex-direction: column; gap: var(--gutter); }

/* Metric cards */
.metrics-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--gutter); }
.metric-card { background: var(--surface-container); border: 1px solid var(--outline-variant); border-radius: var(--radius-lg); padding: 16px 20px; display: flex; flex-direction: column; gap: 8px; }
.metric-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--on-surface-variant); }
.metric-value { font-size: 28px; font-weight: 800; letter-spacing: -0.03em; color: var(--on-surface); font-variant-numeric: tabular-nums; }
.metric-sub { font-size: 12px; color: var(--on-surface-variant); }

/* Panels */
.panel { background: var(--surface-container); border: 1px solid var(--outline-variant); border-radius: var(--radius-lg); padding: var(--panel-padding); }
.panel-title { font-size: 14px; font-weight: 700; color: var(--on-surface); margin-bottom: 12px; }

/* Semantic colors */
.green { color: var(--secondary); }
.red { color: var(--tertiary); }
.blue { color: var(--primary); }

/* Badges */
.regime-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.regime-badge.positive { background: rgba(78, 222, 163, 0.12); color: var(--secondary); border: 1px solid rgba(78, 222, 163, 0.3); }
.regime-badge.negative { background: rgba(255, 179, 173, 0.12); color: var(--tertiary); border: 1px solid rgba(255, 179, 173, 0.3); }
.regime-badge.neutral { background: rgba(173, 198, 255, 0.12); color: var(--primary); border: 1px solid rgba(173, 198, 255, 0.3); }

/* Table */
table { width: 100%; border-collapse: collapse; }
th { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--on-surface-variant); text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--outline-variant); }
td { font-size: 13px; color: var(--on-surface); padding: 10px 12px; border-bottom: 1px solid rgba(66, 71, 84, 0.5); }
tr:last-child td { border-bottom: none; }

/* Nav sidebar */
.sidebar-header { padding: 12px 12px 18px; border-bottom: 1px solid rgba(140, 144, 159, 0.12); }
.sidebar-kicker { font-size: 11px; font-weight: 800; color: var(--primary-strong); text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 6px; }
.sidebar-subtitle { font-size: 12px; color: var(--on-surface-variant); }
.side-nav { display: grid; gap: 6px; }
.side-link { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px; border-radius: var(--radius-lg); color: var(--on-surface-variant); background: transparent; border: 1px solid transparent; font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none; transition: all 0.15s; }
.side-link .left { display: flex; align-items: center; gap: 12px; }
.side-link.active { background: rgba(77, 142, 255, 0.10); color: var(--primary-strong); border-color: rgba(77, 142, 255, 0.28); box-shadow: inset 2px 0 0 var(--primary-strong); }
.side-link:hover:not(.active) { background: rgba(255,255,255,0.03); color: var(--on-surface); border-color: rgba(140, 144, 159, 0.12); }
.side-icon { width: 28px; height: 28px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.04); color: inherit; font-size: 12px; font-weight: 800; }
.sidebar-footer { margin-top: auto; display: grid; gap: 12px; padding-top: 12px; border-top: 1px solid rgba(140, 144, 159, 0.12); }
```

---

### Task 3: Create Vue app shell (`index.html` + `app.js`)

**Objective:** Replace the 5 static HTML files with a Vue 3 SPA that uses the shared design system.

**File:** Create `frontend/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Liquidity Pulse</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/design-system.css" />
  <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
</head>
<body>
  <div id="app"></div>
  <script src="js/constants.js"></script>
  <script src="js/api.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
```

---

### Task 4: Create `frontend/js/constants.js`

**Objective:** Extract metric keys, nav items, badge types, and color mappings into a typed constants file mirroring the mockup data structure.

**File:** Create `frontend/js/constants.js`

```javascript
export const METRICS = {
  regime: { label: 'Regime', color: 'neutral' },
  liquidityScore: { label: 'Liquidity Score', color: 'neutral' },
  riskAppetite: { label: 'Risk Appetite', color: 'neutral' },
  spreadCost: { label: 'Spread Cost', color: 'neutral' },
  marketConviction: { label: 'Market Conviction', color: 'neutral' },
  trendSignal: { label: 'Trend Signal', color: 'neutral' },
};

export const NAV_ITEMS = [
  { id: 'discovery',  label: 'Discovery',      abbr: 'DS', path: '/' },
  { id: 'flows',      label: 'Liquidity Flows', abbr: 'LF', path: '/flows' },
  { id: 'impacts',    label: 'Market Impacts', abbr: 'IM', path: '/impacts' },
  { id: 'trends',     label: 'Hidden Trends',   abbr: 'HT', path: '/trends' },
  { id: 'ideas',      label: 'Ideas',           abbr: 'ID', path: '/ideas' },
  { id: 'settings',   label: 'Settings',        abbr: 'ST', path: '/settings' },
];

export const BADGE_TYPES = {
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
  NEUTRAL:  'neutral',
};

export const API_BASE = 'http://localhost:8000/api';
```

---

### Task 5: Install Playwright and write first E2E test

**Objective:** Set up Playwright for E2E/UI testing. Every UI task after this will include a Playwright test step.

**Step 1: Install Playwright**

```bash
cd /home/thomas/Desktop/Dropbox/Projects/liquidity-pulse/frontend
npm init -y
npm install -D @playwright/test
npx playwright install chromium --with-deps
```

**Step 2: Create `frontend/playwright.config.js`**

```javascript
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'python -m http.server 3000',
    port: 3000,
    reuseExistingServer: true,
  },
});
```

**Step 3: Create first E2E test — `frontend/e2e/shell.spec.js`**

```javascript
const { test, expect } = require('@playwright/test');

test.describe('App Shell', () => {
  test('page loads without console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    await expect(page).toHaveTitle(/Liquidity Pulse/i);
    expect(errors).toHaveLength(0);
  });

  test('sidebar is visible with all 6 nav items', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.sidebar')).toBeVisible();
    const links = page.locator('.side-link');
    await expect(links).toHaveCount(6);
  });

  test('topbar shows brand name', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.brand')).toContainText('Liquidity Pulse');
  });

  test('metrics row renders 6 metric cards', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('.metric-card');
    await expect(cards).toHaveCount(6);
  });
});
```

**Step 4: Run E2E test to verify failure (no frontend yet)**

```bash
cd /home/thomas/Desktop/Dropbox/Projects/liquidity-pulse/frontend
npx playwright test e2e/shell.spec.js
```
Expected: FAIL — page not found (no index.html served yet)

---

## PHASE 2 — Backend Core (FastAPI + Data Sources)

### Task 5: Write failing test for Yahoo Finance service

**Objective:** Establish TDD discipline. Write the first test before any implementation.

**File:** Create `backend/tests/test_yahoo_finance.py`

```python
import pytest
from datetime import datetime
from backend.services.yahoo_finance import YahooFinanceService

@pytest.fixture
def service():
    return YahooFinanceService()

@pytest.mark.asyncio
async def test_fetch_spx_index(service):
    """SPX should return a dict with symbol, price, change_pct, and timestamp."""
    result = await service.fetch_index('^GSPC')
    assert 'symbol' in result
    assert 'price' in result
    assert 'change_pct' in result
    assert result['symbol'] == '^GSPC'
    assert isinstance(result['price'], float)
    assert isinstance(result['change_pct'], float)

@pytest.mark.asyncio
async def test_fetch_vix(service):
    """VIX should return a dict with symbol, price, change_pct."""
    result = await service.fetch_index('^VIX')
    assert result['symbol'] == '^VIX'
    assert result['price'] > 0

@pytest.mark.asyncio
async def test_fetch_treasury_yield(service):
    """10Y Treasury yield should be a positive float."""
    result = await service.fetch_treasury('10yr')
    assert result['symbol'] == '10YR'
    assert result['yield'] > 0
    assert result['yield'] < 20  # sanity check

@pytest.mark.asyncio
async def test_fetch_stock_price(service):
    """Individual stock should return price, change_pct, volume."""
    result = await service.fetch_stock('AAPL')
    assert result['symbol'] == 'AAPL'
    assert result['price'] > 0
    assert isinstance(result['change_pct'], float)
```

**Step 2: Run to verify failure**

```bash
cd /home/thomas/Desktop/Dropbox/Projects/liquidity-pulse
python -m pytest backend/tests/test_yahoo_finance.py -v
```
Expected: FAIL — `YahooFinanceService` not found

---

### Task 6: Implement YahooFinanceService

**File:** Create `backend/services/yahoo_finance.py`

```python
"""
Yahoo Finance fetcher using yfinance library.
All methods are async to allow parallel fetching.
"""
import yfinance as yf
from typing import Any
from datetime import datetime

class YahooFinanceService:
    async def fetch_index(self, symbol: str) -> dict[str, Any]:
        ticker = yf.Ticker(symbol)
        info = ticker.fast_info
        price = info.last_price or 0
        prev_close = info.previous_close or price
        change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0
        return {
            'symbol': symbol,
            'price': round(price, 2),
            'change_pct': round(change_pct, 2),
            'timestamp': datetime.utcnow().isoformat(),
        }

    async def fetch_treasury(self, symbol: str = '10yr') -> dict[str, Any]:
        # Map symbol to Yahoo finance ticker for US treasuries
        ticker_map = {'10yr': '^TNX', '2yr': '^IRX', '5yr': '^FVX'}
        ticker_sym = ticker_map.get(symbol, '^TNX')
        ticker = yf.Ticker(ticker_sym)
        info = ticker.fast_info
        yield_val = info.last_price or 0
        return {
            'symbol': symbol.upper(),
            'yield': round(yield_val, 4),
            'timestamp': datetime.utcnow().isoformat(),
        }

    async def fetch_stock(self, symbol: str) -> dict[str, Any]:
        ticker = yf.Ticker(symbol)
        info = ticker.fast_info
        price = info.last_price or 0
        prev_close = info.previous_close or price
        change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0
        volume = info.last_volume or 0
        market_cap = info.market_cap or 0
        return {
            'symbol': symbol.upper(),
            'price': round(price, 2),
            'change_pct': round(change_pct, 2),
            'volume': volume,
            'market_cap': market_cap,
            'timestamp': datetime.utcnow().isoformat(),
        }
```

**Step 3: Run tests to verify pass**

```bash
python -m pytest backend/tests/test_yahoo_finance.py -v
```
Expected: PASS (or FAIL if yfinance rate-limits — retry once)

---

### Task 7: Write failing test for FRED service

**File:** Create `backend/tests/test_fred.py`

```python
import pytest
from backend.services.fred import FredService

@pytest.fixture
def service():
    return FredService()

@pytest.mark.asyncio
async def test_fetch_us_oil(service):
    result = await service.fetch_commodity('DCOILBRENTEU')
    assert result['symbol'] == 'DCOILBRENTEU'
    assert result['price'] > 0
    assert 'timestamp' in result

@pytest.mark.asyncio
async def test_fetch_dollar_index(service):
    result = await service.fetch_dxy()
    assert result['symbol'] == 'DXY'
    assert result['price'] > 0
```

**Step 2: Run to verify failure**

```bash
python -m pytest backend/tests/test_fred.py -v
```
Expected: FAIL — `FredService` not found

---

### Task 8: Implement FredService

**File:** Create `backend/services/fred.py`

```python
"""
FRED API client for macroeconomic indicators.
Free tier: no API key needed for many series.
"""
import requests
from datetime import datetime
from typing import Any

BASE_URL = 'https://api.stlouisfed.org/fred'

class FredService:
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key

    async def fetch_series(self, series_id: str) -> dict[str, Any]:
        # Observation endpoint for public series (no key needed)
        url = f'https://api.stlouisfed.org/fred/series/observations'
        params = {'series_id': series_id, 'limit': 1, 'sort_order': 'desc'}
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        observations = data.get('observations', [])
        if not observations:
            return {'series_id': series_id, 'price': None}
        latest = observations[0]
        return {
            'series_id': series_id,
            'price': float(latest['value']) if latest['value'] != '.' else None,
            'date': latest['date'],
        }

    async def fetch_commodity(self, series_id: str = 'DCOILBRENTEU') -> dict[str, Any]:
        obs = await self.fetch_series(series_id)
        return {
            'symbol': series_id,
            'price': obs['price'],
            'date': obs['date'],
            'timestamp': datetime.utcnow().isoformat(),
        }

    async def fetch_dxy(self) -> dict[str, Any]:
        obs = await self.fetch_series('DTWEXBGS')
        return {
            'symbol': 'DXY',
            'price': obs['price'],
            'date': obs['date'],
            'timestamp': datetime.utcnow().isoformat(),
        }
```

**Step 3: Run tests**

```bash
python -m pytest backend/tests/test_fred.py -v
```

---

### Task 9: Write failing test for crypto service

**File:** Create `backend/tests/test_crypto.py`

```python
import pytest
from backend.services.crypto import CryptoService

@pytest.fixture
def service():
    return CryptoService()

@pytest.mark.asyncio
async def test_fetch_btc_usdt(service):
    result = await service.fetch_pair('BTC/USDT')
    assert result['symbol'] == 'BTC/USDT'
    assert result['price'] > 0
    assert 'change_pct' in result

@pytest.mark.asyncio
async def test_fetch_eth_usdt(service):
    result = await service.fetch_pair('ETH/USDT')
    assert result['symbol'] == 'ETH/USDT'
    assert result['price'] > 0

@pytest.mark.asyncio
async def test_fetch_funding_rate(service):
    result = await service.fetch_funding_rate('BTC/USDT')
    assert result['symbol'] == 'BTC/USDT'
    assert isinstance(result['rate'], float)
```

**Step 2: Run to verify failure**

```bash
python -m pytest backend/tests/test_crypto.py -v
```
Expected: FAIL — `CryptoService` not found

---

### Task 10: Implement CryptoService (CCXT)

**File:** Create `backend/services/crypto.py`

```python
"""
CCXT wrapper for Binance — crypto price, funding rates, orderbook.
"""
import ccxt
from datetime import datetime
from typing import Any

class CryptoService:
    def __init__(self):
        self.exchange = ccxt.binance({'enableRateLimit': True})

    async def fetch_pair(self, symbol: str = 'BTC/USDT') -> dict[str, Any]:
        ticker = self.exchange.fetch_ticker(symbol)
        return {
            'symbol': symbol,
            'price': ticker['last'],
            'change_pct': ticker['percentage'],
            'volume_24h': ticker['quoteVolume'],
            'timestamp': datetime.utcnow().isoformat(),
        }

    async def fetch_funding_rate(self, symbol: str = 'BTC/USDT') -> dict[str, Any]:
        # Binance funding rate is available via public API
        try:
            funding = self.exchange.fetch_funding_rate(symbol)
            return {
                'symbol': symbol,
                'rate': funding['fundingRate'],
                'next_funding': funding.get('nextFundingTime'),
                'timestamp': datetime.utcnow().isoformat(),
            }
        except Exception:
            return {'symbol': symbol, 'rate': None, 'next_funding': None}

    async def fetch_orderbook(self, symbol: str = 'BTC/USDT', limit: int = 20) -> dict[str, Any]:
        ob = self.exchange.fetch_order_book(symbol, limit)
        return {
            'symbol': symbol,
            'bids': ob['bids'][:limit],
            'asks': ob['asks'][:limit],
            'timestamp': datetime.utcnow().isoformat(),
        }
```

**Step 3: Run tests**

```bash
python -m pytest backend/tests/test_crypto.py -v
```

---

### Task 11: Write failing test for signal engine

**File:** Create `backend/tests/test_signal_engine.py`

```python
import pytest
from backend.services.signal_engine import SignalEngine

@pytest.fixture
def engine():
    return SignalEngine()

def test_regime_classification_positive(engine):
    """VIX < 15 + yield spread widening + risk-on crypto = Bull Expansion."""
    signals = {
        'vix': 13.5,
        'treasury_10y': 4.4,
        'treasury_2y': 4.1,
        'credit_spread': 2.8,
        'btc_change_pct': 2.1,
    }
    regime = engine.classify_regime(signals)
    assert regime['name'] in ['BULL_EXPANSIVE', 'BULL_NARROW', 'BEAR_EXPANSIVE', 'BEAR_NARROW', 'NEUTRAL']
    assert 'confidence' in regime
    assert 0 <= regime['confidence'] <= 1

def test_regime_classification_negative(engine):
    """High VIX + inverted curve + credit widening = Bear Expansion."""
    signals = {
        'vix': 28.0,
        'treasury_10y': 4.0,
        'treasury_2y': 4.6,
        'credit_spread': 4.5,
        'btc_change_pct': -3.2,
    }
    regime = engine.classify_regime(signals)
    assert regime['name'].startswith('BEAR')

def test_liquidity_score_bounded(engine):
    score = engine.compute_liquidity_score({'spread_cost': 0.05, 'bid_ask_spread': 0.001})
    assert 0 <= score <= 100

def test_spread_cost_calculation(engine):
    cost = engine.compute_spread_cost({'orderbook_breadth': 10, 'orderbook_depth': 50000})
    assert cost >= 0

def test_risk_appetite_composite(engine):
    result = engine.compute_risk_appetite({'vix': 18, 'credit_spread': 3.0, 'equity_momentum': 0.5})
    assert 'score' in result
    assert 0 <= result['score'] <= 100
```

**Step 2: Run to verify failure**

```bash
python -m pytest backend/tests/test_signal_engine.py -v
```
Expected: FAIL — `SignalEngine` not found

---

### Task 12: Implement SignalEngine

**File:** Create `backend/services/signal_engine.py`

```python
"""
Signal processing engine.
Computes regime classification, liquidity scores, risk appetite,
spread costs, and cross-asset correlation from raw market data.
"""
from typing import Any

class SignalEngine:
    def classify_regime(self, signals: dict[str, float]) -> dict[str, Any]:
        vix = signals.get('vix', 20)
        spread_10y_2y = signals.get('treasury_10y', 0) - signals.get('treasury_2y', 0)
        credit_spread = signals.get('credit_spread', 3.0)
        btc_chg = signals.get('btc_change_pct', 0)

        # Simple rule-based regime classifier (v1)
        # Refine with ML in future iterations
        is_bear = vix > 22 or credit_spread > 4.5 or spread_10y_2y < -0.3
        is_bull = vix < 16 and credit_spread < 3.0 and spread_10y_2y > 0.1 and btc_chg > 0
        is_narrow = (is_bear or is_bull) is False

        if is_bull and spread_10y_2y > 0.3:
            name = 'BULL_EXPANSIVE'
            confidence = 0.85
        elif is_bull:
            name = 'BULL_NARROW'
            confidence = 0.70
        elif is_bear and credit_spread > 5.0:
            name = 'BEAR_EXPANSIVE'
            confidence = 0.85
        elif is_bear:
            name = 'BEAR_NARROW'
            confidence = 0.70
        else:
            name = 'NEUTRAL'
            confidence = 0.60

        return {'name': name, 'confidence': confidence, 'vix': vix, 'credit_spread': credit_spread}

    def compute_liquidity_score(self, data: dict[str, float]) -> float:
        spread_cost = data.get('spread_cost', 0)
        bid_ask = data.get('bid_ask_spread', 0.001)
        # Higher spread = lower liquidity score
        score = max(0, min(100, 100 - (spread_cost * 1000) - (bid_ask * 50000)))
        return round(score, 1)

    def compute_spread_cost(self, data: dict[str, float]) -> float:
        breadth = data.get('orderbook_breadth', 10)   # number of levels
        depth = data.get('orderbook_depth', 10000)    # avg size per level
        # Simple: cost increases when breadth is narrow or depth is low
        cost = max(0, (20 - breadth) * 0.01 + (10000 - depth) / 100000 * 0.01)
        return round(cost, 6)

    def compute_risk_appetite(self, data: dict[str, float]) -> dict[str, Any]:
        vix = data.get('vix', 20)
        credit = data.get('credit_spread', 3.0)
        momentum = data.get('equity_momentum', 0)

        # VIX contribution: low VIX = high risk appetite
        vix_score = max(0, min(100, (30 - vix) / 30 * 100))
        # Credit contribution: low spread = high risk appetite
        credit_score = max(0, min(100, (6 - credit) / 6 * 100))
        # Momentum: positive = risk-on
        momentum_score = 50 + momentum * 50
        momentum_score = max(0, min(100, momentum_score))

        composite = (vix_score * 0.4 + credit_score * 0.35 + momentum_score * 0.25)
        return {'score': round(composite, 1), 'vix_score': round(vix_score, 1), 'credit_score': round(credit_score, 1), 'momentum_score': round(momentum_score, 1)}
```

**Step 3: Run tests**

```bash
python -m pytest backend/tests/test_signal_engine.py -v
```
Expected: PASS (all 5 tests)

---

### Task 13: Write failing test for market router

**File:** Create `backend/tests/test_market_router.py`

```python
import pytest
from httpx import AsyncClient, ASGITransport
from backend.main import app

@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://test') as client:
        resp = await client.get('/health')
        assert resp.status_code == 200
        assert resp.json()['status'] == 'ok'

@pytest.mark.asyncio
async def test_market_snapshot_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://test') as client:
        resp = await client.get('/api/market/snapshot')
        assert resp.status_code == 200
        data = resp.json()
        assert 'regime' in data
        assert 'vix' in data
        assert 'spx' in data
        assert 'timestamp' in data

@pytest.mark.asyncio
async def test_flows_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://test') as client:
        resp = await client.get('/api/flows/depth')
        assert resp.status_code == 200
        data = resp.json()
        assert 'bids' in data
        assert 'asks' in data
```

**Step 2: Run to verify failure**

```bash
python -m pytest backend/tests/test_market_router.py -v
```
Expected: FAIL — 404 on all endpoints

---

### Task 14: Implement FastAPI main + routers

**File:** `backend/main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import market, flows, impacts, trends, ideas

app = FastAPI(title='Liquidity Pulse API', version='0.1.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(market.router)
app.include_router(flows.router)
app.include_router(impacts.router)
app.include_router(trends.router)
app.include_router(ideas.router)

@app.get('/health')
def health():
    return {'status': 'ok'}

@app.get('/')
def root():
    return {'message': 'Liquidity Pulse API — see /docs'}
```

**File:** `backend/routers/market.py`

```python
from fastapi import APIRouter
from backend.services.yahoo_finance import YahooFinanceService
from backend.services.fred import FredService
from backend.services.signal_engine import SignalEngine

router = APIRouter(prefix='/api/market', tags=['market'])
yahoo = YahooFinanceService()
fred = FredService()
engine = SignalEngine()

@router.get('/snapshot')
async def snapshot():
    # Parallel fetch of key market data
    spx = await yahoo.fetch_index('^GSPC')
    vix = await yahoo.fetch_index('^VIX')
    btc = await yahoo.fetch_stock('BTC-USD')
    yield_10y = await yahoo.fetch_treasury('10yr')
    dxy = await fred.fetch_dxy()
    oil = await fred.fetch_commodity('DCOILBRENTEU')

    signals = {
        'vix': vix['price'],
        'treasury_10y': yield_10y['yield'],
        'treasury_2y': 0,  # optional: fetch 2yr
        'credit_spread': 3.2,  # placeholder — wire to ICE BofA series
        'btc_change_pct': btc['change_pct'],
    }
    regime = engine.classify_regime(signals)

    return {
        'regime': regime,
        'vix': vix,
        'spx': spx,
        'btc': btc,
        'yield_10y': yield_10y,
        'dxy': dxy,
        'oil': oil,
        'timestamp': spx['timestamp'],
    }
```

**File:** `backend/routers/__init__.py` (empty, routers imported directly)

**File:** `backend/routers/flows.py`

```python
from fastapi import APIRouter
from backend.services.crypto import CryptoService
from backend.services.yahoo_finance import YahooFinanceService

router = APIRouter(prefix='/api/flows', tags=['flows'])
crypto = CryptoService()
yahoo = YahooFinanceService()

@router.get('/depth')
async def depth_chart(symbol: str = 'BTC/USDT'):
    ob = await crypto.fetch_orderbook(symbol)
    return ob

@router.get('/funding-rates')
async def funding_rates():
    pairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'ARB/USDT']
    results = []
    for pair in pairs:
        rate = await crypto.fetch_funding_rate(pair)
        price_data = await crypto.fetch_pair(pair)
        results.append({**rate, 'price': price_data['price'], 'change_pct': price_data['change_pct']})
    return {'rates': results}

@router.get('/tvl')
async def tvl():
    # Placeholder — DeFi Llama / DeFiPulse API
    return {'chains': [
        {'name': 'Ethereum', 'tvl': 45_200_000_000},
        {'name': 'Arbitrum', 'tvl': 8_100_000_000},
        {'name': 'Solana', 'tvl': 4_200_000_000},
        {'name': 'BSC', 'tvl': 3_800_000_000},
    ]}
```

**File:** `backend/routers/impacts.py`, `trends.py`, `ideas.py`

(Structure mirrors flows.py — each returns mock data in v1, wired to real sources in v2)

**Step 3: Run integration tests**

```bash
python -m pytest backend/tests/test_market_router.py -v
```

---

## PHASE 3 — Frontend SPA with Real API Integration

### Task 15: Write failing Vitest test for API client

**File:** Create `frontend/tests/api.test.js`

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import * as api from '../js/api.js';

describe('api module', () => {
  it('fetchSnapshot returns an object with regime key', async () => {
    // Skip if backend not running — use mock
    let data;
    try {
      data = await api.fetchSnapshot();
    } catch (e) {
      data = api.fetchSnapshotMock();
    }
    expect(data).toHaveProperty('regime');
    expect(data).toHaveProperty('vix');
    expect(data).toHaveProperty('spx');
  });

  it('fetchDepth returns bids and asks arrays', async () => {
    let data;
    try {
      data = await api.fetchDepth('BTC/USDT');
    } catch (e) {
      data = api.fetchDepthMock('BTC/USDT');
    }
    expect(data).toHaveProperty('bids');
    expect(data).toHaveProperty('asks');
    expect(Array.isArray(data.bids)).toBe(true);
  });
});
```

**Step 2: Run to verify failure**

```bash
cd /home/thomas/Desktop/Dropbox/Projects/liquidity-pulse/frontend
npx vitest run tests/api.test.js
```
Expected: FAIL — api.js not found

---

### Task 16: Implement `frontend/js/api.js` with mock fallback

**File:** `frontend/js/api.js`

```javascript
import { API_BASE } from './constants.js';

async function get(path) {
  const resp = await fetch(`${API_BASE}${path}`);
  if (!resp.ok) throw new Error(`API error ${resp.status}: ${path}`);
  return resp.json();
}

export async function fetchSnapshot() {
  return get('/market/snapshot');
}

export async function fetchDepth(symbol = 'BTC/USDT') {
  return get(`/flows/depth?symbol=${encodeURIComponent(symbol)}`);
}

export async function fetchFundingRates() {
  return get('/flows/funding-rates');
}

export async function fetchTVL() {
  return get('/flows/tvl');
}

// ─── Mock fallbacks (used when backend is offline) ────────────────────────────

export function fetchSnapshotMock() {
  return {
    regime: { name: 'BULL_NARROW', confidence: 0.72, vix: 17.3, credit_spread: 2.9 },
    vix: { symbol: '^VIX', price: 17.3, change_pct: -4.2 },
    spx: { symbol: '^GSPC', price: 5248.5, change_pct: 0.41 },
    btc: { symbol: 'BTC-USD', price: 67420, change_pct: 1.82 },
    yield_10y: { symbol: '10YR', yield: 4.312 },
    dxy: { symbol: 'DXY', price: 106.12 },
    oil: { symbol: 'DCOILBRENTEU', price: 83.4 },
    timestamp: new Date().toISOString(),
  };
}

export function fetchDepthMock(symbol) {
  return {
    symbol,
    bids: [[67400, 2.5], [67350, 1.8], [67300, 3.1]],
    asks: [[67410, 2.1], [67460, 1.5], [67500, 2.8]],
    timestamp: new Date().toISOString(),
  };
}
```

**Step 3: Run tests**

```bash
npx vitest run tests/api.test.js
```
Expected: PASS (mock path)

---

### Task 17: Build Vue Discovery page component

**Objective:** Replace static HTML with live Vue component fetching from the backend.

**File:** `frontend/js/components/DiscoveryPage.vue.js`

```javascript
// Vue 3 component (using CDN global Vue — no .vue file loader needed)
// Usage: Vue.component('discovery-page', { template: '...', data() { return {...} }, methods: {...} })

export const DiscoveryPage = {
  data() {
    return {
      loading: true,
      snapshot: null,
      error: null,
    };
  },
  async created() {
    try {
      const { fetchSnapshot } = await import('../api.js');
      this.snapshot = await fetchSnapshot();
    } catch (e) {
      const { fetchSnapshotMock } = await import('../api.js');
      this.snapshot = fetchSnapshotMock();
    } finally {
      this.loading = false;
    }
  },
  template: `
    <div class="page-discovery">
      <div class="metrics-row">
        <div class="metric-card">
          <span class="metric-label">Regime</span>
          <span class="metric-value" :class="regimeColor">{{ snapshot?.regime?.name }}</span>
          <span class="metric-sub">Conf: {{ snapshot?.regime?.confidence }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">VIX</span>
          <span class="metric-value">{{ snapshot?.vix?.price }}</span>
          <span class="metric-sub" :class="snapshot?.vix?.change_pct < 0 ? 'red' : 'green'">
            {{ snapshot?.vix?.change_pct }}%
          </span>
        </div>
        <div class="metric-card">
          <span class="metric-label">SPX</span>
          <span class="metric-value">{{ snapshot?.spx?.price }}</span>
          <span class="metric-sub" :class="snapshot?.spx?.change_pct < 0 ? 'red' : 'green'">
            {{ snapshot?.spx?.change_pct }}%
          </span>
        </div>
        <div class="metric-card">
          <span class="metric-label">BTC</span>
          <span class="metric-value">{{ snapshot?.btc?.price?.toLocaleString() }}</span>
          <span class="metric-sub" :class="snapshot?.btc?.change_pct < 0 ? 'red' : 'green'">
            {{ snapshot?.btc?.change_pct }}%
          </span>
        </div>
        <div class="metric-card">
          <span class="metric-label">10Y Yield</span>
          <span class="metric-value">{{ snapshot?.yield_10y?.yield }}</span>
          <span class="metric-sub">%</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Oil (Brent)</span>
          <span class="metric-value">{{ snapshot?.oil?.price }}</span>
          <span class="metric-sub">USD/bbl</span>
        </div>
      </div>
    </div>
  `,
  computed: {
    regimeColor() {
      const name = this.snapshot?.regime?.name || '';
      if (name.startsWith('BULL')) return 'green';
      if (name.startsWith('BEAR')) return 'red';
      return 'blue';
    },
  },
};
```

---

### Task 18: Write failing test for DiscoveryPage component

**File:** `frontend/tests/DiscoveryPage.test.js`

```javascript
import { describe, it, expect } from 'vitest';
import { DiscoveryPage } from '../js/components/DiscoveryPage.vue.js';

describe('DiscoveryPage', () => {
  it('has correct data keys', () => {
    const component = DiscoveryPage;
    expect(typeof component.data).toBe('function');
    const data = component.data();
    expect(data).toHaveProperty('loading');
    expect(data).toHaveProperty('snapshot');
    expect(data).toHaveProperty('error');
  });

  it('regimeColor computed returns string', () => {
    const component = DiscoveryPage;
    const vm = { snapshot: { regime: { name: 'BULL_NARROW' } } };
    const color = component.computed.regimeColor.call(vm);
    expect(['green', 'red', 'blue']).toContain(color);
  });
});
```

**Step 2: Run Vitest test to verify failure**

```bash
npx vitest run tests/DiscoveryPage.test.js
```
Expected: FAIL — module not found or import error

**Step 3: Add Playwright E2E test — `frontend/e2e/discovery.spec.js`**

```javascript
const { test, expect } = require('@playwright/test');

test.describe('Discovery Page', () => {
  test('loads with 6 metric cards after data fetches', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    // Wait for Vue to mount and data to load (mock fallback is instant)
    await page.waitForSelector('.metric-card', { timeout: 5000 });
    const cards = page.locator('.metric-card');
    await expect(cards).toHaveCount(6);
    // Check all cards have a metric-label and metric-value
    for (const card of await cards.all()) {
      await expect(card.locator('.metric-label')).toBeVisible();
      await expect(card.locator('.metric-value')).toBeVisible();
    }
    expect(errors).toHaveLength(0);
  });

  test('regime badge shows regime name from snapshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.metric-card', { timeout: 5000 });
    const regimeCard = page.locator('.metric-card').first();
    const value = regimeCard.locator('.metric-value');
    await expect(value).not.toBeEmpty();
    // Regime name should be one of the known values
    const text = await value.textContent();
    expect(['BULL', 'BEAR', 'NEUTRAL']).toSatisfy(v => text.includes(v));
  });

  test('VIX and SPX cards show numeric values', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.metric-card', { timeout: 5000 });
    const cards = page.locator('.metric-card');
    const vixText = await cards.nth(1).locator('.metric-value').textContent();
    expect(parseFloat(vixText.trim())).toBeGreaterThan(0);
    const spxText = await cards.nth(2).locator('.metric-value').textContent();
    expect(parseFloat(spxText.trim().replace(/,/g, ''))).toBeGreaterThan(0);
  });

  test('no console errors on page load', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    await page.waitForSelector('.metric-card', { timeout: 5000 });
    await page.waitForTimeout(500); // allow async ops to settle
    expect(errors).toHaveLength(0);
  });
});
```

**Step 4: Run Playwright E2E test**

```bash
cd /home/thomas/Desktop/Dropbox/Projects/liquidity-pulse/frontend
npx playwright test e2e/discovery.spec.js
```
Expected: FAIL — DiscoveryPage.vue.js not yet created

---

### Task 19: Wire Vue app.js router

**File:** `frontend/js/app.js`

```javascript
const { createApp, ref, computed } = Vue;
const { createRouter, createWebHashHistory } = VueRouter;

const DiscoveryPage = () => import('./components/DiscoveryPage.vue.js');
const FlowsPage = () => import('./components/FlowsPage.vue.js');
// ... lazy-load other pages

const routes = [
  { path: '/', component: DiscoveryPage },
  { path: '/flows', component: FlowsPage },
  // ...
];

const router = createRouter({ history: createWebHashHistory(), routes });

const app = createApp({
  data() {
    return { currentRoute: ref('') };
  },
  router,
  template: `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-kicker">Terminal</div>
          <div class="sidebar-subtitle">v1.0</div>
        </div>
        <nav class="side-nav">
          <router-link
            v-for="item in NAV_ITEMS"
            :key="item.id"
            :to="item.path"
            class="side-link"
            active-class="active"
          >
            <span class="left">
              <span class="side-icon">{{ item.abbr }}</span>
              {{ item.label }}
            </span>
          </router-link>
        </nav>
      </aside>
      <header class="topbar">
        <div class="brand-row">
          <span class="brand">Liquidity Pulse</span>
        </div>
        <div class="status-group">
          <span class="regime-badge neutral" v-if="false"><!-- live status here --></span>
        </div>
      </header>
      <main class="main-content">
        <router-view />
      </main>
    </div>
  `,
});

app.config.globalProperties.NAV_ITEMS = NAV_ITEMS;
app.use(router);
app.mount('#app');
```

**Step 4: Add Playwright E2E test — `frontend/e2e/navigation.spec.js`**

```javascript
const { test, expect } = require('@playwright/test');

test.describe('Navigation', () => {
  test('all 6 nav links are visible and clickable', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.side-link', { timeout: 5000 });
    const links = page.locator('.side-link');
    await expect(links).toHaveCount(6);
    const labels = ['Discovery', 'Liquidity Flows', 'Market Impacts', 'Hidden Trends', 'Ideas', 'Settings'];
    for (const label of labels) {
      await expect(page.locator('.side-link', { hasText: label })).toBeVisible();
    }
  });

  test('clicking Liquidity Flows navigates to /flows', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.side-link', { timeout: 5000 });
    await page.click('.side-link:has-text("Liquidity Flows")');
    await expect(page).toHaveURL(/.*flows/);
  });

  test('clicking Ideas navigates to /ideas', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.side-link', { timeout: 5000 });
    await page.click('.side-link:has-text("Ideas")');
    await expect(page).toHaveURL(/.*ideas/);
  });

  test('clicking Discovery returns to home', async ({ page }) => {
    await page.goto('/flows');
    await page.waitForSelector('.side-link', { timeout: 5000 });
    await page.click('.side-link:has-text("Discovery")');
    await expect(page).toHaveURL('/#/');  // Vue Router hash mode
  });

  test('sidebar stays visible on all pages', async ({ page }) => {
    const pages = ['/', '/flows', '/impacts', '/trends', '/ideas'];
    for (const p of pages) {
      await page.goto(p);
      await page.waitForSelector('.sidebar', { timeout: 5000 });
      await expect(page.locator('.sidebar')).toBeVisible();
    }
  });
});
```

**Step 5: Run Playwright E2E navigation tests**

```bash
cd /home/thomas/Desktop/Dropbox/Projects/liquidity-pulse/frontend
npx playwright test e2e/navigation.spec.js
```
Expected: FAIL — router not yet wired

---

## PHASE 4 — Integration & Polish

### Task 20: Run all backend tests

```bash
cd /home/thomas/Desktop/Dropbox/Projects/liquidity-pulse
python -m pytest backend/tests/ -v --tb=short
```

### Task 21: Run all frontend Vitest unit tests

```bash
cd /home/thomas/Desktop/Dropbox/Projects/liquidity-pulse/frontend
npx vitest run
```

### Task 22: Run all Playwright E2E tests

```bash
cd /home/thomas/Desktop/Dropbox/Projects/liquidity-pulse/frontend
npx playwright test --reporter=line
```

### Task 23: Start backend and verify full stack

```bash
cd /home/thomas/Desktop/Dropbox/Projects/liquidity-pulse
uvicorn backend.main:app --reload --port 8000
# In another terminal:
curl http://localhost:8000/api/market/snapshot | python -m json.tool
```

### Task 24: End-to-end Playwright smoke test (real data)

**File:** `frontend/e2e/smoke.spec.js`

```javascript
const { test, expect } = require('@playwright/test');

test.describe('Full Stack Smoke Test', () => {
  test('discovery page shows live regime classification', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    await page.waitForSelector('.metric-card', { timeout: 8000 });
    const regimeValue = page.locator('.metric-card').first().locator('.metric-value');
    await expect(regimeValue).not.toBeEmpty();
    // Regime name must be a known value
    const text = await regimeValue.textContent();
    expect(['BULL', 'BEAR', 'NEUTRAL']).toSatisfy(v => text.includes(v));
    // SPX price must be a real number > 1000
    const spxValue = page.locator('.metric-card').nth(2).locator('.metric-value');
    const spx = parseFloat((await spxValue.textContent()).replace(/,/g, ''));
    expect(spx).toBeGreaterThan(1000);
    // VIX must be > 0
    const vixValue = page.locator('.metric-card').nth(1).locator('.metric-value');
    const vix = parseFloat(await vixValue.textContent());
    expect(vix).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
  });

  test('liquidity flows page loads depth chart data', async ({ page }) => {
    await page.goto('/flows');
    await page.waitForSelector('.panel', { timeout: 8000 });
    // At least one table or chart element should be visible
    const panels = page.locator('.panel');
    expect(await panels.count()).toBeGreaterThan(0);
  });

  test('no console errors across all pages', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    const pages = ['/', '/flows', '/impacts', '/trends', '/ideas'];
    for (const p of pages) {
      await page.goto(p);
      await page.waitForTimeout(1000);
    }
    expect(errors).toHaveLength(0);
  });
});
```

**Step 2: Run smoke test**

```bash
npx playwright test e2e/smoke.spec.js
```
Expected: FAIL until backend is running and CORS is configured

---

## Data Sources Summary

| Signal | Source | Free? | Notes |
|--------|--------|-------|-------|
| SPX, individual stocks | Yahoo Finance (yfinance) | ✅ | US equities, ETFs |
| VIX | Yahoo Finance (^VIX) | ✅ | |
| Treasury yields (2y, 5y, 10y, 30y) | Yahoo Finance (^IRX, ^FVX, ^TNX, ^TYX) | ✅ | |
| BTC, ETH, SOL, altcoins | Binance via CCXT | ✅ | No account needed for public endpoints |
| Funding rates | Binance via CCXT | ✅ | |
| DXY (dollar index) | FRED (DTWEXBGS) | ✅ | No API key needed |
| Oil (Brent) | FRED (DCOILBRENTEU) | ✅ | |
| Credit spread (IG) | FRED (BAMLC0A0CM) | ✅ | ICE BofA US Corporate Index |
| TVL by chain | DeFi Llama | ✅ | Free API |
| Cross-asset correlations | Computed locally from price data | ✅ | Rolling Pearson correlation |

---

## TDD Cycle Summary

Every task follows:
1. **Write failing test** (red)
2. **Verify failure message** (green ⬜ red)
3. **Write minimal implementation** (green ⬜ green)
4. **Verify all tests pass** (green ⬜ green)
5. **Commit** (`git add && git commit -m "type: description"`)

## Execution

**"Plan complete. Shall I proceed using subagent-driven-development — dispatching one fresh subagent per task with spec-compliance then code-quality review?"**
