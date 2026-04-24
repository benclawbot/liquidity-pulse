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

export const API_ENDPOINTS = {
  discovery: '/api/market/snapshot',
  flows: '/api/flows/dashboard',
  impacts: '/api/impacts/summary',
  trends: '/api/trends/summary',
  ideas: '/api/ideas/summary',
};

export const TOPBAR_TABS = ['Discovery', 'Flows', 'Transmission', 'Recommendations'];
export const REFRESH_INTERVAL_MS = 120000;
