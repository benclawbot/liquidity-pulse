import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchPageData } from '../js/api.js';

describe('api fetchPageData', () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    globalThis.window = globalThis;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalFetch === undefined) {
      delete globalThis.fetch;
    } else {
      globalThis.fetch = originalFetch;
    }

    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it('returns parsed endpoint payload on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ updated_at: '2026-04-23T20:00:00Z', metrics: [] }),
    });

    const payload = await fetchPageData('discovery');
    expect(payload.updated_at).toBe('2026-04-23T20:00:00Z');
  });

  it('throws when upstream endpoint returns non-200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(fetchPageData('discovery')).rejects.toThrow('Request failed: 503');
  });

  it('throws when network request fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(fetchPageData('flows')).rejects.toThrow('network down');
  });
});
