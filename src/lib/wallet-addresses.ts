import { getSupabaseServiceClient } from './supabase-server';

const TABLE = 'rune_tracked_addresses';
const THOR_ADDRESS_PATTERN = /^thor1[02-9ac-hj-np-z]{38}$/;

export type TrackedAddress = {
  address: string;
  label: string | null;
  includeBondRewards: boolean;
  source: 'saved';
};

export type SaveTrackedAddressInput = {
  workspaceId: string;
  address: string;
  label?: string | null;
  includeBondRewards?: boolean;
};

type TrackedAddressRow = {
  address: string;
  label: string | null;
  include_bond_rewards: boolean | null;
};

export function normalizeThorAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function isValidThorAddress(address: string): boolean {
  return THOR_ADDRESS_PATTERN.test(normalizeThorAddress(address));
}

export function assertValidThorAddress(address: string): string {
  const normalized = normalizeThorAddress(address);
  if (!isValidThorAddress(normalized)) {
    throw new Error('Enter a valid THORChain address that starts with thor1.');
  }
  return normalized;
}

export async function fetchSavedTrackedAddresses(workspaceId: string | null): Promise<TrackedAddress[]> {
  if (!workspaceId) return [];

  const supabase = getSupabaseServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select('address, label, include_bond_rewards')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Supabase tracked address fetch failed: ${error.message}`);

  return ((data ?? []) as TrackedAddressRow[]).map((row) => ({
    address: normalizeThorAddress(row.address),
    label: row.label,
    includeBondRewards: Boolean(row.include_bond_rewards),
    source: 'saved' as const,
  }));
}

export async function saveTrackedAddress(input: SaveTrackedAddressInput): Promise<TrackedAddress> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new Error('Supabase service role key is not configured. Add SUPABASE_SERVICE_ROLE_KEY before saving wallet addresses.');
  }

  const address = assertValidThorAddress(input.address);
  const label = normalizeOptionalText(input.label);

  const { error: workspaceError } = await supabase
    .from('rune_workspaces')
    .upsert({ workspace_id: input.workspaceId }, { onConflict: 'workspace_id' });
  if (workspaceError) throw new Error(`Supabase workspace save failed: ${workspaceError.message}`);

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        workspace_id: input.workspaceId,
        address,
        label,
        include_bond_rewards: Boolean(input.includeBondRewards),
      },
      { onConflict: 'workspace_id,address' },
    )
    .select('address, label, include_bond_rewards')
    .single();

  if (error) throw new Error(`Supabase tracked address save failed: ${error.message}`);

  const row = data as TrackedAddressRow;
  return {
    address: normalizeThorAddress(row.address),
    label: row.label,
    includeBondRewards: Boolean(row.include_bond_rewards),
    source: 'saved',
  };
}

export async function deleteTrackedAddress(workspaceId: string, address: string): Promise<void> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new Error('Supabase service role key is not configured. Add SUPABASE_SERVICE_ROLE_KEY before removing wallet addresses.');
  }

  const normalized = assertValidThorAddress(address);
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('address', normalized);
  if (error) throw new Error(`Supabase tracked address delete failed: ${error.message}`);
}

export function mergeTrackedAddresses(saved: TrackedAddress[]): TrackedAddress[] {
  const byAddress = new Map<string, TrackedAddress>();

  for (const address of saved) {
    const normalized = normalizeThorAddress(address.address);
    byAddress.set(normalized, {
      ...address,
      address: normalized,
      source: 'saved',
      label: address.label ?? null,
      includeBondRewards: address.includeBondRewards || false,
    });
  }

  return Array.from(byAddress.values());
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 120) : null;
}
