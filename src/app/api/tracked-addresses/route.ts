import { deleteTrackedAddress, saveTrackedAddress, type SaveTrackedAddressInput } from '@/lib/wallet-addresses';
import { getOrCreateWorkspaceIdFromRequest, getWorkspaceIdFromCookieHeader, workspaceCookieHeader } from '@/lib/workspace';

export async function POST(request: Request) {
  try {
    const workspace = getOrCreateWorkspaceIdFromRequest(request);
    const body = (await request.json()) as Partial<Omit<SaveTrackedAddressInput, 'workspaceId'>>;
    const address = await saveTrackedAddress({ ...validateSaveInput(body), workspaceId: workspace.workspaceId });
    const response = Response.json({ address, workspaceId: workspace.workspaceId });
    if (workspace.created) response.headers.append('Set-Cookie', workspaceCookieHeader(workspace.workspaceId));
    return response;
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown address save error' },
      { status: error instanceof ValidationError ? 400 : 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const workspaceId = getWorkspaceIdFromCookieHeader(request.headers.get('cookie'));
    if (!workspaceId) throw new ValidationError('This browser does not have a workspace yet. Save an address first.');
    const body = (await request.json()) as { address?: unknown };
    if (typeof body.address !== 'string') throw new ValidationError('Missing address.');
    await deleteTrackedAddress(workspaceId, body.address);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown address delete error' },
      { status: error instanceof ValidationError ? 400 : 500 },
    );
  }
}

function validateSaveInput(body: Partial<Omit<SaveTrackedAddressInput, 'workspaceId'>>): Omit<SaveTrackedAddressInput, 'workspaceId'> {
  if (typeof body.address !== 'string' || body.address.trim().length === 0) throw new ValidationError('Missing address.');
  if (body.label !== undefined && body.label !== null && typeof body.label !== 'string') throw new ValidationError('Invalid label.');
  if (body.includeBondRewards !== undefined && typeof body.includeBondRewards !== 'boolean') throw new ValidationError('Invalid bond reward option.');

  return {
    address: body.address,
    label: body.label ?? null,
    includeBondRewards: body.includeBondRewards ?? false,
  };
}

class ValidationError extends Error {}
