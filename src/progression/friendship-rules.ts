/**
 * The entire balance and decision surface of the Friendship system.
 *
 * Mirrors the split `xp-rules.ts`/`reaction-rules.ts` already use: every
 * tunable (the range, gain amounts, tier boundaries, the evolution threshold)
 * lives here so tuning never means hunting through the host service, and
 * every decision is a pure function over plain numbers so it can be unit
 * tested without `vscode` or a DOM.
 *
 * Friendship is deliberately NOT XP: it tracks how much the user has worked
 * alongside THIS Pokemon while it was the partner, not how much experience it
 * has earned. Nothing here ever decreases a value - there is no loss
 * mechanic in V1 (see the module doc on `PokemonProgress.friendship`).
 *
 * Pure: no `vscode`, no DOM.
 */

export const MIN_FRIENDSHIP = 0;
export const MAX_FRIENDSHIP = 255;

/**
 * Where a Pokemon already in the collection starts.
 *
 * Existing Pokemon predate Friendship entirely - the same reasoning
 * `DEFAULT_POKEMON_LEVEL` uses for level. Zero would say the user has never
 * worked with a Pokemon they may have had for weeks; the low-but-not-zero
 * "Friendly" starting point is a fairer default, and still leaves the whole
 * climb to Best Friend ahead of them.
 */
export const DEFAULT_POKEMON_FRIENDSHIP = 70;

/** Friendship at or above this makes a `friendship`/`friendship-time`
 * evolution rule eligible. Centralized so nothing ever hardcodes `220`. */
export const FRIENDSHIP_EVOLUTION_THRESHOLD = 220;

/* ------------------------------- gain amounts ------------------------------ */

/** The partner receives an accepted, qualifying Pokemon XP award. */
export const FRIENDSHIP_GAIN_XP_EVENT = 1;
/** The partner receives an accepted Dev Action award specifically - replaces
 * `FRIENDSHIP_GAIN_XP_EVENT` for that event rather than stacking with it. */
export const FRIENDSHIP_GAIN_DEV_ACTION = 2;
/** The partner levels up. Stacks on top of whichever of the two gains above
 * the same XP grant already earned. */
export const FRIENDSHIP_GAIN_LEVEL_UP = 3;
/** A Daily Challenge completes while this Pokemon is the partner. */
export const FRIENDSHIP_GAIN_DAILY_COMPLETE = 5;
/** Every `FRIENDSHIP_CODING_CHUNK_MS` of qualifying coding time spent with the
 * same Pokemon as partner throughout. */
export const FRIENDSHIP_GAIN_CODING_CHUNK = 3;

/** How much qualifying, same-partner coding time earns one
 * `FRIENDSHIP_GAIN_CODING_CHUNK`. Mirrors `CODING_CHUNK_MS`'s naming in
 * `xp-rules.ts`, but is a separate, longer window: Friendship's time bonus is
 * deliberately slower than the XP payout cadence. */
export const FRIENDSHIP_CODING_CHUNK_MS = 30 * 60 * 1000;

/* --------------------------------- tiers ----------------------------------- */

export type FriendshipTierId =
  | 'wary'
  | 'friendly'
  | 'close'
  | 'very-close'
  | 'best-friend';

/** Ascending order, boundaries inclusive on the low end. */
export const FRIENDSHIP_TIER_ORDER: readonly FriendshipTierId[] = [
  'wary',
  'friendly',
  'close',
  'very-close',
  'best-friend',
];

interface FriendshipTierBand {
  id: FriendshipTierId;
  /** Inclusive lower bound. */
  min: number;
  hearts: number;
}

/** 0-49 Wary, 50-99 Friendly, 100-149 Close, 150-219 Very Close, 220-255 Best
 * Friend - one heart per band, five at Best Friend. */
const FRIENDSHIP_TIER_BANDS: readonly FriendshipTierBand[] = [
  { id: 'wary', min: 0, hearts: 1 },
  { id: 'friendly', min: 50, hearts: 2 },
  { id: 'close', min: 100, hearts: 3 },
  { id: 'very-close', min: 150, hearts: 4 },
  { id: 'best-friend', min: 220, hearts: 5 },
];

function bandFor(value: number): FriendshipTierBand {
  const clamped = clampFriendship(value);
  let band = FRIENDSHIP_TIER_BANDS[0];
  for (const candidate of FRIENDSHIP_TIER_BANDS) {
    if (clamped >= candidate.min) {
      band = candidate;
    }
  }
  return band;
}

export function clampFriendship(value: number): number {
  if (!isFinite(value)) {
    return MIN_FRIENDSHIP;
  }
  return Math.min(Math.max(Math.floor(value), MIN_FRIENDSHIP), MAX_FRIENDSHIP);
}

export function getFriendshipTier(value: number): FriendshipTierId {
  return bandFor(value).id;
}

/** 1-5, for the compact heart meter. */
export function getFriendshipHearts(value: number): number {
  return bandFor(value).hearts;
}

/**
 * How much a single accepted Partner XP event is worth in Friendship.
 *
 * A Dev Action (build/test/typecheck/lint) REPLACES the generic "qualifying
 * XP" amount rather than stacking with it - it is still exactly one XP
 * event, just a more specific one. A debug XP grant earns none at all: it is
 * test tooling, not real activity, and Friendship has its own dedicated
 * debug command (`pokedev.debug-add-friendship`) for exercising it directly.
 *
 * Takes the bare event type string rather than importing
 * `ProgressionEventType` from `progression-types.ts`, so this stays usable
 * from a test with no other dependency - the switch is exhaustive over the
 * real type at every call site via `ProgressionEvent['type']`.
 */
export function friendshipXpEventAmount(eventType: string): number {
  switch (eventType) {
    case 'debug-grant':
      return 0;
    case 'build-success':
    case 'test-success':
    case 'typecheck-success':
    case 'lint-success':
      return FRIENDSHIP_GAIN_DEV_ACTION;
    default:
      return FRIENDSHIP_GAIN_XP_EVENT;
  }
}

export interface FriendshipGrantResult {
  value: number;
  tierBefore: FriendshipTierId;
  tierAfter: FriendshipTierId;
  /** Whether this grant crossed into a strictly higher tier. */
  tierUp: boolean;
}

/**
 * Grants Friendship, clamped to the valid range. Pure: returns a plain
 * result, never mutates anything.
 *
 * A non-finite, negative or zero amount is a no-op rather than an error -
 * same reasoning as `addPokemonXp`: producers of this call are incidental
 * (timers, progression grants) and must never be able to throw.
 */
export function addFriendship(
  current: number,
  amount: number,
): FriendshipGrantResult {
  const before = clampFriendship(current);
  const tierBefore = getFriendshipTier(before);

  if (!isFinite(amount) || amount <= 0) {
    return { value: before, tierBefore, tierAfter: tierBefore, tierUp: false };
  }

  const after = clampFriendship(before + Math.floor(amount));
  const tierAfter = getFriendshipTier(after);

  return {
    value: after,
    tierBefore,
    tierAfter,
    tierUp:
      FRIENDSHIP_TIER_ORDER.indexOf(tierAfter) >
      FRIENDSHIP_TIER_ORDER.indexOf(tierBefore),
  };
}
