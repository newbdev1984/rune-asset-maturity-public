import { describe, expect, it } from 'vitest';
import { isValidThorAddress, mergeTrackedAddresses, normalizeThorAddress, type TrackedAddress } from './wallet-addresses';

describe('wallet address helpers', () => {
  it('normalizes and validates THOR addresses', () => {
    expect(normalizeThorAddress('  THOR1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQP2ADNK  ')).toBe('thor1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqp2adnk');
    expect(isValidThorAddress('thor1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqp2adnk')).toBe(true);
    expect(isValidThorAddress('bc1notthor')).toBe(false);
  });

  it('starts blank and only uses addresses saved in the browser workspace', () => {
    const saved: TrackedAddress[] = [
      {
        address: 'thor1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqp2adnk',
        label: 'workspace wallet',
        includeBondRewards: false,
        source: 'saved',
      },
    ];

    const merged = mergeTrackedAddresses(saved);

    expect(mergeTrackedAddresses([])).toEqual([]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ label: 'workspace wallet', source: 'saved' });
  });

  it('dedupes saved addresses within a workspace', () => {
    const merged = mergeTrackedAddresses([
      {
        address: 'thor1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqp2adnk',
        label: 'first label',
        includeBondRewards: false,
        source: 'saved',
      },
      {
        address: 'THOR1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQP2ADNK',
        label: 'updated label',
        includeBondRewards: true,
        source: 'saved',
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ source: 'saved', label: 'updated label', includeBondRewards: true });
  });
});
