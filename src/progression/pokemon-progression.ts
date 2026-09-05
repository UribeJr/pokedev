/**
 * Per-Pokemon progression: the level curve, XP grants, and safe defaults for
 * Pokemon saved before progression existed.
 *
 * Mirrors the trainer model deliberately: `totalXp` is the source of truth and
 * `level` / `currentXp` are derived on every read, so a hand-edited or corrupt
 * record cannot describe a level its XP does not justify.
 *
 * Pure: no `vscode`, no DOM.
 */
import {
  addFriendship,
  clampFriendship,
  DEFAULT_POKEMON_FRIENDSHIP,
  FriendshipGrantResult,
} from './friendship-rules';
import { LevelUpResult, PokemonProgress } from './progression-types';

/**
 * How many Pokemon have ever earned real progression XP.
 *
 * The progress map only ever gains an entry through `addPokemonXp` actually
 * changing a total (see `progression-service.ts`'s `_applyPokemonXpGrant`,
 * the map's sole writer alongside evolution's species-only rewrites). Merely
 * spawning a Pokemon never creates one, so the key count is exactly "Pokemon
 * Raised" with no extra bookkeeping needed.
 */
export function countPokemonRaised(
  progressMap: Readonly<Record<string, PokemonProgress>>,
): number {
  return Object.keys(progressMap).length;
}

export const MAX_POKEMON_LEVEL = 100;

/**
 * The level a Pokemon already in someone's collection starts at.
 *
 * Existing Pokemon predate progression entirely, so they need a defensible
 * starting point rather than level 1: they have, in fairness, been keeping the
 * user company for a while already.
 */
export const DEFAULT_POKEMON_LEVEL = 5;

/**
 * Experience needed to advance FROM `level` to `level + 1`.
 *
 * A deliberately plain curve for V1: 75 XP at level 5, 375 at level 15, 3000
 * at level 50. Early levels arrive within an hour or two of coding and later
 * ones stretch out smoothly.
 *
 * This is NOT one of the official growth-rate formulas. Real growth-rate
 * groups (fast / medium-fast / slow / erratic) are a later milestone; keeping
 * the curve to a single expression means swapping it for a per-species group
 * later touches only this function.
 */
export function getPokemonXpForNextLevel(level: number): number {
  if (!isFiniteNumber(level) || level < 1) {
    return getPokemonXpForNextLevel(1);
  }
  const capped = Math.floor(level);
  if (capped >= MAX_POKEMON_LEVEL) {
    return 0;
  }
  return capped * (capped + 10);
}

/** Total experience required to *reach* `level` from level 1. */
export function getCumulativePokemonXp(level: number): number {
  if (!isFiniteNumber(level) || level <= 1) {
    return 0;
  }
  const capped = Math.min(Math.floor(level), MAX_POKEMON_LEVEL);
  let total = 0;
  for (let l = 1; l < capped; l++) {
    total += getPokemonXpForNextLevel(l);
  }
  return total;
}

/** The level a given lifetime XP total earns. Inverse of the curve above. */
export function getPokemonLevelFromXp(totalXp: number): number {
  if (!isFiniteNumber(totalXp) || totalXp <= 0) {
    return 1;
  }
  let level = 1;
  let remaining = Math.floor(totalXp);
  while (level < MAX_POKEMON_LEVEL) {
    const needed = getPokemonXpForNextLevel(level);
    if (remaining < needed) {
      break;
    }
    remaining -= needed;
    level += 1;
  }
  return level;
}

/**
 * A progression record for a Pokemon that has never had one.
 *
 * Seeded with the XP that genuinely buys `DEFAULT_POKEMON_LEVEL` rather than
 * with zero. Storing level 5 alongside 0 XP would make the two fields
 * contradict each other, and the first grant would immediately "demote" the
 * Pokemon back to level 1.
 */
export function createDefaultPokemonProgress(
  species: string,
  now: number,
  level: number = DEFAULT_POKEMON_LEVEL,
): PokemonProgress {
  const startLevel = clampInt(
    level,
    1,
    MAX_POKEMON_LEVEL,
    DEFAULT_POKEMON_LEVEL,
  );
  return {
    version: 1,
    species,
    totalXp: getCumulativePokemonXp(startLevel),
    level: startLevel,
    currentXp: 0,
    createdAt: now,
    friendship: DEFAULT_POKEMON_FRIENDSHIP,
  };
}

/**
 * Rebuilds a progression record from whatever was persisted.
 *
 * Anything unreadable falls back to a fresh default rather than throwing:
 * progression is a game feature and must never be able to break the panel.
 */
export function normalizePokemonProgress(
  raw: unknown,
  species: string,
  now: number,
): PokemonProgress {
  if (!isRecord(raw)) {
    return createDefaultPokemonProgress(species, now);
  }

  const maxTotal = getCumulativePokemonXp(MAX_POKEMON_LEVEL);
  const stored = raw['totalXp'];

  // A record written before `totalXp` existed, or one hand-edited to a level
  // only: reconstruct the total the stored level implies.
  const totalXp = isFiniteNumber(stored)
    ? clampInt(stored, 0, maxTotal, 0)
    : getCumulativePokemonXp(
        clampInt(raw['level'], 1, MAX_POKEMON_LEVEL, DEFAULT_POKEMON_LEVEL),
      );

  const level = getPokemonLevelFromXp(totalXp);
  const declined = raw['declinedEvolutionAtLevel'];

  return {
    version: 1,
    species: asString(raw['species'], species),
    totalXp,
    level,
    currentXp:
      level >= MAX_POKEMON_LEVEL ? 0 : totalXp - getCumulativePokemonXp(level),
    ...(isFiniteNumber(declined)
      ? {
          declinedEvolutionAtLevel: clampInt(declined, 1, MAX_POKEMON_LEVEL, 1),
        }
      : {}),
    createdAt: clampInt(raw['createdAt'], 1, Number.MAX_SAFE_INTEGER, now),
    // Every Pokemon saved before Friendship existed simply has no field here -
    // this is that migration, applied on every read rather than as a
    // one-time pass, so it is safe no matter which release last wrote this
    // record. `isFiniteNumber` rejects both "missing" and any hand-edited
    // non-number, both of which fall back to the same safe default.
    friendship: isFiniteNumber(raw['friendship'])
      ? clampFriendship(raw['friendship'])
      : DEFAULT_POKEMON_FRIENDSHIP,
  };
}

/**
 * Grants experience, rolling over as many levels as the amount covers.
 *
 * Pure: returns a new record. A non-finite, negative or zero grant is a no-op
 * rather than an error, because XP producers are incidental (timers, git
 * hooks) and must not be able to break anything.
 */
export function addPokemonXp(
  progress: PokemonProgress,
  amount: number,
): { progress: PokemonProgress; result: LevelUpResult } {
  const unchanged: LevelUpResult = {
    levelledUp: false,
    fromLevel: progress.level,
    toLevel: progress.level,
  };

  if (!isFiniteNumber(amount)) {
    return { progress, result: unchanged };
  }
  const grant = Math.floor(amount);
  if (grant <= 0) {
    return { progress, result: unchanged };
  }

  const maxTotal = getCumulativePokemonXp(MAX_POKEMON_LEVEL);
  const totalXp = Math.min(progress.totalXp + grant, maxTotal);
  const level = getPokemonLevelFromXp(totalXp);

  const next: PokemonProgress = {
    ...progress,
    totalXp,
    level,
    currentXp:
      level >= MAX_POKEMON_LEVEL ? 0 : totalXp - getCumulativePokemonXp(level),
  };

  // Levelling up clears a previous decline: reaching a new level is a fresh
  // opportunity to be asked about evolving.
  if (level > progress.level) {
    delete next.declinedEvolutionAtLevel;
  }

  return {
    progress: next,
    result: {
      levelledUp: level > progress.level,
      fromLevel: progress.level,
      toLevel: level,
    },
  };
}

/**
 * Grants Friendship to a Pokemon's progression record, clamped to the valid
 * range. Pure: returns a new record plus what happened, exactly mirroring
 * `addPokemonXp`'s shape.
 *
 * Deliberately separate from `addPokemonXp`: Friendship never affects
 * `totalXp`/`level`, and levelling never affects Friendship directly (a
 * level-up's own Friendship bonus is a distinct, explicit grant - see
 * `ProgressionService`).
 */
export function applyFriendshipGrant(
  progress: PokemonProgress,
  amount: number,
): { progress: PokemonProgress; result: FriendshipGrantResult } {
  const result = addFriendship(progress.friendship, amount);
  if (result.value === progress.friendship) {
    return { progress, result };
  }
  return {
    progress: { ...progress, friendship: result.value },
    result,
  };
}

/* ------------------------------- helpers ------------------------------- */

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!isFiniteNumber(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(value), min), max);
}
