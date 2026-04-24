# Liquidity Pulse

Liquidity Pulse is a real-time market intelligence dashboard for tracking cross-asset liquidity, capital flows, market impacts, hidden trends, and actionable trade ideas across equities, crypto, and macro.

## What it includes

- **FastAPI backend** with endpoints for market snapshot, flows, impacts, trends, and ideas
- **Vue 3 frontend** served as a lightweight SPA
- **Institutional-style dashboard UI** with five major views:
  - Discovery
  - Liquidity Flows
  - Market Impacts
  - Hidden Trends
  - Ideas
- **Public-data integrations** for equities, macro, and crypto
- **Test coverage** with pytest, Vitest, and Playwright

## Project structure

```text
liquidity-pulse/
├── backend/                 # FastAPI app, routers, services, tests
├── frontend/                # Vue SPA, CSS, Playwright and Vitest tests
├── ARCHITECTURE.md          # Build plan and implementation notes
├── overview.md             # Project overview
├── plan.md                 # Planning notes
├── decisions.md            # Decision log
├── requirements.txt        # Python dependencies
└── liquidity-*-mockup.html # Original mockups
```

## Quick start

### Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

The backend serves the frontend from the same app. Once running, open:

- `http://127.0.0.1:8000/`
- health check: `http://127.0.0.1:8000/health`

### Frontend tests

```bash
cd frontend
npm install
npm test -- --run
npx playwright test
```

### Backend tests

```bash
pytest -q backend/tests
```

## Notes

- The original static mockups are kept in the repo for design reference.
- Live data quality depends on upstream public providers.
- The current implementation favors a lightweight, inspectable stack over heavy framework tooling.
