/**
 * The `vscode.Task` <-> Dev Action bridge: adapts a real task to the pure
 * classifier's narrow input shape, and does the one-shot capability scan
 * Daily Challenge generation uses to decide whether a build/test/lint/
 * typecheck challenge is even possible here.
 *
 * `activity-tracker.ts` uses `taskToClassifiable` on every task completion;
 * this file is what keeps that adapter in one place rather than duplicated
 * between the live listener and the capability scan.
 */
import * as vscode from 'vscode';
import {
  ClassifiableTask,
  classifyTaskAsDevAction,
} from '../progression/dev-action-classifier';
import {
  DevActionCapabilities,
  NO_DEV_ACTION_CAPABILITIES,
} from '../progression/dev-action-types';

export function isDevActionsEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('pokedev')
    .get<boolean>('devActions.enabled', true);
}

/**
 * Projects a real task down to what the classifier needs.
 *
 * Reads only static, already-declared task metadata - the npm script name,
 * the task's own configured shell/process command line - never anything
 * observed while a task was actually running.
 */
export function taskToClassifiable(task: vscode.Task): ClassifiableTask {
  const definition = task.definition;
  const npmScript =
    definition.type === 'npm' && typeof definition['script'] === 'string'
      ? (definition['script'] as string)
      : undefined;

  return {
    name: task.name,
    definitionType: definition.type,
    npmScript,
    command: readDeclaredCommand(task.execution),
  };
}

function readDeclaredCommand(
  execution:
    | vscode.ProcessExecution
    | vscode.ShellExecution
    | vscode.CustomExecution
    | undefined,
): string | undefined {
  if (execution instanceof vscode.ShellExecution) {
    if (typeof execution.commandLine === 'string') {
      return execution.commandLine;
    }
    if (execution.command === undefined) {
      return undefined;
    }
    return typeof execution.command === 'string'
      ? execution.command
      : execution.command.value;
  }
  if (execution instanceof vscode.ProcessExecution) {
    return [execution.process, ...execution.args].join(' ');
  }
  // CustomExecution has no static command to read - never a reason to fail.
  return undefined;
}

/**
 * A one-shot scan of every task VS Code currently knows about - registered in
 * tasks.json, or auto-detected (npm scripts, for instance) - classified with
 * the exact same rules a completed run is judged by.
 *
 * Called only when Daily Challenges generates today's set (see
 * `daily-challenges-service.ts`), never polled: the result only ever needs to
 * be as fresh as "once a day". Returns every capability `false` when Dev
 * Actions are disabled, so a disabled feature never has its challenges
 * offered either.
 */
export async function detectDevActionCapabilities(): Promise<DevActionCapabilities> {
  if (!isDevActionsEnabled()) {
    return NO_DEV_ACTION_CAPABILITIES;
  }

  let tasks: vscode.Task[];
  try {
    tasks = await vscode.tasks.fetchTasks();
  } catch {
    // Conservative: if the task system cannot be queried, offer nothing
    // rather than guess.
    return NO_DEV_ACTION_CAPABILITIES;
  }

  const capabilities: DevActionCapabilities = { ...NO_DEV_ACTION_CAPABILITIES };
  for (const task of tasks) {
    switch (classifyTaskAsDevAction(taskToClassifiable(task))) {
      case 'build-success':
        capabilities.build = true;
        break;
      case 'test-success':
        capabilities.test = true;
        break;
      case 'typecheck-success':
        capabilities.typecheck = true;
        break;
      case 'lint-success':
        capabilities.lint = true;
        break;
      case null:
        break;
    }
  }
  return capabilities;
}
