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
import { ProgressionEvent } from '../progression/progression-types';
import { appendToLog, XpLedger } from '../progression/xp-ledger';
import { XP_RULES } from '../progression/xp-rules';
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
import { resolvePartnerIdentity } from './trainer-partner';
import { readTrainerProfile, writeTrainerProfile } from './trainer-storage';

/** How long a level-up message lingers in the status bar. */
const STATUS_MESSAGE_MS = 6000;

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

    await this._grantTrainerXp(event);
    await this._grantPartnerXp(event);
    await this._log(event);
    this._notifyCard();
    return true;
  }

  private async _grantTrainerXp(event: ProgressionEvent): Promise<void> {
    if (event.trainerXp <= 0) {
      return;
    }
    const now = Date.now();
    const before = readTrainerProfile(this._context, now);
    const after = addTrainerXp(before, event.trainerXp);
    if (after.totalTrainerXp === before.totalTrainerXp) {
      return;
    }
    await writeTrainerProfile(this._context, after);

    if (after.trainerLevel > before.trainerLevel) {
      // One message however many levels were crossed at once.
      showStatusMessage(
        vscode.l10n.t('Trainer reached Lv. {0}!', after.trainerLevel),
      );
    }
  }

  /**
   * Grants XP to the current partner and, on a level-up, offers evolution.
   *
   * Only the partner earns Pokemon XP in this milestone. Progression is keyed
   * by nickname, so it survives an evolution - which changes species but never
   * the name - without any migration.
   */
  private async _grantPartnerXp(event: ProgressionEvent): Promise<void> {
    if (event.pokemonXp <= 0) {
      return;
    }
    const partner = resolvePartnerIdentity(this._context);
    if (!partner) {
      return;
    }

    this._reactToEvent(event, partner.nickname);

    const now = Date.now();
    const before = readPokemonProgress(
      this._context,
      partner.nickname,
      partner.species,
      now,
    );
    const { progress, result } = addPokemonXp(before, event.pokemonXp);
    if (progress.totalXp === before.totalXp) {
      return;
    }

    // Keep the recorded species current; the collection stays authoritative.
    await writePokemonProgress(this._context, partner.nickname, {
      ...progress,
      species: partner.species,
    });

    const actualXp = progress.totalXp - before.totalXp;
    const displayName = getPokemonToastDisplayName(
      partner.nickname,
      partner.species,
    );
    toastHub.notifyXp(
      partner.nickname,
      displayName,
      actualXp,
      event.type === 'git-commit' ? 'large' : 'normal',
      now,
    );

    if (!result.levelledUp) {
      return;
    }

    showStatusMessage(
      vscode.l10n.t('{0} reached Lv. {1}!', displayName, result.toLevel),
    );
    reactionHub.notifyLevelUp(partner.nickname);

    for (let level = result.fromLevel + 1; level <= result.toLevel; level++) {
      toastHub.notifyLevelUp(partner.nickname, displayName, level, now);
    }

    await this._maybeOfferEvolution(partner.nickname, result.toLevel);
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
