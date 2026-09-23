/**
 * Pure PokéGear RADIO player logic - track selection (shuffle/repeat/
 * sequential), volume clamping, and time formatting.
 *
 * Kept separate from `panel/pokegear/main.ts` (which owns the actual
 * `<audio>` element and DOM) for the same reason `pokegear-activity.ts` is
 * separate from the rest of the view-model builder: this is the part that
 * can be unit-tested directly, with no DOM/webview involved - see
 * `src/test/suite/pokegear-radio.test.ts`.
 *
 * PLAYBACK RULES (see this milestone's own spec)
 * ------------------------------------------------
 * - Manual Previous always moves to the prior track in catalog order,
 *   regardless of shuffle - shuffle has no "history", so a shuffled
 *   "previous" would be arbitrary; sequential is at least predictable.
 * - Manual Next respects shuffle: a different random track when shuffle is
 *   on, otherwise the next track in catalog order (wrapping at the end).
 * - Repeat Track takes priority over shuffle on track-end: if it's on, the
 *   same track plays again rather than advancing at all.
 * - Track-end (not manually triggered) follows: Repeat Track > Shuffle >
 *   sequential-with-wrap - see `resolveTrackEndTransition`.
 */

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Falls back to the first catalog id for a missing/unknown/removed id -
 * never throws, matching `normalizePokeballId`'s "trust nothing from
 * storage" discipline. Returns `undefined` only if the catalog itself is
 * empty. */
export function normalizeRadioTrackId(
  id: string | undefined,
  trackIds: readonly string[],
): string | undefined {
  if (id && trackIds.includes(id)) {
    return id;
  }
  return trackIds[0];
}

function sequentialIndex(
  trackIds: readonly string[],
  currentId: string | undefined,
  direction: 1 | -1,
): number {
  const currentIndex = currentId ? trackIds.indexOf(currentId) : -1;
  const base = currentIndex === -1 ? 0 : currentIndex;
  return (base + direction + trackIds.length) % trackIds.length;
}

/** A different track than `currentId`, chosen uniformly at random from the
 * rest of the catalog - "choose a different track when possible" per this
 * milestone's spec. Falls back to `currentId` only when the catalog has a
 * single track (nothing else to choose). `random` is injectable for
 * deterministic tests. */
export function pickShuffledTrackId(
  trackIds: readonly string[],
  currentId: string | undefined,
  random: () => number = Math.random,
): string | undefined {
  if (trackIds.length === 0) {
    return undefined;
  }
  if (trackIds.length === 1) {
    return trackIds[0];
  }
  const candidates = trackIds.filter((id) => id !== currentId);
  const pick = candidates[Math.floor(random() * candidates.length)];
  return pick ?? trackIds[0];
}

export function resolvePreviousTrackId(
  trackIds: readonly string[],
  currentId: string | undefined,
): string | undefined {
  if (trackIds.length === 0) {
    return undefined;
  }
  return trackIds[sequentialIndex(trackIds, currentId, -1)];
}

export function resolveManualNextTrackId(
  trackIds: readonly string[],
  currentId: string | undefined,
  shuffle: boolean,
  random: () => number = Math.random,
): string | undefined {
  if (trackIds.length === 0) {
    return undefined;
  }
  if (shuffle) {
    return pickShuffledTrackId(trackIds, currentId, random);
  }
  return trackIds[sequentialIndex(trackIds, currentId, 1)];
}

export interface TrackEndTransitionInput {
  trackIds: readonly string[];
  currentId: string | undefined;
  shuffle: boolean;
  repeatTrack: boolean;
  random?: () => number;
}

/** What plays next when the current track finishes on its own (not a
 * manual Next/Previous click) - see the module doc comment for the
 * priority order. */
export function resolveTrackEndTransition(
  input: TrackEndTransitionInput,
): string | undefined {
  const { trackIds, currentId, shuffle, repeatTrack, random } = input;
  if (trackIds.length === 0) {
    return undefined;
  }
  if (repeatTrack) {
    return currentId ?? trackIds[0];
  }
  if (shuffle) {
    return pickShuffledTrackId(trackIds, currentId, random);
  }
  return trackIds[sequentialIndex(trackIds, currentId, 1)];
}

/** Seconds -> "1:31" (or "0:42"), never "NaN:NaN" - `<audio>` reports
 * `duration`/`currentTime` as `NaN` before metadata loads. */
export function formatTrackTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '--:--';
  }
  const whole = Math.floor(totalSeconds);
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}
