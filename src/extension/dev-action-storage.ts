/**
 * Persistence for Dev Action cooldowns - the ONLY thing this feature persists
 * (see `common/storage-keys.ts`'s `DEV_ACTION_COOLDOWNS_KEY`). Exists purely
 * to stop reload farming: without it, restarting Cursor would forget every
 * in-memory cooldown and let an already-rewarded build pay out again.
 *
 * Follows the same normalize-on-read pattern as `progression-storage.ts`: a
 * missing or corrupt record reads back as "no cooldowns yet" rather than
 * throwing.
 */
import * as vscode from 'vscode';
import { DEV_ACTION_COOLDOWNS_KEY } from '../common/storage-keys';
import { rememberDevActionAcceptedIn } from '../progression/dev-action-rules';

export function readDevActionCooldowns(
  context: vscode.ExtensionContext,
): Record<string, number> {
  const raw = context.workspaceState.get<unknown>(DEV_ACTION_COOLDOWNS_KEY, {});
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && isFinite(value)) {
      result[key] = value;
    }
  }
  return result;
}

export async function rememberDevActionAccepted(
  context: vscode.ExtensionContext,
  key: string,
  now: number,
): Promise<void> {
  const existing = readDevActionCooldowns(context);
  await context.workspaceState.update(
    DEV_ACTION_COOLDOWNS_KEY,
    rememberDevActionAcceptedIn(existing, key, now),
  );
}
