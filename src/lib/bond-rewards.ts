import { addDaysUtc, roundRune, type RuneEvent } from './tax-lots';

const VIEWBLOCK_BASE = 'https://api.viewblock.io/thorchain';
const VIEWBLOCK_PAGE_LIMIT = 100;
const VIEWBLOCK_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; rune-asset-maturity-public/1.0)',
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://viewblock.io',
  Referer: 'https://viewblock.io/',
};

export type ViewBlockRewardDoc = {
  timestamp: number;
  type: string;
  address: string;
  height: number;
  node: string;
  bond: string;
  fee?: string;
  feeAmount?: string;
  rewards: string;
};

type ViewBlockRewardsResponse = {
  docs?: ViewBlockRewardDoc[];
  total?: number;
  page?: string;
  pages?: number;
};

export type BondRewardLot = {
  id: string;
  address: string;
  node: string;
  height: number;
  timestamp: number;
  acquiredAt: string;
  maturesAt: string;
  rewardsRune: number;
  usedRune: number;
  feeAmountRune: number;
  bondAfterRune: number;
  partial: boolean;
};

export async function fetchBondRewardDocs(address: string): Promise<ViewBlockRewardDoc[]> {
  const first = await fetchViewBlockRewardPage(address, 1);
  const pages = Math.min(first.pages ?? 1, VIEWBLOCK_PAGE_LIMIT);
  const docs = [...(first.docs ?? [])];

  for (let page = 2; page <= pages; page += 1) {
    const response = await fetchViewBlockRewardPage(address, page);
    docs.push(...(response.docs ?? []));
  }

  return dedupeRewardDocs(docs).filter((doc) => parseRune(doc.rewards) > 0);
}

export function selectNewestBondRewardsForGap(address: string, docs: ViewBlockRewardDoc[], gapRune: number): BondRewardLot[] {
  if (gapRune <= 0) return [];

  const selected: BondRewardLot[] = [];
  let remaining = roundRune(gapRune);

  for (const doc of [...docs].sort((a, b) => b.timestamp - a.timestamp)) {
    if (remaining <= 0.000001) break;

    const rewardsRune = parseRune(doc.rewards);
    if (rewardsRune <= 0) continue;

    const usedRune = roundRune(Math.min(rewardsRune, remaining));
    selected.push(toBondRewardLot(address, doc, usedRune, usedRune < rewardsRune));
    remaining = roundRune(remaining - usedRune);
  }

  return selected;
}

export function bondRewardLotsToEvents(lots: BondRewardLot[]): RuneEvent[] {
  return lots.map((lot) => ({
    id: lot.id,
    txId: lot.id,
    date: lot.acquiredAt,
    type: 'bond_reward',
    wallet: lot.address,
    runeAmount: lot.usedRune,
    description: `ViewBlock bond reward from node ${lot.node} at height ${lot.height}${lot.partial ? ' (partial reconciliation lot)' : ''}`,
  }));
}

async function fetchViewBlockRewardPage(address: string, page: number): Promise<ViewBlockRewardsResponse> {
  const url = new URL(`${VIEWBLOCK_BASE}/addresses/${address}/rewards`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('network', 'mainnet');

  const response = await fetch(url.toString(), {
    headers: VIEWBLOCK_HEADERS,
  });

  if (!response.ok) throw new Error(`ViewBlock rewards request failed: ${response.status} ${response.statusText}`);
  return (await response.json()) as ViewBlockRewardsResponse;
}

function dedupeRewardDocs(docs: ViewBlockRewardDoc[]): ViewBlockRewardDoc[] {
  const seen = new Set<string>();
  const deduped: ViewBlockRewardDoc[] = [];

  for (const doc of docs) {
    const key = `${doc.height}:${doc.node}:${doc.timestamp}:${doc.rewards}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(doc);
  }

  return deduped;
}

function toBondRewardLot(address: string, doc: ViewBlockRewardDoc, usedRune: number, partial: boolean): BondRewardLot {
  const acquiredAt = new Date(doc.timestamp).toISOString();

  return {
    id: `viewblock-bond-reward-${doc.height}-${doc.node}-${doc.timestamp}`,
    address,
    node: doc.node,
    height: doc.height,
    timestamp: doc.timestamp,
    acquiredAt,
    maturesAt: addDaysUtc(acquiredAt, 365),
    rewardsRune: parseRune(doc.rewards),
    usedRune,
    feeAmountRune: parseRune(doc.feeAmount ?? '0'),
    bondAfterRune: parseRune(doc.bond),
    partial,
  };
}

function parseRune(value: string | number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? roundRune(parsed) : 0;
}
