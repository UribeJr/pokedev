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
 *
 * NOTE ON THE `vscode-pokemon.` PREFIX
 * ------------------------------------
 * Every user-facing identifier was renamed to `pokedev.` when this fork took
 * its own identity, but these storage keys deliberately were not. They are
 * invisible to users - nobody types them - and renaming them would orphan
 * every existing collection, trainer profile and progression record behind a
 * key nothing reads any more. There is no benefit to weigh against that.
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

/**
 * Daily Challenges.
 *
 * A genuinely new feature added long after the `vscode-pokemon.` -> `pokedev.`
 * rename, so - unlike everything above - it uses the current prefix: there is
 * no legacy install anywhere to orphan by doing so.
 *
 * Both live in `globalState`, matching every other progression key: today's
 * challenges are a property of the Trainer, not of whichever workspace
 * happens to be open (the Git challenge's own eligibility already accounts
 * for "no repository here" - see `daily-challenges-service.ts` - so the
 * feature does not need workspace scoping to behave correctly per project).
 */
export const DAILY_CHALLENGES_STATE_KEY = 'pokedev.dailyChallenges.state';
/** Lifetime count of completed Daily Challenges. Purely informational today -
 * nothing reads it back yet - kept for a future achievement without needing
 * a schema change when that lands. */
export const DAILY_CHALLENGES_TOTAL_COMPLETED_KEY =
  'pokedev.dailyChallenges.totalCompleted';

/**
 * Dev Actions cooldown state - the last-accepted timestamp per (action type,
 * task identity) pair, used only to stop reload farming (run a successful
 * build, reload Cursor, immediately run it again for a second reward).
 *
 * `workspaceState`, mirroring `PROGRESSION_COMMITS_KEY`: a build/test/lint/
 * typecheck task belongs to the workspace whose tasks.json (or auto-detected
 * npm scripts) defined it, not to the user globally. Never stores a command
 * string, terminal output, or anything beyond the bounded key -> timestamp
 * map itself - see `dev-action-rules.ts`.
 */
export const DEV_ACTION_COOLDOWNS_KEY = 'pokedev.devActions.cooldowns';

/**
 * PokeGear's last-selected tab (`STATUS`/`ACTIVITY`/`BADGES`/`PARTY`/`BAG`) -
 * a cosmetic UI convenience only, restored on next open. `globalState`: which
 * tab you left on is a preference about you, not about a project. See
 * `src/extension/pokegear-panel.ts`.
 */
export const POKEGEAR_LAST_TAB_KEY = 'pokedev.pokeGear.lastTab';

/**
 * The Bag: item quantities (evolution stones in V1) - a genuinely new
 * feature, like Daily Challenges, so it uses the current `pokedev.` prefix
 * directly; there is no legacy install anywhere to orphan. `globalState`,
 * not synced (see `EXTRA_POKEMON_KEY_TYPES`'s note above on the one
 * `setKeysForSync` call site): the Bag is small enough, and new enough, that
 * losing sync parity across machines is an acceptable V1 tradeoff, exactly
 * like every other post-collection key in this file. See
 * `src/extension/inventory-storage.ts`.
 */
export const INVENTORY_KEY = 'pokedev.inventory';

/**
 * IDs of one-time item rewards (currently only Trainer-level milestone
 * stones) already claimed, so a reward already granted once is never granted
 * again - see `src/extension/item-rewards.ts`.
 */
export const CLAIMED_ITEM_REWARDS_KEY = 'pokedev.claimedItemRewards';
