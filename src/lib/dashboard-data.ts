import { bondRewardLotsToEvents, fetchBondRewardDocs, selectNewestBondRewardsForGap, type BondRewardLot } from './bond-rewards';
import { DEFAULT_SALE_AMOUNT_RUNE } from './config';
import { type LotOverride, applyLotOverrides } from './lot-overrides';
import { fetchLotOverrides } from './lot-overrides-store';
import { applyLotSplits, type LotSplit } from './lot-splits';
import { fetchLotSplits } from './lot-splits-store';
import { fetchRunePriceUsd } from './price';
import {
  buildLotsFromEvents,
  getMaturitySchedule,
  getMaturitySummary,
  reconcileRuneSupply,
  roundRune,
  simulateSale,
  type RuneEvent,
  type RuneLot,
} from './tax-lots';
import { classifyActionAsRuneEvent, fetchAllActions, fetchWalletSnapshot, type WalletRuneSnapshot } from './thorchain';
import { fetchSavedTrackedAddresses, mergeTrackedAddresses, type TrackedAddress } from './wallet-addresses';

export type DashboardData = {
  asOf: string;
  runePriceUsd: number;
  runePriceSource: string;
  trackedAddresses: TrackedAddress[];
  wallets: WalletRuneSnapshot[];
  balanceDataComplete: boolean;
  events: RuneEvent[];
  rawLots: RuneLot[];
  reviewLots: RuneLot[];
  lots: RuneLot[];
  lotOverrides: LotOverride[];
  lotSplits: LotSplit[];
  bondRewardLots: BondRewardLot[];
  summary: ReturnType<typeof getMaturitySummary>;
  schedule: ReturnType<typeof getMaturitySchedule>;
  saleSimulation: ReturnType<typeof simulateSale>;
  ingestionWarnings: string[];
};

export async function getDashboardData(workspaceId: string | null = null): Promise<DashboardData> {
  const asOf = new Date().toISOString();
  const ingestionWarnings: string[] = [];
  const trackedAddresses = await getTrackedAddresses(workspaceId, ingestionWarnings);
  const ownedWallets = trackedAddresses.map((wallet) => wallet.address);
  const bondRewardAddresses = trackedAddresses.filter((wallet) => wallet.includeBondRewards).map((wallet) => wallet.address);
  const walletSnapshots = await getWalletSnapshots(ownedWallets, ingestionWarnings);
  const wallets = walletSnapshots.wallets;
  const balanceDataComplete = walletSnapshots.complete;
  const totalWalletRune = wallets.reduce((total, wallet) => total + wallet.walletRune, 0);
  const totalBondedRune = wallets.reduce((total, wallet) => total + wallet.bondedRune, 0);
  const liveEventResult = await getRecentLiveEvents(ownedWallets, ingestionWarnings);
  const liveEvents = liveEventResult.events;
  const actionHistoryComplete = liveEventResult.complete;
  const canReconcileCurrentBalances = balanceDataComplete && actionHistoryComplete;
  const lotsFromLiveEvents = buildLotsFromEvents(liveEvents);
  const actionDerivedRune = roundRune(lotsFromLiveEvents.reduce((total, lot) => total + lot.remainingAmount, 0));
  const reconciliationInput = canReconcileCurrentBalances
    ? { walletRune: totalWalletRune, bondedRune: totalBondedRune }
    : { walletRune: actionDerivedRune, bondedRune: 0 };
  const initialReconciliation = reconcileRuneSupply(actionDerivedRune, reconciliationInput);
  const bondRewardLots = canReconcileCurrentBalances && initialReconciliation.reconciliationDelta > 0
    ? await getBondRewardLotsForGap(initialReconciliation.reconciliationDelta, bondRewardAddresses, ingestionWarnings)
    : [];
  const rewardEvents = bondRewardLotsToEvents(bondRewardLots);
  const eventsWithRewards = [...liveEvents, ...rewardEvents];
  const lotsFromEventsAndRewards = buildLotsFromEvents(eventsWithRewards);
  const rewardAdjustedRune = roundRune(lotsFromEventsAndRewards.reduce((total, lot) => total + lot.remainingAmount, 0));
  const reconciliation = reconcileRuneSupply(rewardAdjustedRune, reconciliationInput);

  const rawLots = !canReconcileCurrentBalances
    ? lotsFromLiveEvents
    : reconciliation.isBalanced
      ? lotsFromEventsAndRewards
      : reconciliation.reconciliationDelta > 0
        ? buildLotsFromEvents([
            ...eventsWithRewards,
            ...buildOpeningBalanceEvents(wallets, asOf, reconciliation.reconciliationDelta),
          ])
        : trimNewestLotsToTotal(lotsFromEventsAndRewards, reconciliation.totalReconciledRune);

  const lotOverrides = await getSavedLotOverrides(workspaceId, ingestionWarnings);
  const lotSplits = await getSavedLotSplits(workspaceId, ingestionWarnings);
  const reviewLots = applyLotOverrides(rawLots, lotOverrides);
  const lots = applyLotSplits(reviewLots, lotSplits);

  if (!canReconcileCurrentBalances) {
    ingestionWarnings.push(
      actionHistoryComplete
        ? 'Current wallet/bonded balance APIs were unavailable or incomplete, so the dashboard is temporarily keeping the action-derived lot table instead of trimming it to a zero/partial balance. Refresh later to restore exact wallet + bonded reconciliation.'
        : 'Action history is incomplete or rate-limited, so the dashboard is temporarily avoiding current-balance reconciliation and bond-reward imports until all wallet histories load. Refresh later to restore exact wallet + bonded reconciliation.',
    );
  }

  if (canReconcileCurrentBalances && !reconciliation.isBalanced && reconciliation.reconciliationDelta > 0) {
    ingestionWarnings.push(
      'Live action history is incomplete or rate-limited, so the app adds a manual opening-balance lot to reconcile wallet RUNE + bonded RUNE. Replace that lot with real acquisition dates or CEX imports before relying on tax output.',
    );
  }

  if (canReconcileCurrentBalances && !reconciliation.isBalanced && reconciliation.reconciliationDelta < 0) {
    ingestionWarnings.push(
      'Live action-derived lots exceed wallet RUNE + bonded RUNE. The dashboard trims newest preview lots to match reconciled current exposure until full historical import is available.',
    );
  }

  const price = await fetchRunePriceUsd();
  const summary = getMaturitySummary(lots, asOf, price.usd, reconciliationInput);

  return {
    asOf,
    runePriceUsd: price.usd,
    runePriceSource: price.source,
    trackedAddresses,
    wallets,
    balanceDataComplete: canReconcileCurrentBalances,
    events: liveEvents,
    rawLots,
    reviewLots,
    lots,
    lotOverrides,
    lotSplits,
    bondRewardLots,
    summary,
    schedule: getMaturitySchedule(lots, asOf),
    saleSimulation: simulateSale(lots, DEFAULT_SALE_AMOUNT_RUNE, asOf),
    ingestionWarnings,
  };
}

async function getTrackedAddresses(workspaceId: string | null, warnings: string[]): Promise<TrackedAddress[]> {
  try {
    return mergeTrackedAddresses(await fetchSavedTrackedAddresses(workspaceId));
  } catch (error) {
    warnings.push(`Saved address list could not be loaded, so this workspace is starting with no addresses: ${error instanceof Error ? error.message : 'unknown error'}`);
    return mergeTrackedAddresses([]);
  }
}

async function getSavedLotOverrides(workspaceId: string | null, warnings: string[]): Promise<LotOverride[]> {
  try {
    return await fetchLotOverrides(workspaceId);
  } catch (error) {
    warnings.push(`Saved lot reviews could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}`);
    return [];
  }
}

async function getBondRewardLotsForGap(gapRune: number, addresses: string[], warnings: string[]): Promise<BondRewardLot[]> {
  const lots: BondRewardLot[] = [];
  let remainingGap = gapRune;

  for (const address of addresses) {
    if (remainingGap <= 0.000001) break;

    try {
      const docs = await fetchBondRewardDocs(address);
      const selected = selectNewestBondRewardsForGap(address, docs, remainingGap);
      lots.push(...selected);
      remainingGap = roundRune(remainingGap - selected.reduce((total, lot) => total + lot.usedRune, 0));
      warnings.push(`${address} ViewBlock bond rewards import selected ${selected.length} reward lot(s) totaling ${roundRune(selected.reduce((total, lot) => total + lot.usedRune, 0))} RUNE to explain bonded reward balance.`);
    } catch (error) {
      warnings.push(`${address} ViewBlock bond rewards fetch failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  return lots;
}

async function getSavedLotSplits(workspaceId: string | null, warnings: string[]): Promise<LotSplit[]> {
  try {
    return await fetchLotSplits(workspaceId);
  } catch (error) {
    warnings.push(`Saved split lots could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}`);
    return [];
  }
}

async function getWalletSnapshots(ownedWallets: string[], warnings: string[]): Promise<{ wallets: WalletRuneSnapshot[]; complete: boolean }> {
  const results = await Promise.allSettled(ownedWallets.map((address) => fetchWalletSnapshot(address)));
  let complete = true;

  const wallets = results.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    complete = false;
    warnings.push(`${ownedWallets[index]} wallet snapshot fetch failed; substituted zero balances for this address.`);
    return {
      address: ownedWallets[index],
      walletRune: 0,
      bondedRune: 0,
      totalRune: 0,
      bondPositions: [],
    };
  });

  return { wallets, complete };
}

async function getRecentLiveEvents(ownedWallets: string[], warnings: string[]): Promise<{ events: RuneEvent[]; complete: boolean }> {
  const allEvents: RuneEvent[] = [];
  let complete = true;

  for (const address of ownedWallets) {
    try {
      const actions = await fetchAllActions(address);
      const events = actions
        .map((action) => classifyActionAsRuneEvent(action, ownedWallets))
        .filter((event): event is RuneEvent => Boolean(event));
      allEvents.push(...events);
      warnings.push(`${address} historical import loaded ${actions.length} Midgard action(s).`);
    } catch (error) {
      complete = false;
      warnings.push(`${address} action history fetch failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  return { events: allEvents, complete };
}

function trimNewestLotsToTotal(lots: RuneLot[], targetTotalRune: number): RuneLot[] {
  const clonedLots = lots.map((lot) => ({ ...lot }));
  let excess = roundRune(clonedLots.reduce((total, lot) => total + lot.remainingAmount, 0) - targetTotalRune);

  for (const lot of [...clonedLots].sort((a, b) => new Date(b.acquiredAt).getTime() - new Date(a.acquiredAt).getTime())) {
    if (excess <= 0) break;
    const reduction = Math.min(lot.remainingAmount, excess);
    lot.remainingAmount = roundRune(lot.remainingAmount - reduction);
    excess = roundRune(excess - reduction);
  }

  return clonedLots.filter((lot) => lot.remainingAmount > 0);
}

function buildOpeningBalanceEvents(wallets: WalletRuneSnapshot[], asOf: string, amountToReconcile: number): RuneEvent[] {
  if (amountToReconcile <= 0) return [];
  const totalRune = wallets.reduce((total, wallet) => total + wallet.totalRune, 0);
  const fallbackAcquiredAt = asOf;

  return wallets
    .filter((wallet) => wallet.totalRune > 0)
    .map((wallet) => ({
      id: `manual-opening-${wallet.address}`,
      txId: `manual-opening-${wallet.address}`,
      date: fallbackAcquiredAt,
      type: 'transfer_in' as const,
      wallet: wallet.address,
      runeAmount: totalRune > 0 ? (amountToReconcile * wallet.totalRune) / totalRune : 0,
      description: 'Manual opening balance placeholder; edit acquisition date after full history import.',
    }));
}
