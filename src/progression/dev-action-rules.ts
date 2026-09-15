/**
 * Anti-farming for Dev Actions.
 *
 * Mirrors the split `activity-rules.ts`/`reaction-rules.ts` already use: the
 * cooldown decision is a pure function over plain values, and the bounded-map
 * update mirrors `rememberCommitIn` (`activity-rules.ts`) - same shape,
 * applied to a key -> timestamp map instead of a list of hashes, because a
 * Dev Action can legitimately repeat (a second build) where a commit sha
 * cannot.
 */
import { DevActionType } from './dev-action-types';

/**
 * Minimum gap between two accepted Dev Actions of the same type, for the same
 * task. The task may still run as often as the user likes during the
 * cooldown - only the reward is withheld, silently, exactly like every other
 * anti-farming rule in this extension.
 */
export const DEV_ACTION_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * How many (type, task) cooldown entries to remember at once. Generous
 * relative to how many distinct build/test/lint/typecheck tasks a real
 * project defines - this exists only to bound storage growth, the same way
 * `MAX_REMEMBERED_COMMITS` bounds the commit set.
 */
export const MAX_REMEMBERED_DEV_ACTION_COOLDOWNS = 100;

/**
 * The compound key one Dev Action's cooldown is tracked under.
 *
 * Workspace-scoped storage (`workspaceState`) already separates one project
 * from another, so the key itself only needs to separate action types and
 * tasks within a single workspace.
 */
export function devActionCooldownKey(
  type: DevActionType,
  taskIdentity: string,
): string {
  return `${type}::${taskIdentity}`;
}

/**
 * Whether enough time has passed since this exact Dev Action was last
 * accepted. Shares its shape with `shouldAwardBatch`/`shouldReactAgain` -
 * same question, different clock.
 */
export function shouldAcceptDevAction(
  lastAcceptedAt: number | undefined,
  now: number,
  cooldownMs: number = DEV_ACTION_COOLDOWN_MS,
): boolean {
  if (lastAcceptedAt === undefined) {
    return true;
  }
  return now - lastAcceptedAt >= cooldownMs;
}

/**
 * Records one accepted Dev Action's timestamp, bounded to `max` entries.
 *
 * Unlike `rememberCommitIn` (a growing list, newest first), every key here is
 * updated IN PLACE - a repeat build overwrites its own entry rather than
 * adding a new one - so eviction only ever needs to happen once the number of
 * DISTINCT (type, task) pairs this workspace has ever produced exceeds `max`,
 * which real projects come nowhere close to. The oldest timestamps are
 * dropped first, since those are the least likely to matter for an imminent
 * repeat.
 */
export function rememberDevActionAcceptedIn(
  existing: Readonly<Record<string, number>>,
  key: string,
  now: number,
  max: number = MAX_REMEMBERED_DEV_ACTION_COOLDOWNS,
): Record<string, number> {
  const next: Record<string, number> = { ...existing, [key]: now };
  const keys = Object.keys(next);
  if (keys.length <= max) {
    return next;
  }
  const sorted = keys.sort((a, b) => next[a] - next[b]);
  for (const dropKey of sorted.slice(0, keys.length - max)) {
    delete next[dropKey];
  }
  return next;
}
