/**
 * The Trainer Sprite catalog: a small, curated set of Generation I-IV
 * player-character sprites the user can pick as their Trainer Card portrait
 * instead of their GitHub avatar.
 *
 * Pure: no `vscode`, no DOM. Imported by BOTH the extension host (to resolve
 * each `assetPath` into a webview URI) and the webview bundles (to read
 * generation labels/ids for the picker UI), so it must stay that way -
 * mirrors the constraint documented at the top of `trainer-types.ts`.
 *
 * Generation mapping lives HERE and only here - nothing in the panel or
 * webview code should hardcode which games belong to which generation.
 *
 * Assets live under `media/trainers/gen<N>/<assetPath>`, sourced and curated
 * from https://github.com/jonbarrow/trainercards.studio (itself crediting
 * Bulbagarden Archives / pokengine.org as the original sprite sources) - see
 * the README's Credits section for full attribution.
 */

export type TrainerGeneration = 1 | 2 | 3 | 4;

export interface TrainerGenerationInfo {
  generation: TrainerGeneration;
  /** Short tab label, e.g. "GEN I". */
  label: string;
}

/**
 * Adding Generation V later is meant to be exactly this: one more entry here,
 * one more `TrainerSprite` bucket below, and new assets under
 * `media/trainers/gen5/`. Nothing else needs to change - the picker UI and
 * the persisted-id validation both derive everything from this catalog.
 */
export const TRAINER_GENERATIONS: readonly TrainerGenerationInfo[] = [
  { generation: 1, label: 'GEN I' },
  { generation: 2, label: 'GEN II' },
  { generation: 3, label: 'GEN III' },
  { generation: 4, label: 'GEN IV' },
];

export interface TrainerSprite {
  /** Stable identifier. Persisted (`TrainerProfile.trainerSpriteId`) - never
   *  derive identity from array position or from `name`/`assetPath`. */
  id: string;
  /** Display name, e.g. "Red". */
  name: string;
  generation: TrainerGeneration;
  /** Game/version the sprite is drawn from, e.g. "Red / Blue". */
  game: string;
  /** Relative to `media/trainers/`, e.g. "gen1/gen1-red.png". */
  assetPath: string;
}

/**
 * A small, curated selection - one or two player-character sprites per
 * source game - not the reference project's full multi-thousand-sprite
 * archive (which also includes NPCs, gym leaders, etc. we have no use for
 * here).
 */
export const TRAINER_SPRITES: readonly TrainerSprite[] = [
  // Generation I: Red / Blue, Red / Green.
  {
    id: 'gen1-red',
    name: 'Red',
    generation: 1,
    game: 'Red / Blue',
    assetPath: 'gen1/gen1-red.png',
  },
  {
    id: 'gen1-blue',
    name: 'Blue',
    generation: 1,
    game: 'Red / Green',
    assetPath: 'gen1/gen1-blue.png',
  },

  // Generation II: Gold / Silver, Crystal.
  {
    id: 'gen2-ethan',
    name: 'Ethan',
    generation: 2,
    game: 'Gold / Silver',
    assetPath: 'gen2/gen2-ethan.png',
  },
  {
    id: 'gen2-kris',
    name: 'Kris',
    generation: 2,
    game: 'Crystal',
    assetPath: 'gen2/gen2-kris.png',
  },

  // Generation III: Ruby / Sapphire, Emerald, FireRed / LeafGreen.
  {
    id: 'gen3-brendan',
    name: 'Brendan',
    generation: 3,
    game: 'Ruby / Sapphire',
    assetPath: 'gen3/gen3-brendan.png',
  },
  {
    id: 'gen3-may',
    name: 'May',
    generation: 3,
    game: 'Ruby / Sapphire',
    assetPath: 'gen3/gen3-may.png',
  },
  {
    id: 'gen3-leaf',
    name: 'Leaf',
    generation: 3,
    game: 'FireRed / LeafGreen',
    assetPath: 'gen3/gen3-leaf.png',
  },

  // Generation IV: Diamond / Pearl, Platinum, HeartGold / SoulSilver.
  {
    id: 'gen4-lucas',
    name: 'Lucas',
    generation: 4,
    game: 'Diamond / Pearl',
    assetPath: 'gen4/gen4-lucas.png',
  },
  {
    id: 'gen4-dawn',
    name: 'Dawn',
    generation: 4,
    game: 'Diamond / Pearl',
    assetPath: 'gen4/gen4-dawn.png',
  },
  {
    id: 'gen4-lyra',
    name: 'Lyra',
    generation: 4,
    game: 'HeartGold / SoulSilver',
    assetPath: 'gen4/gen4-lyra.png',
  },
];

const SPRITES_BY_ID: Readonly<Record<string, TrainerSprite>> = (() => {
  const map: Record<string, TrainerSprite> = {};
  for (const sprite of TRAINER_SPRITES) {
    map[sprite.id] = sprite;
  }
  return map;
})();

/** The sprite for a given id, or `undefined` for `null`/unknown/removed ids. */
export function getTrainerSprite(
  id: string | null | undefined,
): TrainerSprite | undefined {
  if (!id) {
    return undefined;
  }
  return SPRITES_BY_ID[id];
}

/** Every sprite in one generation, in catalog order. */
export function getTrainerSpritesByGeneration(
  generation: TrainerGeneration,
): TrainerSprite[] {
  return TRAINER_SPRITES.filter((sprite) => sprite.generation === generation);
}
