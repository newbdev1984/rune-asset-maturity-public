import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyActionAsRuneEvent, fetchAllActions, parseBondedRuneFromNodes, parseWalletRuneBalance } from './thorchain';

describe('thorchain parsers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('parses wallet RUNE balance from Midgard balance response', () => {
    expect(parseWalletRuneBalance({ coins: [{ asset: 'THOR.RUNE', amount: '123456789' }] })).toBe(1.23456789);
  });

  it('sums bonded RUNE where an address is a bond provider across nodes', () => {
    const nodes = [
      {
        node_address: 'node1',
        status: 'Active',
        bond_providers: { providers: [{ bond_address: 'thor-user', bond: '100000000' }] },
      },
      {
        node_address: 'node2',
        status: 'Active',
        bond_providers: { providers: [{ bond_address: 'thor-user', bond: '250000000' }] },
      },
      {
        node_address: 'node3',
        status: 'Standby',
        bond_providers: { providers: [{ bond_address: 'someone-else', bond: '999000000' }] },
      },
    ];

    expect(parseBondedRuneFromNodes(nodes, 'thor-user')).toEqual({
      bondedRune: 3.5,
      positions: [
        { nodeAddress: 'node1', status: 'Active', bondedRune: 1 },
        { nodeAddress: 'node2', status: 'Active', bondedRune: 2.5 },
      ],
    });
  });

  it('classifies successful actions with RUNE entering the owned wallet as acquisitions', () => {
    const event = classifyActionAsRuneEvent(
      {
        date: '1704067200000000000',
        height: '1',
        type: 'swap',
        status: 'success',
        in: [{ address: 'external', coins: [{ asset: 'BTC.BTC', amount: '100' }], txID: 'IN' }],
        out: [{ address: 'thor-owned', coins: [{ asset: 'THOR.RUNE', amount: '500000000' }], txID: 'OUT' }],
      },
      ['thor-owned'],
    );

    expect(event).toMatchObject({ type: 'swap_in', runeAmount: 5, wallet: 'thor-owned', txId: 'OUT' });
  });

  it('classifies bond actions separately so holding periods are preserved by the lot engine', () => {
    const event = classifyActionAsRuneEvent(
      {
        date: '1704067200000000000',
        height: '2',
        type: 'bond',
        status: 'success',
        in: [{ address: 'thor-owned', coins: [{ asset: 'THOR.RUNE', amount: '100000000' }], txID: 'BOND' }],
        out: [],
      },
      ['thor-owned'],
    );

    expect(event).toMatchObject({ type: 'bond_in', runeAmount: 1, wallet: 'thor-owned', txId: 'BOND' });
  });

  it('loads every Midgard action page and falls back from rate-limited public Midgard to Liquify', async () => {
    const successPayloads = [
      { actions: Array.from({ length: 50 }, (_, index) => mockAction(String(index))), count: '51' },
      { actions: [mockAction('50')], count: '51' },
    ];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlText = String(url);
      if (urlText.startsWith('https://midgard.thorchain.network')) {
        return { ok: false, status: 429, statusText: 'Too Many Requests', json: async () => ({}) } as Response;
      }
      const payload = successPayloads.shift() ?? { actions: [], count: '51' };
      return { ok: true, json: async () => payload } as Response;
    });

    const actions = await fetchAllActions('thor-owned');

    expect(actions).toHaveLength(51);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('offset=0'), expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('offset=50'), expect.any(Object));
  });
});

function mockAction(height: string) {
  return {
    date: '1704067200000000000',
    height,
    type: 'send',
    status: 'success',
    in: [{ address: 'external', coins: [{ asset: 'THOR.RUNE', amount: '100000000' }], txID: `IN-${height}` }],
    out: [{ address: 'thor-owned', coins: [{ asset: 'THOR.RUNE', amount: '100000000' }], txID: `OUT-${height}` }],
  };
}
