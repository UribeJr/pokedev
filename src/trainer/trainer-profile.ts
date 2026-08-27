/**
 * The trainer progression model.
 *
 * Progression is deliberately NOT derived from GitHub: GitHub supplies the
 * trainer's identity, this profile tracks what the trainer has done inside the
 * editor. Everything here is pure and free of `vscode`, so it is unit-testable
 * and safe to import from the webview bundle.
 *
 * In V1 nothing calls `addTrainerXp`; it exists so that later systems (coding
 * streaks, catching, Git-based XP) can grant experience without the Trainer
 * Card needing to change.
 */
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
 * A gentle quadratic: 100 XP for level 1 -> 2, 300 for 2 -> 3, 600 for 3 -> 4.
 * Fixed now rather than later because changing the curve after release would
 * retroactively re-level everyone.
 */
export function getXpForNextTrainerLevel(level: number): number {
  if (!isFiniteNumber(level) || level < 1) {
    return getXpForNextTrainerLevel(1);
  }
  const capped = Math.min(Math.floor(level), MAX_TRAINER_LEVEL);
  return 50 * capped * (capped + 1);
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
    version: 1,
    githubUsername,
    trainerLevel: 1,
    trainerXp: 0,
    pokemonCaught: 0,
    shinyPokemonCaught: 0,
    badges: [],
    achievements: [],
    totalCodingTimeMs: 0,
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

  const level = clampInt(raw['trainerLevel'], 1, MAX_TRAINER_LEVEL, 1);

  return {
    version: 1,
    githubUsername:
      githubUsername ??
      asString(raw['githubUsername'], defaults.githubUsername),
    trainerLevel: level,
    // Never carry more XP than the current level can hold; a corrupt value
    // would otherwise render a progress bar past 100%.
    trainerXp: clampInt(
      raw['trainerXp'],
      0,
      getXpForNextTrainerLevel(level) - 1,
      0,
    ),
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
    totalCodingTimeMs: clampInt(
      raw['totalCodingTimeMs'],
      0,
      Number.MAX_SAFE_INTEGER,
      0,
    ),
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

  let level = profile.trainerLevel;
  let xp = profile.trainerXp + grant;

  while (level < MAX_TRAINER_LEVEL) {
    const needed = getXpForNextTrainerLevel(level);
    if (xp < needed) {
      break;
    }
    xp -= needed;
    level += 1;
  }

  if (level >= MAX_TRAINER_LEVEL) {
    level = MAX_TRAINER_LEVEL;
    xp = 0;
  }

  return { ...profile, trainerLevel: level, trainerXp: xp };
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
