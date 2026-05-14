import { getSupabaseServiceClient } from './supabase-server';
import { type LotSplit } from './lot-splits';

const TABLE = 'rune_lot_splits';

type LotSplitRow = {
  parent_lot_id: string;
  source_tx_id: string;
  source_wallet: string;
  split_index: number;
  amount_rune: string | number;
  acquired_at: string;
  source_label: string | null;
  notes: string | null;
};

export type SaveLotSplitsInput = {
  workspaceId: string;
  parentLotId: string;
  sourceTxId: string;
  sourceWallet: string;
  splits: Array<{
    amountRune: number;
    acquiredAt: string;
    sourceLabel?: string | null;
    notes?: string | null;
  }>;
};

export async function fetchLotSplits(workspaceId: string | null): Promise<LotSplit[]> {
  if (!workspaceId) return [];

  const supabase = getSupabaseServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select('parent_lot_id, source_tx_id, source_wallet, split_index, amount_rune, acquired_at, source_label, notes')
    .eq('workspace_id', workspaceId)
    .order('parent_lot_id', { ascending: true })
    .order('split_index', { ascending: true });

  if (error) throw new Error(`Supabase lot split fetch failed: ${error.message}`);

  return ((data ?? []) as LotSplitRow[]).map(rowToSplit);
}

export async function saveLotSplits(input: SaveLotSplitsInput): Promise<LotSplit[]> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new Error('Supabase service role key is not configured. Add SUPABASE_SERVICE_ROLE_KEY before saving split lots.');
  }

  const { data, error } = await supabase.rpc('replace_rune_lot_splits', {
    p_workspace_id: input.workspaceId,
    p_parent_lot_id: input.parentLotId,
    p_source_tx_id: input.sourceTxId,
    p_source_wallet: input.sourceWallet,
    p_splits: input.splits.map((split) => ({
      amount_rune: split.amountRune,
      acquired_at: split.acquiredAt,
      source_label: split.sourceLabel ?? null,
      notes: split.notes ?? null,
    })),
  });

  if (error) throw new Error(`Supabase lot split save failed: ${error.message}`);

  return ((data ?? []) as LotSplitRow[]).map(rowToSplit);
}

export async function clearLotSplits(workspaceId: string, parentLotId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new Error('Supabase service role key is not configured. Add SUPABASE_SERVICE_ROLE_KEY before clearing split lots.');
  }

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('parent_lot_id', parentLotId);
  if (error) throw new Error(`Supabase lot split clear failed: ${error.message}`);
}

function rowToSplit(row: LotSplitRow): LotSplit {
  return {
    parentLotId: row.parent_lot_id,
    sourceTxId: row.source_tx_id,
    sourceWallet: row.source_wallet,
    splitIndex: row.split_index,
    amountRune: Number(row.amount_rune),
    acquiredAt: row.acquired_at,
    sourceLabel: row.source_label,
    notes: row.notes,
  };
}
