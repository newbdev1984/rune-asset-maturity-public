'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState, useTransition } from 'react';
import type { TrackedAddress } from '@/lib/wallet-addresses';

type AddressManagerProps = {
  addresses: TrackedAddress[];
};

export function AddressManager({ addresses }: AddressManagerProps) {
  const router = useRouter();
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [includeBondRewards, setIncludeBondRewards] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const savedCount = useMemo(() => addresses.length, [addresses]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const response = await fetch('/api/tracked-addresses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, label, includeBondRewards }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? 'Address could not be saved.');
      return;
    }

    setAddress('');
    setLabel('');
    setIncludeBondRewards(false);
    setMessage('Saved. The dashboard is refreshing with the updated address set.');
    startTransition(() => router.refresh());
  }

  async function removeAddress(addressToRemove: string) {
    setError(null);
    setMessage(null);

    const response = await fetch('/api/tracked-addresses', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: addressToRemove }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? 'Address could not be removed.');
      return;
    }

    setMessage('Removed. The dashboard is refreshing with the updated address set.');
    startTransition(() => router.refresh());
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="text-slate-300">THOR address</span>
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="thor1..."
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-cyan-300"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-300">Optional label</span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Example: Ledger 2 / CEX withdrawal wallet"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-300"
            />
          </label>
          <label className="flex gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={includeBondRewards}
              onChange={(event) => setIncludeBondRewards(event.target.checked)}
              className="mt-1"
            />
            <span>
              Also try ViewBlock bond-reward imports for this address when the app needs rewards to explain bonded balance growth.
            </span>
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? 'Refreshing…' : 'Save address'}
          </button>
          {message && <p className="text-sm text-emerald-200">{message}</p>}
          {error && <p className="text-sm text-rose-200">{error}</p>}
        </div>
      </form>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-slate-100">Currently tracked</h3>
            <p className="mt-1 text-sm text-slate-400">{savedCount} address{savedCount === 1 ? '' : 'es'} saved in this browser workspace.</p>
          </div>
          <div className="rounded-full bg-cyan-300/10 px-3 py-1 text-sm text-cyan-100">{addresses.length} total</div>
        </div>
        <div className="mt-4 space-y-3">
          {addresses.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-400">
              No addresses yet. Save a THOR address to create this browser&apos;s anonymous workspace and load the dashboard.
            </div>
          )}
          {addresses.map((item) => (
            <div key={item.address} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="break-all font-mono text-sm text-cyan-200">{item.address}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-300">saved to workspace</span>
                    {item.label && <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-300">{item.label}</span>}
                    {item.includeBondRewards && <span className="rounded-full bg-emerald-300/15 px-2 py-1 text-emerald-100">bond rewards enabled</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void removeAddress(item.address)}
                  disabled={isPending}
                  className="rounded-lg border border-rose-300/30 px-3 py-1 text-sm text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
