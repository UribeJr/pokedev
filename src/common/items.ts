/**
 * Catalog of item definitions PokéDev's Bag can hold.
 *
 * Pure data, no `vscode` import: bundled into BOTH the extension host and the
 * PokeGear webview's client bundle, mirroring `display-skins.ts`/
 * `environments.ts`/`roaming-style.ts`'s exact split - the webview needs the
 * same names/descriptions to render the Bag without a round trip for text
 * that never changes.
 *
 * V1 scope: evolution stones only (see `evolution-data.ts`'s `item`
 * condition). `category` is its own field, not a hardcoded assumption
 * elsewhere, so a later milestone can add other categories (held items,
 * consumables, ...) without any of these entries changing shape - but no
 * other category is implemented yet; see this module's own scope notes in
 * the project's Bag milestone.
 */

export type EvolutionStoneId =
  | 'fire-stone'
  | 'water-stone'
  | 'thunder-stone'
  | 'leaf-stone'
  | 'moon-stone'
  | 'sun-stone';

export type ItemId = EvolutionStoneId;

export interface PokedevItemDefinition {
  id: ItemId;
  name: string;
  category: 'evolution-stone';
  description: string;
}

export const EVOLUTION_STONE_IDS: readonly EvolutionStoneId[] = [
  'fire-stone',
  'water-stone',
  'thunder-stone',
  'leaf-stone',
  'moon-stone',
  'sun-stone',
];

export const ITEM_DEFINITIONS: readonly PokedevItemDefinition[] = [
  {
    id: 'fire-stone',
    name: 'Fire Stone',
    category: 'evolution-stone',
    description:
      'A peculiar stone that makes certain species of Pokémon evolve. It glows with a warm, fiery orange light.',
  },
  {
    id: 'water-stone',
    name: 'Water Stone',
    category: 'evolution-stone',
    description:
      'A peculiar stone that makes certain species of Pokémon evolve. It is the deep, clear blue of a calm pool.',
  },
  {
    id: 'thunder-stone',
    name: 'Thunder Stone',
    category: 'evolution-stone',
    description:
      'A peculiar stone that makes certain species of Pokémon evolve. A faint crackle of static clings to it.',
  },
  {
    id: 'leaf-stone',
    name: 'Leaf Stone',
    category: 'evolution-stone',
    description:
      'A peculiar stone that makes certain species of Pokémon evolve. Its surface is patterned like a leaf.',
  },
  {
    id: 'moon-stone',
    name: 'Moon Stone',
    category: 'evolution-stone',
    description:
      'A peculiar stone that makes certain species of Pokémon evolve. Legend says it fell from the night sky.',
  },
  {
    id: 'sun-stone',
    name: 'Sun Stone',
    category: 'evolution-stone',
    description:
      'A peculiar stone that makes certain species of Pokémon evolve. It shines as red as the midday sun.',
  },
];

const ITEM_DEFINITIONS_BY_ID: Partial<Record<string, PokedevItemDefinition>> =
  {};
for (const definition of ITEM_DEFINITIONS) {
  ITEM_DEFINITIONS_BY_ID[definition.id] = definition;
}

export function isValidItemId(id: string | undefined): id is ItemId {
  if (!id) {
    return false;
  }
  return ITEM_DEFINITIONS_BY_ID[id] !== undefined;
}

export function getItemDefinition(
  id: string,
): PokedevItemDefinition | undefined {
  return ITEM_DEFINITIONS_BY_ID[id];
}
