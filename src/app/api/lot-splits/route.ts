import { getDashboardData } from '@/lib/dashboard-data';
import { validateLotSplitTotal } from '@/lib/lot-splits';
import { clearLotSplits, saveLotSplits, type SaveLotSplitsInput } from '@/lib/lot-splits-store';
import { getWorkspaceIdFromCookieHeader } from '@/lib/workspace';

const MAX_SPLIT_COUNT = 50;
const MAX_TEXT_LENGTH = 500;

export async function POST(request: Request) {
  try {
    const workspaceId = getWorkspaceIdFromCookieHeader(request.headers.get('cookie'));
    if (!workspaceId) throw new ValidationError('This browser does not have a workspace yet. Save an address first.');
    const body = (await request.json()) as Partial<Omit<SaveLotSplitsInput, 'workspaceId'>> & { parentRune?: number };
    const input = validateInput(body, workspaceId);
    const parentLot = await getAuthoritativeParentLot(input);
    const validation = validateLotSplitTotal(parentLot.remainingAmount, input.splits);
    if (!validation.valid) {
      throw new ValidationError(
        `Split amounts must equal the parent lot. Split total ${validation.totalRune}, parent ${validation.parentRune}, difference ${validation.deltaRune}.`,
      );
    }

    const splits = await saveLotSplits(input);
    return Response.json({ splits });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown split-lot save error' },
      { status: error instanceof ValidationError ? 400 : 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const workspaceId = getWorkspaceIdFromCookieHeader(request.headers.get('cookie'));
    if (!workspaceId) throw new ValidationError('This browser does not have a workspace yet. Save an address first.');
    const { parentLotId } = (await request.json()) as { parentLotId?: string };
    if (!parentLotId) throw new ValidationError('Missing parent lot id.');
    await clearLotSplits(workspaceId, parentLotId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown split-lot clear error' },
      { status: error instanceof ValidationError ? 400 : 500 },
    );
  }
}

function validateInput(body: Partial<Omit<SaveLotSplitsInput, 'workspaceId'>> & { parentRune?: number }, workspaceId: string): SaveLotSplitsInput {
  if (!body.parentLotId) throw new ValidationError('Missing parent lot id.');
  if (!body.sourceTxId) throw new ValidationError('Missing source transaction id.');
  if (!body.sourceWallet) throw new ValidationError('Missing source wallet.');
  if (typeof body.parentRune !== 'number' || !Number.isFinite(body.parentRune) || body.parentRune <= 0) throw new ValidationError('Invalid parent RUNE amount.');
  if (!Array.isArray(body.splits) || body.splits.length < 2) throw new ValidationError('Add at least two split lots.');
  if (body.splits.length > MAX_SPLIT_COUNT) throw new ValidationError(`Split lots are limited to ${MAX_SPLIT_COUNT} rows.`);

  return {
    workspaceId,
    parentLotId: body.parentLotId,
    sourceTxId: body.sourceTxId,
    sourceWallet: body.sourceWallet,
    splits: body.splits.map((split, index) => {
      if (typeof split.amountRune !== 'number' || !Number.isFinite(split.amountRune) || split.amountRune <= 0) {
        throw new ValidationError(`Split ${index + 1} has an invalid RUNE amount.`);
      }
      if (!split.acquiredAt || Number.isNaN(new Date(split.acquiredAt).getTime())) {
        throw new ValidationError(`Split ${index + 1} has an invalid acquisition date.`);
      }
      if ((split.sourceLabel !== undefined && split.sourceLabel !== null && typeof split.sourceLabel !== 'string') || (split.notes !== undefined && split.notes !== null && typeof split.notes !== 'string')) {
        throw new ValidationError(`Split ${index + 1} source label and note must be text.`);
      }
      if ((split.sourceLabel?.length ?? 0) > MAX_TEXT_LENGTH || (split.notes?.length ?? 0) > MAX_TEXT_LENGTH) {
        throw new ValidationError(`Split ${index + 1} source label and note must be ${MAX_TEXT_LENGTH} characters or less.`);
      }

      return {
        amountRune: split.amountRune,
        acquiredAt: split.acquiredAt,
        sourceLabel: split.sourceLabel ?? null,
        notes: split.notes ?? null,
      };
    }),
  };
}

async function getAuthoritativeParentLot(input: Pick<SaveLotSplitsInput, 'workspaceId' | 'parentLotId' | 'sourceTxId' | 'sourceWallet'>) {
  const data = await getDashboardData(input.workspaceId);
  const parentLot = data.reviewLots.find((lot) => lot.id === input.parentLotId);

  if (!parentLot) throw new ValidationError('Parent lot no longer exists in the current dashboard data. Refresh and try again.');
  if (parentLot.sourceTxId !== input.sourceTxId || parentLot.sourceWallet !== input.sourceWallet) {
    throw new ValidationError('Parent lot source mismatch. Refresh and try again.');
  }
  if (parentLot.remainingAmount <= 0 || !Number.isFinite(parentLot.remainingAmount)) {
    throw new ValidationError('Parent lot has no remaining RUNE to split.');
  }

  return parentLot;
}

class ValidationError extends Error {}
