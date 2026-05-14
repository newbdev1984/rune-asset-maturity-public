import { describe, expect, it } from 'vitest';
import {
  addDaysUtc,
  buildLotsFromEvents,
  getMaturitySummary,
  getMaturitySchedule,
  simulateSale,
  reconcileRuneSupply,
  type RuneEvent,
} from './tax-lots';

const events: RuneEvent[] = [
  {
    id: 'old-swap',
    txId: 'AAA',
    date: '2025-01-01T00:00:00.000Z',
    type: 'swap_in',
    wallet: 'thor1',
    runeAmount: 100,
    description: 'BTC to RUNE',
  },
  {
    id: 'new-transfer',
    txId: 'BBB',
    date: '2025-09-01T00:00:00.000Z',
    type: 'transfer_in',
    wallet: 'thor1',
    runeAmount: 50,
    description: 'Exchange withdrawal',
  },
  {
    id: 'sale',
    txId: 'CCC',
    date: '2025-10-01T00:00:00.000Z',
    type: 'swap_out',
    wallet: 'thor1',
    runeAmount: 30,
    description: 'RUNE to BTC',
  },
];

describe('tax lot engine', () => {
  it('adds exactly 365 days in UTC for long-term maturity dates', () => {
    expect(addDaysUtc('2025-01-01T00:00:00.000Z', 365)).toBe('2026-01-01T00:00:00.000Z');
  });

  it('builds FIFO lots and consumes oldest RUNE first on disposals', () => {
    const lots = buildLotsFromEvents(events);

    expect(lots).toHaveLength(2);
    expect(lots[0]).toMatchObject({ sourceTxId: 'AAA', originalAmount: 100, remainingAmount: 70 });
    expect(lots[1]).toMatchObject({ sourceTxId: 'BBB', originalAmount: 50, remainingAmount: 50 });
  });

  it('summarizes short-term vs long-term RUNE and includes bonded RUNE in reconciliation', () => {
    const lots = buildLotsFromEvents(events);
    const summary = getMaturitySummary(lots, '2026-02-01T00:00:00.000Z', 1.25, {
      walletRune: 90,
      bondedRune: 30,
    });

    expect(summary.longTermRune).toBe(70);
    expect(summary.shortTermRune).toBe(50);
    expect(summary.totalTrackedRune).toBe(120);
    expect(summary.totalReconciledRune).toBe(120);
    expect(summary.reconciliationDelta).toBe(0);
    expect(summary.bondedRune).toBe(30);
  });

  it('creates a stepped maturity schedule for remaining lots', () => {
    const lots = buildLotsFromEvents(events);
    const schedule = getMaturitySchedule(lots, '2025-12-01T00:00:00.000Z');

    expect(schedule.map((item) => ({ date: item.date, runeMaturing: item.runeMaturing, longTermRuneAfter: item.longTermRuneAfter }))).toEqual([
      { date: '2026-01-01T00:00:00.000Z', runeMaturing: 70, longTermRuneAfter: 70 },
      { date: '2026-09-01T00:00:00.000Z', runeMaturing: 50, longTermRuneAfter: 120 },
    ]);
  });

  it('simulates a future FIFO sale and separates long-term from short-term sold amounts', () => {
    const lots = buildLotsFromEvents(events);
    const sale = simulateSale(lots, 90, '2026-02-01T00:00:00.000Z');

    expect(sale.longTermAmount).toBe(70);
    expect(sale.shortTermAmount).toBe(20);
    expect(sale.lotsConsumed).toHaveLength(2);
  });

  it('does not reset holding period when RUNE moves into or out of bonded node positions', () => {
    const lots = buildLotsFromEvents([
      {
        id: 'old-buy',
        txId: 'OLD',
        date: '2024-01-01T00:00:00.000Z',
        type: 'transfer_in',
        wallet: 'thor1',
        runeAmount: 100,
      },
      {
        id: 'bond',
        txId: 'BOND',
        date: '2025-01-01T00:00:00.000Z',
        type: 'bond_in',
        wallet: 'thor1',
        runeAmount: 100,
      },
      {
        id: 'unbond',
        txId: 'UNBOND',
        date: '2025-02-01T00:00:00.000Z',
        type: 'bond_out',
        wallet: 'thor1',
        runeAmount: 25,
      },
    ]);

    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ sourceTxId: 'OLD', acquiredAt: '2024-01-01T00:00:00.000Z', remainingAmount: 100 });
  });

  it('reconciles tracked lots against wallet plus bonded RUNE totals', () => {
    const result = reconcileRuneSupply(120, { walletRune: 90, bondedRune: 35 });

    expect(result.totalReconciledRune).toBe(125);
    expect(result.reconciliationDelta).toBe(5);
    expect(result.isBalanced).toBe(false);
  });
});
