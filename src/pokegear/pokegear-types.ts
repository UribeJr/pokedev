/**
 * Shared PokeGear types.
 *
 * PokeGear is a NEW PRESENTATION LAYER ONLY - a Gen II "utility/status" panel
 * that reads the exact same underlying state the Trainer Card, Explorer
 * views, Daily Challenges and Dev Badges already expose. Nothing here
 * duplicates a calculation or a persisted record; every field is either
 * copied verbatim from an existing view-model type (`ExplorerPartnerView`,
 * `ExplorerPokemonEntry`, `DevBadgesView`) or derived read-only from the
 * existing progression log (`ProgressionEvent`) - see
 * `src/extension/pokegear-panel.ts`'s `buildPokeGearViewModel` for exactly
 * where each field comes from.
 *
 * This module is imported by BOTH the extension host and the PokeGear
 * webview bundle, so - like `trainer-types.ts`/`explorer-types.ts` - it must
 * stay free of `vscode` imports and DOM references.
 *
 * Visual style: PokeGear always renders with the Crystal skin's tokens/
 * components in V1, regardless of the Trainer Card's own selected
 * `pokedev.trainerCard.style` - "PokeGear is its own game interface" per
 * this milestone's own instruction - so there is no `style` field on
 * `PokeGearViewModel` to read; `panel/pokegear/main.ts` applies
 * `tc-skin-crystal` unconditionally the same way `skinClassName` does
 * elsewhere.
 */
import { DevBadgesView } from '../trainer/trainer-types';
import {
  ExplorerPartnerView,
  ExplorerPokemonEntry,
} from '../trainer/explorer-types';
import { ProgressionEventType } from '../progression/progression-types';

/** Webview panel view type, also used as the serializer key. */
export const POKEGEAR_VIEW_TYPE = 'pokedevPokeGear';

export type PokeGearTab = 'status' | 'activity' | 'badges' | 'party';

/** In display order - also the order tab navigation cycles through. */
export const POKEGEAR_TABS: readonly PokeGearTab[] = [
  'status',
  'activity',
  'badges',
  'party',
];

/* ------------------------------------------------------------------ *
 * STATUS tab
 * ------------------------------------------------------------------ */

export interface PokeGearStatusView {
  connected: boolean;
  trainerName: string;
  trainerLevel: number;
  trainerXp: number;
  /** 0 at the level cap, where there is nothing left to fill toward. */
  xpForNextLevel: number;
  totalCodingTimeMs: number;
  /** Same instance/shape the compact Explorer HUD already shows. */
  partner?: ExplorerPartnerView;
  dailyCompletedCount: number;
  dailyTotalCount: number;
  /** Earned Dev Badges - see `DevBadgesView.badges.length`; 0 while
   * disconnected/loading/erroring, exactly like the Trainer Card. */
  devBadgesEarned: number;
}

/* ------------------------------------------------------------------ *
 * ACTIVITY tab
 * ------------------------------------------------------------------ */

/**
 * One entry from the existing progression log
 * (`src/extension/progression-storage.ts`'s `readProgressionLog`) - the
 * SAME bounded (`MAX_LOGGED_EVENTS`), globally-persisted log every XP event
 * already writes to. PokeGear adds no new storage for this tab; it only
 * reads this log and additionally appends three purely OBSERVATIONAL event
 * types to it (`pokemon-level-up`/`pokemon-evolved`/
 * `daily-challenge-complete` - see `ProgressionEventType`'s own doc
 * comment) at the exact points those already happen.
 */
export interface PokeGearActivityEntry {
  type: ProgressionEventType;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface PokeGearActivityTodayStats {
  /** 'git-commit' events since local midnight. */
  commits: number;
  /** 'build-success'|'test-success'|'typecheck-success'|'lint-success'
   * events since local midnight - the Dev Actions group. */
  devActions: number;
  dailyCompletedCount: number;
  dailyTotalCount: number;
}

export interface PokeGearActivityView {
  today: PokeGearActivityTodayStats;
  /**
   * Newest first, capped the same way the log itself is - see
   * `POKEGEAR_ACTIVITY_FEED_LIMIT`. Never raw terminal output, file
   * contents or commit messages; only the semantic `ProgressionEventType`
   * plus small display metadata.
   */
  recent: PokeGearActivityEntry[];
}

/** How many recent entries the ACTIVITY feed shows - a display cap, smaller
 * than the log's own `MAX_LOGGED_EVENTS`, so the feed stays a glance rather
 * than a full history dump. */
export const POKEGEAR_ACTIVITY_FEED_LIMIT = 20;

/* ------------------------------------------------------------------ *
 * BADGES tab
 * ------------------------------------------------------------------ */

/**
 * The exact same DEV Community badge data the Trainer Card's BADGES section
 * already shows - real earned badges (name/image/description), scraped
 * from the user's public DEV profile. DEV's public page exposes no
 * earned-date and no catalog of unearned badges (see the licensing/data
 * note in `src/trainer/dev-badge-parse.ts`), so PokeGear does not invent a
 * locked/secret badge grid - see this project's own explicit rule against
 * inventing data that was never supplied.
 */
export interface PokeGearBadgesView {
  devBadges: DevBadgesView;
}

/* ------------------------------------------------------------------ *
 * PARTY tab
 * ------------------------------------------------------------------ */

export interface PokeGearPartyView {
  /** Same instances, same order, as the Trainer Card's PARTY section and
   * the Explorer team list - up to `PARTY_SLOTS`. */
  party: ExplorerPokemonEntry[];
  /** How many Pokemon actually exist in the collection - which may exceed
   * `party.length`; mirrors the Trainer Card's own `totalPartnerCandidates`
   * gate for offering a partner change beyond what's visible here. */
  totalPartnerCandidates: number;
}

/* ------------------------------------------------------------------ *
 * Whole-panel view model
 * ------------------------------------------------------------------ */

export interface PokeGearLabels {
  panelTitle: string;
  tabStatus: string;
  tabActivity: string;
  tabParty: string;
  tabBadges: string;
  trainerLabel: string;
  levelLabel: string;
  xpLabel: string;
  codingTimeLabel: string;
  partnerLabel: string;
  noPartnerLabel: string;
  dailyLabel: string;
  badgesLabel: string;
  badgesEarnedLabel: string;
  todayLabel: string;
  commitsLabel: string;
  devActionsLabel: string;
  recentActivityLabel: string;
  noActivityLabel: string;
  noDevBadgesLabel: string;
  connectDevHint: string;
  makePartnerButton: string;
  openTrainerCardButton: string;
  closeButton: string;
  refreshButton: string;
  shinyLabel: string;
  unknownValue: string;
}

export interface PokeGearViewModel {
  /** Restored from persisted UI state on first load - see
   * `pokedev.pokeGear.lastTab` in `trainer-card-style-config.ts`-style
   * getter in `pokegear-panel.ts`. Purely a convenience; the webview is
   * free to switch tabs client-side without a host round trip afterward. */
  activeTab: PokeGearTab;
  labels: PokeGearLabels;
  status: PokeGearStatusView;
  activity: PokeGearActivityView;
  badges: PokeGearBadgesView;
  party: PokeGearPartyView;
}

/* ------------------------------------------------------------------ *
 * Message protocol
 * ------------------------------------------------------------------ */

export type PokeGearHostboundMessage =
  | { command: 'pokegear/ready' }
  | { command: 'pokegear/setActiveTab'; tab: PokeGearTab }
  | { command: 'pokegear/openTrainerCard' }
  | { command: 'pokegear/refreshDevBadges' }
  | { command: 'pokegear/selectPartner'; nickname: string }
  | { command: 'pokegear/close' };

export type PokeGearWebviewboundMessage = {
  command: 'pokegear/state';
  payload: PokeGearViewModel;
};
