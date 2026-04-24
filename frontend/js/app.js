import { fetchPageData } from './api.js';
import { NAV_ITEMS, REFRESH_INTERVAL_MS, ROUTE_TITLES } from './constants.js';
import {
  escapeHtml,
  formatCompactNumber,
  formatCurrency,
  formatDateTime,
  formatMetricValue,
  formatSignedPercent,
  routeFromHash,
  toneClass,
} from './helpers.js';

const appEl = document.getElementById('app');
const state = {
  route: normalizeRoute(routeFromHash(window.location.hash)),
  cache: new Map(),
  loading: true,
  refreshing: false,
  error: '',
  isRefreshing: false,       // true while any route is being fetched
  lastAllRefreshed: null,    // timestamp of last complete full refresh
  pendingRoutes: new Set(),  // routes currently being fetched
};

function normalizeRoute(route) {
  return NAV_ITEMS.some((item) => item.id === route) ? route : 'discovery';
}

function activeHash(route) {
  return route === 'discovery' ? '#/' : `#/${route}`;
}

function metricCard(metric) {
  return `
    <div class="metric-card">
      <div class="metric-label">${escapeHtml(metric.label)}</div>
      <div class="metric-value ${toneClass(metric.tone)}">${escapeHtml(formatMetricValue(metric.value))}</div>
      <div class="metric-foot">${escapeHtml(metric.foot || '')}</div>
    </div>
  `;
}

function renderMetrics(metrics = []) {
  return `<section class="metrics-row six-up">${metrics.slice(0, 6).map(metricCard).join('')}</section>`;
}

function sourceStatusLabel(status) {
  if (status === 'live') return 'Data: Live';
  if (status === 'cached') return 'Data: Cached';
  if (status === 'unavailable') return 'Data: Unavailable';
  if (status === 'fallback') return 'Data: Fallback';
  return 'Data: Mixed';
}

function sourceStatusClass(status) {
  if (status === 'live') return 'green';
  if (status === 'unavailable' || status === 'fallback') return 'red';
  return 'blue';
}

function renderSidebar(route) {
  const refreshLabel = state.refreshing ? 'Refreshing…' : 'Refresh signals';
  return `
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-kicker">Terminal v1.0</div>
        <div class="sidebar-subtitle">Institutional market intelligence</div>
      </div>

      <nav class="side-nav">
        ${NAV_ITEMS.map(
          (item) => `
            <a class="side-link ${item.id === route ? 'active' : ''}" href="${item.hash}">
              <div class="left"><span class="side-icon">${item.short}</span><span>${item.label}</span></div>
              <span>${item.id === route ? '›' : ''}</span>
            </a>
          `,
        ).join('')}
      </nav>

      <div class="sidebar-footer">
        <button class="button-primary" data-action="refresh" ${state.isRefreshing ? 'disabled aria-busy="true"' : ''}>${state.isRefreshing ? 'Refreshing…' : 'Refresh signals'}</button>
      </div>
    </aside>
  `;
}

function renderTopbar(route, data) {
  const regimeLabel = data?.regime?.label || ROUTE_TITLES[route] || 'Live';
  const regimeTone = data?.regime?.tone || 'neutral';
  const dataStatus = data?.source_status || 'fallback';
  const dataStatusLabel = sourceStatusLabel(dataStatus);
  const dataStatusClass = sourceStatusClass(dataStatus);

  let refreshLabel = '';
  if (state.isRefreshing) {
    refreshLabel = 'Refreshing…';
  } else if (state.lastAllRefreshed) {
    refreshLabel = `Refreshed ${formatDateTime(state.lastAllRefreshed)}`;
  } else if (data?.updated_at) {
    refreshLabel = formatDateTime(data.updated_at);
  }

  return `
    <header class="topbar">
      <div class="brand-row">
        <div class="brand">LIQUIDITY PULSE</div>
      </div>

      <div class="topbar-actions">
        <div class="status-group">
          <div class="regime-badge ${regimeTone}"><span class="dot"></span>${escapeHtml(regimeLabel)}</div>
          <div class="badge-pill ${dataStatusClass} data-source-badge">${escapeHtml(dataStatusLabel)}</div>
          ${refreshLabel ? `<div class="chip" style="background:rgba(173,198,255,0.10); border:1px solid rgba(173,198,255,0.18); color:var(--primary);">${escapeHtml(refreshLabel)}</div>` : ''}
        </div>
      </div>
    </header>
  `;
}

function renderDiscovery(data) {
  const nodes = (data.transmission_nodes || [])
    .map((node) => {
      const toneClassName = node.tone === 'positive' ? 'green-node' : node.tone === 'negative' ? 'red-node' : '';
      return `
        <div class="flow-node ${toneClassName}">
          <div class="flow-node-circle">${escapeHtml(node.key)}</div>
          <div class="flow-node-label">${escapeHtml(node.label)}</div>
        </div>
      `;
    })
    .join('');

  const leaders = (data.flow_leaders || [])
    .map(
      (item) => `
        <div class="theme-item">
          <div>
            <div class="theme-name">${escapeHtml(item.theme)}</div>
            <div class="theme-meta">${escapeHtml(item.description)}</div>
          </div>
          <div class="theme-score ${item.score >= 0 ? 'green' : 'red'}">${item.score >= 0 ? '+' : ''}${item.score.toFixed(1)}%</div>
          <svg class="sparkline" viewBox="0 0 84 24"><path stroke="${item.score >= 0 ? '#4edea3' : '#ffb3ad'}" d="M2 18 L12 16 L22 18 L32 12 L42 13 L52 8 L62 10 L72 5 L82 7"></path></svg>
        </div>
      `,
    )
    .join('');

  const recommendationRows = (data.recommendations || [])
    .map(
      (item) => `
        <tr>
          <td><strong>${escapeHtml(item.ticker)}</strong></td>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.thesis)}</td>
          <td>${escapeHtml(item.conviction)}</td>
          <td>${escapeHtml(item.entry)}</td>
          <td>${escapeHtml(item.horizon)}</td>
        </tr>
      `,
    )
    .join('');

  const watchItems = (data.recommendations || [])
    .map(
      (item) => `
        <div class="watch-item">
          <div class="watch-left">
            <div class="watch-ticker">${escapeHtml(item.ticker)}</div>
            <div class="watch-note">${escapeHtml(item.entry)}</div>
          </div>
          <div class="watch-right">
            <div class="watch-price">${escapeHtml(item.conviction)}</div>
            <div class="watch-note">${escapeHtml(item.horizon)}</div>
          </div>
        </div>
      `,
    )
    .join('');

  return `
    <section class="hero-row">
      <div>
        <h1 class="page-title">Market Discovery</h1>
        <p class="page-subtitle">Unified intelligence dashboard for news-to-impact mapping, liquidity flows, cross-asset transmission, hidden trend detection, and idea generation.</p>
      </div>
      <div class="hero-meta">
        <div class="chip" style="background:rgba(78,222,163,0.10); border:1px solid rgba(78,222,163,0.18); color:var(--secondary);">${escapeHtml(data.regime?.label || 'Live')}</div>
        <div class="chip" style="background:rgba(173,198,255,0.10); border:1px solid rgba(173,198,255,0.18); color:var(--primary);">24h View</div>
      </div>
    </section>

    ${renderMetrics(data.metrics)}

    <section class="grid-12">
      <article class="panel hero-panel">
        <div class="panel-header">
          <div>
            <div class="panel-kicker">Centerpiece explainer</div>
            <h2 class="panel-title">Market Transmission Map</h2>
            <p class="panel-subtitle">Macro anchors, dominant catalyst, and the first- and second-order areas where capital appears to be rotating.</p>
          </div>
          <div class="chip" style="background:rgba(255,255,255,0.04); border:1px solid rgba(140,144,159,0.16); color:var(--on-surface-variant);">Live model</div>
        </div>
        <div class="hero-surface">
          <div class="hero-map">
            <div class="node-row">${nodes}</div>
            <div class="center-catalyst">
              <div class="title">Dominant catalyst</div>
              <div class="headline">AI power demand + sticky rates</div>
              <div class="body">Risk appetite is stabilizing while elevated yields keep investors selective. Leadership remains strongest in power, cooling, electrical equipment, and second-order infrastructure beneficiaries.</div>
              <div class="chip" style="margin:0 auto; background:rgba(78,222,163,0.10); border:1px solid rgba(78,222,163,0.18); color:var(--secondary);">Confidence ${Math.round((data.regime?.confidence || 0.7) * 100)}%</div>
            </div>
          </div>
        </div>
      </article>

      <div class="stack-panel">
        <article class="panel">
          <div class="panel-header">
            <div>
              <div class="panel-kicker">Ranked themes</div>
              <h2 class="panel-title">Flow Leaders</h2>
            </div>
            <div class="chip" style="background:rgba(255,255,255,0.04); border:1px solid rgba(140,144,159,0.16); color:var(--on-surface-variant);">4h</div>
          </div>
          <div class="theme-list">${leaders}</div>
        </article>
      </div>
    </section>

    <section class="recommendations-grid">
      <article class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-kicker">Actionable output</div>
            <h2 class="panel-title">Top Recommendations</h2>
          </div>
        </div>
        <div class="table-scroll">
          <table class="recommendation-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Name</th>
                <th>Thesis</th>
                <th>Conviction</th>
                <th>Entry</th>
                <th>Horizon</th>
              </tr>
            </thead>
            <tbody>${recommendationRows}</tbody>
          </table>
        </div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-kicker">Quick scan</div>
            <h2 class="panel-title">Watchlist</h2>
          </div>
        </div>
        <div class="watchlist">${watchItems}</div>
      </article>
    </section>
  `;
}

function initials(label) {
  const tokens = String(label || '')
    .split(/[\s/:_-]+/)
    .filter(Boolean);
  if (!tokens.length) return 'NA';
  return tokens
    .slice(0, 2)
    .map((token) => token[0])
    .join('')
    .toUpperCase();
}

const FLOW_VENUES = ['Binance', 'Coinbase', 'OKX', 'Bybit', 'Hyperliquid', 'Kraken'];

function deriveCrossVenueFlows(fundingRates = []) {
  const defaults = [
    { venue: 'Binance', pair: 'BTC/USDT', direction: 'in', magnitude_usd: 412_000_000, meta: '+1.20% 24h · funding 0.010%' },
    { venue: 'Coinbase', pair: 'ETH/USDT', direction: 'in', magnitude_usd: 188_000_000, meta: '+0.84% 24h · funding 0.008%' },
    { venue: 'Kraken', pair: 'SOL/USDT', direction: 'in', magnitude_usd: 94_000_000, meta: '+2.10% 24h · funding 0.012%' },
    { venue: 'OKX', pair: 'ARB/USDT', direction: 'out', magnitude_usd: 241_000_000, meta: '-1.35% 24h · funding -0.006%' },
    { venue: 'Bybit', pair: 'BNB/USDT', direction: 'out', magnitude_usd: 108_000_000, meta: '-0.74% 24h · funding -0.004%' },
    { venue: 'Hyperliquid', pair: 'ETH/USDT', direction: 'out', magnitude_usd: 74_000_000, meta: '-0.42% 24h · funding -0.003%' },
  ];

  const rows = Array.isArray(fundingRates) ? fundingRates.slice(0, 6) : [];
  if (!rows.length) {
    return {
      inflows: defaults.filter((row) => row.direction === 'in').slice(0, 3),
      outflows: defaults.filter((row) => row.direction === 'out').slice(0, 3),
    };
  }

  const averageChange = rows.reduce((sum, item) => sum + Number(item.change_pct || 0), 0) / rows.length;
  const computed = rows.map((item, index) => {
    const changePct = Number(item.change_pct || 0);
    const rate = Number(item.rate || 0);
    const price = Number(item.price || 0);
    const venue = FLOW_VENUES[index] || String(item.symbol || '').split('/')[0] || `Venue ${index + 1}`;
    const directionScore = (changePct - averageChange) + (rate * 5000);
    const direction = directionScore > 0 ? 'in' : directionScore < 0 ? 'out' : (index % 2 === 0 ? 'in' : 'out');
    const magnitude_usd = Math.max(
      25_000_000,
      Math.round((Math.abs(changePct) + 0.75) * (Math.log10(Math.abs(price) + 10) + 1) * 18_000_000),
    );
    return {
      venue,
      pair: item.symbol || `PAIR-${index + 1}`,
      direction,
      magnitude_usd,
      meta: `${formatSignedPercent(changePct)} 24h · funding ${(rate * 100).toFixed(3)}%`,
    };
  });

  const ranked = [...computed].sort((a, b) => b.magnitude_usd - a.magnitude_usd);
  let inflows = computed.filter((row) => row.direction === 'in');
  let outflows = computed.filter((row) => row.direction === 'out');

  if (inflows.length < 3 || outflows.length < 3) {
    inflows = [];
    outflows = [];
    ranked.forEach((row, index) => {
      const normalized = { ...row, direction: index % 2 === 0 ? 'in' : 'out' };
      if (normalized.direction === 'in') inflows.push(normalized);
      else outflows.push(normalized);
    });
  }

  while (inflows.length < 3) inflows.push(defaults[inflows.length]);
  while (outflows.length < 3) outflows.push(defaults[3 + outflows.length]);

  return { inflows: inflows.slice(0, 3), outflows: outflows.slice(0, 3) };
}

function deriveBridgeFlows(tvlRows = []) {
  const defaults = [
    { name: 'Arbitrum', direction: 'in', eth_equivalent: 8240, note: '+3.10% TVL · 8.1B TVL' },
    { name: 'Base', direction: 'in', eth_equivalent: 4820, note: '+4.30% TVL · 3.6B TVL' },
    { name: 'Solana', direction: 'in', eth_equivalent: 3140, note: '+5.70% TVL · 4.2B TVL' },
    { name: 'Ethereum L1', direction: 'out', eth_equivalent: 16200, note: '-2.40% TVL · rotation into L2s' },
  ];

  const rows = Array.isArray(tvlRows) ? tvlRows.slice(0, 5) : [];
  if (!rows.length) return defaults;

  const ranked = [...rows].sort((a, b) => Number(b.tvl || 0) - Number(a.tvl || 0)).slice(0, 4);
  const hasNegative = ranked.some((row) => Number(row.change_pct || 0) < 0);

  const bridge = ranked.map((row, index) => {
    const changePct = Number(row.change_pct || 0);
    let direction = changePct < 0 ? 'out' : 'in';
    if (!hasNegative && index === 0) direction = 'out';
    const tvl = Number(row.tvl || 0);
    const eth_equivalent = Math.max(
      450,
      Math.round((Math.abs(changePct) + 0.35) * Math.log10(Math.max(1, tvl)) * 720),
    );
    return {
      name: direction === 'out' ? `${row.name} L1` : row.name,
      direction,
      eth_equivalent,
      note: `${formatSignedPercent(changePct)} TVL · ${formatCompactNumber(tvl)} TVL`,
    };
  });

  const inflows = bridge.filter((row) => row.direction === 'in').sort((a, b) => b.eth_equivalent - a.eth_equivalent);
  const outflows = bridge.filter((row) => row.direction === 'out').sort((a, b) => b.eth_equivalent - a.eth_equivalent);

  const normalized = [...inflows.slice(0, 3), ...outflows.slice(0, 1)];
  while (normalized.length < 4) normalized.push(defaults[normalized.length]);
  return normalized.slice(0, 4);
}

function deriveLiquiditySnapshotRows(fundingRates = [], depth = {}) {
  const fallbackRates = [
    { symbol: 'BTC/USDT', price: 67405, change_pct: 1.2, rate: 0.0001 },
    { symbol: 'ETH/USDT', price: 3520, change_pct: 0.8, rate: 0.0001 },
    { symbol: 'SOL/USDT', price: 162, change_pct: 2.1, rate: 0.0001 },
    { symbol: 'BNB/USDT', price: 590, change_pct: -0.7, rate: 0.0001 },
    { symbol: 'ARB/USDT', price: 1.07, change_pct: -1.3, rate: 0.0001 },
  ];

  const venueByPair = {
    'BTC/USDT': 'Binance · Coinbase · OKX',
    'ETH/USDT': 'Binance · Bybit · Hyperliquid',
    'SOL/USDT': 'Binance · Jupiter · Raydium',
    'BNB/USDT': 'Binance · Bybit · PancakeSwap',
    'ARB/USDT': 'Binance · Arbitrum DEX',
  };

  const rates = (Array.isArray(fundingRates) && fundingRates.length ? fundingRates : fallbackRates).slice(0, 5);
  const bids = Array.isArray(depth?.bids) ? depth.bids : [];
  const asks = Array.isArray(depth?.asks) ? depth.asks : [];

  const baseBidDepthUsd = bids.reduce((sum, level) => sum + (Number(level?.[0] || 0) * Number(level?.[1] || 0)), 0) || 180_000_000;
  const baseAskDepthUsd = asks.reduce((sum, level) => sum + (Number(level?.[0] || 0) * Number(level?.[1] || 0)), 0) || 165_000_000;
  const bestBid = Number(bids?.[0]?.[0] || 0);
  const bestAsk = Number(asks?.[0]?.[0] || 0);
  const baseSpreadPct = bestAsk > 0 ? ((bestAsk - bestBid) / bestAsk) * 100 : 0.02;

  return rates.map((item, index) => {
    const factor = Math.max(0.38, 1 - (index * 0.14));
    const pair = item.symbol || `PAIR-${index + 1}`;
    const changePct = Number(item.change_pct || 0);
    const price = Number(item.price || 0);

    const volumeUsd = Math.max(
      90_000_000,
      Math.round((Math.abs(changePct) + 0.9) * (Math.log10(Math.abs(price) + 10) + 1) * 85_000_000 * factor),
    );

    const bidDepthUsd = Math.max(
      12_000_000,
      Math.round(baseBidDepthUsd * factor * (1 + Math.max(changePct, 0) / 100)),
    );
    const askDepthUsd = Math.max(
      12_000_000,
      Math.round(baseAskDepthUsd * factor * (1 + Math.max(-changePct, 0) / 100)),
    );

    const imbalancePct = ((bidDepthUsd - askDepthUsd) / Math.max(askDepthUsd, 1)) * 100;
    const spread = `${Math.max(0.01, baseSpreadPct + (index * 0.01)).toFixed(2)}%`;

    let signal = 'Neutral';
    let signalClass = 'tag-blue';
    if (imbalancePct > 25) {
      signal = '▲ Bid pressure';
      signalClass = 'tag-green';
    } else if (imbalancePct < -25) {
      signal = '▼ Ask pressure';
      signalClass = 'tag-red';
    }

    return {
      pair,
      venues: venueByPair[pair] || 'Cross-venue composite',
      volumeUsd,
      bidDepthUsd,
      askDepthUsd,
      imbalancePct,
      spread,
      signal,
      signalClass,
    };
  });
}

function renderFlows(data) {
  const bestBid = data.depth?.bids?.[0] || [0, 0];
  const bestAsk = data.depth?.asks?.[0] || [0, 0];
  const venueFlows = deriveCrossVenueFlows(data.funding_rates || []);
  const bridgeRows = deriveBridgeFlows(data.tvl || []);
  const liquidityRows = deriveLiquiditySnapshotRows(data.funding_rates || [], data.depth || {});

  const fundingRows = (data.funding_rates || [])
    .map(
      (item) => `
        <tr>
          <td><strong>${escapeHtml(item.symbol)}</strong></td>
          <td>${formatCurrency(item.price)}</td>
          <td class="${item.change_pct >= 0 ? 'green' : 'red'}">${formatSignedPercent(item.change_pct)}</td>
          <td class="${(item.rate || 0) >= 0 ? 'green' : 'red'}">${Number(item.rate || 0).toFixed(5)}</td>
        </tr>
      `,
    )
    .join('');

  const tvlRows = (data.tvl || [])
    .map(
      (item) => `
        <tr>
          <td><strong>${escapeHtml(item.name)}</strong></td>
          <td>${formatCompactNumber(item.tvl)}</td>
          <td class="${item.change_pct >= 0 ? 'green' : 'red'}">${formatSignedPercent(item.change_pct)}</td>
        </tr>
      `,
    )
    .join('');

  const renderCrossFlowItem = (row) => `
    <div class="cross-flow-item">
      <div class="flow-badge ${row.direction === 'in' ? 'in' : 'out'}">${escapeHtml(initials(row.venue))}</div>
      <div>
        <div class="flow-pair">${escapeHtml(row.venue)}</div>
        <div class="flow-vol">${escapeHtml(row.meta)} · ${escapeHtml(row.pair)}</div>
      </div>
      <div class="flow-amount ${row.direction === 'in' ? 'green' : 'red'}">${row.direction === 'in' ? '+' : '-'}$${formatCompactNumber(row.magnitude_usd)}</div>
    </div>
  `;

  const renderBridgeItem = (row) => `
    <div class="cross-flow-item">
      <div class="flow-badge ${row.direction === 'in' ? 'in' : 'out'}">${escapeHtml(initials(row.name))}</div>
      <div>
        <div class="flow-pair">${escapeHtml(row.name)}</div>
        <div class="flow-vol">${escapeHtml(row.note)}</div>
      </div>
      <div style="text-align:right">
        <div class="flow-amount ${row.direction === 'in' ? 'green' : 'red'}">${row.direction === 'in' ? '+' : '-'}${formatCompactNumber(row.eth_equivalent)}</div>
        <div class="flow-unit">ETH equiv.</div>
      </div>
    </div>
  `;

  return `
    <section class="hero-row">
      <div>
        <h1 class="page-title">Liquidity Flows</h1>
        <p class="page-subtitle">Orderbook depth, funding, and chain-level capital movement. Focus on execution quality and persistent flow direction.</p>
      </div>
      <div class="hero-meta">
        <div class="chip" style="background:rgba(173,198,255,0.10); border:1px solid rgba(173,198,255,0.18); color:var(--primary);">${escapeHtml(data.depth?.symbol || 'BTC/USDT')}</div>
      </div>
    </section>
    ${renderMetrics(data.metrics)}

    <section class="grid-12">
      <article class="panel hero-panel">
        <div class="panel-header">
          <div>
            <div class="panel-kicker">Execution layer</div>
            <h2 class="panel-title">Orderbook Depth</h2>
            <p class="panel-subtitle">Top-of-book spread and near-book sizing for the selected perpetual pair.</p>
          </div>
          <div class="chip">Source: ${escapeHtml(data.sources?.orderbook || 'fallback')}</div>
        </div>
        <div class="split-grid">
          <div class="status-card"><strong>Best bid:</strong> ${formatCurrency(bestBid[0])} | <strong>Size:</strong> ${bestBid[1]}</div>
          <div class="status-card"><strong>Best ask:</strong> ${formatCurrency(bestAsk[0])} | <strong>Size:</strong> ${bestAsk[1]}</div>
        </div>
        <div class="table-scroll" style="margin-top:16px;">
          <table>
            <thead><tr><th>Bid Price</th><th>Bid Size</th><th>Ask Price</th><th>Ask Size</th></tr></thead>
            <tbody>
              ${(data.depth?.bids || []).slice(0, 5).map((bid, index) => `
                <tr>
                  <td>${formatCurrency(bid[0])}</td>
                  <td>${bid[1]}</td>
                  <td>${formatCurrency((data.depth?.asks || [])[index]?.[0] || 0)}</td>
                  <td>${(data.depth?.asks || [])[index]?.[1] || 0}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </article>

      <div class="stack-panel">
        <article class="panel">
          <div class="panel-header">
            <div>
              <div class="panel-kicker">Perpetuals</div>
              <h2 class="panel-title">Funding Rates</h2>
            </div>
            <div class="chip">Source: ${escapeHtml(data.sources?.funding || 'fallback')}</div>
          </div>
          <div class="table-scroll">
            <table class="recommendation-table">
              <thead><tr><th>Pair</th><th>Price</th><th>24h</th><th>Funding</th></tr></thead>
              <tbody>${fundingRows}</tbody>
            </table>
          </div>
        </article>

        <article class="panel">
          <div class="panel-header">
            <div>
              <div class="panel-kicker">Chain breadth</div>
              <h2 class="panel-title">TVL by Chain</h2>
            </div>
            <div class="chip">Source: ${escapeHtml(data.sources?.tvl || 'fallback')}</div>
          </div>
          <div class="table-scroll">
            <table>
              <thead><tr><th>Chain</th><th>TVL</th><th>Change</th></tr></thead>
              <tbody>${tvlRows}</tbody>
            </table>
          </div>
        </article>
      </div>
    </section>

    <section class="grid-12">
      <article class="panel split-panel">
        <div class="panel-header">
          <div>
            <div class="panel-kicker">Cross-venue direction</div>
            <h2 class="panel-title">Cross-Venue Net Flows</h2>
            <p class="panel-subtitle">Derived from funding and price momentum, normalized into directional venue pressure.</p>
          </div>
          <div class="chip">Derived · ${escapeHtml(data.sources?.funding || 'fallback')}</div>
        </div>
        <div class="cross-flow-grid">
          <div>
            <div class="split-col-title green"><span class="pulse-dot"></span>Inflows</div>
            <div class="cross-flow-list">${venueFlows.inflows.map(renderCrossFlowItem).join('')}</div>
          </div>
          <div>
            <div class="split-col-title red"><span class="pulse-dot"></span>Outflows</div>
            <div class="cross-flow-list">${venueFlows.outflows.map(renderCrossFlowItem).join('')}</div>
          </div>
        </div>
      </article>

      <article class="panel split-panel">
        <div class="panel-header">
          <div>
            <div class="panel-kicker">Chain destination</div>
            <h2 class="panel-title">On-Chain Bridge Flows</h2>
            <p class="panel-subtitle">TVL momentum transformed into net bridge direction to preserve the original command-center narrative.</p>
          </div>
          <div class="chip">Derived · ${escapeHtml(data.sources?.tvl || 'fallback')}</div>
        </div>
        <div class="cross-flow-list">${bridgeRows.map(renderBridgeItem).join('')}</div>
      </article>
    </section>

    <section>
      <article class="panel full-panel">
        <div class="panel-header">
          <div>
            <div class="panel-kicker">Cross-asset depth</div>
            <h2 class="panel-title">Top Asset Pairs — Liquidity Snapshot</h2>
            <p class="panel-subtitle">Composite depth, spread, and imbalance generated from live orderbook and funding context.</p>
          </div>
          <div class="chip">Derived · ${escapeHtml(data.sources?.orderbook || 'fallback')} / ${escapeHtml(data.sources?.funding || 'fallback')}</div>
        </div>
        <div class="table-scroll">
          <table class="chain-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>24h Volume</th>
                <th>Bid Depth</th>
                <th>Ask Depth</th>
                <th>Imbalance</th>
                <th>Spread</th>
                <th>Signal</th>
              </tr>
            </thead>
            <tbody>
              ${liquidityRows.map((row) => `
                <tr>
                  <td><div class="chain-name">${escapeHtml(row.pair)}</div><div class="chain-meta">${escapeHtml(row.venues)}</div></td>
                  <td>$${formatCompactNumber(row.volumeUsd)}</td>
                  <td class="green">$${formatCompactNumber(row.bidDepthUsd)}</td>
                  <td class="red">$${formatCompactNumber(row.askDepthUsd)}</td>
                  <td class="${row.imbalancePct >= 0 ? 'green' : 'red'}">${row.imbalancePct >= 0 ? '+' : ''}${row.imbalancePct.toFixed(0)}%</td>
                  <td>${row.spread}</td>
                  <td><span class="tag ${row.signalClass}">${escapeHtml(row.signal)}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  `;
}

function renderImpacts(data) {
  return `
    <section class="hero-row">
      <div>
        <h1 class="page-title">Market Impacts</h1>
        <p class="page-subtitle">How macro catalysts travel through rates, valuations, credit, and risk appetite.</p>
      </div>
    </section>
    ${renderMetrics(data.metrics)}
    <section class="split-grid">
      <article class="panel">
        <div class="panel-header"><div><div class="panel-kicker">Transmission chain</div><h2 class="panel-title">Macro to Market</h2></div></div>
        <div class="simple-list">${(data.transmission_chain || []).map((item) => `
          <div class="simple-item">
            <div class="simple-item-head"><div class="simple-item-title">${escapeHtml(item.from)} → ${escapeHtml(item.to)}</div><div class="badge-pill ${toneClass(item.tone)}">${escapeHtml(item.tone)}</div></div>
            <div class="simple-item-sub">${escapeHtml(item.note)}</div>
          </div>
        `).join('')}</div>
      </article>
      <article class="panel">
        <div class="panel-header"><div><div class="panel-kicker">Sensitivity matrix</div><h2 class="panel-title">Rate Exposure</h2></div></div>
        <table>
          <thead><tr><th>Bucket</th><th>Sensitivity</th><th>Bias</th></tr></thead>
          <tbody>${(data.rate_matrix || []).map((row) => `<tr><td>${escapeHtml(row.bucket)}</td><td>${escapeHtml(row.sensitivity)}</td><td>${escapeHtml(row.bias)}</td></tr>`).join('')}</tbody>
        </table>
      </article>
    </section>
    <section class="split-grid">
      <article class="panel">
        <div class="panel-header"><div><div class="panel-kicker">Correlations</div><h2 class="panel-title">Cross-Asset Matrix</h2></div></div>
        <table>
          <thead><tr><th>Pair</th><th>Correlation</th></tr></thead>
          <tbody>${(data.correlation_matrix || []).map((row) => `<tr><td>${escapeHtml(row.pair)}</td><td>${row.value}</td></tr>`).join('')}</tbody>
        </table>
      </article>
      <article class="panel">
        <div class="panel-header"><div><div class="panel-kicker">Recent events</div><h2 class="panel-title">Transmission Notes</h2></div></div>
        <div class="simple-list">${(data.events || []).map((item) => `
          <div class="simple-item">
            <div class="simple-item-head"><div class="simple-item-title">${escapeHtml(item.title)}</div><div class="badge-pill ${toneClass(item.tone)}">${escapeHtml(item.tone)}</div></div>
            <div class="simple-item-sub">${escapeHtml(item.impact)}</div>
          </div>
        `).join('')}</div>
      </article>
    </section>
  `;
}

function renderTrends(data) {
  return `
    <section class="hero-row">
      <div>
        <h1 class="page-title">Hidden Trends</h1>
        <p class="page-subtitle">Signals that have not yet become consensus: positioning anomalies, narrative drift, and second-order beneficiaries.</p>
      </div>
    </section>
    ${renderMetrics(data.metrics)}
    <section class="split-grid">
      <article class="panel">
        <div class="panel-header"><div><div class="panel-kicker">Anomalies</div><h2 class="panel-title">Positioning Outliers</h2></div></div>
        <div class="simple-list">${(data.anomalies || []).map((item) => `
          <div class="simple-item">
            <div class="simple-item-head"><div class="simple-item-title">${escapeHtml(item.asset)}</div><div class="badge-pill blue">${Math.round(item.confidence * 100)}%</div></div>
            <div class="simple-item-sub">${escapeHtml(item.signal)}</div>
          </div>
        `).join('')}</div>
      </article>
      <article class="panel">
        <div class="panel-header"><div><div class="panel-kicker">Trend cards</div><h2 class="panel-title">Emerging Narratives</h2></div></div>
        <div class="idea-grid">${(data.trend_cards || []).map((item) => `
          <div class="idea-card">
            <div class="idea-card-header">
              <div>
                <div class="idea-ticker">${escapeHtml(item.name)}</div>
                <div class="idea-name">Stage: ${escapeHtml(item.stage)}</div>
              </div>
              <div class="badge-pill ${item.confidence >= 65 ? 'green' : item.confidence < 55 ? 'red' : 'blue'}">${item.confidence}%</div>
            </div>
            <div class="idea-thesis">${(item.evidence || []).map((evidence) => `• ${escapeHtml(evidence)}`).join('<br>')}</div>
          </div>
        `).join('')}</div>
      </article>
    </section>
  `;
}

function renderIdeas(data) {
  const ideaCards = (data.ideas || []).map((idea) => `
    <div class="idea-card">
      <div class="idea-card-header">
        <div>
          <div class="idea-ticker">${escapeHtml(idea.ticker)}</div>
          <div class="idea-name">${escapeHtml(idea.name)} · ${escapeHtml(idea.theme)}</div>
        </div>
        <div class="badge-pill ${idea.conviction === 'High' ? 'green' : idea.conviction === 'Watch' ? 'red' : 'blue'}">${escapeHtml(idea.conviction)}</div>
      </div>
      <div class="idea-meta">
        <div class="badge-pill blue">${escapeHtml(idea.signal)}</div>
        <div class="badge-pill blue">${escapeHtml(idea.entry)}</div>
        <div class="badge-pill blue">${escapeHtml(idea.horizon)}</div>
      </div>
      <div class="idea-thesis">${formatCurrency(idea.price)} · <span class="${idea.change_pct >= 0 ? 'green' : 'red'}">${formatSignedPercent(idea.change_pct)}</span></div>
    </div>
  `).join('');

  const watchlist = (data.watchlist || []).map((item) => `
    <div class="watch-item">
      <div class="watch-left">
        <div class="watch-ticker">${escapeHtml(item.ticker)}</div>
        <div class="watch-note">${escapeHtml(item.note)}</div>
      </div>
      <div class="watch-right">
        <div class="watch-price">${formatCurrency(item.price)}</div>
        <div class="watch-note ${item.change_pct >= 0 ? 'green' : 'red'}">${formatSignedPercent(item.change_pct)}</div>
      </div>
    </div>
  `).join('');

  return `
    <section class="hero-row">
      <div>
        <h1 class="page-title">Ideas</h1>
        <p class="page-subtitle">Rule-based trade candidates aligned with the current transmission map and hidden trend stack.</p>
      </div>
    </section>
    ${renderMetrics(data.metrics)}
    <section class="split-grid">
      <article class="panel">
        <div class="panel-header"><div><div class="panel-kicker">Actionable names</div><h2 class="panel-title">Idea Cards</h2></div></div>
        <div class="idea-grid">${ideaCards}</div>
      </article>
      <article class="panel">
        <div class="panel-header"><div><div class="panel-kicker">Secondary signals</div><h2 class="panel-title">Watchlist</h2></div></div>
        <div class="watchlist">${watchlist}</div>
      </article>
    </section>
    <section>
      <article class="panel">
        <div class="panel-header"><div><div class="panel-kicker">Scoring method</div><h2 class="panel-title">Methodology</h2></div></div>
        <ul class="methodology-list">${(data.methodology || []).map((rule) => `<li>${escapeHtml(rule)}</li>`).join('')}</ul>
      </article>
    </section>
  `;
}

function renderSettings() {
  return `
    <section class="hero-row">
      <div>
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Future controls for refresh cadence, watchlists, signal thresholds, and data providers.</p>
      </div>
    </section>
    <section>
      <article class="panel">
        <div class="panel-header"><div><div class="panel-kicker">Roadmap</div><h2 class="panel-title">Configuration</h2></div></div>
        <div class="simple-list">
          <div class="simple-item"><div class="simple-item-title">Alerts</div><div class="simple-item-sub">Planned: threshold-based signal alerts and watchlist delivery.</div></div>
          <div class="simple-item"><div class="simple-item-title">Data providers</div><div class="simple-item-sub">Currently: Yahoo Finance, FRED, Binance/CCXT, with graceful fallbacks.</div></div>
        </div>
      </article>
    </section>
  `;
}

function renderError(error) {
  return `<div class="page-error">${escapeHtml(error)}</div>`;
}

function renderContent(route, data) {
  if (route === 'flows') return renderFlows(data);
  if (route === 'impacts') return renderImpacts(data);
  if (route === 'trends') return renderTrends(data);
  if (route === 'ideas') return renderIdeas(data);
  if (route === 'settings') return renderSettings();
  return renderDiscovery(data);
}

function render() {
  const route = state.route;
  const data = state.cache.get(route) || {};
  const title = ROUTE_TITLES[route] || ROUTE_TITLES.discovery;
  const body = state.loading && !state.cache.get(route)
    ? `<section class="hero-row"><div><h1 class="page-title">${escapeHtml(title)}</h1><p class="page-subtitle">Loading live data…</p></div></section>`
    : `${state.error ? renderError(state.error) : ''}${renderContent(route, data)}`;

  appEl.innerHTML = `
    <div class="app-shell">
      ${renderSidebar(route)}
      ${renderTopbar(route, data)}
      <main class="main">
        <div class="canvas">${body}</div>
      </main>
    </div>
  `;
}

// Fetch a single route, update state on completion
async function _fetchRoute(route, options = {}) {
  const { manual = false } = options;
  state.pendingRoutes.add(route);
  if (manual) state.isRefreshing = true;
  render();

  try {
    const payload = await fetchPageData(route);
    state.cache.set(route, payload);
    state.error = '';
  } catch (err) {
    // Keep stale cache on failure; error is surfaced in the page
    if (!state.cache.has(route)) {
      state.error = 'Unable to load data.';
    }
  } finally {
    state.pendingRoutes.delete(route);
    if (state.pendingRoutes.size === 0) {
      state.isRefreshing = false;
      state.lastAllRefreshed = Date.now();
    }
    render();
  }
}

// Prefetch all routes on startup (background)
function prefetchAll() {
  for (const route of NAV_ITEMS.map((i) => i.id)) {
    if (route !== 'settings') {
      _fetchRoute(route, { manual: false });
    }
  }
}

// Refresh all routes (manual trigger or auto-refresh)
async function refreshAll() {
  for (const route of NAV_ITEMS.map((i) => i.id)) {
    if (route !== 'settings') {
      _fetchRoute(route, { manual: true });
    }
  }
}

async function loadRoute(route, force = false, trigger = 'system') {
  const normalized = normalizeRoute(route);
  const manualRefresh = trigger === 'manual';

  state.route = normalized;
  state.loading = !state.cache.has(normalized);

  // If manual refresh, re-fetch; otherwise background-refresh if not cached
  if (manualRefresh) {
    await _fetchRoute(normalized, { manual: true });
  } else if (!state.cache.has(normalized) || force) {
    // Show loading state only for the very first load with no cache
    if (!state.cache.has(normalized)) {
      render(); // show loading skeleton
    }
    // Background refresh — don't block on it
    _fetchRoute(normalized, { manual: false });
  } else {
    // Have cache, start background refresh
    _fetchRoute(normalized, { manual: false });
    state.loading = false;
    render();
  }
}

function bindEvents() {
  window.addEventListener('hashchange', () => {
    loadRoute(routeFromHash(window.location.hash));
  });

  document.addEventListener('click', (event) => {
    const refreshButton = event.target.closest('[data-action="refresh"]');
    if (refreshButton) {
      refreshAll();
    }
  });

  // Auto-refresh every REFRESH_INTERVAL_MS
  window.setInterval(() => {
    refreshAll();
  }, REFRESH_INTERVAL_MS);
}

// On startup: render immediately with empty cache (loading state),
// then prefetch all routes in background
bindEvents();
render();
prefetchAll();
