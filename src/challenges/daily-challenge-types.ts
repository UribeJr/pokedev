/**
 * The Daily Challenges data model.
 *
 * Pure: no `vscode`, no DOM, no `Date.now()`. Every function that touches this
 * module is handed "now"/context explicitly, so generation and progress are
 * unit-testable and safe to import from the Explorer webview bundle - the same
 * constraint `progression-types.ts` documents for the rest of progression.
 *
 * A challenge's catalog definition (`DailyChallengeDefinition`) describes what
 * is POSSIBLE; a `DailyChallengeInstance` is what today actually rolled, with
 * its tier already resolved and baked in. Keeping the instance self-contained
 * (title, description, target, reward all copied at generation time) means a
 * later catalog edit - or even removing a definition entirely - can never
 * change what a user already sees today, and a persisted instance never needs
 * to look its definition back up to render.
 */
import { DevActionCapabilities } from '../progression/dev-action-types';

/** The three families of coding activity a challenge can reward, plus a grab
 * bag for anything that does not fit the other three. */
export type ChallengeCategory = 'coding' | 'git' | 'training' | 'wildcard';

/**
 * Which Dev Action capability, if any, a definition needs to be worth
 * offering. `'clean'` means "lint or typecheck", matching the "Clean Check"
 * challenge; `'any'` means "at least one of the four".
 */
export type DevActionRequirement =
  | 'build'
  | 'test'
  | 'lint'
  | 'typecheck'
  | 'clean'
  | 'any';

/**
 * What a challenge instance's progress is actually driven by.
 *
 * This is the routing key `daily-challenge-progress.ts` switches on - it is
 * NOT the same enum as `ProgressionEventType`, because several of these need
 * finer detail than one activity event carries (which file changed, which
 * Pokemon received XP, whether it was the partner). The extension-host glue
 * (`daily-challenges-service.ts`) is what translates real progression events
 * into the signals this module understands.
 */
export type DailyChallengeEventType =
  | 'meaningful-saves'
  | 'distinct-files'
  | 'active-coding-minutes'
  | 'git-commit'
  | 'partner-xp'
  | 'distinct-pokemon-xp'
  | 'underdog-xp'
  | 'pokemon-level-up'
  | 'task-success'
  | 'trainer-xp-total'
  // Dev Actions - each maps 1:1 to the identically-named
  // `ProgressionEventType`/`DevActionType`, translated by
  // `daily-challenges-service.ts` exactly like every other signal here.
  | 'build-success'
  | 'test-success'
  | 'typecheck-success'
  | 'lint-success'
  /** Either a lint OR a typecheck success - "Clean Check". */
  | 'dev-action-clean'
  /** Any of the four Dev Actions - "Ship Shape". */
  | 'dev-action-any';

/** One difficulty rung of a challenge, gated by Trainer level. */
export interface ChallengeTier {
  /** The lowest Trainer level this rung is offered at. */
  minTrainerLevel: number;
  target: number;
  rewardTrainerXp: number;
  /** Overrides the definition's title/description for this rung only, so a
   * single family can read as "Warm Up" at target 5 and "In The Zone" at
   * target 10 rather than one name stretched across every difficulty. */
  title?: string;
  description?: string;
}

/**
 * A handcrafted challenge in the catalog.
 *
 * `family` groups challenges that are really the same objective at a
 * different size (three "make N commits" challenges, say) - the generator
 * never picks two challenges from the same family on the same day, which is
 * what keeps "Make 1 commit / Make 2 commits / Make 3 commits" from all
 * showing up together.
 */
export interface DailyChallengeDefinition {
  id: string;
  family: string;
  category: ChallengeCategory;
  eventType: DailyChallengeEventType;
  /** Fallback title/description when a chosen tier supplies none. */
  title: string;
  description: string;
  /** Ordered by `minTrainerLevel` ascending; the generator picks the highest
   * rung the current Trainer level actually clears. */
  tiers: readonly ChallengeTier[];
  /** Requires a workspace with at least one Git repository open. */
  requiresGit?: boolean;
  /** Requires a specific Dev Action capability - see `isDefinitionEligible`. */
  requiresDevAction?: DevActionRequirement;
  /** Relative selection weight among equally-eligible options. Defaults to 1. */
  weight?: number;
}

/** What the generator needs to know about the user's current situation. */
export interface DailyChallengeEligibilityContext {
  trainerLevel: number;
  hasGitRepo: boolean;
  /** Size of the active party - see `listPartnerCandidates`. */
  partyCount: number;
  /** Whether any Pokemon that can actually earn XP right now (the partner,
   * plus the rest of the party when EXP Share is on) is below level 10. */
  hasPokemonBelowLevel10: boolean;
  /** Which Dev Action types this workspace has evidence it can complete -
   * see `extension/dev-action-capabilities.ts`. */
  devActionCapabilities: DevActionCapabilities;
}

/** One of today's three challenges, tier already resolved. */
export interface DailyChallengeInstance {
  definitionId: string;
  family: string;
  category: ChallengeCategory;
  eventType: DailyChallengeEventType;
  title: string;
  description: string;
  target: number;
  progress: number;
  rewardTrainerXp: number;
  completed: boolean;
  /**
   * Set no earlier than the same write that sets `completed`, and always
   * before the Trainer XP grant itself is even attempted - see
   * `daily-challenges-service.ts`. That ordering is deliberate: it can very
   * rarely cost a completed challenge its reward (a crash in the instant
   * between persisting this flag and the grant call actually running), but it
   * can never award the same challenge's Trainer XP twice, which matters far
   * more.
   */
  rewardGranted: boolean;
  /**
   * Workspace-relative paths saved today, for `distinct-files` only. Bounded
   * by the same 5-file cap `activity-tracker.ts` already applies to a batch's
   * metadata - never grown past that, and never storing file contents.
   */
  uniqueFiles?: string[];
  /** Nicknames that have earned XP today, for `distinct-pokemon-xp` only. */
  uniquePokemon?: string[];
}

/** Today's persisted set. Overwritten wholesale on a calendar-day rollover -
 * see the module doc in `daily-challenge-generator.ts` for why a reroll never
 * happens mid-day. */
export interface DailyChallengeState {
  version: 1;
  /** Local calendar date, e.g. "2026-09-02". */
  dateKey: string;
  /** The exact seed used to generate this set - kept only for debugging;
   * regeneration always recomputes it rather than trusting this field. */
  seed: string;
  challenges: DailyChallengeInstance[];
}
