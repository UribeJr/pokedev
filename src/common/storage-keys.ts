/**
 * Keys under which the Pokémon collection is persisted in
 * `ExtensionContext.globalState`.
 *
 * These live here rather than in extension.ts so that other modules — such as
 * the Trainer Card's partner-Pokémon resolver — can read the collection
 * without importing extension.ts. Importing them from extension.ts would form
 * a CommonJS require cycle over top-level `const`s, which resolves to
 * `undefined` depending on module evaluation order.
 *
 * The three list keys hold index-aligned parallel arrays.
 */
export const EXTRA_POKEMON_KEY = 'vscode-pokemon.extra-pokemon';
export const EXTRA_POKEMON_KEY_TYPES = EXTRA_POKEMON_KEY + '.types';
export const EXTRA_POKEMON_KEY_COLORS = EXTRA_POKEMON_KEY + '.colors';
export const EXTRA_POKEMON_KEY_NAMES = EXTRA_POKEMON_KEY + '.names';
