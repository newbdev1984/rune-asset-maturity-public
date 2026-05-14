import type { RuneLot } from './tax-lots';
import { type LotOverride } from './lot-overrides';
import { getSupabaseServiceClient } from './supabase-server';

const TABLE = 'rune_lot_overrides';

type LotOverrideRow = {
  lot_id: string;
  review_status: LotOverride['reviewStatus'];
  override_acquired_at: string | null;
  source_label: string | null;
  notes: string | null;
};

export type SaveLotOverrideInput = {
  workspaceId: string;
  lotId: string;
  sourceTxId: string;
  sourceWallet: string;
  reviewStatus: LotOverride['reviewStatus'];
  originalAcquiredAt: string;
  overrideAcquiredAt?: string | null;
  amountRune: number;
  sourceLabel?: string | null;
  notes?: string | null;
};

export async function fetchLotOverrides(workspaceId: string | null): Promise<LotOverride[]> {
  if (!workspaceId) return [];

  const supabase = getSupabaseServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select('lot_id, review_status, override_acquired_at, source_label, notes')
    .eq('workspace_id', workspaceId);

  if (error) throw new Error(`Supabase lot override fetch failed: ${error.message}`);

  return ((data ?? []) as LotOverrideRow[]).map((row) => ({
    lotId: row.lot_id,
    reviewStatus: row.review_status,
    overrideAcquiredAt: row.override_acquired_at,
    sourceLabel: row.source_label,
    notes: row.notes,
  }));
}

export async function saveLotOverride(input: SaveLotOverrideInput): Promise<LotOverride> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new Error('Supabase service role key is not configured. Add SUPABASE_SERVICE_ROLE_KEY before saving reviews.');
  }

  const { error: workspaceError } = await supabase
    .from('rune_workspaces')
    .upsert({ workspace_id: input.workspaceId }, { onConflict: 'workspace_id' });
  if (workspaceError) throw new Error(`Supabase workspace save failed: ${workspaceError.message}`);

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        workspace_id: input.workspaceId,
        lot_id: input.lotId,
        source_tx_id: input.sourceTxId,
        source_wallet: input.sourceWallet,
        review_status: input.reviewStatus,
        original_acquired_at: input.originalAcquiredAt,
        override_acquired_at: input.overrideAcquiredAt ?? null,
        amount_rune: input.amountRune,
        source_label: input.sourceLabel ?? null,
        notes: input.notes ?? null,
      },
      { onConflict: 'workspace_id,lot_id' },
    )
    .select('lot_id, review_status, override_acquired_at, source_label, notes')
    .single();

  if (error) throw new Error(`Supabase lot override save failed: ${error.message}`);

  const row = data as LotOverrideRow;
  return {
    lotId: row.lot_id,
    reviewStatus: row.review_status,
    overrideAcquiredAt: row.override_acquired_at,
    sourceLabel: row.source_label,
    notes: row.notes,
  };
}

export function buildSaveInputFromLot(
  lot: RuneLot,
  input: Pick<SaveLotOverrideInput, 'workspaceId' | 'reviewStatus' | 'overrideAcquiredAt' | 'sourceLabel' | 'notes'>,
): SaveLotOverrideInput {
  return {
    workspaceId: input.workspaceId,
    lotId: lot.id,
    sourceTxId: lot.sourceTxId,
    sourceWallet: lot.sourceWallet,
    reviewStatus: input.reviewStatus,
    originalAcquiredAt: lot.acquiredAt,
    overrideAcquiredAt: input.overrideAcquiredAt,
    amountRune: lot.remainingAmount,
    sourceLabel: input.sourceLabel,
    notes: input.notes,
  };
}
