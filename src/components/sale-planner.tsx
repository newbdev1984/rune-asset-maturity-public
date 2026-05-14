'use client';

import { useMemo, useState } from 'react';
import { simulateSale, type RuneLot } from '@/lib/tax-lots';

export function SalePlanner({ lots }: { lots: RuneLot[] }) {
  const [amount, setAmount] = useState(25_000);
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const simulation = useMemo(() => simulateSale(lots, amount, `${saleDate}T00:00:00.000Z`), [amount, saleDate, lots]);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-300">
          Sale amount
          <input
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-cyan-400 focus:ring-2"
            type="number"
            min="0"
            step="100"
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
          />
        </label>
        <label className="text-sm text-slate-300">
          Sale date
          <input
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-cyan-400 focus:ring-2"
            type="date"
            value={saleDate}
            onChange={(event) => setSaleDate(event.target.value)}
          />
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <PlannerMetric label="Long-term sold" value={formatRune(simulation.longTermAmount)} accent="text-emerald-300" />
        <PlannerMetric label="Short-term sold" value={formatRune(simulation.shortTermAmount)} accent="text-fuchsia-300" />
      </div>

      <div className="mt-4 rounded-2xl bg-slate-950/70 p-4 text-sm text-slate-400">
        FIFO consumes {formatRune(simulation.sellableRune)} across {simulation.lotsConsumed.length} lot(s). Unsold/insufficient amount: {formatRune(Math.max(0, amount - simulation.sellableRune))}.
      </div>
    </div>
  );
}

function PlannerMetric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="text-sm text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}

function formatRune(value: number) {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value)} RUNE`;
}
