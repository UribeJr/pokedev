/**
 * Shared Trainer Card types.
 *
 * This module is imported by BOTH the extension host and the webview bundle,
 * so it must stay free of `vscode` imports and DOM references. It is compiled
 * under four different `lib` sets (see tsconfig.*.json), so keep it to plain
 * interfaces and string literal unions.
 */
import { DevBadge } from './dev-badge-parse';
import { ExplorerPokemonEntry } from './explorer-types';
import { TrainerGeneration } from './trainer-sprite-catalog';
import { FriendshipTierId } from '../progression/friendship-rules';

/** Webview panel view type, also used as the serializer key. */
export const TRAINER_CARD_VIEW_TYPE = 'pokedevTrainerCard';

/**
 * Denominator for the compact Explorer HUD's "BADGES n / 8" row. Mirrors the
 * eight-gym-badge convention; Dev Badges are PokéDev's equivalent. The full
 * Trainer Card's BADGES section shows every earned badge with no such cap or
 * count — see `renderBadges` in `panel/trainer-card/main.ts`.
 */
export const DEV_BADGE_SLOTS = 8;

/** Party slots on the Trainer Card, in classic Pokémon-party fashion. */
export const PARTY_SLOTS = 6;

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

  /**
   * Lifetime count of successful evolutions, shown on the Trainer Record.
   *
   * Added after evolution itself already shipped, so every profile written
   * before this field existed simply has none — `normalizeTrainerProfile`
   * defaults it to 0 rather than attempting to reconstruct history that was
   * never recorded.
   */
  totalEvolutions: number;

  totalCodingTimeMs: number;

  /**
   * The chosen Trainer Sprite id (see `trainer-sprite-catalog.ts`), or `null`
   * to use the GitHub avatar instead.
   *
   * `null` is also what every profile written before this field existed
   * normalizes to - see `normalizeTrainerProfile` - so existing users keep
   * seeing their GitHub avatar until they explicitly pick a sprite. Never an
   * empty string: absence is always represented as `null`.
   */
  trainerSpriteId: string | null;

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
 * DEV Community badges (fetched, cached, trimmed)
 *
 * A third, independent identity source alongside GitHub (developer identity)
 * and Trainer progression (in-editor activity): externally earned public DEV
 * badges. Deliberately kept separate from `GithubProfileView` end to end —
 * separate setting, separate cache, separate section on the card.
 * ------------------------------------------------------------------ */

export type DevBadgeStatus = 'disconnected' | 'loading' | 'connected' | 'error';

export type DevBadgeErrorKind =
  | 'invalid-username'
  | 'not-found'
  | 'rate-limited'
  | 'offline'
  | 'malformed'
  | 'unsupported-runtime'
  | 'unknown';

export interface DevBadgeError {
  kind: DevBadgeErrorKind;
  /** Already localized on the host; safe to render via textContent. */
  message: string;
  retryable: boolean;
}

export interface DevBadgesView {
  status: DevBadgeStatus;
  /** The configured DEV username, '' while disconnected. */
  username: string;
  /** Always present, in the order DEV's own profile page shows them. */
  badges: DevBadge[];
  error?: DevBadgeError;
  /** True when `badges` is served from an expired cache after a failed refresh. */
  stale?: boolean;
  /** Epoch milliseconds the cached badge data was fetched. */
  fetchedAt?: number;
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

/**
 * One selectable Trainer Sprite, resolved for display: a `TrainerSprite`
 * (see `trainer-sprite-catalog.ts`) plus its webview-safe image URI. Built
 * host-side (only the host can call `webview.asWebviewUri`); the webview
 * never resolves `assetPath` itself.
 */
export interface TrainerSpriteOption {
  id: string;
  name: string;
  generation: TrainerGeneration;
  game: string;
  spriteUri: string;
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
  /** 0-255, see `progression/friendship-rules.ts`. */
  friendship: number;
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
  /** Section heading for the Coding Time row, when the setting shows it. */
  codingTimeLabel: string;
  xpLabel: string;
  /** Section heading for the party grid. */
  partySectionLabel: string;
  /** Shown in a party slot with no Pokemon in it. */
  emptyPartySlotLabel: string;
  /** Tooltip/accessible-name fragment on a non-partner party slot. */
  makePartnerHint: string;
  partnerLabel: string;
  /** Empty state when the Pokemon collection has no usable entry. */
  noPartnerLabel: string;
  /** Short level prefix on the partner plate, e.g. "Lv." */
  partnerLevelLabel: string;
  /** Accessible name for the partner's experience bar. */
  partnerXpLabel: string;
  /** Footer action: pick which Pokemon is the partner. Only shown when the
   *  party grid does not already make every Pokemon clickable - see
   *  `TrainerCardViewModel.totalPartnerCandidates`. */
  changePartnerButton: string;
  /** Short form shown on the footer button itself. */
  changePartnerShort: string;
  /** Footer action when the DEV RECORD block is currently visible. */
  hideDevRecordButton: string;
  /** Footer action when it is currently hidden. */
  showDevRecordButton: string;
  /** Footer action: open the Trainer Sprite picker. */
  chooseTrainerButton: string;
  /** Short form shown on the footer button itself. */
  chooseTrainerShort: string;
  /** Heading inside the Trainer Sprite picker overlay. */
  trainerSpriteSelectorHeading: string;
  /** Confirms the previewed sprite and closes the picker. */
  useThisTrainerButton: string;
  /** Closes the picker without changing the selection. */
  cancelButton: string;
  /** Clears `trainerSpriteId` back to the GitHub avatar. */
  useGithubAvatarButton: string;
  /** Badge on the currently-selected sprite tile in the picker. */
  selectedTrainerLabel: string;
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

  /** Section heading for the earned Dev Badge artwork. */
  badgesSectionLabel: string;
  connectDevHint: string;
  connectDevButton: string;
  /** Footer-style action; long form is the accessible name. */
  refreshDevBadgesShort: string;
  refreshDevBadgesButton: string;
  disconnectDevButton: string;
  /** Accessible label for an earned Dev Badge with no name/description. */
  unknownDevBadgeLabel: string;
  /** Shown once connected with nothing earned yet. */
  noDevBadgesLabel: string;
  devBadgesStaleNotice: string;
  /** Tooltip on a shiny party member's star. */
  shinyLabel: string;
  /** Localized Friendship tier names, keyed by tier id - used as the
   * accessible label/tooltip on the partner's heart meter. Shares its five
   * strings with the in-world tier-up toast (`friendshipTierDisplayName` in
   * `progression-service.ts`) so the wording never drifts between them. */
  friendshipTierLabels: Record<FriendshipTierId, string>;
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
  /**
   * Whether to render Coding Time on the Trainer Record.
   *
   * Off by default: Coding Time is still tracked and banked either way (see
   * `ProgressionService.addCodingTime`/`flush`) - this only controls whether
   * the card shows it.
   */
  showCodingTime: boolean;
  /**
   * The current party, up to `PARTY_SLOTS`, in the collection's own stored
   * order - literally the same instances and the same `isPartner` flag as the
   * Explorer Pokemon view (see `PokedevState.buildPartyEntries`), so the two
   * surfaces can never disagree about who is on the team or who the partner
   * is.
   */
  party: ExplorerPokemonEntry[];
  /**
   * How many Pokemon actually exist in the collection - which may exceed
   * `party.length` when there are more than `PARTY_SLOTS`. The footer's
   * Change Partner button is only worth keeping when it can reach a Pokemon
   * the party grid itself cannot.
   */
  totalPartnerCandidates: number;
  /**
   * The resolved image for the selected Trainer Sprite, already converted to
   * a webview URI - `undefined` when `profile.trainerSpriteId` is `null` or
   * no longer resolves in the catalog, in which case the card falls back to
   * `github.avatarUrl`.
   */
  trainerSpriteUri?: string;
  /**
   * The full picker catalog, every entry already resolved to a webview URI.
   * Small and static enough to resend on every render rather than plumb a
   * separate "did the catalog change" message.
   */
  trainerSpriteCatalog: TrainerSpriteOption[];
  github?: GithubProfileView;
  partner?: PartnerPokemonView;
  /** May accompany status 'connected' when a refresh failed over live cache. */
  error?: TrainerError;
  /** True when `github` is served from an expired cache. */
  stale?: boolean;
  /** Epoch milliseconds the cached GitHub data was fetched. */
  fetchedAt?: number;

  /**
   * Independent of `status` above: DEV badges load and render regardless of
   * whether the GitHub-derived trainer identity is connected, loading, or
   * erroring out.
   */
  devBadges: DevBadgesView;
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
  // Sent when a PARTY slot is clicked. Goes straight to the same
  // setPartnerNickname/notify path 'trainer/changePartner' uses via the
  // QuickPick - this just already knows which nickname was chosen.
  | { command: 'trainer/selectPartner'; nickname: string }
  | { command: 'trainer/toggleDevRecord' }
  // The picker overlay is entirely client-side (it only ever reflects data
  // already present in the last view model), so only the final decision
  // travels back to the host - a chosen sprite id, or a reset to null.
  | { command: 'trainer/selectTrainerSprite'; spriteId: string }
  | { command: 'trainer/useGithubAvatar' }
  | { command: 'trainer/close' }
  // DEV badges are configured/refreshed/cleared independently of GitHub —
  // the host prompts for the username via its own input box, the same way
  // 'trainer/changeUsername' does, so no username travels in this message.
  | { command: 'trainer/connectDev' }
  | { command: 'trainer/refreshDev' }
  | { command: 'trainer/disconnectDev' };

export type TrainerWebviewboundMessage = {
  command: 'trainer/state';
  payload: TrainerCardViewModel;
};
