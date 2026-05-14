import { cookies } from 'next/headers';
import { AddressManager } from '@/components/address-manager';
import { AssetMaturationChart } from '@/components/asset-maturation-chart';
import { LotReviewTable, type LotReviewTableRow } from '@/components/lot-review-table';
import { SalePlanner } from '@/components/sale-planner';
import { APP_NAME } from '@/lib/config';
import { getDashboardData, type DashboardData } from '@/lib/dashboard-data';
import { getLotReviewState, isManualOpeningLot } from '@/lib/lot-overrides';
import { validateLotSplitTotal } from '@/lib/lot-splits';
import { WORKSPACE_COOKIE, isValidWorkspaceId } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const cookieStore = await cookies();
  const cookieWorkspaceId = cookieStore.get(WORKSPACE_COOKIE)?.value ?? null;
  const workspaceId = isValidWorkspaceId(cookieWorkspaceId) ? cookieWorkspaceId : null;
  const data = await getDashboardData(workspaceId);
  const chartPoints = buildMaturationChartPoints(data);
  const lotReviewRows = buildLotReviewRows(data);
  const nextMaturity = data.schedule[0];

  return (
    <main className="min-h-screen bg-[#071522] px-6 py-8 text-slate-100">
      <section className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">Public RUNE planning workspace</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">{APP_NAME}</h1>
            <p className="mt-3 max-w-3xl text-slate-300">
              Tracks wallet RUNE plus bonded RUNE, reconstructs FIFO lots from THORChain activity, and highlights when holdings mature from short-term to long-term.
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
            As of <strong>{formatDateTime(data.asOf)}</strong>
          </div>
        </header>

        {data.ingestionWarnings.length > 0 && (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
            <h2 className="font-semibold">Data-quality notes</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {data.ingestionWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-5">
          <MetricCard label="Total RUNE reconciled" value={formatRune(data.summary.totalReconciledRune)} detail={data.balanceDataComplete ? `${formatRune(data.summary.walletRune)} wallet + ${formatRune(data.summary.bondedRune)} bonded` : 'Current balance APIs unavailable; using action-derived lots'} />
          <MetricCard label="Estimated value" value={formatUsd(data.summary.totalValueUsd, 0)} detail={`${data.runePriceSource} ${formatUsd(data.runePriceUsd, 4)}/RUNE`} />
          <MetricCard label="Short-term RUNE" value={formatRune(data.summary.shortTermRune)} detail={`${data.summary.shortTermPercent}% of tracked lots`} accent="text-fuchsia-300" />
          <MetricCard label="Long-term RUNE" value={formatRune(data.summary.longTermRune)} detail={`${data.summary.longTermPercent}% of tracked lots`} accent="text-emerald-300" />
          <MetricCard label="Next maturity" value={nextMaturity ? formatRune(nextMaturity.runeMaturing) : 'None'} detail={nextMaturity ? formatDate(nextMaturity.date) : 'All tracked lots mature'} />
        </section>

        <Panel
          title="Tracked THOR addresses"
          subtitle="Add one or more THORChain addresses. They are saved only inside this browser's anonymous workspace and are not mixed with other visitors."
        >
          <AddressManager addresses={data.trackedAddresses} />
        </Panel>

        <section className="rounded-3xl border border-slate-700 bg-slate-900/70 p-6 shadow-2xl">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Asset maturation</h2>
              <p className="text-sm text-slate-400">Stepped curve: percentage of tracked RUNE lots that are long-term over time.</p>
            </div>
            <div className="rounded-full bg-slate-800 px-4 py-2 text-sm text-slate-300">Current long-term: {data.summary.longTermPercent}% · Projected through {formatDate(chartPoints.at(-1)?.date ?? data.asOf)}</div>
          </div>
          <AssetMaturationChart points={chartPoints} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Panel title="Upcoming maturity calendar" subtitle="Tax-lot cliffs where short-term RUNE flips to long-term.">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400">
                  <tr><th className="py-3">Date</th><th>RUNE maturing</th><th>Long-term after</th><th>Long-term %</th></tr>
                </thead>
                <tbody>
                  {data.schedule.slice(0, 12).map((item) => (
                    <tr key={item.date} className="border-t border-slate-800">
                      <td className="py-3">{formatDate(item.date)}</td>
                      <td>{formatRune(item.runeMaturing)}</td>
                      <td>{formatRune(item.longTermRuneAfter)}</td>
                      <td>{item.longTermPercentAfter}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Sale planner" subtitle="Try a future sale amount/date and see the FIFO short-term vs long-term split.">
            <SalePlanner lots={data.lots} />
          </Panel>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Panel title="Wallet + bonded RUNE reconciliation" subtitle="Balances include RUNE in wallet and RUNE bonded as node bond-provider positions.">
            <div className="space-y-4">
              {data.wallets.map((wallet) => (
                <div key={wallet.address} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="break-all font-mono text-sm text-cyan-200">{wallet.address}</div>
                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                    <div><span className="text-slate-500">Wallet</span><br />{formatRune(wallet.walletRune)}</div>
                    <div><span className="text-slate-500">Bonded</span><br />{formatRune(wallet.bondedRune)}</div>
                    <div><span className="text-slate-500">Total</span><br />{formatRune(wallet.totalRune)}</div>
                  </div>
                  {wallet.bondPositions.length > 0 && <p className="mt-3 text-xs text-slate-400">Bonded across {wallet.bondPositions.length} node position(s).</p>}
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Tax lots" subtitle="Remaining FIFO lots; manual opening lots should be replaced by real acquisition dates/imports.">
            <div className="max-h-[420px] overflow-auto pr-2">
              {data.lots.slice(0, 20).map((lot) => (
                <div key={lot.id} className="mb-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
                  <div className="flex justify-between gap-4"><strong>{formatRune(lot.remainingAmount)} RUNE</strong><span className="text-slate-400">Matures {formatDate(lot.maturesAt)}</span></div>
                  <div className="mt-1 text-slate-400">Acquired {formatDate(lot.acquiredAt)} · {lot.acquisitionType}</div>
                  <div className="mt-1 break-all font-mono text-xs text-slate-500">{lot.sourceTxId}</div>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <Panel
          title="Data confidence + lot review"
          subtitle="Review transfer lots, accept same-day CEX purchase transfers, or override acquisition dates so the dashboard remembers your tax assumptions."
        >
          <LotReviewTable
            rows={lotReviewRows.rows}
            highConfidenceRune={formatRune(lotReviewRows.highConfidenceRune)}
            reviewRune={formatRune(lotReviewRows.reviewRune)}
            reviewedRune={formatRune(lotReviewRows.reviewedRune)}
            balanceStatus={data.balanceDataComplete ? (data.summary.isBalanced ? 'Balanced' : 'Reconciled') : 'Balance API unavailable'}
          />
        </Panel>

        <Panel
          title="Imported bond rewards"
          subtitle="Newest ViewBlock bond rewards selected to replace the manual reconciliation gap. Each timestamp is used as that reward lot's acquisition date."
        >
          <BondRewardsTable rewards={data.bondRewardLots} />
        </Panel>
      </section>
    </main>
  );
}

function MetricCard({ label, value, detail, accent = 'text-white' }: { label: string; value: string; detail: string; accent?: string }) {
  return <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5"><div className="text-sm text-slate-400">{label}</div><div className={`mt-2 text-2xl font-bold ${accent}`}>{value}</div><div className="mt-2 text-xs text-slate-500">{detail}</div></div>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-slate-700 bg-slate-900/70 p-6"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-400">{subtitle}</p><div className="mt-5">{children}</div></section>;
}

function BondRewardsTable({ rewards }: { rewards: DashboardData['bondRewardLots'] }) {
  const total = roundDisplayRune(rewards.reduce((sum, reward) => sum + reward.usedRune, 0));

  if (rewards.length === 0) {
    return <p className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">No imported bond reward lots are currently needed for reconciliation.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 text-sm md:grid-cols-3">
        <SummaryPill label="Imported reward lots" value={String(rewards.length)} />
        <SummaryPill label="RUNE explained" value={formatRune(total)} />
        <SummaryPill label="Oldest selected reward" value={formatDate(rewards.at(-1)?.acquiredAt ?? rewards[0].acquiredAt)} />
      </div>
      <div className="max-h-[520px] overflow-auto rounded-2xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-950 text-slate-400">
            <tr>
              <th className="px-4 py-3">Reward date</th>
              <th className="px-4 py-3">RUNE used</th>
              <th className="px-4 py-3">Full reward</th>
              <th className="px-4 py-3">Matures</th>
              <th className="px-4 py-3">Node / height</th>
            </tr>
          </thead>
          <tbody>
            {rewards.map((reward) => (
              <tr key={reward.id} className="border-t border-slate-800 align-top">
                <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(reward.acquiredAt)}</td>
                <td className="px-4 py-3 whitespace-nowrap font-semibold text-cyan-100">{formatRune(reward.usedRune)}{reward.partial ? <span className="ml-2 rounded-full bg-amber-300/15 px-2 py-0.5 text-xs text-amber-100">partial</span> : null}</td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-300">{formatRune(reward.rewardsRune)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{formatDate(reward.maturesAt)}</td>
                <td className="px-4 py-3">
                  <div className="font-mono text-xs text-slate-300">{shortenTxId(reward.node)}</div>
                  <div className="mt-1 text-xs text-slate-500">Height {reward.height}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-lg font-semibold text-slate-100">{value}</div></div>;
}

function buildLotReviewRows(data: DashboardData): { rows: LotReviewTableRow[]; highConfidenceRune: number; reviewRune: number; reviewedRune: number } {
  const rows = data.reviewLots
    .map((lot): LotReviewTableRow => {
      const savedSplits = data.lotSplits
        .filter((split) => split.parentLotId === lot.id)
        .sort((a, b) => a.splitIndex - b.splitIndex);
      const splitValidation = savedSplits.length > 0 ? validateLotSplitTotal(lot.remainingAmount, savedSplits) : null;
      const validSavedSplitCount = splitValidation?.valid ? savedSplits.length : 0;
      const reviewState = getLotReviewState(lot, data.lotOverrides);
      const hasSavedOverride = data.lotOverrides.some((override) => override.lotId === lot.id);
      const manualOpening = isManualOpeningLot(lot);
      const reviewed = (hasSavedOverride || validSavedSplitCount > 0) && reviewState.status === 'reviewed';
      const transferIn = lot.acquisitionType === 'transfer_in' && !manualOpening;
      const bondReward = lot.acquisitionType === 'bond_reward';
      const highConfidence = reviewed || bondReward || (!transferIn && !manualOpening);
      const confidence = reviewed ? 'Reviewed' : highConfidence ? 'High' : 'Review';
      const confidenceClass = reviewed
        ? 'bg-cyan-300/20 text-cyan-100 ring-1 ring-cyan-300/30'
        : highConfidence
          ? 'bg-emerald-300/20 text-emerald-100 ring-1 ring-emerald-300/30'
          : 'bg-amber-300/20 text-amber-100 ring-1 ring-amber-300/30';

      return {
        id: lot.id,
        lotId: lot.id,
        sourceTxId: lot.sourceTxId,
        sourceWallet: lot.sourceWallet,
        originalAcquiredAt: lot.acquiredAt,
        typeLabel: manualOpening ? 'Manual opening balance' : bondReward ? 'Bond reward' : transferIn ? 'Transfer into wallet' : lot.acquisitionType === 'swap_in' ? 'Swap into RUNE' : lot.acquisitionType,
        rune: lot.remainingAmount,
        acquiredAt: lot.acquiredAt,
        maturesAt: lot.maturesAt,
        confidence,
        confidenceClass,
        meaning: getReviewMeaning({
          manualOpening,
          transferIn,
          bondReward,
          reviewed,
          hasOverrideDate: Boolean(reviewState.overrideAcquiredAt),
          splitCount: validSavedSplitCount,
          invalidSplitDelta: splitValidation && !splitValidation.valid ? splitValidation.deltaRune : null,
        }),
        action: splitValidation && !splitValidation.valid
          ? 'Saved split rows no longer equal the parent lot amount, so the dashboard is ignoring them until you edit or clear the split.'
          : validSavedSplitCount > 0
            ? 'Saved split lots are replacing this parent lot in maturity calculations. You can edit or clear them.'
            : reviewed ? 'Saved. You can still edit the date/source/note if needed.' : getReviewAction({ manualOpening, transferIn }),
        shortTxId: manualOpening ? 'placeholder' : shortenTxId(lot.sourceTxId),
        sourceLabel: reviewState.sourceLabel,
        notes: reviewState.notes,
        splitLots: savedSplits.map((split) => ({
          amountRune: split.amountRune,
          acquiredAt: split.acquiredAt,
          sourceLabel: split.sourceLabel,
          notes: split.notes,
        })),
      };
    })
    .sort((a, b) => statusSort(a.confidence) - statusSort(b.confidence) || new Date(a.acquiredAt).getTime() - new Date(b.acquiredAt).getTime());

  return {
    rows,
    highConfidenceRune: roundDisplayRune(rows.filter((row) => row.confidence === 'High').reduce((total, row) => total + row.rune, 0)),
    reviewRune: roundDisplayRune(rows.filter((row) => row.confidence === 'Review').reduce((total, row) => total + row.rune, 0)),
    reviewedRune: roundDisplayRune(rows.filter((row) => row.confidence === 'Reviewed').reduce((total, row) => total + row.rune, 0)),
  };
}

function getReviewMeaning({
  manualOpening,
  transferIn,
  bondReward,
  reviewed,
  hasOverrideDate,
  splitCount,
  invalidSplitDelta,
}: {
  manualOpening: boolean;
  transferIn: boolean;
  bondReward: boolean;
  reviewed: boolean;
  hasOverrideDate: boolean;
  splitCount: number;
  invalidSplitDelta: number | null;
}) {
  if (invalidSplitDelta !== null) return `Saved split rows are out of balance by ${formatRune(invalidSplitDelta)} and are not being used in maturity calculations.`;
  if (splitCount > 0) return `You split this parent row into ${splitCount} tax lots. The dashboard uses those child acquisition dates for maturity calculations.`;
  if (reviewed && hasOverrideDate) return 'You saved a tax acquisition date for this lot. The dashboard now uses that date for maturity calculations.';
  if (reviewed) return 'You reviewed this lot and accepted the displayed acquisition date for planning.';
  if (manualOpening) return 'The app sees this RUNE in your current balance, but could not trace its true acquisition date from the fetched action history.';
  if (bondReward) return 'This lot comes from ViewBlock bond reward distributions. The reward timestamp is used as the acquisition date for maturity planning.';
  if (transferIn) return 'THORChain shows when RUNE entered this wallet. If you bought shortly before transfer, you can accept this date; otherwise set the earlier buy date.';
  return 'The dashboard found an on-chain event that looks like a direct RUNE acquisition for this wallet set.';
}

function getReviewAction({ manualOpening, transferIn }: { manualOpening: boolean; transferIn: boolean }) {
  if (manualOpening) return 'Set the real buy/receive date, source, and note. Later we can add split-lot replacement for multiple purchases.';
  if (transferIn) return 'Click Accept transfer date if this was purchased shortly before transfer, or save a different acquisition date.';
  return 'Use as a planning estimate; still compare against your tax software before filing.';
}

function statusSort(status: LotReviewTableRow['confidence']) {
  if (status === 'Review') return 0;
  if (status === 'Reviewed') return 1;
  return 2;
}

function shortenTxId(txId: string) {
  if (txId.length <= 18) return txId;
  return `${txId.slice(0, 10)}…${txId.slice(-8)}`;
}

type MaturationChartPoint = {
  date: string;
  label: string;
  x: number;
  longTermRune: number;
  shortTermRune: number;
  totalRune: number;
  longTermPercent: number;
  shortTermPercent: number;
  runeMaturing?: number;
};

function buildMaturationChartPoints(data: DashboardData): MaturationChartPoint[] {
  const totalRune = data.summary.totalTrackedRune;
  const schedule = data.schedule;
  const startTime = new Date(data.asOf).getTime();
  const endTime = schedule.length > 0 ? Math.max(...schedule.map((item) => new Date(item.date).getTime())) : startTime;
  const timeSpan = Math.max(endTime - startTime, 1);
  const xForDate = (date: string) => {
    const time = new Date(date).getTime();
    const ratio = Math.min(Math.max((time - startTime) / timeSpan, 0), 1);
    return 48 + ratio * (936 - 48);
  };

  const points: MaturationChartPoint[] = [
    {
      date: data.asOf,
      label: 'Current holdings',
      x: 48,
      longTermRune: data.summary.longTermRune,
      shortTermRune: data.summary.shortTermRune,
      totalRune,
      longTermPercent: data.summary.longTermPercent,
      shortTermPercent: data.summary.shortTermPercent,
    },
  ];

  schedule.forEach((item) => {
    const longTermRune = item.longTermRuneAfter;
    const shortTermRune = roundDisplayRune(totalRune - longTermRune);
    points.push({
      date: item.date,
      label: 'After maturity step',
      x: xForDate(item.date),
      longTermRune,
      shortTermRune,
      totalRune,
      longTermPercent: item.longTermPercentAfter,
      shortTermPercent: percent(shortTermRune, totalRune),
      runeMaturing: item.runeMaturing,
    });
  });

  if (points.length === 1) {
    points.push({
      date: data.asOf,
      label: 'All tracked lots are already long-term',
      x: 936,
      longTermRune: data.summary.longTermRune,
      shortTermRune: data.summary.shortTermRune,
      totalRune,
      longTermPercent: data.summary.longTermPercent,
      shortTermPercent: data.summary.shortTermPercent,
    });
  }

  return points;
}

function roundDisplayRune(value: number) { return Math.round((value + Number.EPSILON) * 100000000) / 100000000; }
function percent(numerator: number, denominator: number) { return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0; }

function formatRune(value: number) { return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value)} RUNE`; }
function formatUsd(value: number, maximumFractionDigits = 0) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits }).format(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
