/**
 * The local-calendar-day boundary Daily Challenges resets on.
 *
 * Deliberately `Date`'s LOCAL getters (`getFullYear`/`getMonth`/`getDate`),
 * never the UTC ones: two people in different time zones - or the same person
 * before and after a flight - should each see a new set at their own
 * midnight, not at UTC midnight. This is not a rolling 24-hour timer; it is a
 * pure function of wall-clock time, so calling it twice one second apart
 * around midnight can legitimately return different keys, which is exactly
 * the reset this feature wants.
 */
export function localDateKey(now: number): string {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * The entire "should today's set be rerolled" decision, isolated so it can be
 * tested (and reasoned about) without touching `ExtensionContext`.
 *
 * This is intentionally the ONLY condition that ever triggers regeneration -
 * `daily-challenges-service.ts`'s `ensureToday` is a thin wrapper that reads
 * the persisted date, calls this, and either returns what it already had or
 * generates and persists a fresh set. Nothing else (a Trainer level-up, a
 * Party change, Git becoming available, the view reopening) is allowed to
 * make this `true`.
 */
export function shouldRegenerateDailyChallenges(
  existingDateKey: string | undefined,
  todayKey: string,
): boolean {
  return existingDateKey !== todayKey;
}
