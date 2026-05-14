import { randomUUID } from 'node:crypto';

export const WORKSPACE_COOKIE = 'rune_workspace_id';

const WORKSPACE_ID_PATTERN = /^ws_[a-f0-9]{32}$/;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function createWorkspaceId(): string {
  return `ws_${randomUUID().replace(/-/g, '')}`;
}

export function isValidWorkspaceId(value: string | null | undefined): value is string {
  return typeof value === 'string' && WORKSPACE_ID_PATTERN.test(value);
}

export function getWorkspaceIdFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map((part) => part.trim());
  const raw = cookies.find((part) => part.startsWith(`${WORKSPACE_COOKIE}=`));
  if (!raw) return null;
  const value = decodeURIComponent(raw.slice(WORKSPACE_COOKIE.length + 1));
  return isValidWorkspaceId(value) ? value : null;
}

export function getOrCreateWorkspaceIdFromRequest(request: Request): { workspaceId: string; created: boolean } {
  const existing = getWorkspaceIdFromCookieHeader(request.headers.get('cookie'));
  if (existing) return { workspaceId: existing, created: false };
  return { workspaceId: createWorkspaceId(), created: true };
}

export function workspaceCookieHeader(workspaceId: string): string {
  return `${WORKSPACE_COOKIE}=${encodeURIComponent(workspaceId)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}
