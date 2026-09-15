/**
 * Catalog of Poké Ball cosmetics selectable per persistent Pokémon instance.
 *
 * Pure data, no `vscode` import: bundled into BOTH the extension host and
 * the PokeGear webview's client bundle, mirroring `items.ts`/
 * `display-skins.ts`/`trainer-sprite-catalog.ts`'s exact split. Unlike
 * `items.ts` (the evolution-stone Bag catalog, which is text-only - see its
 * own module doc), every entry here has a real sprite, so the shape instead
 * mirrors `trainer-sprite-catalog.ts`'s `TrainerSprite`/`assetPath` pattern:
 * `src/extension/pokeball-service.ts` is this catalog's equivalent of
 * `trainer-sprite-service.ts`, resolving `assetPath` into a webview URI.
 *
 * V1 SCOPE
 * --------
 * This is purely cosmetic customization, never an inventory: every ball
 * below is selectable immediately, for every Pokémon, at all times. Nothing
 * here is bought, caught, earned, consumed, or limited in quantity - that is
 * what makes this a completely different system from the Bag
 * (`common/items.ts`), which tracks real, consumable quantities. Do not
 * conflate the two: a "Great Ball" in this catalog and a Bag item are
 * unrelated concepts that happen to share a name in the source games.
 *
 * ASSET PROVENANCE
 * -----------------
 * All 38 sprites are the actual, full-color item icons from
 * https://github.com/msikma/pokesprite (`items/ball/`, MIT-licensed
 * repository), bundled locally under `media/pokeballs/*.png` - see the
 * README's Credits section for full attribution. Like this project's other
 * Nintendo/Game-Freak-derived pixel art (Trainer/GBC-border/environment
 * assets - see `display-skins.ts`'s own provenance note for the identical
 * reasoning), these are used here for non-commercial fan-project purposes
 * only; `media/pokeballs/*.png` is gitignored (third-party binary assets
 * copied in, not originally-authored) but IS bundled into the packaged
 * extension.
 *
 * Every filename was kept exactly as it ships in the source repository -
 * `id` below IS the source filename (without extension) - so a sprite can
 * always be traced back to its origin with no renaming step to keep in
 * sync. pokesprite ships no display-name data of its own (it is a pure
 * icon set); the `name` field for each entry was written by hand from the
 * real, official Pokémon item names.
 *
 * SORT ORDER
 * ----------
 * Roughly canonical Bag order: the four best-known balls first, then
 * standard catching balls in the order they were introduced, then the
 * Pokémon Legends: Arceus-specific specialty balls, then the Hisuian
 * variants of standard balls (a Legends: Arceus mechanic layered on top of
 * existing balls) last. Not alphabetical - see this milestone's own
 * instruction against sorting a real-world, canonically-ordered catalog
 * alphabetically.
 */

export type PokeballId = string;

export interface PokeballDefinition {
  /** Stable identifier - the source pokesprite filename (without
   * extension). Persisted (`PokemonProgress.pokeballId`) - never derive
   * identity from array position or from `name`. */
  id: PokeballId;
  /** Display name, e.g. "Great Ball". */
  name: string;
  /** Relative to `media/pokeballs/`, e.g. "great.png". */
  assetPath: string;
  sortOrder: number;
}

/** Existing Pokémon instances with no stored preference - and any instance
 * whose stored id no longer resolves in this catalog - default here. */
export const DEFAULT_POKEBALL_ID: PokeballId = 'poke';

export const POKEBALL_DEFINITIONS: readonly PokeballDefinition[] = [
  // The four best-known balls.
  { id: 'poke', name: 'Poké Ball', assetPath: 'poke.png', sortOrder: 0 },
  { id: 'great', name: 'Great Ball', assetPath: 'great.png', sortOrder: 1 },
  { id: 'ultra', name: 'Ultra Ball', assetPath: 'ultra.png', sortOrder: 2 },
  { id: 'master', name: 'Master Ball', assetPath: 'master.png', sortOrder: 3 },

  // Standard catching/utility balls.
  {
    id: 'premier',
    name: 'Premier Ball',
    assetPath: 'premier.png',
    sortOrder: 4,
  },
  { id: 'luxury', name: 'Luxury Ball', assetPath: 'luxury.png', sortOrder: 5 },
  { id: 'heal', name: 'Heal Ball', assetPath: 'heal.png', sortOrder: 6 },
  { id: 'net', name: 'Net Ball', assetPath: 'net.png', sortOrder: 7 },
  { id: 'nest', name: 'Nest Ball', assetPath: 'nest.png', sortOrder: 8 },
  { id: 'dive', name: 'Dive Ball', assetPath: 'dive.png', sortOrder: 9 },
  { id: 'repeat', name: 'Repeat Ball', assetPath: 'repeat.png', sortOrder: 10 },
  { id: 'timer', name: 'Timer Ball', assetPath: 'timer.png', sortOrder: 11 },
  { id: 'dusk', name: 'Dusk Ball', assetPath: 'dusk.png', sortOrder: 12 },
  { id: 'quick', name: 'Quick Ball', assetPath: 'quick.png', sortOrder: 13 },
  { id: 'safari', name: 'Safari Ball', assetPath: 'safari.png', sortOrder: 14 },
  { id: 'level', name: 'Level Ball', assetPath: 'level.png', sortOrder: 15 },
  { id: 'lure', name: 'Lure Ball', assetPath: 'lure.png', sortOrder: 16 },
  { id: 'moon', name: 'Moon Ball', assetPath: 'moon.png', sortOrder: 17 },
  { id: 'friend', name: 'Friend Ball', assetPath: 'friend.png', sortOrder: 18 },
  { id: 'love', name: 'Love Ball', assetPath: 'love.png', sortOrder: 19 },
  { id: 'heavy', name: 'Heavy Ball', assetPath: 'heavy.png', sortOrder: 20 },
  { id: 'fast', name: 'Fast Ball', assetPath: 'fast.png', sortOrder: 21 },
  { id: 'sport', name: 'Sport Ball', assetPath: 'sport.png', sortOrder: 22 },
  { id: 'park', name: 'Park Ball', assetPath: 'park.png', sortOrder: 23 },
  { id: 'dream', name: 'Dream Ball', assetPath: 'dream.png', sortOrder: 24 },
  { id: 'beast', name: 'Beast Ball', assetPath: 'beast.png', sortOrder: 25 },
  {
    id: 'cherish',
    name: 'Cherish Ball',
    assetPath: 'cherish.png',
    sortOrder: 26,
  },

  // Pokémon Legends: Arceus specialty balls.
  { id: 'origin', name: 'Origin Ball', assetPath: 'origin.png', sortOrder: 27 },
  {
    id: 'strange',
    name: 'Strange Ball',
    assetPath: 'strange.png',
    sortOrder: 28,
  },
  {
    id: 'feather',
    name: 'Feather Ball',
    assetPath: 'feather.png',
    sortOrder: 29,
  },
  { id: 'wing', name: 'Wing Ball', assetPath: 'wing.png', sortOrder: 30 },
  { id: 'jet', name: 'Jet Ball', assetPath: 'jet.png', sortOrder: 31 },
  { id: 'leaden', name: 'Leaden Ball', assetPath: 'leaden.png', sortOrder: 32 },
  {
    id: 'gigaton',
    name: 'Gigaton Ball',
    assetPath: 'gigaton.png',
    sortOrder: 33,
  },

  // Hisuian variants of standard balls (also a Legends: Arceus mechanic).
  {
    id: 'hisuian-poke',
    name: 'Hisuian Poké Ball',
    assetPath: 'hisuian-poke.png',
    sortOrder: 34,
  },
  {
    id: 'hisuian-great',
    name: 'Hisuian Great Ball',
    assetPath: 'hisuian-great.png',
    sortOrder: 35,
  },
  {
    id: 'hisuian-ultra',
    name: 'Hisuian Ultra Ball',
    assetPath: 'hisuian-ultra.png',
    sortOrder: 36,
  },
  {
    id: 'hisuian-heavy',
    name: 'Hisuian Heavy Ball',
    assetPath: 'hisuian-heavy.png',
    sortOrder: 37,
  },
];

const POKEBALLS_BY_ID: Readonly<Record<string, PokeballDefinition>> = (() => {
  const map: Record<string, PokeballDefinition> = {};
  for (const ball of POKEBALL_DEFINITIONS) {
    map[ball.id] = ball;
  }
  return map;
})();

export function isValidPokeballId(id: string | undefined): id is PokeballId {
  if (!id) {
    return false;
  }
  return POKEBALLS_BY_ID[id] !== undefined;
}

export function getPokeballDefinition(
  id: string | undefined,
): PokeballDefinition | undefined {
  if (!id) {
    return undefined;
  }
  return POKEBALLS_BY_ID[id];
}

/**
 * Falls back to the standard Poké Ball for a missing/unknown/removed id,
 * never throws - the same "trust nothing from storage" discipline every
 * other normalize-on-read helper in this project follows.
 */
export function normalizePokeballId(id: string | undefined): PokeballId {
  return isValidPokeballId(id) ? id : DEFAULT_POKEBALL_ID;
}
