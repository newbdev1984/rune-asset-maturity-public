export type RunePrice = {
  usd: number;
  source: 'CoinGecko' | 'Binance' | 'fallback';
  asOf: string;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const FALLBACK_RUNE_PRICE_USD = 1.25;

export async function fetchRunePriceUsd(): Promise<RunePrice> {
  const asOf = new Date().toISOString();

  try {
    const coingecko = await fetchJsonWithTimeout<{ thorchain?: { usd?: number } }>(
      'https://api.coingecko.com/api/v3/simple/price?ids=thorchain&vs_currencies=usd',
    );
    const price = coingecko.thorchain?.usd;
    if (isValidPrice(price)) return { usd: price, source: 'CoinGecko', asOf };
  } catch {
    // Try Binance next. The dashboard should not fail just because one public market-data endpoint is unavailable.
  }

  try {
    const binance = await fetchJsonWithTimeout<{ price?: string }>('https://api.binance.com/api/v3/ticker/price?symbol=RUNEUSDT');
    const price = Number(binance.price);
    if (isValidPrice(price)) return { usd: price, source: 'Binance', asOf };
  } catch {
    // Keep a visible fallback so the page remains usable offline/rate-limited.
  }

  return { usd: FALLBACK_RUNE_PRICE_USD, source: 'fallback', asOf };
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'rune-asset-maturity-public' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`price request failed: ${response.status} ${response.statusText}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function isValidPrice(price: unknown): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price > 0;
}
