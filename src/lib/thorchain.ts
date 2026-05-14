import type { RuneEvent } from './tax-lots';
import { roundRune } from './tax-lots';

const MIDGARD_BASES = [
  'https://midgard.thorchain.network/v2',
  'https://gateway.liquify.com/chain/thorchain_midgard/v2',
] as const;
const THORNODE_BASE = 'https://thornode.thorchain.network/thorchain';
const CLIENT_ID = 'rune-asset-maturity-public';
const ACTIONS_PAGE_LIMIT = 50;
const MAX_ACTION_PAGES = 30;

export type Coin = { asset: string; amount: string };
export type ActionSide = { address: string; coins: Coin[]; txID: string };
export type MidgardAction = {
  date: string;
  height: string;
  type: string;
  status: string;
  in?: ActionSide[];
  out?: ActionSide[];
  metadata?: Record<string, unknown>;
};

export type BondPosition = {
  nodeAddress: string;
  status: string;
  bondedRune: number;
};

export type BondedRuneResult = {
  bondedRune: number;
  positions: BondPosition[];
};

export type WalletRuneSnapshot = {
  address: string;
  walletRune: number;
  bondedRune: number;
  totalRune: number;
  bondPositions: BondPosition[];
};

type BalanceResponse = { coins?: Coin[] };
type NodeProvider = { bond_address?: string; bond?: string };
type NodeResponse = {
  node_address?: string;
  status?: string;
  bond_providers?: { providers?: NodeProvider[] | null };
};

export function runeBaseToRune(amount: string | number | undefined): number {
  return roundRune(Number(amount ?? 0) / 100_000_000);
}

export function parseWalletRuneBalance(balance: BalanceResponse): number {
  const rune = balance.coins?.find((coin) => coin.asset === 'THOR.RUNE');
  return runeBaseToRune(rune?.amount ?? '0');
}

export function parseBondedRuneFromNodes(nodes: NodeResponse[], address: string): BondedRuneResult {
  const positions: BondPosition[] = [];

  for (const node of nodes) {
    for (const provider of node.bond_providers?.providers ?? []) {
      if (provider.bond_address !== address) continue;
      positions.push({
        nodeAddress: node.node_address ?? 'unknown-node',
        status: node.status ?? 'Unknown',
        bondedRune: runeBaseToRune(provider.bond ?? '0'),
      });
    }
  }

  return {
    bondedRune: roundRune(positions.reduce((total, position) => total + position.bondedRune, 0)),
    positions,
  };
}

export function classifyActionAsRuneEvent(action: MidgardAction, ownedWallets: string[]): RuneEvent | null {
  if (action.status !== 'success') return null;

  const owned = new Set(ownedWallets);
  const incomingRune = findRuneSide(action.out ?? [], owned);
  const outgoingRune = findRuneSide(action.in ?? [], owned);
  const date = midgardNanoToIso(action.date);
  const normalizedActionType = action.type.toLowerCase();
  const isBondAction = normalizedActionType.includes('bond') || normalizedActionType.includes('unbond');

  if (isBondAction && outgoingRune) {
    return {
      id: `${action.height}-${outgoingRune.txID}-bond-in`,
      txId: outgoingRune.txID,
      date,
      type: 'bond_in',
      wallet: outgoingRune.address,
      runeAmount: outgoingRune.runeAmount,
      description: `${action.type} RUNE into node bond; holding period preserved`,
    };
  }

  if (isBondAction && incomingRune) {
    return {
      id: `${action.height}-${incomingRune.txID}-bond-out`,
      txId: incomingRune.txID,
      date,
      type: 'bond_out',
      wallet: incomingRune.address,
      runeAmount: incomingRune.runeAmount,
      description: `${action.type} RUNE out of node bond; holding period preserved`,
    };
  }

  if (incomingRune && !outgoingRune) {
    return {
      id: `${action.height}-${incomingRune.txID}-in`,
      txId: incomingRune.txID,
      date,
      type: action.type === 'swap' ? 'swap_in' : 'transfer_in',
      wallet: incomingRune.address,
      runeAmount: incomingRune.runeAmount,
      description: `${action.type} RUNE in`,
    };
  }

  if (outgoingRune && !incomingRune) {
    return {
      id: `${action.height}-${outgoingRune.txID}-out`,
      txId: outgoingRune.txID,
      date,
      type: action.type === 'swap' ? 'swap_out' : 'transfer_out',
      wallet: outgoingRune.address,
      runeAmount: outgoingRune.runeAmount,
      description: `${action.type} RUNE out`,
    };
  }

  if (incomingRune && outgoingRune) {
    return {
      id: `${action.height}-${incomingRune.txID}-internal`,
      txId: incomingRune.txID,
      date,
      type: 'internal_transfer',
      wallet: incomingRune.address,
      fromAddress: outgoingRune.address,
      toAddress: incomingRune.address,
      runeAmount: incomingRune.runeAmount,
      description: 'Owned-wallet internal transfer; holding period should be preserved manually during lot assignment.',
    };
  }

  return null;
}

function findRuneSide(sides: ActionSide[], owned: Set<string>): { address: string; txID: string; runeAmount: number } | null {
  for (const side of sides) {
    if (!owned.has(side.address)) continue;
    const runeCoin = side.coins.find((coin) => coin.asset === 'THOR.RUNE');
    if (!runeCoin) continue;

    return {
      address: side.address,
      txID: side.txID,
      runeAmount: runeBaseToRune(runeCoin.amount),
    };
  }

  return null;
}

export function midgardNanoToIso(nanoTimestamp: string): string {
  const milliseconds = Math.floor(Number(nanoTimestamp) / 1_000_000);
  return new Date(milliseconds).toISOString();
}

export async function fetchWalletRuneBalance(address: string): Promise<number> {
  const balance = await fetchMidgardJson<BalanceResponse>(`/balance/${address}`);
  return parseWalletRuneBalance(balance);
}

export async function fetchBondedRune(address: string): Promise<BondedRuneResult> {
  const nodes = await fetchJson<NodeResponse[]>(`${THORNODE_BASE}/nodes`);
  return parseBondedRuneFromNodes(nodes, address);
}

export async function fetchWalletSnapshot(address: string): Promise<WalletRuneSnapshot> {
  const [walletRune, bonded] = await Promise.all([fetchWalletRuneBalance(address), fetchBondedRune(address)]);
  return {
    address,
    walletRune,
    bondedRune: bonded.bondedRune,
    totalRune: roundRune(walletRune + bonded.bondedRune),
    bondPositions: bonded.positions,
  };
}

export async function fetchActionsPage(address: string, limit = ACTIONS_PAGE_LIMIT, offset = 0): Promise<{ actions: MidgardAction[]; count: number }> {
  const response = await fetchMidgardJson<{ actions?: MidgardAction[]; count?: string }>('/actions', {
    address,
    limit: String(limit),
    offset: String(offset),
  });
  return { actions: response.actions ?? [], count: Number(response.count ?? 0) };
}

export async function fetchAllActions(address: string): Promise<MidgardAction[]> {
  const allActions: MidgardAction[] = [];
  let count = Number.POSITIVE_INFINITY;

  for (let pageIndex = 0; pageIndex < MAX_ACTION_PAGES && allActions.length < count; pageIndex += 1) {
    const offset = pageIndex * ACTIONS_PAGE_LIMIT;
    const page = await fetchActionsPage(address, ACTIONS_PAGE_LIMIT, offset);
    count = page.count;
    if (page.actions.length === 0) break;
    allActions.push(...page.actions);
    if (page.actions.length < ACTIONS_PAGE_LIMIT) break;
  }

  return allActions;
}

async function fetchMidgardJson<T>(path: string, params?: Record<string, string>): Promise<T> {
  const errors: string[] = [];

  for (const base of MIDGARD_BASES) {
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);

    try {
      return await fetchJson<T>(url.toString());
    } catch (error) {
      errors.push(`${base}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  throw new Error(`all Midgard providers failed (${errors.join('; ')})`);
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { 'x-client-id': CLIENT_ID },
  });

  if (!response.ok) {
    throw new Error(`THORChain request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}
