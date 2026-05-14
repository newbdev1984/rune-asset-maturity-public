'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

export type LotReviewTableRow = {
  id: string;
  lotId: string;
  typeLabel: string;
  rune: number;
  acquiredAt: string;
  maturesAt: string;
  sourceTxId: string;
  sourceWallet: string;
  originalAcquiredAt: string;
  confidence: 'High' | 'Review' | 'Reviewed';
  confidenceClass: string;
  meaning: string;
  action: string;
  shortTxId: string;
  sourceLabel?: string | null;
  notes?: string | null;
  splitLots: Array<{
    amountRune: number;
    acquiredAt: string;
    sourceLabel?: string | null;
    notes?: string | null;
  }>;
};

type SplitEditorRow = {
  amountRune: string;
  acquiredDate: string;
  sourceLabel: string;
  notes: string;
};

type Props = {
  rows: LotReviewTableRow[];
  highConfidenceRune: string;
  reviewRune: string;
  reviewedRune: string;
  balanceStatus: string;
};

export function LotReviewTable({ rows, highConfidenceRune, reviewRune, reviewedRune, balanceStatus }: Props) {
  return (
    <div>
      <div className="mb-4 grid gap-3 text-sm md:grid-cols-4">
        <SummaryCard tone="emerald" label="High confidence lots" value={highConfidenceRune} detail="Direct swap dates found in THORChain history." />
        <SummaryCard tone="cyan" label="Reviewed lots" value={reviewedRune} detail="Accepted, edited, or split into real tax lots." />
        <SummaryCard tone="amber" label="Needs review" value={reviewRune} detail="Transfer/manual lots still waiting for your decision." />
        <SummaryCard tone="sky" label="Current balance check" value={balanceStatus} detail="Tracked lots are compared to wallet RUNE + bonded RUNE." />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead className="bg-slate-950/80 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Lot type</th>
              <th className="px-4 py-3">RUNE</th>
              <th className="px-4 py-3">Tax date / matures</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">What this means</th>
              <th className="px-4 py-3">Review / edit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <LotReviewTableRowView key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ tone, label, value, detail }: { tone: 'emerald' | 'cyan' | 'amber' | 'sky'; label: string; value: string; detail: string }) {
  const classes = {
    emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    cyan: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200',
    amber: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    sky: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 ${classes}`}>
      <div className="text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{detail}</div>
    </div>
  );
}

function LotReviewTableRowView({ row }: { row: LotReviewTableRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showSplitEditor, setShowSplitEditor] = useState(row.splitLots.length > 0);
  const [acquiredDate, setAcquiredDate] = useState(row.acquiredAt.slice(0, 10));
  const [sourceLabel, setSourceLabel] = useState(row.sourceLabel ?? defaultSourceLabel(row));
  const [notes, setNotes] = useState(row.notes ?? '');
  const [splitRows, setSplitRows] = useState<SplitEditorRow[]>(() => initialSplitRows(row));

  const parsedSplitRows = useMemo(() => splitRows.map((split) => ({ ...split, parsedAmountRune: parseRuneAmount(split.amountRune) })), [splitRows]);
  const splitTotal = useMemo(() => {
    if (parsedSplitRows.some((split) => split.parsedAmountRune === null)) return null;
    return roundRune(parsedSplitRows.reduce((total, split) => total + (split.parsedAmountRune ?? 0), 0));
  }, [parsedSplitRows]);
  const splitDelta = splitTotal === null ? null : roundRune(splitTotal - row.rune);
  const splitValid =
    splitRows.length >= 2 &&
    splitTotal !== null &&
    splitDelta !== null &&
    Math.abs(splitDelta) <= 0.000001 &&
    parsedSplitRows.every((split) => split.parsedAmountRune !== null && split.parsedAmountRune > 0 && split.acquiredDate);

  async function save(overrideAcquiredAt: string | null) {
    setError(null);
    const response = await fetch('/api/lot-overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lotId: row.lotId,
        sourceTxId: row.sourceTxId,
        sourceWallet: row.sourceWallet,
        reviewStatus: 'reviewed',
        originalAcquiredAt: row.originalAcquiredAt,
        overrideAcquiredAt,
        amountRune: row.rune,
        sourceLabel,
        notes,
      }),
    });

    if (!response.ok) return setErrorFromResponse(response, setError);
    startTransition(() => router.refresh());
  }

  async function saveSplitLots() {
    setError(null);
    if (!splitValid) {
      setError('Split lots must use valid positive RUNE amounts and total the parent lot. Commas are OK, for example 15,500.');
      return;
    }
    const response = await fetch('/api/lot-splits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parentLotId: row.lotId,
        sourceTxId: row.sourceTxId,
        sourceWallet: row.sourceWallet,
        parentRune: row.rune,
        splits: parsedSplitRows.map((split) => ({
          amountRune: split.parsedAmountRune!,
          acquiredAt: `${split.acquiredDate}T00:00:00.000Z`,
          sourceLabel: split.sourceLabel,
          notes: split.notes,
        })),
      }),
    });

    if (!response.ok) return setErrorFromResponse(response, setError);
    await save(null);
  }

  async function clearSplitLots() {
    setError(null);
    const response = await fetch('/api/lot-splits', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentLotId: row.lotId }),
    });

    if (!response.ok) return setErrorFromResponse(response, setError);
    setSplitRows(initialSplitRows({ ...row, splitLots: [] }));
    startTransition(() => router.refresh());
  }

  function updateSplit(index: number, patch: Partial<SplitEditorRow>) {
    setSplitRows((current) => current.map((split, splitIndex) => (splitIndex === index ? { ...split, ...patch } : split)));
  }

  return (
    <tr className="border-t border-slate-800 align-top">
      <td className="px-4 py-4">
        <div className="font-medium text-slate-100">{row.typeLabel}</div>
        <div className="mt-1 break-all font-mono text-xs text-slate-500">{row.shortTxId}</div>
        {row.sourceLabel && <div className="mt-2 text-xs text-cyan-200">Source: {row.sourceLabel}</div>}
        {row.splitLots.length > 0 && <div className="mt-2 rounded-full bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">Split into {row.splitLots.length} tax lots</div>}
      </td>
      <td className="px-4 py-4 font-semibold">{formatRune(row.rune)}</td>
      <td className="px-4 py-4 text-slate-300">
        <div>{formatDate(row.acquiredAt)}</div>
        <div className="mt-1 text-xs text-slate-500">Matures {formatDate(row.maturesAt)}</div>
      </td>
      <td className="px-4 py-4">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.confidenceClass}`}>{row.confidence}</span>
      </td>
      <td className="px-4 py-4 text-slate-300">
        <div>{row.meaning}</div>
        <div className="mt-2 text-xs text-slate-500">{row.action}</div>
        {row.notes && <div className="mt-2 rounded-xl bg-slate-950/70 p-2 text-xs text-slate-400">Note: {row.notes}</div>}
        {row.splitLots.length > 0 && (
          <div className="mt-3 space-y-1 rounded-xl bg-slate-950/70 p-3 text-xs text-slate-300">
            {row.splitLots.map((split, index) => (
              <div key={`${split.acquiredAt}-${index}`} className="flex flex-wrap justify-between gap-2">
                <span>{formatRune(split.amountRune)} acquired {formatDate(split.acquiredAt)}</span>
                {split.sourceLabel && <span className="text-cyan-200">{split.sourceLabel}</span>}
              </div>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-4">
        <div className="space-y-3">
          <label className="block text-xs text-slate-400">
            Tax acquisition date
            <input className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" type="date" value={acquiredDate} onChange={(event) => setAcquiredDate(event.target.value)} />
          </label>
          <label className="block text-xs text-slate-400">
            Source label
            <input className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} placeholder="Kraken, self-transfer, CEX same-day purchase" />
          </label>
          <label className="block text-xs text-slate-400">
            Note
            <textarea className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional note for future you" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60" disabled={isPending} type="button" onClick={() => save(`${acquiredDate}T00:00:00.000Z`)}>
              Save date
            </button>
            {row.confidence === 'Review' && !row.typeLabel.includes('Manual') && (
              <button className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60" disabled={isPending} type="button" onClick={() => save(null)}>
                Accept transfer date
              </button>
            )}
            <button className="rounded-lg border border-cyan-400/40 px-3 py-2 text-xs font-semibold text-cyan-100" type="button" onClick={() => setShowSplitEditor((current) => !current)}>
              {showSplitEditor ? 'Hide split editor' : 'Split into multiple tax lots'}
            </button>
          </div>

          {showSplitEditor && (
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-3">
              <div className="mb-2 text-xs text-slate-300">Replace this parent row with child tax lots. The amounts must total {formatRune(row.rune)}.</div>
              <div className="space-y-2">
                {splitRows.map((split, index) => (
                  <div key={index} className="grid gap-2 rounded-xl bg-slate-950/70 p-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                    <input className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100" inputMode="decimal" value={split.amountRune} onChange={(event) => updateSplit(index, { amountRune: event.target.value })} placeholder="RUNE amount" />
                    <input className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100" type="date" value={split.acquiredDate} onChange={(event) => updateSplit(index, { acquiredDate: event.target.value })} />
                    <input className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100" value={split.sourceLabel} onChange={(event) => updateSplit(index, { sourceLabel: event.target.value })} placeholder="Source" />
                    <button className="rounded-lg border border-red-400/30 px-2 py-2 text-xs text-red-200 disabled:opacity-40" disabled={splitRows.length <= 2} type="button" onClick={() => setSplitRows((current) => current.filter((_, splitIndex) => splitIndex !== index))}>Remove</button>
                    <input className="sm:col-span-4 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100" value={split.notes} onChange={(event) => updateSplit(index, { notes: event.target.value })} placeholder="Optional note for this child lot" />
                  </div>
                ))}
              </div>
              <div className={splitValid ? 'mt-2 text-xs text-emerald-200' : 'mt-2 text-xs text-amber-200'}>
                Split total: {formatOptionalRune(splitTotal)} · Parent: {formatRune(row.rune)} · Difference: {formatOptionalRune(splitDelta)}
                {splitTotal === null && <span> · Remove letters/symbols from amount fields; commas are OK.</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-100" type="button" onClick={() => setSplitRows((current) => [...current, { amountRune: '', acquiredDate, sourceLabel: '', notes: '' }])}>+ Add tax lot</button>
                <button className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60" disabled={isPending || !splitValid} type="button" onClick={saveSplitLots}>Save split lots</button>
                {row.splitLots.length > 0 && <button className="rounded-lg border border-red-400/40 px-3 py-2 text-xs font-semibold text-red-100" disabled={isPending} type="button" onClick={clearSplitLots}>Clear split</button>}
              </div>
            </div>
          )}
          {error && <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-2 text-xs text-red-200">{error}</div>}
        </div>
      </td>
    </tr>
  );
}

function initialSplitRows(row: LotReviewTableRow): SplitEditorRow[] {
  if (row.splitLots.length > 0) {
    return row.splitLots.map((split) => ({
      amountRune: String(split.amountRune),
      acquiredDate: split.acquiredAt.slice(0, 10),
      sourceLabel: split.sourceLabel ?? '',
      notes: split.notes ?? '',
    }));
  }

  const half = roundRune(row.rune / 2);
  return [
    { amountRune: String(half), acquiredDate: row.acquiredAt.slice(0, 10), sourceLabel: '', notes: '' },
    { amountRune: String(roundRune(row.rune - half)), acquiredDate: row.acquiredAt.slice(0, 10), sourceLabel: '', notes: '' },
  ];
}

async function setErrorFromResponse(response: Response, setError: (message: string) => void) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  setError(payload?.error ?? 'Save failed');
}

function defaultSourceLabel(row: LotReviewTableRow) {
  if (row.typeLabel.includes('Transfer')) return 'CEX purchase shortly before transfer';
  if (row.typeLabel.includes('Manual')) return 'Manual acquisition date';
  return 'On-chain acquisition';
}

function parseRuneAmount(value: string) {
  const normalized = value.trim().replace(/,/g, '');
  if (!normalized) return null;
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundRune(value: number) {
  return Math.round((value + Number.EPSILON) * 100000000) / 100000000;
}

function formatRune(value: number) {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value)} RUNE`;
}

function formatOptionalRune(value: number | null) {
  return value === null ? 'Invalid amount' : formatRune(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}
