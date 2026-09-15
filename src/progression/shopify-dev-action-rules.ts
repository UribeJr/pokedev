/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Anti-farming for Shopify Dev Actions.
 *
 * Reuses the exact cooldown mechanics `dev-action-rules.ts` already defined
 * (`shouldAcceptDevAction`, and `readDevActionCooldowns`/
 * `rememberDevActionAccepted` in `extension/dev-action-storage.ts`) rather
 * than duplicating them - both are pure functions over plain string keys and
 * numbers, with no dependency on `DevActionType` specifically. This module
 * only adds what IS specific to Shopify: a longer cooldown for a SHIP-tier
 * action than a VERIFY-tier one, and a key shape that also folds in the
 * workspace folder, so two different Shopify projects opened in the same
 * multi-root workspace never share one cooldown.
 */
import { ShopifyDevActionType } from './shopify-dev-action-types';

/**
 * Minutes suggested by the feature spec, converted to milliseconds. SHIP-tier
 * actions (push/deploy/publish) get materially longer cooldowns than
 * VERIFY-tier ones (check/build) - a real theme push or app deploy is not
 * something anyone does every few minutes, while a theme check or app build
 * reasonably might be.
 */
const SHOPIFY_DEV_ACTION_COOLDOWN_MS: Record<ShopifyDevActionType, number> = {
  'shopify-theme-check-success': 5 * 60 * 1000,
  'shopify-app-build-success': 5 * 60 * 1000,
  'shopify-theme-push-success': 10 * 60 * 1000,
  'shopify-extension-deploy-success': 15 * 60 * 1000,
  'shopify-function-deploy-success': 15 * 60 * 1000,
  'shopify-app-deploy-success': 30 * 60 * 1000,
  'shopify-theme-publish-success': 30 * 60 * 1000,
};

export function shopifyDevActionCooldownMs(type: ShopifyDevActionType): number {
  return SHOPIFY_DEV_ACTION_COOLDOWN_MS[type];
}

/**
 * The compound key one Shopify Dev Action's cooldown is tracked under.
 *
 * `workspaceState` already separates one opened workspace from another, but
 * NOT one folder from another inside the same multi-root workspace - folding
 * in `workspaceFolder` (already-available, non-sensitive metadata; never a
 * shop domain or store name) keeps a theme repo and an app repo opened side
 * by side from sharing a cooldown that belongs to neither.
 */
export function shopifyDevActionCooldownKey(
  type: ShopifyDevActionType,
  taskIdentity: string,
  workspaceFolder: string | undefined,
): string {
  return `${type}::${taskIdentity}::${workspaceFolder ?? ''}`;
}
