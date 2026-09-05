/**
 * The reaction event model: what a coding event becomes for the Pokémon
 * world to react to.
 *
 * Pure: no `vscode`, no DOM. Raised on the extension host (`reaction-service.ts`)
 * and consumed in the webview (`panel/reaction-controller.ts`), the same split
 * `progression-types.ts` uses for XP events - so this file is compiled under
 * every `lib` set in the project and must stay free of both APIs.
 *
 * Deliberately does not cover idle, sleep or wake: this system reacts only to
 * explicit, meaningful developer events.
 */

/** The visual reaction a Pokémon plays. */
export type PokemonReactionType =
  | 'notice'
  | 'celebrate'
  | 'confused'
  | 'level-up';

/** What triggered the reaction. */
export type PokemonReactionSource =
  | 'meaningful-save'
  | 'git-commit'
  | 'task-failure'
  | 'pokemon-level-up'
  | 'dev-action';

export interface PokemonReactionEvent {
  type: PokemonReactionType;
  /**
   * Nickname of the Pokémon this reaction targets - the instance identity
   * used throughout progression (`PokemonCollection.locate`, partner
   * resolution). Always resolved fresh by the caller at the moment the event
   * fires, never cached, so a partner switch takes effect on the very next
   * reaction.
   */
  pokemonId: string;
  source: PokemonReactionSource;
  /** Epoch milliseconds. */
  timestamp: number;
  /**
   * Whether one other currently-visible, non-target Pokémon may also play a
   * (lighter) version of this reaction. Only ever set for `git-commit`; kept
   * uncommon by `BYSTANDER_REACTION_CHANCE`.
   */
  allowBystander?: boolean;
}

/** One reaction queued or playing for a single Pokémon in the world. */
export interface PokemonReactionQueueItem {
  pokemonId: string;
  type: PokemonReactionType;
  /** True for the one-in-a-while non-partner participant on a commit. */
  bystander?: boolean;
}
