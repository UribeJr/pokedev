/**
 * Dev Actions: verified successful development outcomes.
 *
 * Pure: no `vscode`, no DOM. Mirrors `progression-types.ts`'s split
 * deliberately - a Dev Action is not a new kind of progress track, it is a
 * more specific NAME for four of the things that can produce a
 * `ProgressionEvent` (see `progression-types.ts`'s `ProgressionEventType`),
 * so downstream code (Daily Challenges, a future achievement) can key off
 * "a build succeeded" without knowing anything about VS Code tasks.
 */

/**
 * The four outcomes V1 recognises. Deliberately narrow: only what a reliable
 * VS Code API can confirm actually happened, never "the user ran a command".
 */
export type DevActionType =
  | 'build-success'
  | 'test-success'
  | 'typecheck-success'
  | 'lint-success';

/**
 * Provenance for the activity log only - never used to decide whether an
 * action counts, and never a place to put command text or output. See the
 * "Privacy" note on `ClassifiableTask` in `dev-action-classifier.ts` for what
 * is and is not captured.
 */
export interface DevActionSource {
  taskName?: string;
  taskDefinitionType?: string;
  workspaceFolder?: string;
}

/** The semantic event a classified, accepted task completion produces. */
export interface DevActionEvent {
  type: DevActionType;
  /** Epoch milliseconds. */
  timestamp: number;
  source?: DevActionSource;
}

/**
 * What kinds of Dev Action this workspace could plausibly ever complete,
 * populated conservatively from the tasks VS Code already knows about (see
 * `dev-action-capabilities.ts`). Used only to keep Daily Challenge generation
 * from offering a challenge nothing here can finish - never to gate whether
 * an actually-observed success earns XP.
 */
export interface DevActionCapabilities {
  build: boolean;
  test: boolean;
  typecheck: boolean;
  lint: boolean;
}

/** A capabilities record with everything false - the safe default. */
export const NO_DEV_ACTION_CAPABILITIES: DevActionCapabilities = {
  build: false,
  test: false,
  typecheck: false,
  lint: false,
};
