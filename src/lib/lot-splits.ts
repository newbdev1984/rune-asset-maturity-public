import { addDaysUtc, roundRune, type RuneLot } from './tax-lots';

export const SPLIT_RECONCILIATION_TOLERANCE = 0.000001;

export type LotSplit = {
  parentLotId: string;
  sourceTxId: string;
  sourceWallet: string;
  splitIndex: number;
  amountRune: number;
  acquiredAt: string;
  sourceLabel?: string | null;
  notes?: string | null;
};

export type LotSplitValidation = {
  valid: boolean;
  totalRune: number;
  parentRune: number;
  deltaRune: number;
};

export function applyLotSplits(lots: RuneLot[], splits: LotSplit[]): RuneLot[] {
  const splitsByParent = groupSplitsByParent(splits);
  const expandedLots: RuneLot[] = [];

  for (const lot of lots) {
    const lotSplits = splitsByParent.get(lot.id);
    if (!lotSplits?.length) {
      expandedLots.push(lot);
      continue;
    }

    const validation = validateLotSplitTotal(lot.remainingAmount, lotSplits);
    if (!validation.valid) {
      expandedLots.push(lot);
      continue;
    }

    expandedLots.push(
      ...lotSplits
        .sort((a, b) => a.splitIndex - b.splitIndex)
        .map((split) => ({
          ...lot,
          id: `${lot.id}-split-${split.splitIndex}`,
          acquiredAt: split.acquiredAt,
          maturesAt: addDaysUtc(split.acquiredAt, 365),
          originalAmount: roundRune(split.amountRune),
          remainingAmount: roundRune(split.amountRune),
          description: [
            lot.description,
            `Split tax lot ${split.splitIndex} from ${lot.id}`,
            split.sourceLabel ? `Source: ${split.sourceLabel}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        })),
    );
  }

  return expandedLots;
}

export function validateLotSplitTotal(parentRune: number, splits: Pick<LotSplit, 'amountRune'>[]): LotSplitValidation {
  const totalRune = roundRune(splits.reduce((total, split) => total + split.amountRune, 0));
  const roundedParentRune = roundRune(parentRune);
  const deltaRune = roundRune(totalRune - roundedParentRune);

  return {
    valid: Math.abs(deltaRune) <= SPLIT_RECONCILIATION_TOLERANCE,
    totalRune,
    parentRune: roundedParentRune,
    deltaRune,
  };
}

export function groupSplitsByParent(splits: LotSplit[]): Map<string, LotSplit[]> {
  const byParent = new Map<string, LotSplit[]>();
  for (const split of splits) {
    const current = byParent.get(split.parentLotId) ?? [];
    current.push(split);
    byParent.set(split.parentLotId, current);
  }
  return byParent;
}
