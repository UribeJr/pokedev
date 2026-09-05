/**
 * The normalized activity/XP event model.
 *
 * Every VS Code listener that observes activity produces one of these rather
 * than touching `TrainerProfile` or Pokemon progression directly. A single
 * writer (`src/extension/progression-service.ts`) consumes them. That keeps
 * throttling, capping, persistence and level-up notification in one place
 * instead of spread across every listener.
 *
 * Pure: no `vscode`, no DOM. Compiled under four different `lib` sets.
 */

/**
 * How the user works, which decides what counts as "still active".
 *
 * The XP weights are shared across all three - they are already tuned so that
 * hand-written and agent-driven sessions earn at close to the same rate. This
 * setting only governs the idle clock, which is the one place the two styles
 * genuinely need different answers.
 */
export type ProgressionMode = 'auto' | 'manual' | 'agentic';

/**
 * What produced a signal that the user is still working.
 *
 * `document-change` cannot tell a human keystroke from an agent's edit - VS
 * Code reports both identically - which is precisely why it is a separate
 * source that some modes decline to trust.
 */
export type ActivitySource =
  | 'human-input'
  | 'document-change'
  | 'editor-switch';

export type ProgressionEventType =
  | 'work-batch'
  | 'active-coding'
  | 'git-commit'
  | 'task-success'
  // Dev Actions: the same "a task ended" signal as `task-success`, but
  // classified into a specific verified outcome by
  // `progression/dev-action-classifier.ts`. `task-success` remains the
  // fallback for a Build/Test-group task the classifier could not identify -
  // see `activity-tracker.ts`'s `_onTaskEnd` for exactly one of the five ever
  // being emitted per task completion.
  | 'build-success'
  | 'test-success'
  | 'typecheck-success'
  | 'lint-success'
  | 'debug-grant';

export interface ProgressionEvent {
  type: ProgressionEventType;
  /** Experience for the trainer track. */
  trainerXp: number;
  /** Experience for the partner Pokemon track. */
  pokemonXp: number;
  /** Epoch milliseconds. */
  timestamp: number;
  /**
   * Free-form detail for the activity log: a commit sha, a task name, the
   * minutes of coding a tick represents. Never used for balance decisions -
   * only for display and future analytics.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Per-instance Pokemon progression.
 *
 * Keyed by nickname, which is this extension's existing instance identity
 * (`PokemonCollection.locate(name)`, the `delete-pokemon` message, friend
 * links). A nickname survives evolution unchanged, so progression carries
 * across an evolution for free.
 *
 * Consequence worth knowing: two Pokemon that share a nickname share
 * progression. Nicknames are drawn at random from an 80-entry list, so
 * collisions are possible - but only the partner earns XP, so at most one of
 * the pair is ever writing.
 */
export interface PokemonProgress {
  /** Schema version, so a later change has something to branch on. */
  version: 1;
  /**
   * Species at the time of writing. Advisory only - the collection memento is
   * authoritative. Stored so the activity log and any future Pokedex work can
   * read progression without also loading the collection.
   */
  species: string;
  /** The source of truth. `level` and `currentXp` are derived from it. */
  totalXp: number;
  /** Derived from `totalXp`. */
  level: number;
  /** Derived. Experience within the current level. */
  currentXp: number;
  /**
   * The level at which the user last answered "Not now" to an evolution
   * prompt. Suppresses re-prompting until the Pokemon levels again; the
   * `Evolve Partner` command ignores it entirely.
   */
  declinedEvolutionAtLevel?: number;
  /** Epoch milliseconds of the first time this nickname earned anything. */
  createdAt: number;
}

/** The outcome of granting XP to either track. */
export interface LevelUpResult {
  levelledUp: boolean;
  fromLevel: number;
  toLevel: number;
}
