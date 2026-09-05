/**
 * The trainer progression model.
 *
 * Progression is deliberately NOT derived from GitHub: GitHub supplies the
 * trainer's identity, this profile tracks what the trainer has done inside the
 * editor. Everything here is pure and free of `vscode`, so it is unit-testable
 * and safe to import from the webview bundle.
 *
 * `totalTrainerXp` is the source of truth. `trainerLevel` and `trainerXp` are
 * derived from it and persisted only so the card can render without
 * recomputing; `normalizeTrainerProfile` re-derives both on every read, so the
 * three can never disagree.
 *
 * XP is granted by `src/extension/progression-service.ts`, which is the only
 * writer. Nothing else should call `addTrainerXp`.
 */
import { getTrainerSprite } from './trainer-sprite-catalog';
import {
  TrainerAchievement,
  TrainerBadge,
  TrainerCardTier,
  TrainerProfile,
} from './trainer-types';

/** Levels stop here so a nonsense XP grant cannot loop forever. */
export const MAX_TRAINER_LEVEL = 100;

/**
 * Experience needed to advance FROM `level` to `level + 1`.
 *
 * 100, 150, 225, 325, 450, 600, ... - the cost rises by a flat 25 more each
 * level, so early levels arrive quickly and later ones stretch out without the
 * requirement ever exploding the way a geometric curve would.
 *
 * `n * (n - 1)` is a product of consecutive integers and therefore always
 * even, so the halving is exact and every requirement is a whole number.
 *
 * This replaced an earlier `50 * L * (L + 1)` curve. That was safe to change
 * because no release ever granted a single point of XP: `addTrainerXp` had no
 * caller until this milestone, so every profile in the wild was level 1 with
 * 0 XP and nobody was re-levelled.
 */
export function getXpForNextTrainerLevel(level: number): number {
  if (!isFiniteNumber(level) || level < 1) {
    return getXpForNextTrainerLevel(1);
  }
  const n = Math.min(Math.floor(level), MAX_TRAINER_LEVEL) - 1;
  return 100 + 50 * n + (25 * (n * (n - 1))) / 2;
}

/**
 * Total experience required to *reach* `level` from level 1.
 *
 * Summed rather than closed-form: the loop runs at most `MAX_TRAINER_LEVEL`
 * times, and keeping it as a sum means the curve above stays the single place
 * the progression is defined.
 */
export function getCumulativeTrainerXp(level: number): number {
  if (!isFiniteNumber(level) || level <= 1) {
    return 0;
  }
  const capped = Math.min(Math.floor(level), MAX_TRAINER_LEVEL);
  let total = 0;
  for (let l = 1; l < capped; l++) {
    total += getXpForNextTrainerLevel(l);
  }
  return total;
}

/** The level a given lifetime XP total earns. Inverse of the curve above. */
export function getTrainerLevelFromXp(totalXp: number): number {
  if (!isFiniteNumber(totalXp) || totalXp <= 0) {
    return 1;
  }
  let level = 1;
  let remaining = Math.floor(totalXp);
  while (level < MAX_TRAINER_LEVEL) {
    const needed = getXpForNextTrainerLevel(level);
    if (remaining < needed) {
      break;
    }
    remaining -= needed;
    level += 1;
  }
  return level;
}

/** Card face colour tier. In V1 every trainer is level 1, i.e. 'base'. */
export function getTrainerCardTier(level: number): TrainerCardTier {
  if (!isFiniteNumber(level)) {
    return 'base';
  }
  if (level >= 75) {
    return 'gold';
  }
  if (level >= 50) {
    return 'silver';
  }
  if (level >= 25) {
    return 'copper';
  }
  return 'base';
}

export function createDefaultTrainerProfile(
  now: number,
  githubUsername = '',
): TrainerProfile {
  return {
    version: 2,
    githubUsername,
    totalTrainerXp: 0,
    trainerLevel: 1,
    trainerXp: 0,
    pokemonCaught: 0,
    shinyPokemonCaught: 0,
    badges: [],
    achievements: [],
    totalEvolutions: 0,
    totalCodingTimeMs: 0,
    trainerSpriteId: null,
    createdAt: now,
  };
}

/**
 * Rebuilds a profile from whatever was persisted, which may be from an older
 * release, hand-edited, or corrupt.
 *
 * `createdAt` is carried over whenever the stored value is usable — resetting
 * it would silently erase how long someone has been playing.
 */
export function normalizeTrainerProfile(
  raw: unknown,
  now: number,
  githubUsername?: string,
): TrainerProfile {
  const defaults = createDefaultTrainerProfile(now, githubUsername ?? '');
  if (!isRecord(raw)) {
    return defaults;
  }

  const totalTrainerXp = readTotalTrainerXp(raw);
  const level = getTrainerLevelFromXp(totalTrainerXp);

  return {
    version: 2,
    githubUsername:
      githubUsername ??
      asString(raw['githubUsername'], defaults.githubUsername),
    totalTrainerXp,
    // Both derived, never trusted from storage: a hand-edited level cannot
    // drift away from the XP that justifies it, and a corrupt within-level
    // value cannot render a progress bar past 100%.
    trainerLevel: level,
    trainerXp:
      level >= MAX_TRAINER_LEVEL
        ? 0
        : totalTrainerXp - getCumulativeTrainerXp(level),
    pokemonCaught: clampInt(
      raw['pokemonCaught'],
      0,
      Number.MAX_SAFE_INTEGER,
      0,
    ),
    shinyPokemonCaught: clampInt(
      raw['shinyPokemonCaught'],
      0,
      Number.MAX_SAFE_INTEGER,
      0,
    ),
    badges: normalizeBadges(raw['badges']),
    achievements: normalizeAchievements(raw['achievements']),
    totalEvolutions: clampInt(
      raw['totalEvolutions'],
      0,
      Number.MAX_SAFE_INTEGER,
      0,
    ),
    totalCodingTimeMs: clampInt(
      raw['totalCodingTimeMs'],
      0,
      Number.MAX_SAFE_INTEGER,
      0,
    ),
    trainerSpriteId: normalizeTrainerSpriteId(raw['trainerSpriteId']),
    createdAt: clampInt(raw['createdAt'], 1, Number.MAX_SAFE_INTEGER, now),
  };
}

/**
 * Grants experience, rolling over as many levels as the amount covers.
 *
 * Pure: returns a new profile and never touches storage, so callers stay
 * testable. A non-finite, negative or zero grant is a no-op rather than an
 * error, because XP producers will be incidental (timers, git hooks) and
 * should not be able to break the card.
 */
export function addTrainerXp(
  profile: TrainerProfile,
  amount: number,
): TrainerProfile {
  if (!isFiniteNumber(amount)) {
    return profile;
  }
  const grant = Math.floor(amount);
  if (grant <= 0) {
    return profile;
  }

  // Cap the lifetime total at what the last level costs, so a runaway grant
  // cannot store an absurd number that later curve changes would inherit.
  const maxTotal = getCumulativeTrainerXp(MAX_TRAINER_LEVEL);
  const totalTrainerXp = Math.min(profile.totalTrainerXp + grant, maxTotal);
  const level = getTrainerLevelFromXp(totalTrainerXp);

  return {
    ...profile,
    totalTrainerXp,
    trainerLevel: level,
    trainerXp:
      level >= MAX_TRAINER_LEVEL
        ? 0
        : totalTrainerXp - getCumulativeTrainerXp(level),
  };
}

/**
 * Records one successful evolution against the lifetime count shown on the
 * Trainer Record.
 *
 * Pure and additive only, mirroring `addTrainerXp`: the caller
 * (`evolution-flow.ts`'s `applyEvolution`) has already confirmed the
 * evolution happened, so this never needs to validate or roll anything back.
 */
export function recordEvolution(profile: TrainerProfile): TrainerProfile {
  return {
    ...profile,
    totalEvolutions: profile.totalEvolutions + 1,
  };
}

/**
 * Sets (or clears) the chosen Trainer Sprite.
 *
 * Pure, mirroring `recordEvolution`. Validates against the catalog itself
 * rather than trusting the caller, so a stale/removed id from an older
 * catalog can never get re-persisted by a round trip through this setter -
 * it simply falls back to `null` (the GitHub avatar), exactly like a profile
 * that never chose a sprite at all.
 */
export function withTrainerSprite(
  profile: TrainerProfile,
  spriteId: string | null,
): TrainerProfile {
  return {
    ...profile,
    trainerSpriteId: normalizeTrainerSpriteId(spriteId),
  };
}

/**
 * A sprite id is only ever trusted when it still resolves in the catalog -
 * see `getTrainerSprite`. Anything else (never chosen, corrupt, or a sprite
 * removed in a later release) normalizes to `null`, which the card already
 * treats as "fall back to the GitHub avatar".
 */
function normalizeTrainerSpriteId(value: unknown): string | null {
  return typeof value === 'string' && getTrainerSprite(value) ? value : null;
}

/**
 * Reads the lifetime XP total, migrating profiles written before it existed.
 *
 * A v1 profile stored only `trainerLevel` plus within-level `trainerXp`. The
 * equivalent total is the cost of reaching that level plus the remainder. In
 * practice every v1 profile is level 1 with 0 XP - nothing ever granted any -
 * so this reconstructs 0, but doing the arithmetic properly costs nothing and
 * keeps a hand-edited profile from being silently zeroed.
 */
function readTotalTrainerXp(raw: Record<string, unknown>): number {
  const stored = raw['totalTrainerXp'];
  if (isFiniteNumber(stored)) {
    return clampInt(stored, 0, getCumulativeTrainerXp(MAX_TRAINER_LEVEL), 0);
  }

  const legacyLevel = clampInt(raw['trainerLevel'], 1, MAX_TRAINER_LEVEL, 1);
  const legacyXp = clampInt(
    raw['trainerXp'],
    0,
    Math.max(getXpForNextTrainerLevel(legacyLevel) - 1, 0),
    0,
  );
  return getCumulativeTrainerXp(legacyLevel) + legacyXp;
}

/* ------------------------------- helpers ------------------------------- */

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
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

function normalizeBadges(value: unknown): TrainerBadge[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: TrainerBadge[] = [];
  const seen: Record<string, true> = {};
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const id = entry['id'];
    if (typeof id !== 'string' || id.length === 0 || seen[id]) {
      continue;
    }
    seen[id] = true;
    result.push({
      id,
      earnedAt: clampInt(entry['earnedAt'], 0, Number.MAX_SAFE_INTEGER, 0),
    });
  }
  return result;
}

function normalizeAchievements(value: unknown): TrainerAchievement[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: TrainerAchievement[] = [];
  const seen: Record<string, true> = {};
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const id = entry['id'];
    if (typeof id !== 'string' || id.length === 0 || seen[id]) {
      continue;
    }
    seen[id] = true;
    result.push({
      id,
      unlockedAt: clampInt(entry['unlockedAt'], 0, Number.MAX_SAFE_INTEGER, 0),
    });
  }
  return result;
}
