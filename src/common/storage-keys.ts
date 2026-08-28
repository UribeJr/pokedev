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

/**
 * Progression state.
 *
 * Pokemon progression sits in `globalState` because the collection it belongs
 * to already does - see `storeCollectionAsMemento`. Keeping the two in the
 * same scope avoids a Pokemon existing in one place and its level in another.
 *
 * Rewarded commit hashes are the one exception: they are inherently per
 * repository, so they live in `workspaceState`.
 *
 * None of these join Settings Sync. `setKeysForSync` replaces the whole list
 * rather than adding to it, so calling it anywhere outside
 * `storeCollectionAsMemento` would silently drop the Pokemon collection from
 * sync - the same trap documented in `trainer-storage.ts`.
 */
export const PROGRESSION_POKEMON_KEY = 'vscode-pokemon.progression.pokemon';
export const PROGRESSION_LOG_KEY = 'vscode-pokemon.progression.log';
export const PROGRESSION_COMMITS_KEY = 'vscode-pokemon.progression.commits';

/**
 * The nickname of the Pokemon the user chose as their partner.
 *
 * Absent until someone picks one, in which case the partner falls back to the
 * first usable entry of the collection - which is what it always was before
 * choosing was possible, so existing users see no change.
 */
export const PROGRESSION_PARTNER_KEY = 'vscode-pokemon.progression.partner';
