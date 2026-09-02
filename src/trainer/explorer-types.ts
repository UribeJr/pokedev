/**
 * View models for the compact Explorer surfaces.
 *
 * Imported by BOTH the extension host and the Explorer webview bundle, so this
 * module must stay free of `vscode` imports and DOM references — the same
 * constraint `trainer-types.ts` documents.
 *
 * These are deliberately NOT the full `TrainerCardViewModel`. The Explorer
 * sidebar is a glanceable HUD at 220px, not a shrunken Trainer Card: sending
 * the whole card model would invite the webview to render fields it has no
 * room for, and would couple a compact view to every future card change.
 */

/** Explorer view ids, also used as the `when` clauses' view names. */
export const TRAINER_EXPLORER_VIEW_TYPE = 'pokedev.trainerView';
export const POKEMON_EXPLORER_VIEW_TYPE = 'pokedev.pokemonView';

/* ------------------------------------------------------------------ *
 * Trainer HUD
 * ------------------------------------------------------------------ */

export interface ExplorerPartnerView {
  /** Localized species name. */
  species: string;
  /** Empty when the Pokemon has never been renamed off its species. */
  nickname: string;
  spriteUri: string;
  shiny: boolean;
  level: number;
  currentXp: number;
  /** 0 at the level cap, where there is nothing left to fill toward. */
  xpForNextLevel: number;
}

export interface ExplorerTrainerViewModel {
  /**
   * Whether a GitHub account has been connected yet. When false the view shows
   * a single prompt rather than an identity block full of blanks.
   */
  connected: boolean;
  displayName: string;
  login: string;
  /** Empty when GitHub has never been fetched; the view falls back to a ball. */
  avatarUrl: string;
  trainerLevel: number;
  /** Experience within the current level. */
  trainerXp: number;
  /** Experience required to advance; 0 at the level cap. */
  xpForNextLevel: number;
  totalCodingTimeMs: number;
  partner?: ExplorerPartnerView;
  labels: ExplorerLabels;
}

/* ------------------------------------------------------------------ *
 * Team list
 * ------------------------------------------------------------------ */

export interface ExplorerPokemonEntry {
  /** The instance identity: nickname is how this extension keys a Pokemon. */
  nickname: string;
  species: string;
  spriteUri: string;
  shiny: boolean;
  level: number;
  currentXp: number;
  xpForNextLevel: number;
  isPartner: boolean;
}

export interface ExplorerPokemonViewModel {
  pokemon: ExplorerPokemonEntry[];
  /** Whether non-partner active party Pokemon additionally earn shared XP. */
  expShareEnabled: boolean;
  labels: ExplorerLabels;
}

/* ------------------------------------------------------------------ *
 * Labels
 * ------------------------------------------------------------------ */

/**
 * Every string the Explorer webviews render.
 *
 * The webview has no access to `vscode.l10n`, so labels are localized on the
 * host and shipped inside the view model — the same approach the full card
 * uses.
 */
export interface ExplorerLabels {
  trainerWord: string;
  levelLabel: string;
  xpLabel: string;
  codingTimeLabel: string;
  partnerLabel: string;
  noPartnerLabel: string;
  noPokemonLabel: string;
  connectPrompt: string;
  connectButton: string;
  openFullCardButton: string;
  refreshButton: string;
  changePartnerButton: string;
  /** Tooltip on a non-partner row explaining what selecting it does. */
  makePartnerHint: string;
  partnerBadge: string;
  shinyLabel: string;
  /** "EXP SHARE" - the compact toggle heading above the team list. */
  expShareLabel: string;
  expShareOnLabel: string;
  expShareOffLabel: string;
  /** Tooltip on the EXP Share toggle. */
  expShareTooltip: string;
}

/* ------------------------------------------------------------------ *
 * Message protocol
 * ------------------------------------------------------------------ */

export type ExplorerHostboundMessage =
  | { command: 'explorer/ready' }
  | { command: 'explorer/openFullCard' }
  | { command: 'explorer/refresh' }
  | { command: 'explorer/changePartner' }
  | { command: 'explorer/connect' }
  /** Sent when a row in the team list is chosen. */
  | { command: 'explorer/selectPartner'; nickname: string }
  /** Sent when the EXP Share toggle in the team list is activated. */
  | { command: 'explorer/toggleExpShare' };

export type ExplorerWebviewboundMessage =
  | { command: 'explorer/trainerState'; payload: ExplorerTrainerViewModel }
  | { command: 'explorer/pokemonState'; payload: ExplorerPokemonViewModel };
