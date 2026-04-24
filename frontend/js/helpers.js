export function formatCompactNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  if (Math.abs(num) >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

export function formatSignedPercent(value) {
  const num = Number(value || 0);
  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
}

export function toneClass(tone) {
  if (tone === 'positive') return 'green';
  if (tone === 'negative') return 'red';
  return 'blue';
}

export function routeFromHash(hash) {
  const cleaned = (hash || '').replace(/^#\/?/, '').trim();
  return cleaned || 'discovery';
}

export function formatMetricValue(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '—';
  if (Math.abs(Number(value)) >= 1000) return Number(value).toLocaleString();
  if (Number.isInteger(Number(value))) return String(value);
  return Number(value).toFixed(2);
}

export function formatCurrency(value) {
  const num = Number(value || 0);
  if (Math.abs(num) >= 1000) return `$${Number(num).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${num.toFixed(2)}`;
}

export function formatDateTime(isoString) {
  if (!isoString) return 'Updated just now';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Updated just now';
  return `Updated ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
