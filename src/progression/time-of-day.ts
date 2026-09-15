/**
 * Game-style time-of-day, for the friendship-time evolution condition
 * (Eevee -> Espeon/Umbreon and friends).
 *
 * Uses the user's local system time via `Date`'s own local getters - no
 * timezone handling of its own, matching how every other timestamp in this
 * extension is just `Date.now()`.
 *
 * Pure: no `vscode`, no DOM.
 */

export type TimeOfDay = 'day' | 'night';

/** Local hour DAY begins at (inclusive). */
export const DAY_START_HOUR = 6;
/** Local hour NIGHT begins at (inclusive). DAY runs 06:00-17:59. */
export const NIGHT_START_HOUR = 18;

/** Defaults to the current moment; a `Date` can be passed for testing. */
export function getTimeOfDay(date: Date = new Date()): TimeOfDay {
  const hour = date.getHours();
  return hour >= DAY_START_HOUR && hour < NIGHT_START_HOUR ? 'day' : 'night';
}
