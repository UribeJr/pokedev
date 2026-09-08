/**
 * Pure derivation of PokeGear's ACTIVITY tab from the existing progression
 * log - no new persistence, no new calculations, just reading and shaping
 * data that already exists. DOM-free/`vscode`-free so it is directly unit
 * testable, the same convention `panel/roaming/*.ts` follows.
 */
import { ProgressionEvent } from '../progression/progression-types';
import {
  PokeGearActivityEntry,
  PokeGearActivityView,
  POKEGEAR_ACTIVITY_FEED_LIMIT,
} from './pokegear-types';

/**
 * Dev Action successes, grouped for the "today" summary - deliberately
 * includes `task-success` (the unclassified fallback for a Build/Test-group
 * task the classifier could not name; see `ProgressionEventType`'s own doc
 * comment), since it is still genuinely a Dev Action, just an unlabelled one.
 */
const DEV_ACTION_TYPES: ReadonlySet<ProgressionEvent['type']> = new Set([
  'build-success',
  'test-success',
  'typecheck-success',
  'lint-success',
  'task-success',
]);

/**
 * High-frequency "ambient" events excluded from the RECENT feed (not from
 * the log itself, which this module never writes to): a coding-time tick or
 * a save batch fires far more often than a commit or a level-up, and would
 * otherwise drown out the meaningful milestones the ACTIVITY tab exists to
 * surface - see the module doc on `ProgressionEvent.type` and the
 * milestone's own "do NOT show raw terminal commands... summarize
 * MEANINGFUL activity" instruction.
 *
 * Known limitation, intentionally accepted rather than solved by changing
 * the shared log: because the log itself is capped at `MAX_LOGGED_EVENTS`
 * (currently 50) and still contains these ambient types, a very active
 * coding day COULD in principle evict an older meaningful milestone from the
 * window before this filter ever sees it. Solving that would mean either
 * growing the shared log (used elsewhere for real balance/restoration
 * purposes, not just display) or maintaining a second one - both bigger
 * changes than this presentation-only feature should make.
 */
const AMBIENT_FEED_TYPES: ReadonlySet<ProgressionEvent['type']> = new Set([
  'work-batch',
  'active-coding',
]);

export function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/**
 * @param log The existing progression log, newest-first (see
 *   `appendToLog`'s own doc comment - this function trusts that order
 *   rather than re-sorting).
 * @param now Epoch ms "today" is measured against - a parameter (not
 *   `Date.now()` read internally) so this stays pure and testable.
 */
export function buildPokeGearActivityView(
  log: readonly ProgressionEvent[],
  dailyCompletedCount: number,
  dailyTotalCount: number,
  now: number,
): PokeGearActivityView {
  let commits = 0;
  let devActions = 0;
  const recent: PokeGearActivityEntry[] = [];

  for (const event of log) {
    const isToday = isSameLocalDay(event.timestamp, now);
    if (isToday) {
      if (event.type === 'git-commit') {
        commits++;
      } else if (DEV_ACTION_TYPES.has(event.type)) {
        devActions++;
      }
    }
    if (
      recent.length < POKEGEAR_ACTIVITY_FEED_LIMIT &&
      !AMBIENT_FEED_TYPES.has(event.type)
    ) {
      recent.push({
        type: event.type,
        timestamp: event.timestamp,
        metadata: event.metadata,
      });
    }
  }

  return {
    today: { commits, devActions, dailyCompletedCount, dailyTotalCount },
    recent,
  };
}
