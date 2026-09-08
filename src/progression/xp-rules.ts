/* eslint-disable @typescript-eslint/naming-convention */
/**
 * The entire balance surface of the progression system.
 *
 * Everything a designer would want to tune - XP amounts, cooldowns, idle
 * thresholds, anti-farming caps - lives here so that tuning never means
 * hunting through listener code. Pure: no `vscode`, no DOM.
 */
import { ProgressionEventType } from './progression-types';

/** XP awarded by a single event of each type. */
export interface XpAward {
  trainerXp: number;
  pokemonXp: number;
}

export const XP_RULES: Record<ProgressionEventType, XpAward> = {
  // Base award for a batch of saved work; see `computeWorkBatchAward`, which
  // adds a capped bonus for breadth. Never used directly for this type.
  'work-batch': { trainerXp: 2, pokemonXp: 4 },
  'active-coding': { trainerXp: 5, pokemonXp: 8 },
  // The strongest signal available: a commit is a milestone someone chose to
  // record, which stays true whether a human or an agent wrote the diff.
  'git-commit': { trainerXp: 25, pokemonXp: 40 },
  // The unclassified fallback: some Build/Test-group task succeeded, but the
  // Dev Action classifier could not name what kind. Matched to
  // 'build-success'/'test-success' below rather than priced above them - a
  // task PokeDev cannot identify should never outearn one it can.
  'task-success': { trainerXp: 5, pokemonXp: 8 },
  // Dev Actions. Deliberately lower than 'git-commit': a commit is a
  // milestone someone chose to record, while a build or test run can - and
  // should - happen many times on the way there. typecheck/lint are priced
  // lower still; they are cheaper to run and to satisfy than an actual build
  // or test pass.
  'build-success': { trainerXp: 5, pokemonXp: 8 },
  'test-success': { trainerXp: 5, pokemonXp: 8 },
  'typecheck-success': { trainerXp: 3, pokemonXp: 5 },
  'lint-success': { trainerXp: 3, pokemonXp: 5 },
  // Granted only by the debug commands, which are off by default.
  'debug-grant': { trainerXp: 0, pokemonXp: 0 },
  // Observational log entries only (see `ProgressionEventType`'s own doc
  // comment) - never passed through `ProgressionService.applyEvent`/this
  // award pipeline, so these entries are never actually looked up. Present
  // only so `XP_RULES` stays a total mapping over `ProgressionEventType`.
  'pokemon-level-up': { trainerXp: 0, pokemonXp: 0 },
  'pokemon-evolved': { trainerXp: 0, pokemonXp: 0 },
  'daily-challenge-complete': { trainerXp: 0, pokemonXp: 0 },
};

/* ----------------------------- work batches ---------------------------- */

/**
 * Saves are grouped into batches before being paid.
 *
 * A single edit and a forty-file refactor both arrive as a burst of save
 * events, and paying per file would make XP measure blast radius rather than
 * accomplishment - a property of the task, not of the work. That mattered
 * little when a human typed every file, and matters a great deal when an agent
 * writes thirty at once.
 *
 * Saves landing within this window collapse into one event.
 */
export const BATCH_WINDOW_MS = 5 * 1000;

/**
 * Minimum gap between two paid batches.
 *
 * Global rather than per-document. A per-document cooldown cannot throttle a
 * burst at all, because distinct files never share one - which is exactly how
 * agent-driven bursts slipped past the old rule.
 */
export const BATCH_COOLDOWN_MS = 45 * 1000;

/** Extra award per file beyond the first in a batch. */
const BATCH_PER_EXTRA_FILE: XpAward = { trainerXp: 1, pokemonXp: 2 };

/** Ceiling on a single batch, however many files it touched. */
const BATCH_MAX: XpAward = { trainerXp: 10, pokemonXp: 20 };

/**
 * What a batch of `fileCount` changed files is worth.
 *
 * Breadth counts for something - a change spanning ten files usually is more
 * work than a one-line fix - but with a hard ceiling, so the difference
 * between a large change and an enormous one is nil.
 */
export function computeWorkBatchAward(fileCount: number): XpAward {
  const files = Math.max(1, Math.floor(fileCount) || 1);
  const extra = files - 1;
  const base = XP_RULES['work-batch'];
  return {
    trainerXp: Math.min(
      base.trainerXp + extra * BATCH_PER_EXTRA_FILE.trainerXp,
      BATCH_MAX.trainerXp,
    ),
    pokemonXp: Math.min(
      base.pokemonXp + extra * BATCH_PER_EXTRA_FILE.pokemonXp,
      BATCH_MAX.pokemonXp,
    ),
  };
}

/* ------------------------------- saving -------------------------------- */

/**
 * Path fragments that never earn XP.
 *
 * Generated and vendored output would otherwise let a single build grant a
 * burst of save XP the user did not write.
 */
export const IGNORED_PATH_SEGMENTS: readonly string[] = [
  'node_modules',
  '/out/',
  '/dist/',
  '/build/',
  '/.git/',
  '/coverage/',
  '/.vscode-test/',
];

/** Filenames that never earn XP, matched case-insensitively on the basename. */
export const IGNORED_FILE_PATTERNS: readonly RegExp[] = [
  /\.min\.(js|css)$/i,
  /^package-lock\.json$/i,
  /^yarn\.lock$/i,
  /^pnpm-lock\.yaml$/i,
  /\.map$/i,
  /\.log$/i,
];

/* ---------------------------- active coding ---------------------------- */

/** How often the coding-time ticker wakes. Deliberately coarse. */
export const CODING_TICK_MS = 60 * 1000;

/** No editor interaction for this long and the session stops accruing time. */
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * The idle window in agentic mode.
 *
 * Wider because an agent run has long legitimate pauses - reasoning, tool
 * calls, a build - where nothing touches a document at all. Five minutes would
 * cut off a session that is very much still underway.
 */
export const AGENTIC_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/** Active coding is banked - and paid - in chunks this large. */
export const CODING_CHUNK_MS = 10 * 60 * 1000;

/* ------------------------------ git commit ----------------------------- */

/**
 * How many rewarded commit hashes to remember per workspace.
 *
 * Bounded so a long-lived repository cannot grow the stored state without
 * limit. Dropping the oldest entries is safe: re-awarding a commit from
 * hundreds of commits ago would require the user to reset HEAD back to it.
 */
export const MAX_REMEMBERED_COMMITS = 200;

/* ----------------------------- task success ---------------------------- */

/** One task name cannot earn twice inside this window. */
export const TASK_COOLDOWN_MS = 60 * 1000;

/* ----------------------------- anti-farming ---------------------------- */

/**
 * Hard ceiling on XP events accepted per minute.
 *
 * This is a loop breaker, not a balance lever: no combination of real editor
 * activity approaches it. It exists so a misbehaving listener or an event
 * storm cannot dump thousands of XP.
 */
export const MAX_EVENTS_PER_MINUTE = 30;

/**
 * Soft ceiling on trainer XP per rolling hour.
 *
 * A hard session earns roughly 165/h (30 coding + ~40 saves + ~45 commits +
 * ~50 tasks), so this leaves about 3.6x headroom and only ever catches
 * runaway behaviour.
 */
export const MAX_TRAINER_XP_PER_HOUR = 600;

/** Window the hourly cap is measured over. */
export const XP_CAP_WINDOW_MS = 60 * 60 * 1000;

/** How many recent events the activity log retains. */
export const MAX_LOGGED_EVENTS = 50;
