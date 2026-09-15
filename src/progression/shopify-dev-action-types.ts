/**
 * Shopify Dev Actions: verified successful Shopify CLI outcomes.
 *
 * Pure: no `vscode`, no DOM. Mirrors `dev-action-types.ts` deliberately - a
 * Shopify Dev Action is not a new progress track, it is a more specific name
 * for a handful of things that can produce a `ProgressionEvent` (see
 * `progression-types.ts`'s `ProgressionEventType`), kept in its own narrow
 * union rather than folded into `DevActionType` because Shopify outcomes have
 * their own classifier, cooldown table and eligibility model - see
 * `shopify-dev-action-classifier.ts`/`shopify-dev-action-rules.ts`.
 *
 * `shopify-extension-deploy-success` and `shopify-function-deploy-success`
 * are part of this union for classification completeness (a hand-authored
 * VS Code task could plausibly be named for either), even though the current
 * Shopify CLI has no standalone `extension deploy`/`function deploy`
 * subcommand - both ship as part of `shopify app deploy`. Only the four
 * commands that ARE real, non-interactive-friendly CLI actions (theme check,
 * theme push, app build, app deploy) get a PokéDev-managed command; see the
 * module doc on `extension/shopify-cli.ts`.
 */

/**
 * The seven outcomes V1 recognises. Deliberately narrow: only what a reliable
 * VS Code API (a task's own exit code and declared metadata) can confirm
 * actually happened, never "the user typed a Shopify CLI command".
 */
export type ShopifyDevActionType =
  | 'shopify-theme-check-success'
  | 'shopify-theme-push-success'
  | 'shopify-app-build-success'
  | 'shopify-app-deploy-success'
  | 'shopify-extension-deploy-success'
  | 'shopify-function-deploy-success'
  | 'shopify-theme-publish-success';

/**
 * Provenance for the activity log only - never used to decide whether an
 * action counts, and never a place to put command text, CLI output, shop
 * domains or credentials. See the "Privacy" note on `ClassifiableTask` in
 * `dev-action-classifier.ts` for what is and is not captured; the same rule
 * applies here.
 */
export interface ShopifyDevActionSource {
  taskName?: string;
  taskDefinitionType?: string;
  workspaceFolder?: string;
}

/**
 * What kind of Shopify project this workspace looks like, from lightweight
 * file-existence checks only (see `extension/shopify-project-detection.ts`) -
 * never a deep scan, never file contents. Used only to gate which managed
 * commands and Daily Challenges are offered - never to decide whether an
 * actually-observed success earns XP.
 */
export interface ShopifyCapabilities {
  theme: boolean;
  app: boolean;
  extensions: boolean;
}

/** A capabilities record with everything false - the safe default. */
export const NO_SHOPIFY_CAPABILITIES: ShopifyCapabilities = {
  theme: false,
  app: false,
  extensions: false,
};
