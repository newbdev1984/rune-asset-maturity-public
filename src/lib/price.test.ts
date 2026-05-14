import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRunePriceUsd } from './price';

describe('RUNE price sourcing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses CoinGecko current RUNE price when available', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ thorchain: { usd: 0.5567 } }),
    } as Response);

    await expect(fetchRunePriceUsd()).resolves.toMatchObject({ usd: 0.5567, source: 'CoinGecko' });
  });

  it('falls back to Binance RUNEUSDT when CoinGecko fails', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests', json: async () => ({}) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ symbol: 'RUNEUSDT', price: '0.55800000' }) } as Response);

    await expect(fetchRunePriceUsd()).resolves.toMatchObject({ usd: 0.558, source: 'Binance' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
