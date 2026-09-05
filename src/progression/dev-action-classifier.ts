/**
 * Turns a completed VS Code task into a Dev Action type, or `null`.
 *
 * Pure: no `vscode`. `ClassifiableTask` is a deliberately narrow projection of
 * `vscode.Task` (built by `extension/dev-action-capabilities.ts`), so this
 * whole decision is unit-testable without a task ever actually running.
 *
 * Every field this looks at is STATIC task metadata the user (or a task
 * provider like the built-in npm integration) already declared - a task
 * name, an npm script name, a task's configured shell/process command line.
 * None of it is terminal output, terminal history, or anything captured while
 * the task was running. That distinction is the whole privacy and
 * reliability model of this feature: a declared command is knowable without
 * ever reading what actually happened in a shell.
 *
 * Classification is intentionally conservative and ORDERED. Checked most-
 * specific first (typecheck, then lint, then test, then build) so a task
 * whose name plausibly matches more than one keyword - "build:test", say -
 * resolves to exactly one canonical action rather than several. An unrelated
 * task (`watch`, `dev`, `clean`, `start`, arbitrary shell commands typed into
 * a terminal that were never registered as a task at all) matches nothing and
 * returns `null`.
 */
import { DevActionType } from './dev-action-types';

export interface ClassifiableTask {
  /** `vscode.Task.name`. */
  name: string;
  /** `vscode.Task.definition.type`, e.g. 'npm', 'shell', 'typescript', 'gulp'. */
  definitionType: string;
  /** `vscode.Task.definition.script` when `definitionType === 'npm'` - the
   * package.json script name, which is the single most reliable signal for
   * an npm-provided task. */
  npmScript?: string;
  /** The task's OWN configured command line, when its execution is a
   * `ShellExecution`/`ProcessExecution` and that command is available -
   * never terminal output. */
  command?: string;
}

const TYPECHECK_NAME_PATTERN = /\btype[-\s]?check(ing)?\b|\bcheck-types\b/i;
const TSC_NOEMIT_PATTERN = /\btsc\b.*(--noemit|--no-emit)\b/i;
const LINT_PATTERN = /\beslint\b|\btslint\b|\blint(ing)?\b/i;
const TEST_PATTERN = /\btests?\b|\bjest\b|\bvitest\b|\bmocha\b|\bspec\b/i;
const BUILD_PATTERN = /\bbuild\b|\brebuild\b|\bcompile\b|\bbundle\b/i;

function matchesAny(
  fields: readonly (string | undefined)[],
  pattern: RegExp,
): boolean {
  return fields.some((field) => field !== undefined && pattern.test(field));
}

/**
 * Classifies one completed task. Callers must have already confirmed it
 * exited successfully - this makes no judgement about success or failure.
 */
export function classifyTaskAsDevAction(
  task: ClassifiableTask,
): DevActionType | null {
  const nameFields = [task.npmScript, task.name];
  const allFields = [task.npmScript, task.name, task.command];

  if (
    matchesAny(nameFields, TYPECHECK_NAME_PATTERN) ||
    matchesAny([task.command], TSC_NOEMIT_PATTERN)
  ) {
    return 'typecheck-success';
  }
  if (matchesAny(allFields, LINT_PATTERN)) {
    return 'lint-success';
  }
  if (matchesAny(allFields, TEST_PATTERN)) {
    return 'test-success';
  }
  if (matchesAny(allFields, BUILD_PATTERN)) {
    return 'build-success';
  }
  return null;
}

/**
 * A stable identity for one task, for cooldown tracking only.
 *
 * Prefers the npm script name (the most stable identity npm-provided tasks
 * have) and falls back to the definition type plus display name for
 * everything else. Never includes the command text - the cooldown key is
 * persisted, and a command line is exactly the kind of detail this feature
 * promises never to store.
 */
export function buildTaskIdentity(task: ClassifiableTask): string {
  return `${task.definitionType}:${task.npmScript ?? task.name}`;
}
