import { describe, expect, it } from 'vitest';
import { bondRewardLotsToEvents, selectNewestBondRewardsForGap, type ViewBlockRewardDoc } from './bond-rewards';
import { buildLotsFromEvents } from './tax-lots';

const docs: ViewBlockRewardDoc[] = [
  {
    timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
    type: 'bond',
    address: 'thor1abc',
    height: 1,
    node: 'node-old',
    bond: '100',
    rewards: '100',
  },
  {
    timestamp: Date.parse('2026-02-01T00:00:00.000Z'),
    type: 'bond',
    address: 'thor1abc',
    height: 2,
    node: 'node-new',
    bond: '200',
    rewards: '200',
  },
];

describe('bond rewards', () => {
  it('selects newest rewards first and splits the final row to the reconciliation gap', () => {
    const selected = selectNewestBondRewardsForGap('thor1abc', docs, 250);

    expect(selected).toHaveLength(2);
    expect(selected[0]).toMatchObject({ height: 2, usedRune: 200, partial: false });
    expect(selected[1]).toMatchObject({ height: 1, usedRune: 50, partial: true });
  });

  it('converts selected rewards into acquisition lots using reward timestamps', () => {
    const selected = selectNewestBondRewardsForGap('thor1abc', docs, 250);
    const lots = buildLotsFromEvents(bondRewardLotsToEvents(selected));

    expect(lots.map((lot) => lot.acquisitionType)).toEqual(['bond_reward', 'bond_reward']);
    expect(lots.reduce((total, lot) => total + lot.remainingAmount, 0)).toBe(250);
    expect(lots[0].acquiredAt).toBe('2026-01-01T00:00:00.000Z');
    expect(lots[1].acquiredAt).toBe('2026-02-01T00:00:00.000Z');
  });
});
