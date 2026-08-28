/**
 * Shared Trainer Card types.
 *
 * This module is imported by BOTH the extension host and the webview bundle,
 * so it must stay free of `vscode` imports and DOM references. It is compiled
 * under four different `lib` sets (see tsconfig.*.json), so keep it to plain
 * interfaces and string literal unions.
 */

/** Webview panel view type, also used as the serializer key. */
export const TRAINER_CARD_VIEW_TYPE = 'pokemonTrainerCard';

/** Number of badge slots on the card. Mirrors the eight-gym convention. */
export const TRAINER_BADGE_SLOTS = 8;

/* ------------------------------------------------------------------ *
 * Game-side progression (persisted; never derived from GitHub)
 * ------------------------------------------------------------------ */

export interface TrainerBadge {
  /** Stable identifier. Labels and art live in code, keyed by this id, so
   *  they can be changed later without a data migration. */
  id: string;
  /** Epoch milliseconds. */
  earnedAt: number;
}

export interface TrainerAchievement {
  id: string;
  /** Epoch milliseconds. */
  unlockedAt: number;
}

export interface TrainerProfile {
  /** Schema version, so `normalizeTrainerProfile` has something to branch on. */
  version: 2;
  githubUsername: string;

  /**
   * The source of truth for trainer progression: every point ever earned.
   *
   * `trainerLevel` and `trainerXp` below are DERIVED from this and persisted
   * only so the card can render without recomputing. `normalizeTrainerProfile`
   * recomputes both on every read, so a hand-edited level cannot drift out of
   * agreement with the XP that justifies it.
   */
  totalTrainerXp: number;

  /** Derived from `totalTrainerXp`. Do not assign directly. */
  trainerLevel: number;
  /** Derived. Experience accumulated *within* the current level. */
  trainerXp: number;

  pokemonCaught: number;
  shinyPokemonCaught: number;

  badges: TrainerBadge[];
  achievements: TrainerAchievement[];

  totalCodingTimeMs: number;

  /** Epoch milliseconds. Must survive every normalize pass. */
  createdAt: number;
}

/** Card face colour, following the in-game progression. */
export type TrainerCardTier = 'base' | 'copper' | 'silver' | 'gold';

/** Trainer class identifiers. Localized labels are resolved on the host. */
export type TrainerClassId =
  | 'frontend'
  | 'research'
  | 'systems'
  | 'fullstack'
  | 'novice';

/* ------------------------------------------------------------------ *
 * GitHub identity (fetched, cached, trimmed)
 * ------------------------------------------------------------------ */

export interface LanguageCount {
  language: string;
  repoCount: number;
}

/**
 * The only GitHub fields that are displayed, and therefore the only ones
 * written to the cache.
 */
export interface GithubProfileView {
  /** Numeric account id, shown as the card's ID No. */
  id: number;
  /** Canonical login as GitHub reports it, not as the user typed it. */
  login: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  location: string;
  profileUrl: string;
  publicRepos: number;
  followers: number;
  following: number;
  /** ISO 8601 account creation timestamp. */
  joinedAt: string;
  /** null when the repository request was skipped or failed. */
  totalStars: number | null;
  /** Empty when unknown. Deterministically ordered. */
  topLanguages: LanguageCount[];
  /** How many repositories the derived stats were computed from. */
  sampledRepos: number;
  /** True when the repository list was truncated at one page. */
  sampleTruncated: boolean;
}

export interface GithubProfileCache {
  version: 1;
  /** Always lowercased; GitHub logins are case-insensitive. */
  username: string;
  /** Epoch milliseconds. */
  fetchedAt: number;
  data: GithubProfileView;
}

/* ------------------------------------------------------------------ *
 * View model
 * ------------------------------------------------------------------ */

export type TrainerCardStatus =
  | 'onboarding'
  | 'loading'
  | 'connected'
  | 'error';

export type TrainerErrorKind =
  | 'invalid-username'
  | 'not-found'
  | 'rate-limited'
  | 'offline'
  | 'malformed'
  | 'unsupported-runtime'
  | 'unknown';

export interface TrainerError {
  kind: TrainerErrorKind;
  /** Already localized on the host; safe to render via textContent. */
  message: string;
  /** Epoch milliseconds; rate-limit only. */
  retryAt?: number;
  retryable: boolean;
}

export interface PartnerPokemonView {
  species: string;
  nickname: string;
  spriteUri: string;
  shiny: boolean;
  /** Partner progression. Present for every resolvable partner. */
  level: number;
  /** Experience within the current level. */
  currentXp: number;
  /** Experience required to advance from `level`; 0 at the level cap. */
  xpForNextLevel: number;
}

/**
 * Every string the webview renders. The webview has no access to
 * `vscode.l10n`, so labels are localized on the host and shipped across.
 */
export interface TrainerCardLabels {
  /** Subtle brand mark in the card header. */
  brandLabel: string;
  cardTitle: string;
  idLabel: string;
  /** Small word above the level number on the level plate. */
  trainerWord: string;
  levelLabel: string;
  /** Section heading for the GitHub-derived stats. */
  devRecordLabel: string;
  reposLabel: string;
  followersLabel: string;
  followingLabel: string;
  starsLabel: string;
  sinceLabel: string;
  /** Section heading for the language breakdown. */
  specialtiesLabel: string;
  /** Section heading for the game-side stats. */
  trainerRecordLabel: string;
  pokedexLabel: string;
  caughtSuffix: string;
  shiniesLabel: string;
  badgesLabel: string;
  codingTimeLabel: string;
  xpLabel: string;
  partnerLabel: string;
  /** Empty state when the Pokemon collection has no usable entry. */
  noPartnerLabel: string;
  /** Short level prefix on the partner plate, e.g. "Lv." */
  partnerLevelLabel: string;
  /** Accessible name for the partner's experience bar. */
  partnerXpLabel: string;
  /** Footer action: pick which Pokemon is the partner. */
  changePartnerButton: string;
  /** Short form shown on the footer button itself. */
  changePartnerShort: string;
  /** Footer action when the DEV RECORD block is currently visible. */
  hideDevRecordButton: string;
  /** Footer action when it is currently hidden. */
  showDevRecordButton: string;
  trainerClass: string;
  createTrainerHeading: string;
  connectHint: string;
  usernamePlaceholder: string;
  createTrainerButton: string;
  /** Short footer text; the long form is used as the accessible name. */
  refreshShort: string;
  refreshButton: string;
  /** Short footer text; the long form is used as the accessible name. */
  changeTrainerShort: string;
  changeUsernameButton: string;
  closeButton: string;
  retryButton: string;
  /** Visible heading in the loading status box. */
  loadingHeading: string;
  /** Screen-reader announcement while loading. */
  loadingLabel: string;
  /** Visible heading in the error status box. */
  errorHeading: string;
  invalidUsernameHint: string;
  staleNotice: string;
  truncatedNotice: string;
  languageDerivationNotice: string;
  unknownValue: string;
}

export interface TrainerCardViewModel {
  status: TrainerCardStatus;
  labels: TrainerCardLabels;
  /** Always present, even while onboarding, so the card can render level/XP. */
  profile: TrainerProfile;
  tier: TrainerCardTier;
  /** XP required to advance from the profile's current level. */
  xpForNextLevel: number;
  /**
   * Whether to render the GitHub-derived DEV RECORD block.
   *
   * A preference, not a consequence of missing data: someone may simply not
   * want their public GitHub stats on screen while sharing it, even though the
   * profile loaded fine. The data is still fetched and cached either way.
   */
  showDevRecord: boolean;
  github?: GithubProfileView;
  partner?: PartnerPokemonView;
  /** May accompany status 'connected' when a refresh failed over live cache. */
  error?: TrainerError;
  /** True when `github` is served from an expired cache. */
  stale?: boolean;
  /** Epoch milliseconds the cached GitHub data was fetched. */
  fetchedAt?: number;
}

/* ------------------------------------------------------------------ *
 * Message protocol
 * ------------------------------------------------------------------ */

export type TrainerHostboundMessage =
  | { command: 'trainer/ready' }
  | { command: 'trainer/connect'; username: string }
  | { command: 'trainer/refresh' }
  | { command: 'trainer/changeUsername' }
  | { command: 'trainer/changePartner' }
  | { command: 'trainer/toggleDevRecord' }
  | { command: 'trainer/close' };

export type TrainerWebviewboundMessage = {
  command: 'trainer/state';
  payload: TrainerCardViewModel;
};
