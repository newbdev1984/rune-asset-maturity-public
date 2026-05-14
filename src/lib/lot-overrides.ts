import { addDaysUtc, type RuneLot } from './tax-lots';

export type LotReviewStatus = 'needs_review' | 'reviewed';

export type LotOverride = {
  lotId: string;
  reviewStatus: LotReviewStatus;
  overrideAcquiredAt?: string | null;
  sourceLabel?: string | null;
  notes?: string | null;
};

export type LotReviewReason = 'manual_opening_balance' | 'transfer_in' | 'none';

export type LotReviewState = {
  status: LotReviewStatus;
  reason: LotReviewReason;
  overrideAcquiredAt?: string | null;
  sourceLabel?: string | null;
  notes?: string | null;
};

export function applyLotOverrides(lots: RuneLot[], overrides: LotOverride[]): RuneLot[] {
  const byLotId = new Map(overrides.map((override) => [override.lotId, override]));

  return lots.map((lot) => {
    const override = byLotId.get(lot.id);
    if (!override?.overrideAcquiredAt) return lot;

    return {
      ...lot,
      acquiredAt: override.overrideAcquiredAt,
      maturesAt: addDaysUtc(override.overrideAcquiredAt, 365),
      description: [lot.description, `Tax acquisition date overridden: ${override.overrideAcquiredAt}`]
        .filter(Boolean)
        .join(' · '),
    };
  });
}

export function getLotReviewState(lot: RuneLot, overrides: LotOverride[]): LotReviewState {
  const override = overrides.find((candidate) => candidate.lotId === lot.id);
  if (override) {
    return {
      status: override.reviewStatus,
      reason: 'none',
      overrideAcquiredAt: override.overrideAcquiredAt,
      sourceLabel: override.sourceLabel,
      notes: override.notes,
    };
  }

  if (isManualOpeningLot(lot)) return { status: 'needs_review', reason: 'manual_opening_balance' };
  if (lot.acquisitionType === 'transfer_in') return { status: 'needs_review', reason: 'transfer_in' };
  return { status: 'reviewed', reason: 'none' };
}

export function isManualOpeningLot(lot: Pick<RuneLot, 'id' | 'sourceTxId'>): boolean {
  return lot.sourceTxId.startsWith('manual-opening') || lot.id.includes('manual-opening');
}
