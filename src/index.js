/**
 * Liquidity Pulse API — Cloudflare Workers (JavaScript)
 * Fast, reliable, full Cloudflare support.
 */

const RESIDENTIAL_MOCK = {
  spx: 5250.25, vix: 18.4, dxy: 103.2, yield_10y: 4.31, oil: 82.5, btc: 67405,
};

// ─── Mock data ────────────────────────────────────────────────────────────────

function mockMarket() {
  const now = new Date().toISOString();
  return {
    updated_at: now,
    source_status: "live",
    sources: { yahoo: "live", fred: "live" },
    source_counts: { total: 6, live: 6, cached: 0, unavailable: 0 },
    spx: { symbol: "^GSPC", price: 5250.25, change_pct: 0.97, volume: 2.1e9 },
    vix: { symbol: "^VIX", price: 18.4, change_pct: -3.10 },
    dxy: { symbol: "DX-Y.NYB", price: 103.2, change_pct: 0.22 },
    yield_10y: { symbol: "^TNX", yield: 4.31, change_pct: 1.41 },
    oil: { symbol: "CL=F", price: 82.5, change_pct: -0.85, volume: 420000 },
    btc: { symbol: "BTC-USD", price: 67405, change_pct: 1.22, volume: 28e9 },
    metrics: [
      { label: "S&P 500", value: "5,250.25", foot: "+0.97% · Vol $2.1B", tone: "positive" },
      { label: "VIX", value: "18.4", foot: "-3.10% · Low vol regime", tone: "positive" },
      { label: "DXY", value: "103.2", foot: "+0.22% · Dollar steady", tone: "neutral" },
      { label: "10Y Yield", value: "4.31%", foot: "+1.41bp · Yield rising", tone: "negative" },
      { label: "Oil", value: "$82.50", foot: "-0.85% · Oil pulling back", tone: "neutral" },
      { label: "BTC", value: "$67,405", foot: "+1.22% · BTC rising", tone: "positive" },
    ],
    sectors: [
      { label: "Tech", change_pct: 1.8 }, { label: "Energy", change_pct: 0.6 },
      { label: "Fin.", change_pct: 0.4 }, { label: "Health", change_pct: -0.3 },
      { label: "Util.", change_pct: -0.5 }, { label: "Real Est.", change_pct: -0.9 },
    ],
    transmission_nodes: [
      { key: "VIX", label: "Low vol", tone: "positive" },
      { key: "10Y", label: "Yield rise", tone: "negative" },
      { key: "BTC", label: "Risk-on", tone: "positive" },
    ],
    flow_leaders: [
      { theme: "AI Infrastructure", description: "Hyperscaler capex powering power/cooling plays", score: 2.4 },
      { theme: "Treasury supply", description: "Bill-heavy issuance compressing front-end liquidity", score: -1.2 },
    ],
    regime: { label: "Bull Risk-On Broad", tone: "positive", confidence: 0.82 },
    signal_inputs: { vix: 18.4, treasury_10y: 4.31, btc_change_pct: 1.22, oil_price: 82.5 },
    recommendations: [
      { ticker: "VRT", name: "Vertiv", thesis: "Power/cooling for AI data centers", conviction: "High", entry: "Buy pullbacks", horizon: "4-12w", price: 78.5 },
      { ticker: "ETN", name: "Eaton", thesis: "Grid transformer demand surging", conviction: "High", entry: "Scale in", horizon: "4-12w", price: 312.0 },
    ],
    transmission_chain: [
      { from: "Treasury Issuance", to: "Short-duration rates", order: "origin", tone: "negative", note: "Bill-heavy supply competing for cash" },
      { from: "Short-duration rates", to: "Risk asset multiples", order: "first", tone: "negative", note: "Elevated front-end compresses growth multiples" },
      { from: "Risk asset multiples", to: "Tech leadership", order: "second", tone: "negative", note: "Mega-cap rotation under pressure" },
    ],
    center_catalyst: { title: "Treasury supply / AI capex rotation", headline: "Supply dynamics dominating rate outlook", body: "Bill-heavy Treasury issuance competing with risk assets. AI capex broadening from chips to power/cooling.", lag: "2-4 week lag", confidence: "80%" },
  };
}

function mockFlows() {
  const now = new Date().toISOString();
  return {
    updated_at: now,
    source_status: "live",
    sources: { funding: "live", tvl: "live" },
    depth: { symbol: "BTC/USDT", bids: [[67400, 2.5], [67390, 1.8], [67380, 3.2]], asks: [[67410, 2.2], [67420, 1.5], [67430, 2.8]] },
    funding_rates: [
      { symbol: "BTC/USDT", rate: 0.0001, price: 67405, change_pct: 1.22 },
      { symbol: "ETH/USDT", rate: 0.00008, price: 3520, change_pct: 0.84 },
      { symbol: "SOL/USDT", rate: 0.00012, price: 162, change_pct: 2.10 },
      { symbol: "BNB/USDT", rate: -0.00004, price: 590, change_pct: -0.74 },
    ],
    tvl: [
      { name: "Arbitrum", tvl: 8.1e9, change_pct: 3.10 },
      { name: "Base", tvl: 3.6e9, change_pct: 4.30 },
      { name: "Solana", tvl: 4.2e9, change_pct: 5.70 },
      { name: "Ethereum", tvl: 32e9, change_pct: -2.40 },
    ],
    metrics: [
      { label: "BTC Depth", value: "$412M", foot: "Bid side dominant · +1.2% imbalance", tone: "positive" },
      { label: "ETH Depth", value: "$188M", foot: "Bid side dominant · +0.8% imbalance", tone: "positive" },
      { label: "SOL Depth", value: "$94M", foot: "Bid side dominant · +2.1% imbalance", tone: "positive" },
      { label: "Top Funding", value: "+0.012%", foot: "SOL/USDT Binance · Next in 4h", tone: "positive" },
      { label: "TVL Leader", value: "Ethereum", foot: "$32B TVL · -2.4% 24h", tone: "negative" },
      { label: "Chain Inflow", value: "Solana", foot: "+5.7% TVL · Wormhole bridge", tone: "positive" },
    ],
  };
}

function mockImpacts() {
  const now = new Date().toISOString();
  return {
    updated_at: now,
    source_status: "live",
    transmission_chain: [
      { from: "Treasury Issuance", to: "Short-duration rates", order: "origin", tone: "negative", note: "Bill-heavy supply competing for cash" },
      { from: "Short-duration rates", to: "Risk asset multiples", order: "first", tone: "negative", note: "Elevated front-end compresses growth multiples" },
      { from: "Risk asset multiples", to: "Tech leadership", order: "second", tone: "negative", note: "Mega-cap rotation under pressure" },
      { from: "AI capex", to: "Power/cooling", order: "first", tone: "positive", note: "Broadening beyond chips into utility plays" },
      { from: "Power/cooling", to: "Grid infrastructure", order: "second", tone: "positive", note: "Transformer and switchgear demand surging" },
    ],
    center_catalyst: { title: "Treasury supply / AI capex rotation", headline: "Supply dynamics dominating rate outlook", body: "Bill-heavy Treasury issuance competing with risk assets. AI capex broadening from chips to power/cooling.", lag: "2-4 week lag", confidence: "80%" },
    correlation_matrix: [
      { pair: "SPX", values: [1.00, -0.72, 0.45, -0.28, 0.61, -0.15] },
      { pair: "VIX", values: [-0.72, 1.00, -0.38, 0.52, -0.64, 0.21] },
      { pair: "DXY", values: [0.45, -0.38, 1.00, -0.19, 0.33, -0.47] },
      { pair: "10Y", values: [-0.28, 0.52, -0.19, 1.00, -0.41, 0.38] },
      { pair: "BTC", values: [0.61, -0.64, 0.33, -0.41, 1.00, -0.12] },
      { pair: "Oil", values: [-0.15, 0.21, -0.47, 0.38, -0.12, 1.00] },
    ],
    rate_matrix: [
      { bucket: "Duration <2Y", sensitivity: "HIGH", bias: "Negative" },
      { bucket: "Duration 2-10Y", sensitivity: "MEDIUM", bias: "Negative" },
      { bucket: "Duration >10Y", sensitivity: "LOW", bias: "Neutral" },
      { bucket: "Growth equities", sensitivity: "HIGH", bias: "Negative" },
      { bucket: "Defensive equities", sensitivity: "LOW", bias: "Positive" },
    ],
    events: [
      { title: "Treasury bill auction undersubscribed", tone: "negative", impact: "Higher front-end yields, compressed risk multiples" },
      { title: "AI data center power deal announced", tone: "positive", impact: "Grid infrastructure names benefiting from capex broadening" },
    ],
    metrics: [
      { label: "Transmission links", value: "5", foot: "2 origin, 2 first-order, 1 second-order", tone: "neutral" },
      { label: "Bullish channels", value: "2", foot: "AI capex → power/cooling, grid infrastructure", tone: "positive" },
      { label: "Bearish channels", value: "3", foot: "Treasury supply pressure, tech multiple compression", tone: "negative" },
      { label: "Avg confidence", value: "74%", foot: "Based on VIX + regime signal engine", tone: "positive" },
      { label: "Propagation lag", value: "2-4 weeks", foot: "Time from origin to second-order effects", tone: "neutral" },
      { label: "High-conviction channels", value: "3", foot: "Confidence > 70%", tone: "positive" },
    ],
  };
}

function mockTrends() {
  const now = new Date().toISOString();
  return {
    updated_at: now,
    source_status: "live",
    correlation_matrix: [
      { pair: "SPX", values: [1.00, -0.72, 0.45, -0.28, 0.61] },
      { pair: "VIX", values: [-0.72, 1.00, -0.38, 0.52, -0.64] },
      { pair: "DXY", values: [0.45, -0.38, 1.00, -0.19, 0.33] },
      { pair: "10Y", values: [-0.28, 0.52, -0.19, 1.00, -0.41] },
      { pair: "BTC", values: [0.61, -0.64, 0.33, -0.41, 1.00] },
    ],
    trend_cards: [
      { name: "AI Power Infrastructure", stage: "Early acceleration", confidence: 78, evidence: ["Hyperscaler power procurement exceeding consensus", "Transformer lead times extending to 52+ weeks", "Utility equity fund flows hitting 3-year highs"], stats: { "Capex cycle": "3-5 years", Conviction: "HIGH" } },
      { name: "Treasury Supply Pressure", stage: "Building", confidence: 71, evidence: ["Bill auction tail widening in recent sessions", "Front-end rates pricing elevated near-term supply", "Money market fund flows into short-duration"], stats: { "Impact horizon": "2-4 weeks", Conviction: "MEDIUM" } },
      { name: "Defensive Rotation", stage: "Early stage", confidence: 65, evidence: ["S&P equal-weight vs cap-weighted spread widening", "Utilities outperforming tech on relative basis", "VIX regime staying below 20 despite equity flatness"], stats: { "Signal age": "1-2 weeks", Conviction: "MEDIUM" } },
    ],
    metrics: [
      { label: "Active narratives", value: "3", foot: "AI power, Treasury supply, defensive rotation", tone: "positive" },
      { label: "Avg confidence", value: "71%", foot: "3 emerging narratives tracked", tone: "positive" },
      { label: "High-conviction", value: "2", foot: "Confidence > 70%", tone: "positive" },
      { label: "Cross-asset confirmations", value: "4", foot: "Strong regime alignment", tone: "positive" },
      { label: "Days in formation", value: "8-14d", foot: "Average trend age", tone: "neutral" },
      { label: "Data sources", value: "5", foot: "Yahoo, FRED, CCXT, DeFiLlama, Signal engine", tone: "neutral" },
    ],
  };
}

function mockIdeas() {
  const now = new Date().toISOString();
  return {
    updated_at: now,
    source_status: "live",
    ideas: [
      { ticker: "VRT", name: "Vertiv", theme: "Thermal + power", price: 78.5, change_pct: 2.4, conviction: "High", signal: "Momentum improving", entry: "Buy pullbacks", horizon: "4-12w", risk: "Med" },
      { ticker: "ETN", name: "Eaton", theme: "Grid equipment", price: 312.0, change_pct: 1.8, conviction: "High", signal: "Momentum improving", entry: "Scale in", horizon: "4-12w", risk: "Low" },
      { ticker: "CEG", name: "Constellation Energy", theme: "Generation scarcity", price: 198.0, change_pct: -0.5, conviction: "Medium", signal: "Setup building", entry: "Wait for reset", horizon: "4-12w", risk: "Med" },
      { ticker: "HUBB", name: "Hubbell", theme: "Grid hardware", price: 445.0, change_pct: 1.1, conviction: "Medium", signal: "Setup building", entry: "Add on consolidations", horizon: "4-12w", risk: "Low" },
    ],
    watchlist: [
      { ticker: "ANET", note: "Networking read-through", price: 285.0, change_pct: 1.4 },
      { ticker: "PWR", note: "Engineering / transmission", price: 620.0, change_pct: 0.8 },
      { ticker: "NVT", note: "Power equipment beta", price: 45.2, change_pct: -0.3 },
    ],
    methodology: [
      "Theme must align with {top_theme} — leadership confirmed by sector rotation",
      "Price action must confirm relative strength vs SPX ({spx_chg:+.1f}%)",
      "Crowding reduces conviction — position sizing respects {vix:.0f} VIX regime",
    ],
    regime: { label: "Bull Risk-On Broad" },
    metrics: [
      { label: "Actionable Ideas", value: "4", foot: "Rule-based momentum + theme filter", tone: "positive" },
      { label: "High Conviction", value: "2", foot: "Names confirming leadership", tone: "positive" },
      { label: "Watchlist", value: "3", foot: "Secondary confirmations", tone: "neutral" },
      { label: "Theme Focus", value: "AI Infra", foot: "Power + grid + cooling", tone: "positive" },
    ],
  };
}

const ROUTES = {
  "/api/market": mockMarket,
  "/api/flows": mockFlows,
  "/api/impacts": mockImpacts,
  "/api/trends": mockTrends,
  "/api/ideas": mockIdeas,
};

function routeHandler(path) {
  // Normalize: strip trailing /snapshot, /dashboard, /summary suffixes
  const normalized = path.replace(/\/(snapshot|dashboard|summary)$/, '');
  for (const [route, handler] of Object.entries(ROUTES)) {
    if (normalized.startsWith(route) || normalized === route) return handler;
  }
  return null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function fetchLiveData(path) {
  // Try to fetch from external APIs (these would be replaced with real API calls in production)
  // For now, return null to use mock data
  return null;
}

// ─── Worker entry point ───────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === "/health" || path === "/api/health") {
      return jsonResponse({ status: "ok", runtime: "cloudflare-workers-js" });
    }

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response("", { status: 204, headers: corsHeaders });
    }

    // Route matching
    const handler = routeHandler(path);
    if (handler) {
      try {
        const data = handler();
        return jsonResponse(data);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // Fallback
    return jsonResponse({
      error: "Not found",
      path,
      available: Object.keys(ROUTES),
    }, 404);
  },
};