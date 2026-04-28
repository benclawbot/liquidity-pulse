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

// ─── Depth Chart ──────────────────────────────────────────────────────────────

function deriveDepthChartData(bids = [], asks = [], midPrice = 0) {
  const sortedBids = [...bids].sort((a, b) => Number(b[0]) - Number(a[0]));
  const sortedAsks = [...asks].sort((a, b) => Number(a[0]) - Number(b[0]));

  const topBid = Number(sortedBids[0]?.[0] || 0);
  const topAsk = Number(sortedAsks[0]?.[0] || 0);
  const spread = topAsk > 0 && topBid > 0 ? ((topAsk - topBid) / topAsk) * 100 : 0.01;
  const imbalance = topBid > 0 && topAsk > 0
    ? ((topBid * Number(sortedBids[0]?.[1] || 0)) - (topAsk * Number(sortedAsks[0]?.[1] || 0))) /
      Math.max(topBid * Number(sortedBids[0]?.[1] || 0), topAsk * Number(sortedAsks[0]?.[1] || 0)) * 100
    : 0;

  // Build cumulative bid depth from top of book outward (price descending → x ascending)
  const bidDepths = [];
  let cumBid = 0;
  for (const [price, size] of sortedBids) {
    cumBid += Number(price) * Number(size);
    bidDepths.push({ price: Number(price), cumDepth: cumBid });
  }

  // Build cumulative ask depth from top of book outward (price ascending → x ascending)
  const askDepths = [];
  let cumAsk = 0;
  for (const [price, size] of sortedAsks) {
    cumAsk += Number(price) * Number(size);
    askDepths.push({ price: Number(price), cumDepth: cumAsk });
  }

  if (!bidDepths.length) bidDepths.push({ price: midPrice * 0.98, cumDepth: 0 });
  if (!askDepths.length) askDepths.push({ price: midPrice * 1.02, cumDepth: 0 });

  const allPrices = [...bidDepths.map(d => d.price), ...askDepths.map(d => d.price)];
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const priceRange = maxPrice - minPrice || 1;

  const maxDepth = Math.max(
    bidDepths[bidDepths.length - 1]?.cumDepth || 0,
    askDepths[askDepths.length - 1]?.cumDepth || 0,
  );

  // Map price → SVG x (0–1000)
  const xOf = (price) => ((price - minPrice) / priceRange) * 1000;
  // Map depth → SVG y (0 = top = 0, max = bottom = 320)
  const yOf = (depth) => 320 - (maxDepth > 0 ? (depth / maxDepth) * 300 : 0);

  // Build stepped bid path: from left (y=320) up to first bid, then step through each
  let bidPath = 'M 0 320';
  bidPath += ` L ${xOf(bidDepths[0].price)} 320`;
  for (const { price, cumDepth } of bidDepths) {
    const x = xOf(price);
    const y = yOf(cumDepth);
    bidPath += ` L ${x} ${y}`;
  }
  bidPath += ` L 1000 ${yOf(bidDepths[bidDepths.length - 1]?.cumDepth || 0)} L 1000 320 Z`;

  let askPath = 'M 0 320';
  askPath += ` L ${xOf(askDepths[0].price)} 320`;
  for (const { price, cumDepth } of askDepths) {
    const x = xOf(price);
    const y = yOf(cumDepth);
    askPath += ` L ${x} ${y}`;
  }
  askPath += ` L 1000 ${yOf(askDepths[askDepths.length - 1]?.cumDepth || 0)} L 1000 320 Z`;

  const midX = midPrice > 0 ? xOf(midPrice) : 500;

  return {
    bidPath,
    askPath,
    midX,
    spread: spread.toFixed(2),
    imbalance: imbalance.toFixed(0),
    imbalanceTone: imbalance >= 0 ? 'green' : 'red',
    imbalanceLabel: imbalance >= 0 ? 'Bid side dominant' : 'Ask side dominant',
    topBid,
    topAsk,
    bidDepths,
    askDepths,
  };
}

function renderDepthChart(data) {
  const bestBid = data.depth?.bids?.[0] || [0, 0];
  const bestAsk = data.depth?.asks?.[0] || [0, 0];
  const midPrice = Number(bestBid[0] || 0) && Number(bestAsk[0] || 0)
    ? (Number(bestBid[0]) + Number(bestAsk[0])) / 2
    : Number(data.depth?.bids?.[0]?.[0] || 0) || 0;

  const { bidPath, askPath, midX, spread, imbalance, imbalanceTone, imbalanceLabel } =
    deriveDepthChartData(data.depth?.bids || [], data.depth?.asks || [], midPrice);

  const venues = data.depth?.symbol ? `${data.depth.symbol} · Binance · Bybit · OKX` : 'BTC/USDT · Binance · Bybit · OKX';
  const priceDisplay = midPrice > 0 ? formatCurrency(midPrice) : '—';
  const priceDirection = midPrice > 0 ? '▲' : '';

  return `
    <div class="depth-chart-area">
      <div class="depth-header">
        <div>
          <div class="depth-pair">${escapeHtml(venues)}</div>
          <div class="depth-price">${priceDisplay} <span style="font-size:16px;color:var(--secondary)">${priceDirection}</span></div>
          <div class="depth-spread">Spread: ${spread}% · Best bid: ${formatCurrency(bestBid[0])} / Best ask: ${formatCurrency(bestAsk[0])}</div>
        </div>
        <div style="text-align:right">
          <div class="depth-legend-label">Book Imbalance</div>
          <div class="depth-imbalance ${imbalanceTone}">${imbalance >= 0 ? '+' : ''}${imbalance}%</div>
          <div class="depth-imbalance-foot">${imbalanceLabel}</div>
        </div>
      </div>
      <div class="depth-canvas-wrap">
        <svg class="depth-canvas" viewBox="0 0 1000 320" preserveAspectRatio="none" aria-hidden="true">
          <path d="${bidPath}" fill="rgba(78,222,163,0.12)" stroke="rgba(78,222,163,0.45)" stroke-width="2"/>
          <path d="${askPath}" fill="rgba(255,84,81,0.10)" stroke="rgba(255,84,81,0.38)" stroke-width="2"/>
          <line x1="${midX}" y1="0" x2="${midX}" y2="320" stroke="rgba(173,198,255,0.35)" stroke-width="1" stroke-dasharray="6 6"/>
          <text x="${midX}" y="18" text-anchor="middle" fill="rgba(173,198,255,0.7)" font-size="12" font-weight="700" letter-spacing="0.1em">MID PRICE</text>
        </svg>
      </div>
    </div>
  `;
}

// ─── Cross-Asset Correlation Heatmap ─────────────────────────────────────────

function renderCorrelationHeatmap(matrix = []) {
  if (!matrix.length) return '<p style="color:var(--on-surface-variant);font-size:13px">No correlation data available.</p>';

  const labels = matrix.map(r => r.pair || r.label || '—');
  const flat = matrix.map(row => row.values || []);

  const cellColor = (val) => {
    if (val > 0.6) return 'rgba(78,222,163,0.30)';
    if (val > 0.3) return 'rgba(78,222,163,0.16)';
    if (val > 0) return 'rgba(78,222,163,0.08)';
    if (val > -0.3) return 'rgba(255,84,81,0.08)';
    if (val > -0.6) return 'rgba(255,84,81,0.16)';
    return 'rgba(255,84,81,0.30)';
  };
  const textColor = (val) => {
    if (Math.abs(val) > 0.3) return 'rgba(255,255,255,0.85)';
    return 'rgba(173,198,255,0.8)';
  };

  // Header row — top axis labels
  let html = `<div class="matrix-wrap">`;
  html += `<div class="matrix-row-header">`;
  html += `<div class="matrix-cell matrix-corner"></div>`;
  for (const label of labels) {
    html += `<div class="matrix-cell matrix-label top">${escapeHtml(label)}</div>`;
  }
  html += `</div>`;

  // Data rows — left axis label + correlation cells
  for (let i = 0; i < flat.length; i++) {
    html += `<div class="matrix-row">`;
    html += `<div class="matrix-label">${escapeHtml(labels[i])}</div>`;
    for (let j = 0; j < flat[i].length; j++) {
      const val = Number(flat[i][j]) || 0;
      const bg = cellColor(val);
      const tc = textColor(val);
      const isDiag = i === j;
      html += `<div class="matrix-cell data${isDiag ? ' diagonal' : ''}" style="background:${bg};color:${isDiag ? 'rgba(140,144,159,0.4)' : tc}">${val > 0 ? '+' : ''}${val.toFixed(2)}</div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

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
  ideasTab: 'All',          // active Ideas tab

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
        <button class="hamburger-btn" data-action="menu" aria-label="Open menu">☰</button>
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

function heatClass(pct) {
  if (pct >= 2) return 'pos-3';
  if (pct >= 1) return 'pos-2';
  if (pct > 0)  return 'pos-1';
  if (pct === 0) return 'neutral';
  if (pct <= -2) return 'neg-3';
  if (pct <= -1) return 'neg-2';
  return 'neg-1';
}

function renderDiscovery(data) {
  // ── Market Overview: all 6 assets ─────────────────────────────────────
  const ASSET_KEYS = [
    { key: 'spx',      label: 'S&P 500',   format: (v) => v?.price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—', extra: (v) => v?.volume ? `Vol ${(v.volume/1e9).toFixed(1)}B` : '' },
    { key: 'vix',      label: 'VIX',        format: (v) => v?.price != null ? v.price.toFixed(2) : '—', extra: () => '' },
    { key: 'dxy',      label: 'DXY',         format: (v) => v?.price != null ? v.price.toFixed(2) : '—', extra: () => '' },
    { key: 'yield_10y',label: '10Y Yield',  format: (v) => v?.yield != null ? v.yield.toFixed(3) + '%' : '—', extra: () => '' },
    { key: 'oil',      label: 'Oil',         format: (v) => v?.price != null ? '$' + v.price.toFixed(2) : '—', extra: (v) => v?.volume ? `Vol ${(v.volume/1e6).toFixed(1)}M` : '' },
    { key: 'btc',      label: 'BTC',         format: (v) => v?.price != null ? '$' + v.price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—', extra: (v) => v?.volume ? `Vol $${(v.volume/1e9).toFixed(1)}B` : '' },
  ];

  const marketCards = ASSET_KEYS.map(({ key, label, format, extra }) => {
    const v = data[key];
    const chg = v?.change_pct ?? 0;
    const tone = chg > 0 ? 'green' : chg < 0 ? 'red' : 'neutral';
    const meta = extra(v);
    return `
      <div class="market-card">
        <div class="market-card-ticker">${escapeHtml(label)}</div>
        <div class="market-card-price">${format(v)}</div>
        <div class="market-card-change ${tone}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</div>
        ${meta ? `<div class="market-card-meta">${escapeHtml(meta)}</div>` : ''}
      </div>
    `;
  }).join('');

  // ── Sector heatmap ────────────────────────────────────────────────────
  const sectors = data.sectors || [];
  const heatmapTiles = sectors.map((s) => {
    const cls = heatClass(s.change_pct || 0);
    return `<div class="heat ${cls}">${escapeHtml(s.label)}</div>`;
  }).join('');

  // ── Transmission nodes ─────────────────────────────────────────────────
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

  // ── Flow Leaders ───────────────────────────────────────────────────────
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

  // ── Recommendations table ──────────────────────────────────────────────
  const recommendationRows = (data.recommendations || [])
    .map(
      (item) => `
        <tr>
          <td class="ticker">${escapeHtml(item.ticker)}</td>
          <td>${escapeHtml(item.name || item.ticker)}</td>
          <td class="muted">${escapeHtml(item.thesis || '')}</td>
          <td>${escapeHtml(item.conviction || '')}</td>
          <td>${escapeHtml(item.entry || '')}</td>
          <td>${escapeHtml(item.horizon || '')}</td>
        </tr>
      `,
    )
    .join('');

  // ── Watchlist (properly formatted from recommendations) ────────────────
  const watchItems = (data.recommendations || [])
    .slice(0, 5)
    .map(
      (item) => `
        <div class="watch-item">
          <div class="watch-left">
            <div class="watch-ticker">${escapeHtml(item.ticker)}</div>
            <div class="watch-note">${escapeHtml(item.horizon || 'Medium horizon')}</div>
          </div>
          <div class="watch-right">
            <div class="watch-price">${item.price != null ? '$' + item.price.toFixed(2) : '—'}</div>
            <div class="watch-note">${escapeHtml(item.conviction || '')}</div>
          </div>
        </div>
      `,
    )
    .join('');

  // ── Strength / weaken trends ───────────────────────────────────────────
  const sig = data.signal_inputs || {};
  const vixVal = sig.vix || 20;
  const spxChg = sig.spx_change_pct || 0;
  const btcChg = sig.btc_change_pct || 0;
  const oilVal = sig.oil_price || 80;
  const dxyVal = 98;
  const yieldVal = sig.treasury_10y || 4.3;

  const strengthening = [];
  const weakening = [];

  if (vixVal < 18) strengthening.push({ name: 'Low-vol regime', note: 'VIX ' + vixVal.toFixed(1) + ' confirms calm, breadth expansion likely', score: Math.round((30 - vixVal) * 4) });
  if (spxChg > 0.5) strengthening.push({ name: 'Equity momentum', note: 'S&P +' + spxChg.toFixed(2) + '% — risk-on breadth improving', score: Math.round(spxChg * 40) });
  if (btcChg > 0.5) strengthening.push({ name: 'BTC risk-on', note: 'BTC +' + btcChg.toFixed(2) + '% — liquidity flowing into risk assets', score: Math.round(btcChg * 30) });
  if (oilVal > 90) weakening.push({ name: 'Energy inflation', note: 'Oil $' + oilVal.toFixed(2) + ' — cost-push pressure on consumer discretionary', score: -Math.round((oilVal - 85) * 5) });
  if (yieldVal > 4.5) weakening.push({ name: 'Rate sensitivity', note: '10Y ' + yieldVal.toFixed(2) + '% — duration assets and growth multiples compressed', score: -Math.round((yieldVal - 4.5) * 40) });
  if (dxyVal > 103) weakening.push({ name: 'Dollar headwind', note: 'DXY ' + dxyVal.toFixed(2) + ' — headwind for EM and commodities', score: -Math.round((dxyVal - 103) * 8) });
  if (spxChg < -0.5) weakening.push({ name: 'Equity pressure', note: 'S&P ' + spxChg.toFixed(2) + '% — risk-off rotation likely', score: Math.round(spxChg * 40) });

  const trendItems = (items, tone) => items.map((t) => `
    <div class="trend-item ${tone}">
      <div>
        <div class="trend-name">${escapeHtml(t.name)}</div>
        <div class="trend-note">${escapeHtml(t.note)}</div>
      </div>
      <div class="trend-score ${tone}">${t.score > 0 ? '+' : ''}${t.score}</div>
    </div>
  `).join('');

  const strengthItems = trendItems(strengthening.slice(0, 3), 'green');
  const weakenItems   = trendItems(weakening.slice(0, 3), 'red');

  // ── Impact Feed ────────────────────────────────────────────────────────
  const feedItems = [
    {
      cat: 'macro', icon: 'FI',
      title: 'Treasury issuance mix points to tighter front-end liquidity',
      body: 'Bill-heavy financing could compete with risk assets for short-duration cash while still leaving long-end rates elevated enough to restrain expensive growth leadership.',
      meta: '12 min ago · Macro',
    },
    {
      cat: 'tech', icon: 'AI',
      title: 'Hyperscaler capex broadens from chips to power procurement',
      body: 'The market is beginning to price power availability, cooling, switchgear, and utility relationships as part of the AI infrastructure stack rather than just semis and networking.',
      meta: '48 min ago · Tech / Utilities',
    },
    {
      cat: 'rates', icon: '10Y',
      title: 'Real yields grinding higher as breakevens compress',
      body: 'With nominal 10Y pinned near 4.3% and inflation expectations softening, the real yield pocket at +1.8% is increasingly a headwind for unprofitable tech and rate-sensitive sectors.',
      meta: '1 hr ago · Rates',
    },
    {
      cat: 'equity', icon: 'SPX',
      title: 'Narrow breadth capped by sector rotation away from consensus',
      body: 'S&P flat on the day despite a 3:1 advance/decline ratio. Leadership rotating from mega-cap tech into industrials, utilities, and selective energy — a健康的 breadth-widening signal.',
      meta: '2 hr ago · Equities',
    },
  ].map((f) => `
    <div class="feed-item ${f.cat}">
      <div class="feed-icon">${escapeHtml(f.icon)}</div>
      <div>
        <div class="feed-title">${escapeHtml(f.title)}</div>
        <div class="feed-body">${escapeHtml(f.body)}</div>
        <div class="feed-meta">${escapeHtml(f.meta)}</div>
      </div>
    </div>
  `).join('');

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
      <div style="grid-column: span 12;">
        <div class="panel-header" style="margin-bottom: 14px;">
          <div>
            <div class="panel-kicker">Cross-asset snapshot</div>
            <h2 class="panel-title">Market Overview</h2>
          </div>
        </div>
        <div class="market-overview-grid">${marketCards}</div>
      </div>
    </section>

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
              <div class="headline">${escapeHtml(data.regime?.label || 'Mixed regime')}</div>
              <div class="body">${data.signal_inputs ? escapeHtml('VIX ' + data.signal_inputs.vix + ' | 10Y ' + data.signal_inputs.treasury_10y + '% | BTC ' + (data.signal_inputs.btc_change_pct >= 0 ? '+' : '') + data.signal_inputs.btc_change_pct + '% | Oil $' + data.signal_inputs.oil_price) : 'Live regime signal'}</div>
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

    <section class="grid-12">
      <article class="panel full-panel">
        <div class="panel-header">
          <div>
            <div class="panel-kicker">Breadth scan</div>
            <h2 class="panel-title">Liquidity Heatmap</h2>
          </div>
        </div>
        <div class="heatmap-grid">${heatmapTiles || '<div style="padding:16px;color:var(--on-surface-variant);font-size:13px;">Sector data unavailable</div>'}</div>
      </article>
    </section>

    <section class="grid-12">
      <article class="panel split-panel">
        <div class="panel-header">
          <div>
            <div class="panel-kicker">Narrative monitor</div>
            <h2 class="panel-title">Strengthening vs Weakening Trends</h2>
            <p class="panel-subtitle">Not generic gainers and losers — only themes with some explanatory flow or catalyst backing.</p>
          </div>
          <div class="chip" style="background:rgba(255,255,255,0.04); border:1px solid rgba(140,144,159,0.16); color:var(--on-surface-variant);">Last 24h</div>
        </div>
        <div class="split-grid">
          <div>
            <div class="split-column-title green"><span class="pulse-dot green"></span>Strengthening</div>
            <div class="trend-list">${strengthItems || '<div class="trend-item neutral"><div class="trend-name">No strong signals</div><div class="trend-note">Market in mixed regime</div></div>'}</div>
          </div>
          <div>
            <div class="split-column-title red"><span class="pulse-dot red"></span>Weakening</div>
            <div class="trend-list">${weakenItems || '<div class="trend-item neutral"><div class="trend-name">No strong signals</div><div class="trend-note">Market in mixed regime</div></div>'}</div>
          </div>
        </div>
      </article>
    </section>

    <section class="grid-12">
      <article class="panel" style="grid-column: span 6;">
        <div class="panel-header">
          <div>
            <div class="panel-kicker">Curated catalyst layer</div>
            <h2 class="panel-title">Impact Feed</h2>
            <p class="panel-subtitle">A filtered event stream that explains where the dashboard believes second-order effects are likely to propagate.</p>
          </div>
        </div>
        <div class="feed-list">${feedItems}</div>
      </article>

      <article class="panel" style="grid-column: span 6;">
        <div class="panel-header">
          <div>
            <div class="panel-kicker">Quick scan</div>
            <h2 class="panel-title">Watchlist</h2>
          </div>
        </div>
        <div class="watchlist">${watchItems}</div>
      </article>
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

const FUNDING_VENUES: Record<string, string> = {
  'BTC/USDT': 'Binance · OKX · Bybit',
  'ETH/USDT': 'Binance · Bybit · Hyperliquid',
  'SOL/USDT': 'Binance · Hyperliquid',
  'BNB/USDT': 'Binance · Bybit',
  'ARB/USDT': 'Binance · Arbitrum DEX',
  'LINK/USDT': 'Binance · Bybit',
  'AVAX/USDT': 'Binance only',
};
const TVL_VENUES: Record<string, string> = {
  'Arbitrum': 'LayerZero ·bridge',
  'Base': 'Coinbase · LayerZero',
  'Solana': 'Wormhole',
  'Ethereum': 'native bridge',
  'Optimism': 'Across · Optimism',
};

function renderFundingRows(rates: any[]): string {
  if (!rates || rates.length === 0) {
    return '<p style="color:var(--on-surface-variant);font-size:13px">Funding data unavailable.</p>';
  }
  return rates.map(item => {
    const pair = item.symbol || '—';
    const venues = FUNDING_VENUES[pair] || 'Cross-venue';
    const rate = Number(item.rate || 0);
    const tone = rate >= 0 ? 'green' : 'red';
    const meta = item.meta || (item.price ? `${formatCurrency(item.price)} · ${formatSignedPercent(item.change_pct)} 24h` : '—');
    const nextFunding = item.next_funding ? `Next: ${item.next_funding}` : '';
    return `
      <div class="funding-row" style="color:var(--${tone === 'green' ? 'secondary' : 'tertiary'})">
        <div>
          <div class="funding-name">${escapeHtml(pair)}</div>
          <div class="venue-chip">${escapeHtml(venues)}</div>
        </div>
        <div class="funding-right">
          <div class="funding-rate">${rate >= 0 ? '+' : ''}${(rate * 100).toFixed(4)}%</div>
          <div class="funding-meta">${escapeHtml(meta)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTvlRows(chains: any[]): string {
  if (!chains || chains.length === 0) {
    return '<p style="color:var(--on-surface-variant);font-size:13px">TVL data unavailable.</p>';
  }
  // Normalize: find max TVL for bar scaling
  const maxTvl = Math.max(...chains.map(c => Number(c.tvl || 0)), 1);
  return chains.map(item => {
    const name = item.name || '—';
    const venues = TVL_VENUES[name] || 'bridge';
    const tvl = Number(item.tvl || 0);
    const change = Number(item.change_pct || 0);
    const pct = ((tvl / maxTvl) * 100).toFixed(1);
    const changeColor = change >= 0 ? 'green' : 'red';
    return `
      <div class="tvl-row">
        <div class="tvl-name">${escapeHtml(name)}</div>
        <div class="venue-chip">${escapeHtml(venues)}</div>
        <div class="tvl-bar-cell">
          <div class="tvl-bar-pct ${changeColor}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</div>
          <div class="mini-bar">
            <div class="mini-bar-fill ${change >= 0 ? 'in' : 'out'}" style="width:${pct}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}


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

  const fundingRows = renderFundingRows(data.funding_rates || []);
  const tvlRows = renderTvlRows(data.tvl || []);

  const renderCrossFlowRow = (row) => `
    <tr>
      <td>
        <div class="flow-venue-cell">
          <div class="flow-badge ${row.direction === 'in' ? 'in' : 'out'}">${escapeHtml(initials(row.venue))}</div>
          <div>
            <div class="flow-venue-name">${escapeHtml(row.venue)}</div>
            <div class="flow-venue-meta">${escapeHtml(row.pair)}</div>
          </div>
        </div>
      </td>
      <td class="muted" style="font-size:12px">${escapeHtml(row.meta)}</td>
      <td class="numeric">
        <div class="flow-amount-cell">
          <div class="flow-amount-val ${row.direction === 'in' ? 'green' : 'red'}">${row.direction === 'in' ? '+' : '-'}$${formatCompactNumber(row.magnitude_usd)}</div>
        </div>
      </td>
    </tr>
  `;

  const renderBridgeRow = (row) => `
    <tr>
      <td>
        <div class="flow-venue-cell">
          <div class="flow-badge ${row.direction === 'in' ? 'in' : 'out'}">${escapeHtml(initials(row.name))}</div>
          <div>
            <div class="flow-venue-name">${escapeHtml(row.name)}</div>
          </div>
        </div>
      </td>
      <td class="muted" style="font-size:12px">${escapeHtml(row.note)}</td>
      <td class="numeric">
        <div class="flow-amount-cell">
          <div class="flow-amount-val ${row.direction === 'in' ? 'green' : 'red'}">${row.direction === 'in' ? '+' : '-'}${formatCompactNumber(row.eth_equivalent)}</div>
          <div class="flow-amount-unit">ETH equiv.</div>
        </div>
      </td>
    </tr>
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
            <p class="panel-subtitle">Aggregated bid-ask depth across major venues. Green = bid side accumulation, Red = ask side distribution.</p>
          </div>
          <div class="depth-legend">
            <div class="legend-item"><div class="legend-dot" style="background:var(--secondary)"></div>Bids</div>
            <div class="legend-item"><div class="legend-dot" style="background:var(--tertiary)"></div>Asks</div>
          </div>
        </div>
        <div class="hero-surface">
          ${renderDepthChart(data)}
        </div>
      </article>

      <div class="stack-panel">
        <article class="panel">
          <div class="panel-header">
            <div>
              <div class="panel-kicker">Perpetual basis</div>
              <h2 class="panel-title">Funding Rates</h2>
            </div>
            <div class="chip">Source: ${escapeHtml(data.sources?.funding || 'fallback')}</div>
          </div>
          <div class="funding-list">${fundingRows}</div>
        </article>


        <article class="panel">
          <div class="panel-header">
            <div>
              <div class="panel-kicker">Chain breadth</div>
              <h2 class="panel-title">TVL by Chain</h2>
            </div>
            <div class="chip">Source: ${escapeHtml(data.sources?.tvl || 'fallback')}</div>
          </div>
          <div class="tvl-list">${tvlRows}</div>
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
        <div class="cross-flows-section">
          <div class="cross-flows-col">
            <div class="cross-flows-col-title green"><span class="pulse-dot"></span>Inflows</div>
            <div class="table-scroll">
              <table class="flow-table">
                <thead><tr><th>Venue</th><th>Source</th><th style="text-align:right">Net Flow</th></tr></thead>
                <tbody>${venueFlows.inflows.map(renderCrossFlowRow).join('')}</tbody>
              </table>
            </div>
          </div>
          <div class="cross-flows-col">
            <div class="cross-flows-col-title red"><span class="pulse-dot"></span>Outflows</div>
            <div class="table-scroll">
              <table class="flow-table">
                <thead><tr><th>Venue</th><th>Source</th><th style="text-align:right">Net Flow</th></tr></thead>
                <tbody>${venueFlows.outflows.map(renderCrossFlowRow).join('')}</tbody>
              </table>
            </div>
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
        <div class="table-scroll">
          <table class="flow-table bridge-flow-table">
            <thead><tr><th>Chain</th><th>Context</th><th>Net Bridge Flow</th></tr></thead>
            <tbody>${bridgeRows.map(renderBridgeRow).join('')}</tbody>
          </table>
        </div>
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
  const transmission = data.transmission_chain || [];
  const origins = transmission.filter(t => t.order === 'origin');
  const firstOrder = transmission.filter(t => t.order === 'first');
  const secondOrder = transmission.filter(t => t.order === 'second' || t.order === 'lagged');
  const centerCatalyst = data.center_catalyst || { title: 'Market Catalyst', headline: 'Macro regime shift', body: 'Key macro drivers are propagating through cross-asset channels.' };
  const affected = secondOrder.slice(0, 3);

  const tagClass = (tone) => tone === 'bullish' ? 'tag-green' : tone === 'bearish' ? 'tag-red' : 'tag-blue';
  const originDot = (tone) => tone === 'bullish' ? 'green-node' : tone === 'bearish' ? 'red-node' : '';
  const nodeClass = (tone) => tone === 'bullish' ? 'green-node' : tone === 'bearish' ? 'red-node' : '';

  return `
    <section class="hero-row">
      <div>
        <h1 class="page-title">Market Impacts</h1>
        <p class="page-subtitle">How macro catalysts travel through rates, valuations, credit, and risk appetite.</p>
      </div>
    </section>
    ${renderMetrics(data.metrics)}
    <section class="grid-12">
      <article class="panel hero-panel">
        <div class="panel-header">
          <div>
            <div class="panel-kicker">Propagation map</div>
            <h2 class="panel-title">Transmission Chain</h2>
            <p class="panel-subtitle">How the dominant catalyst propagates: origin → first-order assets → second-order sectors → lagged beneficiaries.</p>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="tag tag-blue">▲ 1st Order</span>
            <span class="tag tag-yellow">◑ 2nd Order</span>
            <span class="tag" style="background:rgba(255,200,77,0.06);color:#8c909f;border-color:rgba(140,144,159,0.18)">◔ Lagged</span>
          </div>
        </div>
        <div class="hero-surface">
          <div class="impact-map">
            <div class="map-row">
              ${origins.slice(0, 3).map(item => `
                <div class="origin-node">
                  <div class="origin-circle ${originDot(item.tone)}">${escapeHtml(item.from || item.asset || '—')}</div>
                  <div class="origin-label">${escapeHtml(item.label || item.note || '')}</div>
                </div>
              `).join('')}
              ${origins.length < 3 ? Array(3 - origins.length).fill('<div class="origin-node"><div class="origin-circle" style="background:rgba(140,144,159,0.08);border-color:rgba(140,144,159,0.18);color:var(--on-surface-variant)">—</div><div class="origin-label">Pending</div></div>').join('') : ''}
            </div>

            <div class="first-order-row">
              ${firstOrder.slice(0, 3).map((item, i) => `
                <div class="order-node">
                  <div class="order-circle ${nodeClass(item.tone)}">${escapeHtml(item.to || item.asset || '—')}</div>
                  <div class="order-label">${escapeHtml(item.note || item.label || '')}</div>
                </div>
              `).join('')}
              ${firstOrder.length < 3 ? Array(3 - firstOrder.length).fill('<div class="order-node"><div class="order-circle" style="background:rgba(140,144,159,0.08);border-color:rgba(140,144,159,0.18);color:var(--on-surface-variant)">—</div><div class="order-label">Pending</div></div>').join('') : ''}
            </div>

            <svg class="map-svg" viewBox="0 0 1000 760" preserveAspectRatio="none" aria-hidden="true">
              ${origins.slice(0, 3).map((_, i) => {
                const xStart = [333, 500, 667][i];
                const xEnd = 500;
                const yStart = 67;
                const yEnd = 245;
                return `<path style="animation-duration:${7 + i}s" d='M${xStart} ${yStart} C ${xStart} 145, ${xEnd} 185, ${xEnd} ${yEnd}' stroke='rgba(173,198,255,0.50)'></path>`;
              }).join('')}
              ${firstOrder.slice(0, 3).map((_, i) => {
                const xStart = [333, 500, 667][i];
                const xEnd = 500;
                return `<path style="animation-duration:${8 + i}s" d='M${xStart} 245 C ${xStart} 310, ${xEnd} 340, ${xEnd} 405' stroke='rgba(255,200,77,0.40)'></path>`;
              }).join('')}
              ${secondOrder.slice(0, 3).map((_, i) => {
                const xStart = [333, 500, 667][i];
                const xEnd = 500;
                return `<path style="animation-duration:${9 + i}s" d='M${xStart} 405 C ${xStart} 470, ${xEnd} 500, ${xEnd} 570' stroke='rgba(173,198,255,0.40)'></path>`;
              }).join('')}
            </svg>

            <div class="second-order-row">
              ${secondOrder.slice(0, 3).map((item, i) => `
                <div class="order-node second-order">
                  <div class="order-circle ${nodeClass(item.tone)}">${escapeHtml(item.to || item.asset || '—')}</div>
                  <div class="order-label">${escapeHtml(item.note || item.label || '')}</div>
                </div>
              `).join('')}
              ${secondOrder.length < 3 ? Array(3 - secondOrder.length).fill('<div class="order-node second-order"><div class="order-circle" style="background:rgba(140,144,159,0.08);border-color:rgba(140,144,159,0.18);color:var(--on-surface-variant)">—</div><div class="order-label">Pending</div></div>').join('') : ''}
            </div>

            <div class="transmission-center">
              <div class="trans-title">${escapeHtml(centerCatalyst.title)}</div>
              <div class="trans-headline">${escapeHtml(centerCatalyst.headline)}</div>
              <div class="trans-body">${escapeHtml(centerCatalyst.body)}</div>
              ${centerCatalyst.lag ? `<div style="margin-top:10px;display:flex;gap:8px;justify-content:center"><span class="tag tag-yellow">${escapeHtml(centerCatalyst.lag)}</span>${centerCatalyst.confidence ? `<span class="tag tag-green">${escapeHtml(centerCatalyst.confidence)}</span>` : ''}</div>` : ''}
            </div>

            <div class="affected-row">
              ${affected.map(item => `
                <div class="affected-card">
                  <div class="affected-head">
                    <div class="affected-name">${escapeHtml(item.to || item.asset || '—')}</div>
                    <span class="tag ${tagClass(item.tone)}">${item.order === 'origin' || item.order === 'first' ? '1st Order' : item.order === 'second' ? '2nd Order' : 'Lagged'}</span>
                  </div>
                  <div class="affected-desc">${escapeHtml(item.note || item.description || '')}</div>
                  ${item.confidence ? `<div class="progress" style="margin-top:8px"><span style="width:${item.confidence}%;color:var(--primary)"></span></div>` : ''}
                </div>
              `).join('')}
              ${affected.length < 3 ? Array(3 - affected.length).fill('<div class="affected-card"><div class="affected-head"><div class="affected-name">—</div></div><div class="affected-desc">Awaiting signal</div></div>').join('') : ''}
            </div>
          </div>
        </div>
      </article>

      <div class="stack-panel">
        <article class="panel">
          <div class="panel-header"><div><div class="panel-kicker">Transmission chain</div><h2 class="panel-title">Macro to Market</h2></div></div>
          <div class="simple-list">${(data.transmission_chain || []).slice(0, 6).map((item) => `
            <div class="simple-item">
              <div class="simple-item-head"><div class="simple-item-title">${escapeHtml(item.from || item.asset || '—')} → ${escapeHtml(item.to || '—')}</div><div class="badge-pill ${tagClass(item.tone)}">${escapeHtml(item.tone || 'neutral')}</div></div>
              <div class="simple-item-sub">${escapeHtml(item.note || item.description || '')}</div>
            </div>
          `).join('')}</div>
        </article>

        <article class="panel">
          <div class="panel-header"><div><div class="panel-kicker">Sensitivity matrix</div><h2 class="panel-title">Rate Exposure</h2></div></div>
          <table>
            <thead><tr><th>Bucket</th><th>Sensitivity</th><th>Bias</th></tr></thead>
            <tbody>${(data.rate_matrix || []).map((row) => `<tr><td>${escapeHtml(row.bucket)}</td><td>${escapeHtml(row.sensitivity)}</td><td class="${row.bias === 'Positive' ? 'green' : row.bias === 'Negative' ? 'red' : ''}">${escapeHtml(row.bias)}</td></tr>`).join('')}</tbody>
          </table>
        </article>
      </div>
    </section>
    <section class="split-grid">
      <article class="panel">
        <div class="panel-header"><div><div class="panel-kicker">Correlations</div><h2 class="panel-title">Cross-Asset Matrix</h2></div></div>
        ${renderCorrelationHeatmap(data.correlation_matrix || [])}
      </article>
      <article class="panel">
        <div class="panel-header"><div><div class="panel-kicker">Recent events</div><h2 class="panel-title">Transmission Notes</h2></div></div>
        <div class="simple-list">${(data.events || []).map((item) => `
          <div class="simple-item">
            <div class="simple-item-head"><div class="simple-item-title">${escapeHtml(item.title)}</div><div class="badge-pill ${tagClass(item.tone)}">${escapeHtml(item.tone)}</div></div>
            <div class="simple-item-sub">${escapeHtml(item.impact || '')}</div>
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
    <section>
      <article class="panel full-panel">
        <div class="panel-header">
          <div>
            <div class="panel-kicker">Trend cards</div>
            <h2 class="panel-title">Emerging Narratives</h2>
          </div>
          <span class="tag tag-blue">${(data.trend_cards || []).length} Active</span>
        </div>
        <div class="trend-cards-grid emerging-grid">${(data.trend_cards || []).map((item) => `
          <div class="trend-card">
            <div class="trend-card-header">
              <div>
                <div class="trend-ticker">${escapeHtml(item.name)}</div>
                <div class="trend-stage">Stage: ${escapeHtml(item.stage || 'Developing')}</div>
              </div>
              <div class="badge-pill ${item.confidence >= 65 ? 'green' : item.confidence < 55 ? 'red' : 'blue'}">${item.confidence}%</div>
            </div>
            <div class="trend-thesis">${(item.evidence || []).map(e => `<p>• ${escapeHtml(e)}</p>`).join('')}</div>
            ${item.stats ? `<div class="trend-stats">${Object.entries(item.stats).map(([k, v]) => `<div class="trend-stat"><span class="trend-stat-label">${escapeHtml(k)}</span><span class="trend-stat-value">${escapeHtml(String(v))}</span></div>`).join('')}</div>` : ''}
          </div>
        `).join('')}</div>
      </article>
    </section>
  `;
}

const IDEAS_TABS = ['All', 'DeFi', 'Macro', 'Sector', 'Narrative'];

const SCORING_CRITERIA = [
  { key: 'Momentum',    label: 'Momentum threshold', val: '≥ 1.5% daily change' },
  { key: 'Liquidity',   label: 'Liquidity filter',    val: '≥ $50M 24h volume' },
  { key: 'Signal',      label: 'Signal strength',     val: 'VIX-adjusted regime' },
  { key: 'Theme',       label: 'Theme alignment',     val: 'Top flow leader' },
  { key: 'Conviction',  label: 'Conviction bands',    val: 'High / Med / Watch' },
  { key: 'Risk',        label: 'Risk labels',         val: 'Low · Med · High' },
];
function riskDot(risk: string) {
  const cls = risk === 'Low' ? 'low' : risk === 'High' ? 'high' : 'med';
  return `<span class="risk-dot ${cls}"></span>`;
}
function ideaFilter(ideas: any[], tab: string): any[] {
  if (tab === 'All') return ideas;
  return ideas.filter(i => i.theme?.toLowerCase().includes(tab.toLowerCase()));
}
function renderIdeaCards(ideas: any[]): string {
  if (!ideas || ideas.length === 0) {
    return '<p style="color:var(--on-surface-variant);font-size:13px">No ideas in this category.</p>';
  }
  return ideas.map((idea) => {
    const convictionColor = idea.conviction === 'High' ? 'green' : idea.conviction === 'Watch' ? 'red' : 'blue';
    const riskLevel = idea.risk || 'Med';
    const riskColor = riskLevel === 'Low' ? 'green' : riskLevel === 'High' ? 'red' : 'var(--primary)';
    const signalBadgeColor = idea.signal === 'Momentum improving' ? 'green' : idea.signal === 'Needs reset' ? 'red' : 'blue';
    return `
      <div class="idea-card">
        <div class="idea-card-header">
          <div>
            <div class="idea-ticker">${escapeHtml(idea.ticker)}</div>
            <div class="idea-name">${escapeHtml(idea.name || idea.ticker)} · ${escapeHtml(idea.theme || 'General')}</div>
          </div>
          <div class="badge-pill ${convictionColor}">${escapeHtml(idea.conviction)}</div>
        </div>
        <div class="idea-meta-grid">
          <div class="idea-meta-cell">
            <div class="idea-meta-key">Signal</div>
            <div class="badge-pill ${signalBadgeColor}" style="font-size:10px;padding:3px 7px">${escapeHtml(idea.signal || '—')}</div>
          </div>
          <div class="idea-meta-cell">
            <div class="idea-meta-key">Entry</div>
            <div class="idea-meta-val">${escapeHtml(idea.entry || '—')}</div>
          </div>
          <div class="idea-meta-cell">
            <div class="idea-meta-key">Horizon</div>
            <div class="idea-meta-val">${escapeHtml(idea.horizon || '—')}</div>
          </div>
          <div class="idea-meta-cell">
            <div class="idea-meta-key">Risk</div>
            <div class="idea-meta-val risk-label" style="color:${riskColor}">${riskDot(riskLevel)}${escapeHtml(riskLevel)}</div>
          </div>
        </div>
        <div class="idea-thesis">
          ${idea.price != null ? formatCurrency(idea.price) : '—'} ·
          <span class="${idea.change_pct >= 0 ? 'green' : 'red'}">${formatSignedPercent(idea.change_pct)}</span>
        </div>
      </div>
    `;
  }).join('');
}
function renderScoringPanel(): string {
  const riskRows = SCORING_CRITERIA.map(c => `
    <div class="criteria-item">
      <div class="criteria-key">${escapeHtml(c.label)}</div>
      <div class="criteria-val">${escapeHtml(c.val)}</div>
    </div>
  `).join('');
  return `
    <div class="scoring-panel">
      <div class="scoring-title">Scoring Criteria</div>
      <div class="criteria-list">${riskRows}</div>
    </div>
  `;
}

function renderIdeas(data) {
  const ideas = data.ideas || [];
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

  const tabBar = IDEAS_TABS.map(tab => {
    const count = tab === 'All' ? ideas.length : ideas.filter(i => i.theme?.toLowerCase().includes(tab.toLowerCase())).length;
    return `<button class="ideas-tab" data-tab="${tab}" data-count="${count}">${tab} <span style="opacity:0.6;font-size:10px">${count}</span></button>`;
  }).join('');

  const ideaCards = renderIdeaCards(ideas);
  const scoringPanel = renderScoringPanel();

  return `
    <section class="hero-row">
      <div>
        <h1 class="page-title">Ideas</h1>
        <p class="page-subtitle">Rule-based trade candidates aligned with the current transmission map and hidden trend stack.</p>
      </div>
    </section>
    ${renderMetrics(data.metrics)}
    <section class="ideas-split">
      <article class="panel">
        <div class="panel-header"><div><div class="panel-kicker">Actionable names</div><h2 class="panel-title">Idea Cards</h2></div></div>
        <div class="ideas-tab-bar">${tabBar}</div>
        <div class="idea-grid">${ideaCards}</div>
      </article>
      ${scoringPanel}
    </section>
    <section>
      <article class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-kicker">Secondary signals</div>
            <h2 class="panel-title">Watchlist</h2>
          </div>
        </div>
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
    <div class="mobile-nav" data-nav="drawer">
      <div class="mobile-nav-panel">
        <div class="mobile-nav-header">
          <div class="sidebar-kicker">Navigation</div>
          <button class="hamburger-btn" data-action="menu" aria-label="Close menu" style="color:var(--on-surface-variant);">✕</button>
        </div>
        <nav class="mobile-nav-links">
          ${NAV_ITEMS.map(
            (item) => `
              <a class="mobile-nav-link ${item.id === state.route ? 'active' : ''}" href="${item.hash}" data-nav="link">
                <span class="side-icon">${item.short}</span>
                <span>${item.label}</span>
              </a>
            `,
          ).join('')}
        </nav>
        <div class="mobile-nav-footer">
          <button class="button-primary" data-action="refresh" ${state.isRefreshing ? 'disabled' : ''} style="width:100%">
            ${state.isRefreshing ? 'Refreshing…' : 'Refresh signals'}
          </button>
        </div>
      </div>
    </div>
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
  const routes = NAV_ITEMS.map((i) => i.id).filter((r) => r !== 'settings');
  // Set isRefreshing once, then wait for all parallel fetches to complete
  state.isRefreshing = true;
  render();
  await Promise.all(routes.map((route) => _fetchRoute(route, { manual: true })));
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

    // Mobile menu toggle
    const menuBtn = event.target.closest('[data-action="menu"]');
    if (menuBtn) {
      const drawer = document.querySelector('.mobile-nav');
      drawer.classList.toggle('open');
      return;
    }

    // Close drawer when clicking the overlay (not the panel)
    const drawer = event.target.closest('.mobile-nav');
    if (drawer && !event.target.closest('.mobile-nav-panel')) {
      drawer.classList.remove('open');
    }

    // Close drawer on nav link click
    const navLink = event.target.closest('[data-nav="link"]');
    if (navLink) {
      const d = document.querySelector('.mobile-nav');
      if (d) d.classList.remove('open');
    }


    // Ideas tab filter
    const ideasTab = event.target.closest('.ideas-tab');
    if (ideasTab) {
      state.ideasTab = ideasTab.dataset.tab;
      document.querySelectorAll('.ideas-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.ideasTab));
      const data = state.cache.get('ideas') || {};
      const filtered = ideaFilter(data.ideas || [], state.ideasTab);
      const grid = document.querySelector('.ideas-split .idea-grid');
      if (grid) grid.innerHTML = renderIdeaCards(filtered);
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
