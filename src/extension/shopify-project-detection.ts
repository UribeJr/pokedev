/**
 * Detects what kind of Shopify project a workspace folder looks like, using
 * lightweight file-EXISTENCE checks only.
 *
 * Deliberately NOT a deep scan: this never reads file contents, never greps
 * source, and never walks the whole tree looking for clues - it only asks
 * "does one of a handful of well-known Shopify CLI project files/directories
 * exist at this path", the same one-shot-and-cheap spirit
 * `detectDevActionCapabilities` already uses for the generic Dev Actions
 * capability scan (`dev-action-capabilities.ts`), just keyed off the
 * filesystem instead of registered tasks - a Shopify theme/app project is
 * identifiable from its shape before any task has ever run in it.
 *
 * Used only to gate which managed commands and Daily Challenges are offered;
 * never to decide whether an actually-observed success earns XP.
 */
import * as vscode from 'vscode';
import {
  NO_SHOPIFY_CAPABILITIES,
  ShopifyCapabilities,
} from '../progression/shopify-dev-action-types';
import { isShopifyDevActionsEnabled } from './shopify-task-bridge';

/** Excluded from every search below - large, irrelevant, and the one
 * directory most likely to contain a false-positive vendored `theme.liquid`
 * or `shopify.app.toml` sample file. */
const EXCLUDE_GLOB = '**/node_modules/**';

const THEME_SIGNAL_GLOBS: readonly string[] = [
  'layout/theme.liquid',
  'config/settings_schema.json',
  'sections/*',
  'templates/*',
];

const APP_SIGNAL_GLOBS: readonly string[] = [
  'shopify.app.toml',
  'shopify.app.*.toml',
];

const EXTENSION_SIGNAL_GLOBS: readonly string[] = ['extensions/*'];

async function anySignalExists(
  folder: vscode.WorkspaceFolder,
  globs: readonly string[],
): Promise<boolean> {
  for (const glob of globs) {
    try {
      const matches = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, glob),
        EXCLUDE_GLOB,
        1,
      );
      if (matches.length > 0) {
        return true;
      }
    } catch {
      // Conservative: a search that fails counts as "not found" rather than
      // throwing capability detection off entirely.
    }
  }
  return false;
}

export async function detectShopifyCapabilitiesForFolder(
  folder: vscode.WorkspaceFolder,
): Promise<ShopifyCapabilities> {
  const [theme, app, extensions] = await Promise.all([
    anySignalExists(folder, THEME_SIGNAL_GLOBS),
    anySignalExists(folder, APP_SIGNAL_GLOBS),
    anySignalExists(folder, EXTENSION_SIGNAL_GLOBS),
  ]);
  return { theme, app, extensions };
}

/**
 * Capabilities across every open workspace folder, OR'd together - matching
 * `DailyChallengeEligibilityContext`'s existing "is this possible anywhere in
 * this workspace" model. Called only when Daily Challenges generates today's
 * set and when building the `PokéDev: Shopify Actions...` QuickPick, never
 * polled.
 */
export async function detectShopifyCapabilities(): Promise<ShopifyCapabilities> {
  if (!isShopifyDevActionsEnabled()) {
    return NO_SHOPIFY_CAPABILITIES;
  }
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    return NO_SHOPIFY_CAPABILITIES;
  }
  const results = await Promise.all(
    folders.map(detectShopifyCapabilitiesForFolder),
  );
  return {
    theme: results.some((result) => result.theme),
    app: results.some((result) => result.app),
    extensions: results.some((result) => result.extensions),
  };
}
