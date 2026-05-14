export type RuneEventType =
  | 'swap_in'
  | 'swap_out'
  | 'transfer_in'
  | 'transfer_out'
  | 'internal_transfer'
  | 'bond_in'
  | 'bond_out'
  | 'bond_reward'
  | 'unknown';

export type RuneEvent = {
  id: string;
  txId: string;
  date: string;
  type: RuneEventType;
  wallet: string;
  runeAmount: number;
  description?: string;
  fromAddress?: string;
  toAddress?: string;
  counterAsset?: string;
};

export type RuneLot = {
  id: string;
  acquiredAt: string;
  maturesAt: string;
  originalAmount: number;
  remainingAmount: number;
  sourceTxId: string;
  sourceWallet: string;
  acquisitionType: RuneEventType;
  description?: string;
};

export type ReconciliationInput = {
  walletRune: number;
  bondedRune: number;
};

export type ReconciliationResult = ReconciliationInput & {
  totalReconciledRune: number;
  reconciliationDelta: number;
  isBalanced: boolean;
};

export type MaturitySummary = ReconciliationResult & {
  asOf: string;
  runePriceUsd: number;
  totalTrackedRune: number;
  shortTermRune: number;
  longTermRune: number;
  shortTermValueUsd: number;
  longTermValueUsd: number;
  totalValueUsd: number;
  longTermPercent: number;
  shortTermPercent: number;
};

export type MaturityScheduleItem = {
  date: string;
  runeMaturing: number;
  longTermRuneAfter: number;
  longTermPercentAfter: number;
};

export type LotConsumption = {
  lotId: string;
  sourceTxId: string;
  acquiredAt: string;
  maturesAt: string;
  amount: number;
  term: 'short' | 'long';
};

export type SaleSimulation = {
  saleDate: string;
  requestedRune: number;
  sellableRune: number;
  shortTermAmount: number;
  longTermAmount: number;
  lotsConsumed: LotConsumption[];
};

const RUNE_EPSILON = 0.000001;

export function addDaysUtc(dateIso: string, days: number): string {
  const date = new Date(dateIso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function isLongTerm(acquiredAt: string, asOf: string): boolean {
  return new Date(asOf).getTime() >= new Date(addDaysUtc(acquiredAt, 365)).getTime();
}

export function buildLotsFromEvents(events: RuneEvent[]): RuneLot[] {
  const lots: RuneLot[] = [];
  const sortedEvents = [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  for (const event of sortedEvents) {
    if (event.runeAmount <= 0) continue;

    if (isAcquisitionEvent(event.type)) {
      lots.push({
        id: `${event.txId}-${event.id}`,
        acquiredAt: event.date,
        maturesAt: addDaysUtc(event.date, 365),
        originalAmount: roundRune(event.runeAmount),
        remainingAmount: roundRune(event.runeAmount),
        sourceTxId: event.txId,
        sourceWallet: event.wallet,
        acquisitionType: event.type,
        description: event.description,
      });
    }

    if (isDisposalEvent(event.type)) {
      consumeFifo(lots, event.runeAmount);
    }
  }

  return lots.filter((lot) => lot.remainingAmount > RUNE_EPSILON);
}

function isAcquisitionEvent(type: RuneEventType): boolean {
  return type === 'swap_in' || type === 'transfer_in' || type === 'bond_reward';
}

function isDisposalEvent(type: RuneEventType): boolean {
  return type === 'swap_out' || type === 'transfer_out';
}

function consumeFifo(lots: RuneLot[], runeAmount: number): void {
  let remainingToConsume = runeAmount;

  for (const lot of lots) {
    if (remainingToConsume <= RUNE_EPSILON) break;
    if (lot.remainingAmount <= RUNE_EPSILON) continue;

    const consumed = Math.min(lot.remainingAmount, remainingToConsume);
    lot.remainingAmount = roundRune(lot.remainingAmount - consumed);
    remainingToConsume = roundRune(remainingToConsume - consumed);
  }
}

export function getMaturitySummary(
  lots: RuneLot[],
  asOf: string,
  runePriceUsd: number,
  reconciliation: ReconciliationInput,
): MaturitySummary {
  const totalTrackedRune = roundRune(sum(lots.map((lot) => lot.remainingAmount)));
  const longTermRune = roundRune(sum(lots.filter((lot) => isLongTerm(lot.acquiredAt, asOf)).map((lot) => lot.remainingAmount)));
  const shortTermRune = roundRune(totalTrackedRune - longTermRune);
  const reconciliationResult = reconcileRuneSupply(totalTrackedRune, reconciliation);

  return {
    asOf,
    runePriceUsd,
    totalTrackedRune,
    shortTermRune,
    longTermRune,
    shortTermValueUsd: roundUsd(shortTermRune * runePriceUsd),
    longTermValueUsd: roundUsd(longTermRune * runePriceUsd),
    totalValueUsd: roundUsd(reconciliationResult.totalReconciledRune * runePriceUsd),
    longTermPercent: percent(longTermRune, totalTrackedRune),
    shortTermPercent: percent(shortTermRune, totalTrackedRune),
    ...reconciliationResult,
  };
}

export function getMaturitySchedule(lots: RuneLot[], asOf: string): MaturityScheduleItem[] {
  const totalRune = roundRune(sum(lots.map((lot) => lot.remainingAmount)));
  const currentLongTerm = roundRune(sum(lots.filter((lot) => isLongTerm(lot.acquiredAt, asOf)).map((lot) => lot.remainingAmount)));
  const byDate = new Map<string, number>();

  for (const lot of lots) {
    if (isLongTerm(lot.acquiredAt, asOf)) continue;
    byDate.set(lot.maturesAt, roundRune((byDate.get(lot.maturesAt) ?? 0) + lot.remainingAmount));
  }

  let runningLongTerm = currentLongTerm;
  return Array.from(byDate.entries())
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([date, runeMaturing]) => {
      runningLongTerm = roundRune(runningLongTerm + runeMaturing);
      return {
        date,
        runeMaturing,
        longTermRuneAfter: runningLongTerm,
        longTermPercentAfter: percent(runningLongTerm, totalRune),
      };
    });
}

export function simulateSale(lots: RuneLot[], requestedRune: number, saleDate: string): SaleSimulation {
  let remainingToSell = requestedRune;
  const lotsConsumed: LotConsumption[] = [];

  for (const lot of [...lots].sort((a, b) => new Date(a.acquiredAt).getTime() - new Date(b.acquiredAt).getTime())) {
    if (remainingToSell <= RUNE_EPSILON) break;

    const amount = Math.min(lot.remainingAmount, remainingToSell);
    if (amount <= RUNE_EPSILON) continue;

    lotsConsumed.push({
      lotId: lot.id,
      sourceTxId: lot.sourceTxId,
      acquiredAt: lot.acquiredAt,
      maturesAt: lot.maturesAt,
      amount: roundRune(amount),
      term: isLongTerm(lot.acquiredAt, saleDate) ? 'long' : 'short',
    });
    remainingToSell = roundRune(remainingToSell - amount);
  }

  const longTermAmount = roundRune(sum(lotsConsumed.filter((lot) => lot.term === 'long').map((lot) => lot.amount)));
  const shortTermAmount = roundRune(sum(lotsConsumed.filter((lot) => lot.term === 'short').map((lot) => lot.amount)));

  return {
    saleDate,
    requestedRune,
    sellableRune: roundRune(requestedRune - remainingToSell),
    shortTermAmount,
    longTermAmount,
    lotsConsumed,
  };
}

export function reconcileRuneSupply(trackedRune: number, reconciliation: ReconciliationInput): ReconciliationResult {
  const totalReconciledRune = roundRune(reconciliation.walletRune + reconciliation.bondedRune);
  const reconciliationDelta = roundRune(totalReconciledRune - trackedRune);

  return {
    ...reconciliation,
    totalReconciledRune,
    reconciliationDelta,
    isBalanced: Math.abs(reconciliationDelta) <= 0.0001,
  };
}

export function roundRune(value: number): number {
  return Math.round((value + Number.EPSILON) * 100000000) / 100000000;
}

export function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function percent(numerator: number, denominator: number): number {
  if (denominator <= RUNE_EPSILON) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}
