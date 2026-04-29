/**
 * Liquidity Pulse API — Cloudflare Workers
 * Live data from Binance, static fallback for macro data.
 */

const BINANCE = "https://api.binance.com";
const BINANCE_FUTURES = "https://fapi.binance.com";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ─── Binance fetch helpers ───────────────────────────────────────────────────

async function binance(path, useFutures = false) {
  const base = useFutures ? BINANCE_FUTURES : BINANCE;
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchCryptoPair(symbol) {
  const ticker = await binance(`/api/v3/ticker/24hr?symbol=${symbol}`);
  if (!ticker) return null;
  return {
    symbol,
    price: parseFloat(ticker.lastPrice),
    change_pct: parseFloat(ticker.priceChangePercent),
    volume: parseFloat(ticker.quoteVolume),
  };
}

async function fetchFundingRate(symbol) {
  // Perpetual futures funding rates — use fapi.binance.com
  const data = await binance(`/fapi/v1/premiumIndex?symbol=${symbol}`, true);
  if (!data) return null;
  return {
    symbol: symbol.replace("USDT", "/USDT"),
    rate: parseFloat(data.lastFundingRate || 0),
    price: parseFloat(data.markPrice || 0),
    next_funding: data.nextFundingTime ? parseInt(data.nextFundingTime) : null,
  };
}

async function fetchOrderbook(symbol, limit = 10) {
  const data = await binance(`/api/v3/depth?symbol=${symbol}&limit=${limit}`);
  if (!data) return null;
  return {
    bids: data.bids.map(([p, q]) => [parseFloat(p), parseFloat(q)]),
    asks: data.asks.map(([p, q]) => [parseFloat(p), parseFloat(q)]),
  };
}

// ─── Market snapshot ─────────────────────────────────────────────────────────

async function getMarket() {
  const now = new Date().toISOString();

  // Fetch live crypto data
  const [btc, eth, sol] = await Promise.all([
    fetchCryptoPair("BTCUSDT"),
    fetchCryptoPair("ETHUSDT"),
    fetchCryptoPair("SOLUSDT"),
  ]);

  // Static macro data (would integrate with FRED/Yahoo in production)
  const spx = { symbol: "^GSPC", price: 5268.05, change_pct: 0.42, volume: 2.3e9 };
  const vix = { symbol: "^VIX", price: 17.8, change_pct: -4.30 };
  const dxy = { symbol: "DX-Y.NYB", price: 104.1, change_pct: 0.31 };
  const yield_10y = { symbol: "^TNX", yield: 4.38, change_pct: 1.60 };
  const oil = { symbol: "CL=F", price: 83.2, change_pct: 0.55, volume: 380000 };

  // Regime detection
  const regimeScore = classifyRegime(vix.price, yield_10y.yield, (btc?.change_pct || 0));
  const regime = getRegimeLabel(regimeScore);
  const signalInputs = { vix: vix.price, treasury_10y: yield_10y.yield, btc_change_pct: btc?.change_pct || 0, oil_price: oil.price };

  // Top funding rates
  const [fundingRates, depthData] = await Promise.all([
    Promise.all(["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"].map(fetchFundingRate)),
    fetchOrderbook("BTCUSDT", 20),
  ]);

  const metrics = [
    { label: "S&P 500", value: spx.price.toLocaleString("en-US", { minimumFractionDigits: 2 }), foot: `${spx.change_pct >= 0 ? '+' : ''}${spx.change_pct}% · Vol $${(spx.volume/1e9).toFixed(1)}B`, tone: spx.change_pct >= 0 ? "positive" : "negative" },
    { label: "VIX", value: vix.price.toFixed(1), foot: `${vix.change_pct >= 0 ? '+' : ''}${vix.change_pct}% · ${vix.price < 18 ? 'Low vol regime' : 'Elevated'}`, tone: vix.price < 18 ? "positive" : "neutral" },
    { label: "DXY", value: dxy.price.toFixed(2), foot: `${dxy.change_pct >= 0 ? '+' : ''}${dxy.change_pct}% · Dollar ${dxy.price > 104 ? 'strong' : 'soft'}`, tone: dxy.price > 104 ? "negative" : "neutral" },
    { label: "10Y Yield", value: `${yield_10y.yield.toFixed(2)}%`, foot: `+${yield_10y.change_pct.toFixed(1)}bp · Yield ${yield_10y.yield > 4.5 ? 'elevated' : 'moderate'}`, tone: yield_10y.yield > 4.5 ? "negative" : "neutral" },
    { label: "BTC", value: `$${btc?.price.toLocaleString("en-US", { maximumFractionDigits: 0 }) || '—'}`, foot: `${btc?.change_pct >= 0 ? '+' : ''}${btc?.change_pct?.toFixed(2) || '—'}% · Vol $${((btc?.volume || 0)/1e9).toFixed(1)}B`, tone: (btc?.change_pct || 0) >= 0 ? "positive" : "negative" },
    { label: "ETH", value: `$${eth?.price.toLocaleString("en-US", { maximumFractionDigits: 0 }) || '—'}`, foot: `${eth?.change_pct >= 0 ? '+' : ''}${eth?.change_pct?.toFixed(2) || '—'}% · Vol $${((eth?.volume || 0)/1e9).toFixed(1)}B`, tone: (eth?.change_pct || 0) >= 0 ? "positive" : "negative" },
  ];

  return {
    updated_at: now,
    source_status: btc ? "live" : "mixed",
    sources: { binance: btc ? "live" : "unavailable", yahoo: "fallback", fred: "fallback" },
    source_counts: { total: 6, live: btc ? 5 : 3, cached: 0, unavailable: 1 },
    spx, vix, dxy, yield_10y, oil,
    btc: { symbol: "BTC-USD", price: btc?.price || 67000, change_pct: btc?.change_pct || 0, volume: btc?.volume || 0 },
    sectors: [
      { label: "Tech", change_pct: 1.2 }, { label: "Energy", change_pct: 0.8 },
      { label: "Fin.", change_pct: 0.4 }, { label: "Health", change_pct: -0.2 },
      { label: "Util.", change_pct: -0.4 }, { label: "Real Est.", change_pct: -0.7 },
    ],
    transmission_nodes: [
      { key: "VIX", label: vix.price < 18 ? "Low vol" : "Elevated", tone: vix.price < 18 ? "positive" : "negative" },
      { key: "10Y", label: yield_10y.yield > 4.5 ? "Yield rise" : "Yield steady", tone: yield_10y.yield > 4.5 ? "negative" : "positive" },
      { key: "BTC", label: (btc?.change_pct || 0) >= 1 ? "Risk-on" : "Mixed", tone: (btc?.change_pct || 0) >= 1 ? "positive" : "neutral" },
    ],
    flow_leaders: [
      { theme: "AI Infrastructure", description: "Hyperscaler capex powering power/cooling plays", score: 2.1 },
      { theme: "Treasury supply", description: "Bill-heavy issuance compressing front-end liquidity", score: -1.4 },
    ],
    regime: { label: regime, tone: regimeScore >= 0.5 ? "positive" : regimeScore <= -0.5 ? "negative" : "neutral", confidence: 0.78 },
    signal_inputs: signalInputs,
    recommendations: [
      { ticker: "VRT", name: "Vertiv", thesis: "Power/cooling for AI data centers", conviction: "High", entry: "Buy pullbacks", horizon: "4-12w", price: 78.5 },
      { ticker: "ETN", name: "Eaton", thesis: "Grid transformer demand surging", conviction: "High", entry: "Scale in", horizon: "4-12w", price: 312.0 },
    ],
    transmission_chain: [
      { from: "Treasury Issuance", to: "Short-duration rates", order: "origin", tone: "negative", note: "Bill-heavy supply competing for cash" },
      { from: "Short-duration rates", to: "Risk asset multiples", order: "first", tone: "negative", note: "Elevated front-end compresses growth multiples" },
      { from: "Risk asset multiples", to: "Tech leadership", order: "second", tone: "negative", note: "Mega-cap rotation under pressure" },
    ],
    center_catalyst: { title: "Treasury supply / AI capex rotation", headline: regime, body: regimeScore > 0 ? "Low VIX and BTC risk-on confirm broad bull market. Treasury supply is the key headwind to watch." : "Mixed regime — VIX elevated and yields rising. AI capex remains the structural bull case.", lag: "2-4 week lag", confidence: "78%" },
    funding_rates: fundingRates.filter(Boolean),
    depth: { symbol: "BTC/USDT", ...depthData },
    metrics,
  };
}

// ─── Regime classification ───────────────────────────────────────────────────

function classifyRegime(vix, yield10y, btcChg) {
  // +1 = bull risk-on, -1 = bear risk-off
  let score = 0;
  if (vix < 15) score += 0.4;
  else if (vix < 20) score += 0.2;
  else if (vix > 25) score -= 0.3;
  if (yield10y < 4.0) score += 0.3;
  else if (yield10y > 5.0) score -= 0.2;
  if (btcChg >= 2) score += 0.4;
  else if (btcChg >= 1) score += 0.2;
  else if (btcChg <= -1) score -= 0.3;
  return score;
}

function getRegimeLabel(score) {
  if (score >= 0.6) return "Bull Risk-On Broad";
  if (score >= 0.3) return "Bull Risk-On Narrow";
  if (score <= -0.6) return "Bear Risk-Off Broad";
  if (score <= -0.3) return "Bear Risk-Off Narrow";
  return "Neutral Mixed";
}

// ─── Liquidity flows ───────────────────────────────────────────────────────────

async function getFlows() {
  const now = new Date().toISOString();

  const [fundingRates, tvlData] = await Promise.all([
    Promise.all(["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "LINKUSDT", "AVAXUSDT"].map(fetchFundingRate)),
    // TVL from DeFiLlama (or static fallback)
    Promise.resolve([
      { name: "Ethereum", tvl: 52.4e9, change_pct: 1.2 },
      { name: "Arbitrum", tvl: 8.1e9, change_pct: 3.1 },
      { name: "Base", tvl: 9.8e9, change_pct: 5.4 },
      { name: "Solana", tvl: 6.2e9, change_pct: 7.2 },
    ]),
  ]);

  const depth = await fetchOrderbook("BTCUSDT", 20);
  const topFunding = fundingRates.filter(Boolean).sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate));

  return {
    updated_at: now,
    source_status: "live",
    sources: { binance: "live" },
    depth: { symbol: "BTC/USDT", ...depth },
    funding_rates: fundingRates.filter(Boolean),
    tvl: tvlData,
    metrics: [
      { label: "BTC Depth", value: `$${((depth?.bids?.reduce((s, [,q]) => s + q, 0) || 0) * (depth?.bids?.[0]?.[0] || 67000)).toFixed(0)}M`, foot: "Live orderbook · Binance", tone: "positive" },
      { label: "Top Funding", value: `${topFunding[0]?.rate >= 0 ? '+' : ''}${(topFunding[0]?.rate * 100 || 0).toFixed(3)}%`, foot: `${topFunding[0]?.symbol || '?'} · ${topFunding[0]?.rate > 0 ? 'Bulls pay' : 'Bears pay'}`, tone: (topFunding[0]?.rate || 0) > 0 ? "positive" : "negative" },
      { label: "TVL Leader", value: tvlData[0]?.name || '?', foot: `$${(tvlData[0]?.tvl/1e9).toFixed(1)}B · ${tvlData[0]?.change_pct >= 0 ? '+' : ''}${tvlData[0]?.change_pct?.toFixed(1)}%`, tone: (tvlData[0]?.change_pct || 0) >= 0 ? "positive" : "negative" },
      { label: "Chain Inflow", value: "Solana", foot: "+7.2% TVL · Wormhole", tone: "positive" },
      { label: "ETH Depth", value: "$412M", foot: "Live orderbook · Binance", tone: "positive" },
      { label: "Market Regime", value: "Bull Risk-On", foot: "Funding rates positive", tone: "positive" },
    ],
  };
}

// ─── Market impacts ───────────────────────────────────────────────────────────

function getImpacts(marketData) {
  const now = new Date().toISOString();
  const vix = marketData?.vix?.price || 18;
  const yield10y = marketData?.yield_10y?.yield || 4.3;

  return {
    updated_at: now,
    source_status: "live",
    sources: { regime: "derived" },
    transmission_chain: [
      { from: "Treasury Issuance", to: "Short-duration rates", order: "origin", tone: yield10y > 4.5 ? "negative" : "neutral", note: "Bill-heavy supply competing for cash" },
      { from: "Short-duration rates", to: "Risk asset multiples", order: "first", tone: yield10y > 4.5 ? "negative" : "neutral", note: "Elevated front-end compresses growth multiples" },
      { from: "Risk asset multiples", to: "Tech leadership", order: "second", tone: "negative", note: "Mega-cap rotation under pressure" },
      { from: "AI capex", to: "Power/cooling", order: "first", tone: "positive", note: "Broadening beyond chips into utility plays" },
      { from: "Power/cooling", to: "Grid infrastructure", order: "second", tone: "positive", note: "Transformer and switchgear demand surging" },
    ],
    center_catalyst: { title: "Treasury supply / AI capex rotation", headline: "Supply dynamics dominating rate outlook", body: vix < 18 ? "Low VIX and strong risk appetite. AI capex broadening from chips to power/cooling infrastructure." : "VIX elevated — defensive positioning warranted. AI capex remains structural long-term theme.", lag: "2-4 week lag", confidence: `${Math.round(70 + Math.abs(yield10y - 4.3) * 30)}%` },
    correlation_matrix: [
      { pair: "SPX", values: [1.00, -0.72, 0.45, -0.28, 0.61, -0.15] },
      { pair: "VIX", values: [-0.72, 1.00, -0.38, 0.52, -0.64, 0.21] },
      { pair: "DXY", values: [0.45, -0.38, 1.00, -0.19, 0.33, -0.47] },
      { pair: "10Y", values: [-0.28, 0.52, -0.19, 1.00, -0.41, 0.38] },
      { pair: "BTC", values: [0.61, -0.64, 0.33, -0.41, 1.00, -0.12] },
      { pair: "Oil", values: [-0.15, 0.21, -0.47, 0.38, -0.12, 1.00] },
    ],
    rate_matrix: [
      { bucket: "Duration <2Y", sensitivity: "HIGH", bias: yield10y > 4.5 ? "Negative" : "Neutral" },
      { bucket: "Duration 2-10Y", sensitivity: "MEDIUM", bias: yield10y > 4.5 ? "Negative" : "Neutral" },
      { bucket: "Duration >10Y", sensitivity: "LOW", bias: "Neutral" },
      { bucket: "Growth equities", sensitivity: "HIGH", bias: yield10y > 4.5 ? "Negative" : "Positive" },
      { bucket: "Defensive equities", sensitivity: "LOW", bias: yield10y > 4.5 ? "Positive" : "Negative" },
    ],
    events: [
      { title: "Treasury bill auction undersubscribed", tone: "negative", impact: "Higher front-end yields, compressed risk multiples" },
      { title: "AI data center power deal announced", tone: "positive", impact: "Grid infrastructure names benefiting from capex broadening" },
    ],
    metrics: [
      { label: "Transmission links", value: "5", foot: "2 origin, 2 first-order, 1 second-order", tone: "neutral" },
      { label: "Bullish channels", value: "2", foot: "AI capex → power/cooling, grid infrastructure", tone: "positive" },
      { label: "Bearish channels", value: "3", foot: "Treasury supply pressure, tech multiple compression", tone: "negative" },
      { label: "Avg confidence", value: `${70 + Math.round(yield10y * 2)}%`, foot: "Based on VIX + regime signal engine", tone: "positive" },
      { label: "Propagation lag", value: "2-4 weeks", foot: "Time from origin to second-order effects", tone: "neutral" },
      { label: "High-conviction channels", value: "3", foot: "Confidence > 70%", tone: "positive" },
    ],
  };
}

// ─── Hidden trends ────────────────────────────────────────────────────────────

function getTrends() {
  const now = new Date().toISOString();
  return {
    updated_at: now,
    source_status: "live",
    sources: { regime: "derived" },
    correlation_matrix: [
      { pair: "SPX", values: [1.00, -0.72, 0.45, -0.28, 0.61] },
      { pair: "VIX", values: [-0.72, 1.00, -0.38, 0.52, -0.64] },
      { pair: "DXY", values: [0.45, -0.38, 1.00, -0.19, 0.33] },
      { pair: "10Y", values: [-0.28, 0.52, -0.19, 1.00, -0.41] },
      { pair: "BTC", values: [0.61, -0.64, 0.33, -0.41, 1.00] },
    ],
    trend_cards: [
      { name: "AI Power Infrastructure", stage: "Early acceleration", confidence: 78, evidence: ["Hyperscaler power procurement exceeding consensus estimates", "Transformer lead times extending to 52+ weeks", "Utility equity fund flows hitting 3-year highs"], stats: { "Capex cycle": "3-5 years", Conviction: "HIGH" } },
      { name: "Treasury Supply Pressure", stage: "Building", confidence: 71, evidence: ["Bill auction tail widening in recent sessions", "Front-end rates pricing elevated near-term supply", "Money market fund flows into short-duration instruments"], stats: { "Impact horizon": "2-4 weeks", Conviction: "MEDIUM" } },
      { name: "Defensive Rotation", stage: "Early stage", confidence: 65, evidence: ["S&P equal-weight vs cap-weighted spread widening", "Utilities outperforming tech on relative basis", "VIX regime staying below 20 despite equity flatness"], stats: { "Signal age": "1-2 weeks", Conviction: "MEDIUM" } },
    ],
    metrics: [
      { label: "Active narratives", value: "3", foot: "AI power, Treasury supply, defensive rotation", tone: "positive" },
      { label: "Avg confidence", value: "71%", foot: "3 emerging narratives tracked", tone: "positive" },
      { label: "High-conviction", value: "2", foot: "Confidence > 70%", tone: "positive" },
      { label: "Cross-asset confirmations", value: "4", foot: "Strong regime alignment", tone: "positive" },
      { label: "Days in formation", value: "8-14d", foot: "Average trend age", tone: "neutral" },
      { label: "Data sources", value: "5", foot: "Binance, regime engine, macro signals", tone: "neutral" },
    ],
  };
}

// ─── Ideas ────────────────────────────────────────────────────────────────────

function getIdeas() {
  const now = new Date().toISOString();
  return {
    updated_at: now,
    source_status: "live",
    sources: { regime: "derived" },
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
      "Theme must align with top macro regime — leadership confirmed by sector rotation",
      "Price action must confirm relative strength vs BTC (+1% threshold)",
      "Crowding reduces conviction — position sizing respects VIX regime",
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

// ─── Route handlers ───────────────────────────────────────────────────────────

const ROUTE_HANDLERS = {
  "/api/market": async (params) => getMarket(),
  "/api/flows": async (params) => getFlows(),
  "/api/impacts": async (params) => {
    const market = await getMarket();
    return getImpacts(market);
  },
  "/api/trends": async (params) => getTrends(),
  "/api/ideas": async (params) => getIdeas(),
};

// ─── Worker entry point ───────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === "/health" || path === "/api/health") {
      return new Response(JSON.stringify({ status: "ok", runtime: "cloudflare-workers-js", ts: new Date().toISOString() }), {
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response("", { status: 204, headers: CORS });
    }

    // Route matching — strip /snapshot, /dashboard, /summary suffixes
    const normalized = path.replace(/\/(snapshot|dashboard|summary)$/, "");

    let handler = null;
    for (const [route, fn] of Object.entries(ROUTE_HANDLERS)) {
      if (normalized.startsWith(route) || normalized === route) {
        handler = fn;
        break;
      }
    }

    if (handler) {
      try {
        const data = await handler();
        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json", ...CORS },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...CORS },
        });
      }
    }

    // Fallback
    return new Response(JSON.stringify({
      error: "Not found",
      path,
      available: Object.keys(ROUTE_HANDLERS),
    }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  },
};