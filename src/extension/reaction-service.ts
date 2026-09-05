/**
 * The reaction hub: the single place a coding event becomes a reaction the
 * Pokémon world might play.
 *
 * Mirrors `pokedev-state.ts`'s hub pattern deliberately - listeners
 * (`progression-service.ts`, `activity-tracker.ts`) call a semantic method
 * here (`notifySave`, `notifyCommit`, ...) and never touch a webview or the
 * DOM themselves:
 *
 *   Coding event -> Reaction event -> this hub -> Pokémon world (webview)
 *
 * This is also the one place reaction cooldowns and the `reactions.enabled`
 * setting live, so tuning them never means hunting through a listener.
 * `extension.ts` is the only subscriber, translating each event into a
 * `postMessage` to whichever surface currently shows the world.
 *
 * Deliberately has no idea what "idle" means: it only ever fires in response
 * to an explicit call from a listener that just observed a real event.
 */
import * as vscode from 'vscode';
import {
  SAVE_REACTION_COOLDOWN_MS,
  shouldReactAgain,
  TASK_FAILURE_REACTION_COOLDOWN_MS,
} from '../progression/reaction-rules';
import { PokemonReactionEvent } from '../progression/reaction-types';

class ReactionHub {
  private readonly _emitter = new vscode.EventEmitter<PokemonReactionEvent>();

  /** Fires once per reaction that should actually play. */
  public readonly onDidReact: vscode.Event<PokemonReactionEvent> =
    this._emitter.event;

  /** Last time a save reaction played, for `SAVE_REACTION_COOLDOWN_MS`. */
  private _lastSaveReactionAt: number | undefined;

  /** Last time a failure reaction played, per task name. */
  private readonly _lastFailureReactionAt = new Map<string, number>();

  /**
   * A qualifying save just happened.
   *
   * The progression system has already decided this save was meaningful
   * (`hasDocumentChanged` + the work-batch debounce); this only adds its own
   * short cooldown so a fast burst of batches cannot spam the reaction even
   * if the batch cooldown were ever tuned shorter.
   */
  public notifySave(pokemonId: string, now: number = Date.now()): void {
    if (
      !shouldReactAgain(
        this._lastSaveReactionAt,
        now,
        SAVE_REACTION_COOLDOWN_MS,
      )
    ) {
      return;
    }
    this._lastSaveReactionAt = now;
    this._fire({
      type: 'notice',
      source: 'meaningful-save',
      pokemonId,
      timestamp: now,
    });
  }

  /**
   * A new, unique commit was just recorded.
   *
   * No cooldown beyond what already gates the call site: `git-activity.ts`
   * only calls this for a HEAD that has never been rewarded before, so a
   * duplicate commit never reaches here at all.
   */
  public notifyCommit(pokemonId: string, now: number = Date.now()): void {
    this._fire({
      type: 'celebrate',
      source: 'git-commit',
      pokemonId,
      timestamp: now,
      allowBystander: true,
    });
  }

  /** A Build or Test task ended with a non-zero, known exit code. */
  public notifyTaskFailure(
    taskName: string,
    pokemonId: string,
    now: number = Date.now(),
  ): void {
    const last = this._lastFailureReactionAt.get(taskName);
    if (!shouldReactAgain(last, now, TASK_FAILURE_REACTION_COOLDOWN_MS)) {
      return;
    }
    this._lastFailureReactionAt.set(taskName, now);
    this._fire({
      type: 'confused',
      source: 'task-failure',
      pokemonId,
      timestamp: now,
    });
  }

  /**
   * A Dev Action (build/test/typecheck/lint) succeeded.
   *
   * No cooldown here either, for the same reason as `notifyCommit`: the
   * 5-minute Dev Action cooldown in `activity-tracker.ts` already keeps a
   * repeat from reaching this call at all. `subtle` chooses `notice` (a small
   * `!`) for typecheck/lint over the fuller `celebrate` a build or test pass
   * gets - the same distinction the toast variant makes.
   */
  public notifyDevAction(
    pokemonId: string,
    subtle: boolean,
    now: number = Date.now(),
  ): void {
    this._fire({
      type: subtle ? 'notice' : 'celebrate',
      source: 'dev-action',
      pokemonId,
      timestamp: now,
    });
  }

  /** A Pokémon just levelled up. Always shown - no cooldown. */
  public notifyLevelUp(pokemonId: string, now: number = Date.now()): void {
    this._fire({
      type: 'level-up',
      source: 'pokemon-level-up',
      pokemonId,
      timestamp: now,
    });
  }

  /**
   * A Pokémon's Friendship just crossed into a new tier.
   *
   * Always shown - no cooldown, mirroring `notifyLevelUp`: this fires at most
   * once per tier crossing (`ProgressionService` only calls it when
   * `addFriendship` reports `tierUp`), which cannot happen more than a
   * handful of times over a Pokémon's whole lifetime.
   */
  public notifyFriendshipUp(pokemonId: string, now: number = Date.now()): void {
    this._fire({
      type: 'friendship-up',
      source: 'friendship-tier-up',
      pokemonId,
      timestamp: now,
    });
  }

  private _fire(event: PokemonReactionEvent): void {
    if (!isReactionsEnabled()) {
      return;
    }
    this._emitter.fire(event);
  }

  /** Test/debug seam: forget cooldown state. */
  public resetCooldowns(): void {
    this._lastSaveReactionAt = undefined;
    this._lastFailureReactionAt.clear();
  }

  public dispose(): void {
    this._emitter.dispose();
  }
}

/** The single hub every reaction source raises through. */
export const reactionHub = new ReactionHub();

export function isReactionsEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('pokedev')
    .get<boolean>('reactions.enabled', true);
}
