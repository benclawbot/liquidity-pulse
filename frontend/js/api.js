import { API_ENDPOINTS } from './constants.js';

async function getJson(path) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(path, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Request timed out: ${path}`);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function fetchPageData(route) {
  const endpoint = API_ENDPOINTS[route] || API_ENDPOINTS.discovery;
  return getJson(endpoint);
}
