/**
 * Advances today's challenges from real activity, and validates what comes
 * back out of storage.
 *
 * Pure and immutable: every function here returns new objects rather than
 * mutating its input, and none of it imports `vscode`. `daily-challenges-
 * service.ts` is the only caller, and is the only place that decides WHEN a
 * signal is worth raising and WHAT happens once something completes (the
 * Trainer XP grant, the toast, the celebration) - this module only ever
 * answers "given this happened, what changed and what just finished".
 */
import { DevActionType } from '../progression/dev-action-types';
import {
  ChallengeCategory,
  DailyChallengeEventType,
  DailyChallengeInstance,
  DailyChallengeState,
} from './daily-challenge-types';

/** Upper bound on how many distinct files/Pokemon one challenge remembers.
 * No catalog entry currently asks for more than 4 or 3 respectively; this
 * leaves headroom without ever growing without bound. */
const MAX_TRACKED_IDENTIFIERS = 10;

/**
 * What actually happened, translated from a real progression event into the
 * vocabulary `DailyChallengeEventType` understands. One raw event can produce
 * more than one signal (a work batch is both a save count and a set of
 * files), and one signal can advance more than one challenge instance (both a
 * `meaningful-saves` and a `distinct-files` challenge react to the same
 * `meaningful-saves` signal).
 */
export type DailyChallengeSignal =
  | { kind: 'meaningful-saves'; fileCount: number; files: readonly string[] }
  | { kind: 'active-coding-minutes'; minutes: number }
  | { kind: 'git-commit' }
  | {
      kind: 'pokemon-xp';
      nickname: string;
      isPartner: boolean;
      amount: number;
      /** The Pokemon's level BEFORE this grant - `underdog-xp` cares whether
       * it was still under 10 at the moment it earned this XP, not after. */
      levelBefore: number;
    }
  | { kind: 'pokemon-level-up'; levelsGained: number }
  | { kind: 'task-success' }
  | { kind: 'trainer-xp'; amount: number }
  | { kind: 'dev-action'; devActionType: DevActionType };

export interface DailyChallengeProgressResult {
  state: DailyChallengeState;
  /** Challenges that flipped from incomplete to complete on this call. Empty
   * (never partially populated) when nothing changed. */
  newlyCompleted: DailyChallengeInstance[];
}

function clampProgress(target: number, progress: number): number {
  return Math.max(0, Math.min(target, Math.floor(progress)));
}

/** Marks `instance` completed once its target is met. A no-op past that
 * point - a challenge is never "un-completed" by a later call. */
function finalize(instance: DailyChallengeInstance): DailyChallengeInstance {
  if (instance.completed) {
    return instance;
  }
  return instance.progress >= instance.target
    ? { ...instance, completed: true }
    : instance;
}

/** Adds a plain numeric increment, clamped to the target. `amount <= 0` and
 * non-finite amounts are no-ops rather than errors - a producer bug should
 * never be able to move a bar backwards. */
function addProgress(
  instance: DailyChallengeInstance,
  amount: number,
): DailyChallengeInstance {
  if (!isFinite(amount) || amount <= 0) {
    return instance;
  }
  const progress = clampProgress(
    instance.target,
    instance.progress + Math.floor(amount),
  );
  if (progress === instance.progress) {
    return instance;
  }
  return finalize({ ...instance, progress });
}

/** Adds `value` to a bounded unique set, and sets progress to the set's new
 * size (never above target). Used by both `distinct-files` and
 * `distinct-pokemon-xp`, which are otherwise identical shapes. */
function addToUniqueSet(
  instance: DailyChallengeInstance,
  field: 'uniqueFiles' | 'uniquePokemon',
  values: readonly string[],
): DailyChallengeInstance {
  const set = new Set(instance[field] ?? []);
  for (const value of values) {
    set.add(value);
  }
  const next = Array.from(set).slice(0, MAX_TRACKED_IDENTIFIERS);
  if (next.length === (instance[field]?.length ?? 0)) {
    return instance;
  }
  return finalize({
    ...instance,
    [field]: next,
    progress: clampProgress(instance.target, next.length),
  });
}

/** Applies one signal to one instance. Returns the SAME object (`===`) when
 * the signal does not apply, so callers can cheaply detect "nothing changed"
 * without a separate equality check. */
function applySignalToInstance(
  instance: DailyChallengeInstance,
  signal: DailyChallengeSignal,
): DailyChallengeInstance {
  if (instance.completed) {
    return instance;
  }

  switch (instance.eventType) {
    case 'meaningful-saves':
      return signal.kind === 'meaningful-saves'
        ? addProgress(instance, signal.fileCount)
        : instance;

    case 'distinct-files':
      return signal.kind === 'meaningful-saves'
        ? addToUniqueSet(instance, 'uniqueFiles', signal.files)
        : instance;

    case 'active-coding-minutes':
      return signal.kind === 'active-coding-minutes'
        ? addProgress(instance, signal.minutes)
        : instance;

    case 'git-commit':
      return signal.kind === 'git-commit' ? addProgress(instance, 1) : instance;

    case 'partner-xp':
      return signal.kind === 'pokemon-xp' && signal.isPartner
        ? addProgress(instance, signal.amount)
        : instance;

    case 'distinct-pokemon-xp':
      return signal.kind === 'pokemon-xp'
        ? addToUniqueSet(instance, 'uniquePokemon', [signal.nickname])
        : instance;

    case 'underdog-xp':
      return signal.kind === 'pokemon-xp' && signal.levelBefore < 10
        ? addProgress(instance, signal.amount)
        : instance;

    case 'pokemon-level-up':
      return signal.kind === 'pokemon-level-up'
        ? addProgress(instance, signal.levelsGained)
        : instance;

    case 'task-success':
      return signal.kind === 'task-success'
        ? addProgress(instance, 1)
        : instance;

    case 'trainer-xp-total':
      return signal.kind === 'trainer-xp'
        ? addProgress(instance, signal.amount)
        : instance;

    case 'build-success':
    case 'test-success':
    case 'typecheck-success':
    case 'lint-success':
      return signal.kind === 'dev-action' &&
        signal.devActionType === instance.eventType
        ? addProgress(instance, 1)
        : instance;

    case 'dev-action-clean':
      return signal.kind === 'dev-action' &&
        (signal.devActionType === 'lint-success' ||
          signal.devActionType === 'typecheck-success')
        ? addProgress(instance, 1)
        : instance;

    case 'dev-action-any':
      return signal.kind === 'dev-action' ? addProgress(instance, 1) : instance;
  }
}

/**
 * Applies one signal across all of today's challenges.
 *
 * Returns the exact same `state` reference when nothing changed, so a caller
 * can skip persisting on a signal that did not match anything today.
 */
export function applyDailyChallengeSignal(
  state: DailyChallengeState,
  signal: DailyChallengeSignal,
): DailyChallengeProgressResult {
  let changed = false;
  const newlyCompleted: DailyChallengeInstance[] = [];

  const challenges = state.challenges.map((instance) => {
    const next = applySignalToInstance(instance, signal);
    if (next !== instance) {
      changed = true;
      if (!instance.completed && next.completed) {
        newlyCompleted.push(next);
      }
    }
    return next;
  });

  if (!changed) {
    return { state, newlyCompleted: [] };
  }
  return { state: { ...state, challenges }, newlyCompleted };
}

/**
 * Flags the given challenges' reward as granted.
 *
 * Called with the SAME batch of ids that are about to have Trainer XP
 * granted, and persisted BEFORE that grant happens - see the
 * `rewardGranted` doc comment in `daily-challenge-types.ts` for why the
 * ordering is deliberate.
 */
export function markRewardsGranted(
  state: DailyChallengeState,
  definitionIds: readonly string[],
): DailyChallengeState {
  if (definitionIds.length === 0) {
    return state;
  }
  const ids = new Set(definitionIds);
  let changed = false;
  const challenges = state.challenges.map((instance) => {
    if (!ids.has(instance.definitionId) || instance.rewardGranted) {
      return instance;
    }
    changed = true;
    return { ...instance, rewardGranted: true };
  });
  return changed ? { ...state, challenges } : state;
}

/* --------------------------------------------------------------------- *
 * Storage validation
 * --------------------------------------------------------------------- */

const CATEGORIES: readonly ChallengeCategory[] = [
  'coding',
  'git',
  'training',
  'wildcard',
];
const EVENT_TYPES: readonly DailyChallengeEventType[] = [
  'meaningful-saves',
  'distinct-files',
  'active-coding-minutes',
  'git-commit',
  'partner-xp',
  'distinct-pokemon-xp',
  'underdog-xp',
  'pokemon-level-up',
  'task-success',
  'trainer-xp-total',
  'build-success',
  'test-success',
  'typecheck-success',
  'lint-success',
  'dev-action-clean',
  'dev-action-any',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value);
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result = value.filter(
    (entry): entry is string => typeof entry === 'string',
  );
  return result.slice(0, MAX_TRACKED_IDENTIFIERS);
}

function normalizeInstance(raw: unknown): DailyChallengeInstance | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const definitionId = raw['definitionId'];
  const family = raw['family'];
  const category = raw['category'];
  const eventType = raw['eventType'];
  const title = raw['title'];
  const description = raw['description'];
  if (
    typeof definitionId !== 'string' ||
    typeof family !== 'string' ||
    typeof title !== 'string' ||
    typeof description !== 'string' ||
    CATEGORIES.indexOf(category as ChallengeCategory) === -1 ||
    EVENT_TYPES.indexOf(eventType as DailyChallengeEventType) === -1 ||
    !isFiniteNumber(raw['target']) ||
    !isFiniteNumber(raw['progress']) ||
    !isFiniteNumber(raw['rewardTrainerXp'])
  ) {
    return undefined;
  }

  const target = Math.max(1, Math.floor(raw['target'] as number));
  const uniqueFiles = normalizeStringArray(raw['uniqueFiles']);
  const uniquePokemon = normalizeStringArray(raw['uniquePokemon']);
  return {
    definitionId,
    family,
    category: category as ChallengeCategory,
    eventType: eventType as DailyChallengeEventType,
    title,
    description,
    target,
    progress: clampProgress(target, raw['progress'] as number),
    rewardTrainerXp: Math.max(0, Math.floor(raw['rewardTrainerXp'] as number)),
    completed: raw['completed'] === true,
    rewardGranted: raw['rewardGranted'] === true,
    // Omitted entirely rather than set to `undefined` when absent, so a
    // round trip through storage never introduces a key that was not there
    // to begin with.
    ...(uniqueFiles ? { uniqueFiles } : {}),
    ...(uniquePokemon ? { uniquePokemon } : {}),
  };
}

/**
 * Rebuilds a state from whatever was persisted, discarding anything
 * unusable. Returns `undefined` for a missing, corrupt, or empty record so
 * the caller treats it exactly like "nothing generated yet" rather than
 * crashing extension activation.
 */
export function normalizeDailyChallengeState(
  raw: unknown,
): DailyChallengeState | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const dateKey = raw['dateKey'];
  const seed = raw['seed'];
  if (typeof dateKey !== 'string' || dateKey.length === 0) {
    return undefined;
  }
  if (!Array.isArray(raw['challenges'])) {
    return undefined;
  }
  const challenges = raw['challenges']
    .map(normalizeInstance)
    .filter((entry): entry is DailyChallengeInstance => entry !== undefined);
  if (challenges.length === 0) {
    return undefined;
  }

  return {
    version: 1,
    dateKey,
    seed: typeof seed === 'string' ? seed : '',
    challenges,
  };
}
