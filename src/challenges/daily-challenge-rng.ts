/**
 * Deterministic, seeded randomness for Daily Challenge selection.
 *
 * `Math.random()` is never used here on purpose: the same seed must produce
 * the same three challenges every time it is asked, both within one session
 * and across a restart, so the string seed (a local calendar date combined
 * with a stable per-install identifier - see `daily-challenge-generator.ts`)
 * is the only source of variation.
 *
 * `xmur3` turns an arbitrary string into a 32-bit integer; `mulberry32` turns
 * that integer into a fast, decent-quality stream of floats in `[0, 1)`. Both
 * are small, widely-used public-domain constructions - not cryptographic, and
 * not trying to be, since nothing here is adversarial.
 */

/** Hashes a string down to a single 32-bit seed. */
function xmur3(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** A seeded [0, 1) generator. Call repeatedly for a deterministic sequence. */
export function createSeededRandom(seed: string): () => number {
  let a = xmur3(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Picks one weighted item deterministically from `items` using `random()`.
 *
 * A plain roulette-wheel selection: each item's slice of `[0, totalWeight)`
 * is proportional to its weight, and `random()` picks a point in that range.
 * Every non-positive weight is treated as 0 (never picked, never divides by
 * it). Returns `undefined` only when `items` is empty or every weight is 0.
 */
export function pickWeighted<T>(
  items: readonly T[],
  weightOf: (item: T) => number,
  random: () => number,
): T | undefined {
  const weights = items.map((item) => Math.max(0, weightOf(item)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) {
    return undefined;
  }
  let roll = random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll < 0) {
      return items[i];
    }
  }
  // Floating point can leave `roll` at exactly (or just past) 0 here; the
  // last positive-weight item is the correct fallback rather than undefined.
  for (let i = items.length - 1; i >= 0; i--) {
    if (weights[i] > 0) {
      return items[i];
    }
  }
  return undefined;
}
