import { saveLotOverride, type SaveLotOverrideInput } from '@/lib/lot-overrides-store';
import { getWorkspaceIdFromCookieHeader } from '@/lib/workspace';

export async function POST(request: Request) {
  try {
    const workspaceId = getWorkspaceIdFromCookieHeader(request.headers.get('cookie'));
    if (!workspaceId) throw new ValidationError('This browser does not have a workspace yet. Save an address first.');
    const body = (await request.json()) as Partial<Omit<SaveLotOverrideInput, 'workspaceId'>>;
    const input = validateInput(body, workspaceId);
    const override = await saveLotOverride(input);
    return Response.json({ override });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown save error' },
      { status: error instanceof ValidationError ? 400 : 500 },
    );
  }
}

function validateInput(body: Partial<Omit<SaveLotOverrideInput, 'workspaceId'>>, workspaceId: string): SaveLotOverrideInput {
  if (!body.lotId) throw new ValidationError('Missing lot id.');
  if (!body.sourceTxId) throw new ValidationError('Missing source transaction id.');
  if (!body.sourceWallet) throw new ValidationError('Missing source wallet.');
  if (body.reviewStatus !== 'reviewed' && body.reviewStatus !== 'needs_review') throw new ValidationError('Invalid review status.');
  if (!body.originalAcquiredAt || Number.isNaN(new Date(body.originalAcquiredAt).getTime())) throw new ValidationError('Invalid original acquisition date.');
  if (body.overrideAcquiredAt && Number.isNaN(new Date(body.overrideAcquiredAt).getTime())) throw new ValidationError('Invalid override acquisition date.');
  if (typeof body.amountRune !== 'number' || body.amountRune < 0) throw new ValidationError('Invalid RUNE amount.');

  return {
    workspaceId,
    lotId: body.lotId,
    sourceTxId: body.sourceTxId,
    sourceWallet: body.sourceWallet,
    reviewStatus: body.reviewStatus,
    originalAcquiredAt: body.originalAcquiredAt,
    overrideAcquiredAt: body.overrideAcquiredAt ?? null,
    amountRune: body.amountRune,
    sourceLabel: body.sourceLabel ?? null,
    notes: body.notes ?? null,
  };
}

class ValidationError extends Error {}
