import { describe, expect, it } from 'vitest';
import type { RuneLot } from './tax-lots';
import { applyLotOverrides, getLotReviewState, type LotOverride } from './lot-overrides';

const baseLot: RuneLot = {
  id: 'tx-1-100-in',
  acquiredAt: '2025-03-23T12:00:00.000Z',
  maturesAt: '2026-03-23T12:00:00.000Z',
  originalAmount: 100,
  remainingAmount: 100,
  sourceTxId: 'tx-1',
  sourceWallet: 'thor123',
  acquisitionType: 'transfer_in',
  description: 'transfer RUNE in',
};

describe('lot overrides', () => {
  it('marks a transfer lot as reviewed without changing its acquisition date', () => {
    const overrides: LotOverride[] = [
      {
        lotId: baseLot.id,
        reviewStatus: 'reviewed',
        sourceLabel: 'CEX purchase shortly before transfer',
        notes: 'Transfer date accepted.',
      },
    ];

    const [lot] = applyLotOverrides([baseLot], overrides);

    expect(lot.acquiredAt).toBe(baseLot.acquiredAt);
    expect(lot.maturesAt).toBe(baseLot.maturesAt);
    expect(getLotReviewState(lot, overrides)).toMatchObject({ status: 'reviewed', sourceLabel: 'CEX purchase shortly before transfer' });
  });

  it('applies an acquisition date override and recalculates the maturity date', () => {
    const overrides: LotOverride[] = [
      {
        lotId: baseLot.id,
        reviewStatus: 'reviewed',
        overrideAcquiredAt: '2024-01-15T00:00:00.000Z',
        sourceLabel: 'Kraken',
      },
    ];

    const [lot] = applyLotOverrides([baseLot], overrides);

    expect(lot.acquiredAt).toBe('2024-01-15T00:00:00.000Z');
    expect(lot.maturesAt).toBe('2025-01-14T00:00:00.000Z');
    expect(getLotReviewState(lot, overrides).overrideAcquiredAt).toBe('2024-01-15T00:00:00.000Z');
  });

  it('keeps manual opening lots needing review until a saved override exists', () => {
    const manualLot: RuneLot = {
      ...baseLot,
      id: 'manual-opening-thor123-manual-opening-thor123',
      sourceTxId: 'manual-opening-thor123',
    };

    expect(getLotReviewState(manualLot, [])).toMatchObject({ status: 'needs_review', reason: 'manual_opening_balance' });
  });
});
