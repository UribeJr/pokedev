/**
 * Persistence for Daily Challenges, following the same pattern as
 * `progression-storage.ts`: every read normalizes, so a corrupt or
 * pre-feature record loads as "nothing generated yet" rather than throwing.
 *
 * Deliberately does NOT call `globalState.setKeysForSync` - see the warning in
 * `trainer-storage.ts` and `common/storage-keys.ts`.
 */
import * as vscode from 'vscode';
import {
  DAILY_CHALLENGES_STATE_KEY,
  DAILY_CHALLENGES_TOTAL_COMPLETED_KEY,
} from '../common/storage-keys';
import { normalizeDailyChallengeState } from '../challenges/daily-challenge-progress';
import { DailyChallengeState } from '../challenges/daily-challenge-types';

export function readDailyChallengeState(
  context: vscode.ExtensionContext,
): DailyChallengeState | undefined {
  return normalizeDailyChallengeState(
    context.globalState.get<unknown>(DAILY_CHALLENGES_STATE_KEY),
  );
}

export async function writeDailyChallengeState(
  context: vscode.ExtensionContext,
  state: DailyChallengeState,
): Promise<void> {
  await context.globalState.update(DAILY_CHALLENGES_STATE_KEY, state);
}

/** Lifetime count of completed Daily Challenges. See the key's own doc
 * comment in `storage-keys.ts` for why nothing reads this back yet. */
export function readTotalDailyChallengesCompleted(
  context: vscode.ExtensionContext,
): number {
  const raw = context.globalState.get<unknown>(
    DAILY_CHALLENGES_TOTAL_COMPLETED_KEY,
    0,
  );
  return typeof raw === 'number' && isFinite(raw) && raw >= 0
    ? Math.floor(raw)
    : 0;
}

export async function bumpTotalDailyChallengesCompleted(
  context: vscode.ExtensionContext,
  by: number,
): Promise<void> {
  if (by <= 0) {
    return;
  }
  await context.globalState.update(
    DAILY_CHALLENGES_TOTAL_COMPLETED_KEY,
    readTotalDailyChallengesCompleted(context) + by,
  );
}
