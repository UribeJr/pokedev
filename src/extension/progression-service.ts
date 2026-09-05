/**
 * The only thing that writes progression.
 *
 * Every listener that observes activity - saves, the coding ticker, git
 * commits, task results, the debug commands - produces a `ProgressionEvent`
 * and hands it here. Nothing else touches `TrainerProfile` or Pokemon
 * progression. That is the whole point of the layer: throttling, capping,
 * persistence, level-up notification and the evolution check happen once, in
 * one place, instead of being re-implemented (and drifting) in five listeners.
 */
import * as vscode from 'vscode';
import {
  getAvailableEvolution,
  getEvolutionLevel,
} from '../progression/evolution-service';
import {
  addPokemonXp,
  getPokemonXpForNextLevel,
} from '../progression/pokemon-progression';
import {
  LevelUpResult,
  ProgressionEvent,
} from '../progression/progression-types';
import { appendToLog, XpLedger } from '../progression/xp-ledger';
import { XP_RULES } from '../progression/xp-rules';
import {
  distributePokemonXp,
  PokemonXpGrant,
} from '../progression/xp-distribution';
import { addTrainerXp } from '../trainer/trainer-profile';
import { promptToEvolvePartner } from './evolution-flow';
import {
  readPokemonProgress,
  readProgressionLog,
  writePokemonProgress,
  writeProgressionLog,
} from './progression-storage';
import { pokedevState } from './pokedev-state';
import { reactionHub } from './reaction-service';
import { getPokemonToastDisplayName, toastHub } from './toast-service';
import {
  isExpShareEnabled,
  listPartnerCandidates,
  PartnerIdentity,
  resolvePartnerIdentity,
} from './trainer-partner';
import { readTrainerProfile, writeTrainerProfile } from './trainer-storage';

/** How long a level-up message lingers in the status bar. */
const STATUS_MESSAGE_MS = 6000;

/** One Pokemon's share of a single applied event, for `onDidApplyProgression`
 * subscribers - currently only Daily Challenges - that need to know more than
 * "some XP was granted somewhere". */
export interface PokemonXpOutcome {
  nickname: string;
  species: string;
  isPartner: boolean;
  /** The actual amount written, which can be less than the event's base
   * award near the level cap. */
  xpGranted: number;
  /** This Pokemon's level immediately before this grant. */
  levelBefore: number;
  /** Present only when this grant crossed a level. */
  levelUp?: LevelUpResult;
}

/**
 * What one call to `applyEvent` actually did, for subscribers that need more
 * detail than `pokedevState`'s "something changed" broadcast.
 *
 * This is a read-only account of a decision `ProgressionService` already
 * made - not a second opinion. Nothing outside this file decides how much XP
 * an event is worth or who receives it; a subscriber only ever reacts to what
 * already happened.
 */
export interface ProgressionOutcome {
  event: ProgressionEvent;
  /** Trainer XP actually written; 0 if the grant was capped away to nothing. */
  trainerXpGranted: number;
  pokemonGrants: PokemonXpOutcome[];
}

/**
 * Builds an event from the rule table.
 *
 * Listeners never invent XP amounts; they name what happened and the balance
 * table decides what it is worth.
 */
export function createProgressionEvent(
  type: ProgressionEvent['type'],
  timestamp: number,
  metadata?: Record<string, unknown>,
): ProgressionEvent {
  const award = XP_RULES[type];
  return {
    type,
    trainerXp: award.trainerXp,
    pokemonXp: award.pokemonXp,
    timestamp,
    ...(metadata ? { metadata } : {}),
  };
}

export class ProgressionService {
  private readonly _ledger = new XpLedger();

  private readonly _progressionEmitter =
    new vscode.EventEmitter<ProgressionOutcome>();

  /**
   * Fires once per `applyEvent` call that actually paid something out.
   *
   * Added for Daily Challenges, but deliberately generic: it is a plain
   * record of what this service just did, so any future consumer (an
   * achievement, an activity feed) can subscribe without this file needing to
   * know it exists, exactly like `pokedevState.onDidChange`.
   */
  public readonly onDidApplyProgression: vscode.Event<ProgressionOutcome> =
    this._progressionEmitter.event;

  /**
   * Active coding time observed but not yet written to disk.
   *
   * Held in memory between ticks so the profile is written at most once a
   * minute rather than on every observation. `flush()` drains it on shutdown,
   * which bounds worst-case loss to a single tick.
   */
  private _pendingCodingTimeMs = 0;

  constructor(private readonly _context: vscode.ExtensionContext) {}

  /** Whether the user has progression switched on. */
  public static isEnabled(): boolean {
    return vscode.workspace
      .getConfiguration('pokedev')
      .get<boolean>('progression.enabled', true);
  }

  /**
   * Banks active coding time. Does not write immediately.
   *
   * Feeds the `Coding Time` field the Trainer Card already displays.
   */
  public addCodingTime(ms: number): void {
    if (!isFinite(ms) || ms <= 0) {
      return;
    }
    this._pendingCodingTimeMs += ms;
  }

  /**
   * Writes any banked coding time.
   *
   * Called once per ticker interval and again from `deactivate()`, so closing
   * the window loses at most one tick of time rather than a whole session.
   */
  public async flush(): Promise<void> {
    if (this._pendingCodingTimeMs <= 0) {
      return;
    }
    const pending = this._pendingCodingTimeMs;
    this._pendingCodingTimeMs = 0;

    const now = Date.now();
    const profile = readTrainerProfile(this._context, now);
    await writeTrainerProfile(this._context, {
      ...profile,
      totalCodingTimeMs: profile.totalCodingTimeMs + pending,
    });
    this._notifyCard();
  }

  /**
   * Applies one activity event to both progression tracks.
   *
   * Returns whether it was paid out; rejections (rate limit, hourly cap) are
   * silent, because they only ever fire on runaway behaviour the user did not
   * cause and cannot see.
   */
  public async applyEvent(event: ProgressionEvent): Promise<boolean> {
    if (!ProgressionService.isEnabled()) {
      return false;
    }
    if (event.trainerXp <= 0 && event.pokemonXp <= 0) {
      return false;
    }
    if (!this._ledger.accept(event).accepted) {
      return false;
    }

    const trainerXpGranted = await this._grantTrainerXp(event);
    const pokemonGrants = await this._grantPokemonXp(event);
    await this._log(event);
    this._notifyCard();
    this._progressionEmitter.fire({ event, trainerXpGranted, pokemonGrants });
    return true;
  }

  /** Returns the amount actually written (0 if capped away to nothing). */
  private async _grantTrainerXp(event: ProgressionEvent): Promise<number> {
    if (event.trainerXp <= 0) {
      return 0;
    }
    const now = Date.now();
    const before = readTrainerProfile(this._context, now);
    const after = addTrainerXp(before, event.trainerXp);
    const granted = after.totalTrainerXp - before.totalTrainerXp;
    if (granted <= 0) {
      return 0;
    }
    await writeTrainerProfile(this._context, after);

    if (after.trainerLevel > before.trainerLevel) {
      // One message however many levels were crossed at once.
      showStatusMessage(
        vscode.l10n.t('Trainer reached Lv. {0}!', after.trainerLevel),
      );
    }
    return granted;
  }

  /**
   * Grants a flat amount of Trainer XP outside the normal activity-event
   * path - Daily Challenge rewards are the only current caller.
   *
   * Bypasses the ledger deliberately: the anti-farming limits in
   * `xp-ledger.ts` exist to catch runaway ACTIVITY (a misbehaving listener
   * firing hundreds of save events), and a Daily Challenge reward is neither
   * activity nor repeatable - `daily-challenges-service.ts` already
   * guarantees each one is granted at most once. Still goes through
   * `addTrainerXp`/`writeTrainerProfile`, so this remains the only code path
   * that ever touches the Trainer profile.
   */
  public async grantFlatTrainerXp(amount: number): Promise<void> {
    if (!ProgressionService.isEnabled() || !isFinite(amount) || amount <= 0) {
      return;
    }
    const now = Date.now();
    const before = readTrainerProfile(this._context, now);
    const after = addTrainerXp(before, amount);
    if (after.totalTrainerXp === before.totalTrainerXp) {
      return;
    }
    await writeTrainerProfile(this._context, after);
    if (after.trainerLevel > before.trainerLevel) {
      showStatusMessage(
        vscode.l10n.t('Trainer reached Lv. {0}!', after.trainerLevel),
      );
    }
    this._notifyCard();
  }

  /**
   * Grants XP to the current partner and, when EXP Share is on, to the rest
   * of the active party - then offers evolution on a partner level-up.
   *
   * `distributePokemonXp` (src/progression/xp-distribution.ts) is the one
   * place that decides who receives how much; this method only applies
   * whatever it returns to the existing per-Pokemon XP/level system, exactly
   * as it already did for the partner alone. Progression is keyed by
   * nickname, so it survives an evolution - which changes species but never
   * the name - without any migration.
   */
  private async _grantPokemonXp(
    event: ProgressionEvent,
  ): Promise<PokemonXpOutcome[]> {
    if (event.pokemonXp <= 0) {
      return [];
    }
    const partner = resolvePartnerIdentity(this._context);
    if (!partner) {
      return [];
    }

    // Reacting is about the coding event happening, not about whether any
    // party member still had room to gain XP - unchanged from before EXP
    // Share existed.
    this._reactToEvent(event, partner.nickname);

    const party = listPartnerCandidates(this._context);
    const grants = distributePokemonXp({
      baseXp: event.pokemonXp,
      partnerNickname: partner.nickname,
      party,
      expShareEnabled: isExpShareEnabled(),
    });

    const now = Date.now();
    let sharedAmountGranted = 0;
    const outcomes: PokemonXpOutcome[] = [];

    for (const grant of grants) {
      const identity = grant.isPartner
        ? partner
        : party.find((candidate) => candidate.nickname === grant.nickname);
      if (!identity) {
        continue;
      }
      const outcome = await this._applyPokemonXpGrant(
        identity,
        grant,
        event,
        now,
      );
      if (outcome) {
        outcomes.push(outcome);
        if (!grant.isPartner) {
          sharedAmountGranted = grant.amount;
        }
      }
    }

    // One grouped toast for the whole party rather than one per shared
    // Pokemon - a save would otherwise pop up to three or four toasts at
    // once. Anchored to the partner, who is always the one guaranteed to be
    // rendered in the world.
    if (sharedAmountGranted > 0) {
      toastHub.notifySystem(
        partner.nickname,
        vscode.l10n.t('EXP Share: Party gained {0} EXP!', sharedAmountGranted),
        now,
      );
    }

    return outcomes;
  }

  /**
   * Applies one Pokemon's share of an XP award: writes progress, raises its
   * XP toast (partner only - see `_grantPokemonXp`), and on a level-up raises
   * the same status message, reaction and toast the partner always has, plus
   * an evolution offer when it is the partner. Returns whether the grant
   * actually changed anything, so a Pokemon already at the level cap is not
   * counted as "shared XP was granted" by the caller.
   */
  private async _applyPokemonXpGrant(
    identity: PartnerIdentity,
    grant: PokemonXpGrant,
    event: ProgressionEvent,
    now: number,
  ): Promise<PokemonXpOutcome | undefined> {
    const before = readPokemonProgress(
      this._context,
      identity.nickname,
      identity.species,
      now,
    );
    const { progress, result } = addPokemonXp(before, grant.amount);
    if (progress.totalXp === before.totalXp) {
      return undefined;
    }

    // Keep the recorded species current; the collection stays authoritative.
    await writePokemonProgress(this._context, identity.nickname, {
      ...progress,
      species: identity.species,
    });

    const actualXp = progress.totalXp - before.totalXp;
    const displayName = getPokemonToastDisplayName(
      identity.nickname,
      identity.species,
    );

    if (grant.isPartner) {
      // Shared Pokemon deliberately get no individual XP toast - the grouped
      // "Party gained" message in `_grantPokemonXp` covers them so ordinary
      // shared XP stays a single subtle notice, not a toast per Pokemon.
      toastHub.notifyXp(
        identity.nickname,
        displayName,
        actualXp,
        // A build/test pass gets the same emphasis as a commit - both are a
        // verified outcome, not incremental progress. typecheck/lint stay
        // 'normal', matching the subtler reaction they get.
        event.type === 'git-commit' ||
          event.type === 'build-success' ||
          event.type === 'test-success'
          ? 'large'
          : 'normal',
        now,
      );
    }

    const outcome: PokemonXpOutcome = {
      nickname: identity.nickname,
      species: identity.species,
      isPartner: grant.isPartner,
      xpGranted: actualXp,
      levelBefore: before.level,
      levelUp: result.levelledUp ? result : undefined,
    };

    if (!result.levelledUp) {
      return outcome;
    }

    // A level-up is significant enough to get its full existing feedback
    // regardless of whether this Pokemon is the partner or shared.
    showStatusMessage(
      vscode.l10n.t('{0} reached Lv. {1}!', displayName, result.toLevel),
    );
    reactionHub.notifyLevelUp(identity.nickname);

    for (let level = result.fromLevel + 1; level <= result.toLevel; level++) {
      toastHub.notifyLevelUp(identity.nickname, displayName, level, now);
    }

    if (grant.isPartner) {
      await this._maybeOfferEvolution(identity.nickname, result.toLevel);
    }

    return outcome;
  }

  /**
   * Raises the world reaction for the event types that have one.
   *
   * Deliberately keyed off `event.type`, not `event.source`/metadata: the
   * event's type is exactly what `git-activity.ts` and `activity-tracker.ts`
   * already used to decide this was a genuine work-batch or a new commit, so
   * this adds no new "was it meaningful" logic of its own - it only maps an
   * already-accepted progression event onto a reaction.
   */
  private _reactToEvent(event: ProgressionEvent, pokemonId: string): void {
    if (event.type === 'work-batch') {
      reactionHub.notifySave(pokemonId);
    } else if (event.type === 'git-commit') {
      reactionHub.notifyCommit(pokemonId);
    } else if (
      event.type === 'build-success' ||
      event.type === 'test-success'
    ) {
      reactionHub.notifyDevAction(pokemonId, false);
    } else if (
      event.type === 'typecheck-success' ||
      event.type === 'lint-success'
    ) {
      reactionHub.notifyDevAction(pokemonId, true);
    }
  }

  /**
   * Reaction-only signal for a failed Build/Test task.
   *
   * Deliberately outside `applyEvent`: a failure earns no XP and is never
   * logged, so it must not touch the ledger, the hourly cap or the activity
   * log - only the reaction hub, which owns its own per-task cooldown.
   */
  public reactToTaskFailure(taskName: string): void {
    const partner = resolvePartnerIdentity(this._context);
    if (!partner) {
      return;
    }
    reactionHub.notifyTaskFailure(taskName, partner.nickname);
  }

  /**
   * Offers evolution when a level-up has made one possible.
   *
   * Only ever fires on the level-up itself. A user who declines is not asked
   * again until the partner levels once more - `addPokemonXp` clears the
   * decline on every level gain - and can always evolve on demand with the
   * `Evolve Partner` command.
   */
  private async _maybeOfferEvolution(
    nickname: string,
    level: number,
  ): Promise<void> {
    const partner = resolvePartnerIdentity(this._context);
    if (!partner || partner.nickname !== nickname) {
      return;
    }

    // A species with no level-based rule is never interrupted at all.
    const threshold = getEvolutionLevel(partner.species);
    if (threshold === undefined || level < threshold) {
      return;
    }

    const availability = getAvailableEvolution(
      partner.species,
      level,
      partner.shiny,
    );
    if (!availability.available) {
      return;
    }

    // A refusal only silences this level. `addPokemonXp` clears the flag on
    // every level gain, so the offer returns once - on the next level-up -
    // rather than either nagging immediately or disappearing forever.
    const progress = readPokemonProgress(
      this._context,
      partner.nickname,
      partner.species,
      Date.now(),
    );
    if (progress.declinedEvolutionAtLevel === level) {
      return;
    }

    await promptToEvolvePartner(this._context, this);
  }

  private async _log(event: ProgressionEvent): Promise<void> {
    const log = appendToLog(readProgressionLog(this._context), event);
    await writeProgressionLog(this._context, log);
  }

  /**
   * Announces that progression changed.
   *
   * Broadcast rather than pushed: this service has no business knowing which
   * surfaces exist. The full card and both Explorer views subscribe to the
   * hub, so adding a fourth surface never touches this file.
   */
  public notifyCard(): void {
    this._notifyCard();
  }

  private _notifyCard(): void {
    pokedevState.notify('progression');
  }

  /** Test/debug seam: forget the in-memory rate-limit windows. */
  public resetLedger(): void {
    this._ledger.reset();
  }

  public dispose(): void {
    this._progressionEmitter.dispose();
  }

  /** Experience the partner needs for its next level; 0 when capped. */
  public partnerXpForNextLevel(level: number): number {
    return getPokemonXpForNextLevel(level);
  }
}

/**
 * A transient status-bar note.
 *
 * Chosen over `showInformationMessage` deliberately: level-ups happen often
 * enough during a long session that toasts would stack into a wall of
 * notifications, and none of them need acknowledging.
 */
export function showStatusMessage(text: string): void {
  vscode.window.setStatusBarMessage(text, STATUS_MESSAGE_MS);
}
