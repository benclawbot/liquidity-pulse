export const NAV_ITEMS = [
  { id: 'discovery', label: 'Discovery', short: 'DS', hash: '#/' },
  { id: 'flows', label: 'Liquidity Flows', short: 'LF', hash: '#/flows' },
  { id: 'impacts', label: 'Market Impacts', short: 'IM', hash: '#/impacts' },
  { id: 'trends', label: 'Hidden Trends', short: 'HT', hash: '#/trends' },
  { id: 'ideas', label: 'Ideas', short: 'ID', hash: '#/ideas' },
  { id: 'settings', label: 'Settings', short: 'ST', hash: '#/settings' },
];

export const ROUTE_TITLES = {
  discovery: 'Market Discovery',
  flows: 'Liquidity Flows',
  impacts: 'Market Impacts',
  trends: 'Hidden Trends',
  ideas: 'Ideas',
  settings: 'Settings',
};

export const API_BASE = 'https://liquidity-pulse-api.benclawbot.workers.dev';

export const API_ENDPOINTS = {
  discovery: `${API_BASE}/api/market/snapshot`,
  flows: `${API_BASE}/api/flows/dashboard`,
  impacts: `${API_BASE}/api/impacts/summary`,
  trends: `${API_BASE}/api/trends/summary`,
  ideas: `${API_BASE}/api/ideas/summary`,
};

export const TOPBAR_TABS = ['Discovery', 'Flows', 'Transmission', 'Recommendations'];
export const REFRESH_INTERVAL_MS = 120000;
