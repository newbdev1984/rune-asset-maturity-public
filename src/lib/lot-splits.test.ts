import { describe, expect, it } from 'vitest';
import type { RuneLot } from './tax-lots';
import { applyLotSplits, validateLotSplitTotal, type LotSplit } from './lot-splits';

const parentLot: RuneLot = {
  id: 'tx-1-100-in',
  acquiredAt: '2025-09-01T00:00:00.000Z',
  maturesAt: '2026-09-01T00:00:00.000Z',
  originalAmount: 100,
  remainingAmount: 100,
  sourceTxId: 'tx-1',
  sourceWallet: 'thor123',
  acquisitionType: 'transfer_in',
  description: 'Exchange withdrawal',
};

const splits: LotSplit[] = [
  {
    parentLotId: parentLot.id,
    sourceTxId: parentLot.sourceTxId,
    sourceWallet: parentLot.sourceWallet,
    splitIndex: 1,
    amountRune: 40,
    acquiredAt: '2024-01-01T00:00:00.000Z',
    sourceLabel: 'Kraken',
  },
  {
    parentLotId: parentLot.id,
    sourceTxId: parentLot.sourceTxId,
    sourceWallet: parentLot.sourceWallet,
    splitIndex: 2,
    amountRune: 60,
    acquiredAt: '2025-09-01T00:00:00.000Z',
    sourceLabel: 'Transfer date',
  },
];

describe('lot split replacement', () => {
  it('validates split totals against the parent lot amount', () => {
    expect(validateLotSplitTotal(100, splits)).toMatchObject({ valid: true, totalRune: 100, deltaRune: 0 });
    expect(validateLotSplitTotal(99, splits)).toMatchObject({ valid: false, totalRune: 100, deltaRune: 1 });
  });

  it('replaces a parent lot with child tax lots for maturity calculations', () => {
    const expanded = applyLotSplits([parentLot], splits);

    expect(expanded).toHaveLength(2);
    expect(expanded.map((lot) => ({ id: lot.id, amount: lot.remainingAmount, acquiredAt: lot.acquiredAt, maturesAt: lot.maturesAt }))).toEqual([
      {
        id: `${parentLot.id}-split-1`,
        amount: 40,
        acquiredAt: '2024-01-01T00:00:00.000Z',
        maturesAt: '2024-12-31T00:00:00.000Z',
      },
      {
        id: `${parentLot.id}-split-2`,
        amount: 60,
        acquiredAt: '2025-09-01T00:00:00.000Z',
        maturesAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
  });

  it('keeps the parent lot if saved split totals do not reconcile', () => {
    const expanded = applyLotSplits([parentLot], [{ ...splits[0], amountRune: 10 }, splits[1]]);

    expect(expanded).toEqual([parentLot]);
  });
});
