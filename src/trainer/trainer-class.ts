/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Trainer class derivation.
 *
 * A fun, deterministic label computed from the languages of a trainer's public
 * repositories. Nothing here is generated or fuzzy: the mapping is a plain
 * table so it can be tweaked in one place, and ties break alphabetically so the
 * same input always yields the same class.
 */
import { LanguageCount, TrainerClassId } from './trainer-types';

/** Buckets a language can belong to. */
export type TrainerClassBucket = 'frontend' | 'research' | 'systems';

/**
 * Language -> bucket. Keys are compared case-insensitively against the
 * `language` field GitHub reports for a repository.
 *
 * Edit this table to change how classes are assigned.
 */
export const LANGUAGE_BUCKETS: Record<string, TrainerClassBucket> = {
  typescript: 'frontend',
  javascript: 'frontend',
  'objective-j': 'frontend',
  html: 'frontend',
  css: 'frontend',
  scss: 'frontend',
  less: 'frontend',
  vue: 'frontend',
  svelte: 'frontend',
  astro: 'frontend',
  liquid: 'frontend',
  handlebars: 'frontend',

  python: 'research',
  'jupyter notebook': 'research',
  r: 'research',
  julia: 'research',
  matlab: 'research',
  stata: 'research',

  go: 'systems',
  rust: 'systems',
  c: 'systems',
  'c++': 'systems',
  zig: 'systems',
  assembly: 'systems',
  llvm: 'systems',
  nix: 'systems',
};

/** Bucket -> class id. */
export const BUCKET_CLASS_IDS: Record<TrainerClassBucket, TrainerClassId> = {
  frontend: 'frontend',
  research: 'research',
  systems: 'systems',
};

/**
 * English labels. The host localizes these via `vscode.l10n.t()`; they double
 * as the fallback and as what the tests assert against.
 */
export const TRAINER_CLASS_FALLBACK_LABELS: Record<TrainerClassId, string> = {
  frontend: 'Frontend Trainer',
  research: 'Research Trainer',
  systems: 'Systems Trainer',
  fullstack: 'Full-Stack Trainer',
  novice: 'Pokémon Trainer',
};

/** Below this many classified repositories there is not enough signal. */
export const MIN_REPOS_FOR_CLASS = 3;

/** Share of classified repositories a bucket needs to be called dominant. */
export const DOMINANCE_THRESHOLD = 0.4;

/**
 * Computes the trainer class from per-language repository counts.
 *
 * - fewer than `MIN_REPOS_FOR_CLASS` recognised repositories -> 'novice'
 * - a bucket holding at least `DOMINANCE_THRESHOLD` of them -> that bucket
 * - otherwise -> 'fullstack'
 */
export function computeTrainerClass(
  languages: readonly LanguageCount[] | undefined,
): TrainerClassId {
  if (!languages || languages.length === 0) {
    return 'novice';
  }

  const totals: Record<string, number> = {};
  let classified = 0;

  for (const entry of languages) {
    if (!entry || typeof entry.language !== 'string') {
      continue;
    }
    const count =
      typeof entry.repoCount === 'number' && isFinite(entry.repoCount)
        ? Math.max(Math.floor(entry.repoCount), 0)
        : 0;
    if (count === 0) {
      continue;
    }
    const bucket = LANGUAGE_BUCKETS[entry.language.trim().toLowerCase()];
    if (!bucket) {
      continue;
    }
    totals[bucket] = (totals[bucket] ?? 0) + count;
    classified += count;
  }

  if (classified < MIN_REPOS_FOR_CLASS) {
    return 'novice';
  }

  // Sort by count descending, then bucket name ascending. The alphabetical
  // tie-break is what makes an exact tie deterministic rather than dependent
  // on key insertion order.
  const ranked = Object.keys(totals).sort((a, b) => {
    const diff = totals[b] - totals[a];
    return diff !== 0 ? diff : a < b ? -1 : a > b ? 1 : 0;
  });

  const top = ranked[0] as TrainerClassBucket;
  if (totals[top] / classified >= DOMINANCE_THRESHOLD) {
    return BUCKET_CLASS_IDS[top];
  }
  return 'fullstack';
}
