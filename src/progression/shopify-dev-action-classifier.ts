/**
 * Turns a completed VS Code task into a Shopify Dev Action type, or `null`.
 *
 * Pure: no `vscode`. Mirrors `dev-action-classifier.ts`'s discipline exactly:
 * every field this looks at is STATIC task metadata (a task name, an npm
 * script name, a task's own configured shell/process command line) - never
 * terminal output, terminal history, or anything captured while the task was
 * running.
 *
 * `managedAction` is the one field with no equivalent in the generic
 * classifier: it is set ONLY for a task PokéDev itself created (see
 * `extension/shopify-cli.ts`), and is trusted directly rather than pattern-
 * matched, since PokéDev already knows exactly what it asked the CLI to do -
 * there is nothing to infer. Every other task (hand-authored in tasks.json,
 * or auto-detected) is classified from its declared command line, which is
 * the only signal available for something PokéDev did not create itself.
 *
 * Classification requires the literal word "shopify" to appear somewhere in
 * the task's own fields, in addition to the specific subcommand pattern - a
 * task merely named "theme push" or "app build" with no Shopify CLI
 * connection at all must never be misclassified as a Shopify Dev Action.
 * `activity-tracker.ts` also always tries this classifier BEFORE the generic
 * one, so "shopify app build" (which would otherwise match the generic
 * `BUILD_PATTERN`) resolves to exactly one Shopify-specific outcome.
 */
import { ClassifiableTask } from './dev-action-classifier';
import { ShopifyDevActionType } from './shopify-dev-action-types';

export type ClassifiableShopifyTask = ClassifiableTask & {
  /** Set only for a task PokéDev itself created via `executeShopifyTask` -
   * see the module doc above. */
  managedAction?: ShopifyDevActionType;
};

const SHOPIFY_PATTERN = /\bshopify\b/i;
const THEME_CHECK_PATTERN = /\btheme[-:\s]?check\b/i;
const THEME_PUBLISH_PATTERN = /\btheme[-:\s]?publish\b/i;
const THEME_PUSH_PATTERN = /\btheme[-:\s]?push\b/i;
const APP_DEPLOY_PATTERN = /\bapp[-:\s]?deploy\b/i;
const APP_BUILD_PATTERN = /\bapp[-:\s]?build\b/i;
const EXTENSION_DEPLOY_PATTERN = /\bextension[-:\s]?deploy\b/i;
const FUNCTION_DEPLOY_PATTERN = /\bfunction[-:\s]?deploy\b/i;

function matchesAny(
  fields: readonly (string | undefined)[],
  pattern: RegExp,
): boolean {
  return fields.some((field) => field !== undefined && pattern.test(field));
}

/**
 * Classifies one completed task. Callers must have already confirmed it
 * exited successfully - this makes no judgement about success or failure.
 *
 * Checked in an order that never matters for correctness today (every
 * pattern below is mutually exclusive - "theme check" cannot also match
 * "app deploy"), but kept most-specific-first to match the convention
 * `classifyTaskAsDevAction` already uses.
 */
export function classifyShopifyTask(
  task: ClassifiableShopifyTask,
): ShopifyDevActionType | null {
  if (task.managedAction) {
    return task.managedAction;
  }

  const fields = [task.npmScript, task.name, task.command];
  if (!matchesAny(fields, SHOPIFY_PATTERN)) {
    return null;
  }

  if (matchesAny(fields, THEME_CHECK_PATTERN)) {
    return 'shopify-theme-check-success';
  }
  if (matchesAny(fields, THEME_PUBLISH_PATTERN)) {
    return 'shopify-theme-publish-success';
  }
  if (matchesAny(fields, THEME_PUSH_PATTERN)) {
    return 'shopify-theme-push-success';
  }
  if (matchesAny(fields, APP_DEPLOY_PATTERN)) {
    return 'shopify-app-deploy-success';
  }
  if (matchesAny(fields, APP_BUILD_PATTERN)) {
    return 'shopify-app-build-success';
  }
  if (matchesAny(fields, EXTENSION_DEPLOY_PATTERN)) {
    return 'shopify-extension-deploy-success';
  }
  if (matchesAny(fields, FUNCTION_DEPLOY_PATTERN)) {
    return 'shopify-function-deploy-success';
  }
  return null;
}
