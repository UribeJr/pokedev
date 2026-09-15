/**
 * The `vscode.Task` <-> Shopify Dev Action bridge.
 *
 * Mirrors `dev-action-capabilities.ts`'s `taskToClassifiable`: projects a
 * real task down to exactly what `classifyShopifyTask` needs, reading only
 * static, already-declared task metadata (name, npm script, configured
 * shell/process command line) - reusing `readDeclaredCommand` from that same
 * file rather than a second copy of the same logic.
 */
import * as vscode from 'vscode';
import { readDeclaredCommand } from './dev-action-capabilities';
import { ClassifiableShopifyTask } from '../progression/shopify-dev-action-classifier';
import { ShopifyDevActionType } from '../progression/shopify-dev-action-types';

/**
 * The definition `type` PokéDev-managed Shopify tasks use - see
 * `shopify-cli.ts`. Exported so both sides of the bridge (task creation here,
 * classification below) agree on it without a string literal drifting apart.
 */
export const SHOPIFY_MANAGED_TASK_TYPE = 'pokedev-shopify';

export function taskToClassifiableShopify(
  task: vscode.Task,
): ClassifiableShopifyTask {
  const definition = task.definition;
  const npmScript =
    definition.type === 'npm' && typeof definition['script'] === 'string'
      ? (definition['script'] as string)
      : undefined;
  const managedAction =
    definition.type === SHOPIFY_MANAGED_TASK_TYPE &&
    typeof definition['shopifyAction'] === 'string'
      ? (definition['shopifyAction'] as ShopifyDevActionType)
      : undefined;

  return {
    name: task.name,
    definitionType: definition.type,
    npmScript,
    command: readDeclaredCommand(task.execution),
    ...(managedAction ? { managedAction } : {}),
  };
}

export function isShopifyDevActionsEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('pokedev')
    .get<boolean>('shopifyDevActions.enabled', true);
}
