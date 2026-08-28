/**
 * The decisions behind "did this actually earn anything".
 *
 * Kept pure and separate from `activity-tracker.ts` deliberately: these are
 * the anti-farming rules, they are the part most likely to be wrong, and a
 * function that imports `vscode` cannot be unit tested without launching an
 * editor. Everything here is a plain function over plain values.
 */
import { ActivitySource, ProgressionMode } from './progression-types';
import {
  AGENTIC_IDLE_TIMEOUT_MS,
  BATCH_COOLDOWN_MS,
  IDLE_TIMEOUT_MS,
  IGNORED_FILE_PATTERNS,
  IGNORED_PATH_SEGMENTS,
  MAX_REMEMBERED_COMMITS,
} from './xp-rules';

/* -------------------------------- modes -------------------------------- */

/**
 * Whether a signal keeps the idle clock alive, given how the user works.
 *
 * The only meaningful difference between the modes. VS Code reports an agent's
 * edit and a human keystroke as the same `onDidChangeTextDocument` event, so
 * `document-change` is the signal that cannot distinguish them:
 *
 *   auto     - trusts everything; you earn whether you type or direct an agent
 *   manual   - trusts only keyboard and mouse input, so watching an agent work
 *              accrues nothing
 *   agentic  - trusts everything, and pairs with a wider idle window for runs
 *              that pause while the agent thinks
 *
 * Note that this governs coding TIME only. Work batches and commits pay the
 * same in every mode - a commit is a commit whoever typed it.
 */
export function countsAsActivity(
  mode: ProgressionMode,
  source: ActivitySource,
): boolean {
  if (mode !== 'manual') {
    return true;
  }
  // Strict by design: in manual mode an agent switching files or writing to
  // them must not stand in for the user being present.
  return source === 'human-input';
}

/** How long without activity before a session stops accruing, per mode. */
export function idleTimeoutForMode(mode: ProgressionMode): number {
  return mode === 'agentic' ? AGENTIC_IDLE_TIMEOUT_MS : IDLE_TIMEOUT_MS;
}

/** Reads a persisted or configured mode, defaulting anything unrecognised. */
export function normalizeProgressionMode(value: unknown): ProgressionMode {
  return value === 'manual' || value === 'agentic' || value === 'auto'
    ? value
    : 'auto';
}

/** What was recorded the last time a document earned save XP. */
export interface SaveRecord {
  at: number;
  fingerprint: string;
}

/**
 * Whether a saved document represents new work.
 *
 * Purely a content check: re-saving an unchanged buffer is never work, no
 * matter how long ago the last save was. Rate limiting is handled separately
 * and globally by `shouldAwardBatch` - deliberately not per document, because
 * distinct files never share a per-document cooldown and so a burst across
 * many files would slip past one entirely.
 */
export function hasDocumentChanged(
  previous: SaveRecord | undefined,
  fingerprint: string,
): boolean {
  if (!previous) {
    return true;
  }
  return previous.fingerprint !== fingerprint;
}

/**
 * Whether enough time has passed since the last paid batch.
 *
 * This is the single rate limit on saved work. Being global, it bounds a
 * forty-file agent burst exactly as it bounds someone hammering Ctrl+S in one
 * file, which is the property the old per-document cooldown lacked.
 */
export function shouldAwardBatch(
  lastAwardAt: number | undefined,
  now: number,
  cooldownMs: number = BATCH_COOLDOWN_MS,
): boolean {
  if (lastAwardAt === undefined) {
    return true;
  }
  return now - lastAwardAt >= cooldownMs;
}

/**
 * Whether a path is generated, vendored or otherwise not the user's writing.
 *
 * `path` is expected to be POSIX-separated; callers normalise Windows paths
 * before calling.
 */
export function isIgnoredPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  for (const segment of IGNORED_PATH_SEGMENTS) {
    if (normalized.indexOf(segment) !== -1) {
      return true;
    }
  }
  const basename = normalized.split('/').pop() ?? '';
  for (const pattern of IGNORED_FILE_PATTERNS) {
    if (pattern.test(basename)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether this tick counts as active coding.
 *
 * Both conditions matter: an unfocused window means the user is elsewhere, and
 * a focused window with no recent interaction means they walked away without
 * switching apps. Neither alone would stop an editor left open overnight from
 * levelling someone up.
 */
export function shouldAccrueCodingTime(
  focused: boolean,
  lastActivityAt: number,
  now: number,
  idleTimeoutMs: number = IDLE_TIMEOUT_MS,
): boolean {
  if (!focused) {
    return false;
  }
  return now - lastActivityAt <= idleTimeoutMs;
}

/**
 * Adds a commit to the rewarded set, newest first and bounded.
 *
 * Returns the unchanged list when the sha is already known - that identity is
 * what the caller uses to decide whether to pay out.
 */
export function rememberCommitIn(
  existing: readonly string[],
  sha: string,
  max: number = MAX_REMEMBERED_COMMITS,
): string[] {
  if (existing.indexOf(sha) !== -1) {
    return existing.slice();
  }
  return [sha, ...existing].slice(0, Math.max(0, max));
}

/** Whether this commit has already been paid for in this workspace. */
export function isCommitRewarded(
  existing: readonly string[],
  sha: string,
): boolean {
  return existing.indexOf(sha) !== -1;
}
