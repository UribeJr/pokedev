/**
 * PokéDev-managed Shopify CLI execution - "Layer 2" of the Shopify Dev
 * Actions feature.
 *
 * "Layer 1" (`shopify-task-bridge.ts` + `activity-tracker.ts`) reliably
 * detects a Shopify outcome from ANY VS Code task that happens to finish,
 * including one the user hand-wrote in `tasks.json` or ran through an
 * existing npm script. This file adds a convenience on top: four commands
 * that run the real Shopify CLI FOR the user, through the exact same task
 * machinery Layer 1 already watches.
 *
 * That "through a real task" choice is deliberate and load-bearing, not
 * incidental: it means there is only ever ONE code path from "a Shopify CLI
 * invocation finished" to "XP granted" - `ActivityTracker`'s task-end
 * listener - regardless of whether the task was hand-authored or created
 * here. A managed command's own task can never earn a second, separate
 * reward on top of what the listener already grants, because this file never
 * grants anything itself; it only asks VS Code to run a task, exactly like
 * clicking ▶ on an entry in `tasks.json` would.
 *
 * What this deliberately does NOT do, per the feature's own privacy/safety
 * requirements: no shell hook, no monkey-patched terminal, no scraping of
 * terminal text or history, no automatic Shopify CLI installation, no stored
 * shop domain/credentials/command string. `isShopifyCliAvailable` runs
 * `shopify version` once via `child_process.execFile` purely to confirm the
 * binary exists before handing control to a real task - its output is never
 * read or stored, only whether it exited successfully.
 *
 * Only theme check/push and app build/deploy get a managed command here.
 * `shopify theme publish` is a real CLI command but needs an explicit
 * `-t`/`-f` target to run non-interactively, which this V1 does not attempt
 * to infer (see the module doc on `progression/shopify-dev-action-types.ts`);
 * a hand-authored task for it still classifies correctly through Layer 1.
 * Extension/function deploy have no standalone CLI subcommand at all -
 * both ship as part of `app deploy` - so neither gets a managed command
 * either, only Layer 1 classification for forward-compatibility.
 */
import { execFile } from 'child_process';
import * as vscode from 'vscode';
import { ShopifyDevActionType } from '../progression/shopify-dev-action-types';
import { isNodeRuntime } from '../common/runtime';
import { detectShopifyCapabilities } from './shopify-project-detection';
import { SHOPIFY_MANAGED_TASK_TYPE } from './shopify-task-bridge';

const SHOPIFY_CLI_CHECK_TIMEOUT_MS = 5000;

/**
 * Whether the `shopify` binary is runnable at all, checked via a one-off
 * `shopify version` call. Never installs anything, never reads or persists
 * the command's output - only whether it exited without error.
 */
export function isShopifyCliAvailable(): Promise<boolean> {
  if (!isNodeRuntime()) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    execFile(
      'shopify',
      ['version'],
      {
        timeout: SHOPIFY_CLI_CHECK_TIMEOUT_MS,
        shell: process.platform === 'win32',
      },
      (error) => resolve(!error),
    );
  });
}

/**
 * Resolves which workspace folder a managed Shopify command should run in.
 * A single-folder workspace is unambiguous; a multi-root workspace always
 * asks via QuickPick rather than guessing from the active editor - see the
 * feature's own "Do not guess" requirement.
 */
async function resolveWorkspaceFolder(): Promise<
  vscode.WorkspaceFolder | undefined
> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    void vscode.window.showErrorMessage(
      vscode.l10n.t('Open a folder or workspace first.'),
    );
    return undefined;
  }
  if (folders.length === 1) {
    return folders[0];
  }

  const activeUri = vscode.window.activeTextEditor?.document.uri;
  const activeFolder = activeUri
    ? vscode.workspace.getWorkspaceFolder(activeUri)
    : undefined;

  const picked = await vscode.window.showQuickPick(
    folders.map((folder) => ({
      label: folder.name,
      description:
        folder === activeFolder ? vscode.l10n.t('Active editor') : undefined,
      folder,
    })),
    {
      placeHolder: vscode.l10n.t(
        'Select a workspace folder for this Shopify action',
      ),
    },
  );
  return picked?.folder;
}

/**
 * Creates and runs a real `vscode.Task` for one Shopify CLI invocation.
 *
 * `definition.shopifyAction` is read back by `taskToClassifiableShopify` the
 * moment this task ends, so classification never has to pattern-match the
 * command line for a task PokéDev created itself - see that module's doc
 * comment.
 */
async function executeShopifyManagedTask(
  actionType: ShopifyDevActionType,
  taskLabel: string,
  commandLine: string,
  folder: vscode.WorkspaceFolder,
): Promise<void> {
  const definition: vscode.TaskDefinition = {
    type: SHOPIFY_MANAGED_TASK_TYPE,
    shopifyAction: actionType,
  };
  const execution = new vscode.ShellExecution(commandLine, {
    cwd: folder.uri.fsPath,
  });
  const task = new vscode.Task(
    definition,
    folder,
    taskLabel,
    'PokéDev',
    execution,
  );
  task.group = vscode.TaskGroup.Build;
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Dedicated,
  };
  await vscode.tasks.executeTask(task);
}

async function runManagedShopifyCommand(
  actionType: ShopifyDevActionType,
  taskLabel: string,
  commandLine: string,
): Promise<void> {
  if (!(await isShopifyCliAvailable())) {
    void vscode.window.showErrorMessage(
      vscode.l10n.t(
        'Shopify CLI not found. Install it from shopify.dev and make sure "shopify" is on your PATH, then try again. PokéDev never installs it automatically.',
      ),
    );
    return;
  }
  const folder = await resolveWorkspaceFolder();
  if (!folder) {
    return;
  }
  await executeShopifyManagedTask(actionType, taskLabel, commandLine, folder);
}

export async function runShopifyThemeCheck(): Promise<void> {
  await runManagedShopifyCommand(
    'shopify-theme-check-success',
    vscode.l10n.t('PokéDev: Shopify Theme Check'),
    'shopify theme check',
  );
}

export async function runShopifyThemePush(): Promise<void> {
  await runManagedShopifyCommand(
    'shopify-theme-push-success',
    vscode.l10n.t('PokéDev: Shopify Theme Push'),
    'shopify theme push',
  );
}

export async function runShopifyAppBuild(): Promise<void> {
  await runManagedShopifyCommand(
    'shopify-app-build-success',
    vscode.l10n.t('PokéDev: Shopify App Build'),
    'shopify app build',
  );
}

export async function runShopifyAppDeploy(): Promise<void> {
  await runManagedShopifyCommand(
    'shopify-app-deploy-success',
    vscode.l10n.t('PokéDev: Shopify App Deploy'),
    'shopify app deploy',
  );
}

/**
 * `PokéDev: Shopify Actions...` - the user's preferred single entry point,
 * grouped by capability (THEME / APP) and only showing groups this workspace
 * actually looks like it could use (see `shopify-project-detection.ts`).
 */
export async function showShopifyActionsQuickPick(): Promise<void> {
  const capabilities = await detectShopifyCapabilities();
  if (!capabilities.theme && !capabilities.app) {
    void vscode.window.showInformationMessage(
      vscode.l10n.t(
        'No Shopify theme or app project detected in this workspace.',
      ),
    );
    return;
  }

  interface ActionItem extends vscode.QuickPickItem {
    run?: () => Promise<void>;
  }

  const items: ActionItem[] = [];
  if (capabilities.theme) {
    items.push({
      label: vscode.l10n.t('THEME'),
      kind: vscode.QuickPickItemKind.Separator,
    });
    items.push({
      label: vscode.l10n.t('Theme Check'),
      description: vscode.l10n.t('Lint theme files for errors'),
      run: runShopifyThemeCheck,
    });
    items.push({
      label: vscode.l10n.t('Theme Push'),
      description: vscode.l10n.t('Push theme files to a store'),
      run: runShopifyThemePush,
    });
  }
  if (capabilities.app) {
    items.push({
      label: vscode.l10n.t('APP'),
      kind: vscode.QuickPickItemKind.Separator,
    });
    items.push({
      label: vscode.l10n.t('App Build'),
      description: vscode.l10n.t('Build the app'),
      run: runShopifyAppBuild,
    });
    items.push({
      label: vscode.l10n.t('App Deploy'),
      description: vscode.l10n.t(
        'Deploy the app, its extensions and functions',
      ),
      run: runShopifyAppDeploy,
    });
  }

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: vscode.l10n.t('Select a Shopify action'),
  });
  await picked?.run?.();
}
