/**
 * Pure geometry/decision logic for Overworld (2D) roaming: where a Pokémon
 * should walk to next, where it should start, how it depth-sorts, and how
 * its position rescales when the playable screen resizes.
 *
 * Deliberately DOM-free and `vscode`-free so every function here can be
 * unit tested with plain numbers - no webview, no jsdom. The stateful glue
 * that actually calls these (reading `getWorldWidth()`/`getWorldHeight()`,
 * writing `pokemon.style.left/bottom`) lives in `states.ts` and
 * `base-pokemon-type.ts`.
 *
 * No physics engine, no pathfinding: every "choose a destination" function
 * here is a single random draw (occasionally two, for lightweight
 * separation) - never a simulation loop.
 */

export interface WorldTarget {
  x: number;
  y: number;
}

/** Keeps `value` within `[margin, size - spriteSize - margin]`, collapsing to
 * the midpoint if the playable area is smaller than a sprite plus its own
 * margins (a very narrow/short Explorer sidebar). */
export function clampToPlayableAxis(
  value: number,
  size: number,
  spriteSize: number,
  margin: number,
): number {
  const max = size - spriteSize - margin;
  if (max <= margin) {
    return Math.max(0, (size - spriteSize) / 2);
  }
  return Math.min(Math.max(value, margin), max);
}

/** Sprite-aware margin so a Pokémon never renders half off-screen - a small
 * inset, not the large "safe rectangle" the classic arena look used. */
export function marginFor(spriteSize: number): number {
  return spriteSize * 0.25;
}

/**
 * Picks the next Overworld destination from `current`.
 *
 * Nearby destinations are heavily preferred (a real Pokémon overworld
 * wanders in short hops, not screensaver-style leaps); `longWanderChance` of
 * the time, a longer wander across more of the screen is allowed instead so
 * movement does not feel confined to one corner forever.
 */
export function chooseOverworldTarget(
  current: WorldTarget,
  worldWidth: number,
  worldHeight: number,
  spriteSize: number,
  rng: () => number = Math.random,
  longWanderChance = 0.2,
): WorldTarget {
  const margin = marginFor(spriteSize);
  const shortRange = Math.max(
    spriteSize,
    Math.min(worldWidth, worldHeight) * 0.35,
  );
  const longRange = Math.max(worldWidth, worldHeight);
  const range = rng() < longWanderChance ? longRange : shortRange;

  const x = current.x + (rng() * 2 - 1) * range;
  const y = current.y + (rng() * 2 - 1) * range;

  return {
    x: clampToPlayableAxis(x, worldWidth, spriteSize, margin),
    y: clampToPlayableAxis(y, worldHeight, spriteSize, margin),
  };
}

/**
 * A single fresh Overworld Y, for the "preserve X, generate Y" cases: a
 * live Classic -> Overworld switch, or restoring a legacy (Classic-only)
 * save while Overworld mode is active. No separation-avoidance here - X is
 * already fixed to the Pokemon's real, preserved position, so there is no
 * good way to avoid another Pokemon at that same X without moving it
 * horizontally too, which would defeat "preserve X where practical".
 */
export function chooseOverworldY(
  worldHeight: number,
  spriteSize: number,
  rng: () => number = Math.random,
): number {
  const margin = marginFor(spriteSize);
  return clampToPlayableAxis(
    rng() * worldHeight,
    worldHeight,
    spriteSize,
    margin,
  );
}

/** Euclidean distance between two positions - used only to compare
 * candidate starting spots against each other, never for movement. */
function distance(a: WorldTarget, b: WorldTarget): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Picks a starting (or freshly-generated, on a Classic -> Overworld switch)
 * position, making a handful of lightweight attempts to keep some distance
 * from `others` - not real collision, just "don't obviously stack Pokémon on
 * top of each other". Keeps whichever of `attempts` random draws had the
 * largest minimum distance to every existing position.
 */
export function chooseInitialOverworldPosition(
  worldWidth: number,
  worldHeight: number,
  spriteSize: number,
  others: readonly WorldTarget[],
  rng: () => number = Math.random,
  attempts = 5,
): WorldTarget {
  const margin = marginFor(spriteSize);

  const draw = (): WorldTarget => ({
    x: clampToPlayableAxis(rng() * worldWidth, worldWidth, spriteSize, margin),
    y: clampToPlayableAxis(
      rng() * worldHeight,
      worldHeight,
      spriteSize,
      margin,
    ),
  });

  if (others.length === 0) {
    return draw();
  }

  let best = draw();
  let bestMinDistance = Math.min(...others.map((o) => distance(best, o)));

  for (let i = 1; i < attempts; i++) {
    const candidate = draw();
    const minDistance = Math.min(...others.map((o) => distance(candidate, o)));
    if (minDistance > bestMinDistance) {
      best = candidate;
      bestMinDistance = minDistance;
    }
  }

  return best;
}

/**
 * Y-based depth sort: a Pokémon rendered lower on screen (smaller `bottom`,
 * i.e. visually closer to the viewer) gets a HIGHER z-index than one
 * rendered higher up. Bounded to stay well under this world's other fixed
 * layers (collision boxes at 999, reactions/toasts at 1000-1001, the GBC
 * overlay at 10) - see the range check in the test suite.
 */
const DEPTH_Z_BASE = 2;
const DEPTH_Z_RANGE = 96;

export function computeDepthZIndex(
  bottom: number,
  worldHeight: number,
): number {
  const safeHeight = Math.max(1, worldHeight);
  const t = Math.max(0, Math.min(1, 1 - bottom / safeHeight));
  return Math.round(DEPTH_Z_BASE + t * DEPTH_Z_RANGE);
}

/**
 * Rescales one axis value proportionally when the playable screen resizes,
 * so an Overworld position stays at the same RELATIVE spot rather than a
 * stale absolute pixel offset. A zero/invalid old size is a no-op (returns
 * `value` unchanged) rather than dividing by zero.
 */
export function rescaleForResize(
  value: number,
  oldSize: number,
  newSize: number,
): number {
  if (!isFinite(oldSize) || oldSize <= 0) {
    return value;
  }
  return (value / oldSize) * newSize;
}
