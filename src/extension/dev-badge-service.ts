/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import {
  DevBadge,
  isDevCacheFresh,
  isValidDevUsername,
  mergeWithCachedDevBadges,
  parseDevProfileHtml,
} from '../trainer/dev-badge-parse';
import {
  HttpNetworkError,
  HttpUnavailableError,
  httpGetText,
  isHttpAvailable,
} from '../trainer/trainer-http';
import {
  DevBadgeError,
  DevBadgeErrorKind,
  DevBadgesView,
} from '../trainer/trainer-types';
import { readDevCache, writeDevCache } from './trainer-storage';

/**
 * All DEV Community network access for the Trainer Card.
 *
 * Mirrors `trainer-github-service.ts`: runs only in the extension host (the
 * card's CSP has no `connect-src`, so the webview cannot reach dev.to
 * regardless), no authentication is used, and results are cached so opening
 * the card does not re-fetch every time.
 *
 * The difference from the GitHub service is the source: there is no public
 * DEV API for badges, so this fetches the profile page's HTML and hands it to
 * `parseDevProfileHtml`. That makes it inherently less stable than a
 * documented API — a DEV markup change can break extraction — so failures
 * degrade to cached data wherever possible rather than surfacing as a hard
 * error.
 */

/** Cached DEV badge data is served without a network call for this long. */
export const DEV_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const DEV_PROFILE_ROOT = 'https://dev.to';
const REQUEST_TIMEOUT_MS = 10_000;

const DEV_HEADERS: Record<string, string> = {
  accept: 'text/html',
  'user-agent': 'pokedev',
};

export interface DevBadgeResolution {
  badges?: DevBadge[];
  /** Epoch ms the data was fetched. */
  fetchedAt?: number;
  /** True when `badges` came from an expired cache after a failed refresh. */
  stale?: boolean;
  error?: DevBadgeError;
}

/**
 * In-flight requests keyed by lowercased username, so rapid Refresh clicks
 * share one round trip instead of hammering dev.to.
 */
const inFlight = new Map<string, Promise<DevBadgeResolution>>();

/**
 * Resolves DEV badges, preferring fresh cache.
 *
 * On failure with a cache present, the cached data is returned alongside the
 * error and flagged `stale` — same contract as `resolveGithubProfile` — so a
 * broken refresh never wipes badges that were working a moment ago.
 */
export async function resolveDevBadges(
  context: vscode.ExtensionContext,
  username: string,
  options: { forceRefresh?: boolean } = {},
): Promise<DevBadgeResolution> {
  const trimmed = username.trim();
  if (!isValidDevUsername(trimmed)) {
    return { error: makeError('invalid-username') };
  }

  const key = trimmed.toLowerCase();
  const now = Date.now();
  const cached = readDevCache(context);

  if (
    !options.forceRefresh &&
    isDevCacheFresh(cached, key, now, DEV_CACHE_TTL_MS)
  ) {
    // isDevCacheFresh already established that cached is defined.
    return { badges: cached?.badges, fetchedAt: cached?.fetchedAt };
  }

  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }

  const request = fetchAndCache(context, trimmed, key).catch(
    (e: unknown): DevBadgeResolution => {
      // fetchAndCache maps expected failures itself; this is the backstop for
      // anything unforeseen, so a bug there cannot reject into the panel.
      console.error('pokedev: DEV badge fetch failed', e);
      return { error: makeError('unknown') };
    },
  );
  inFlight.set(key, request);

  try {
    const result = await request;
    // Refresh failed but we still have something real to show — see
    // `mergeWithCachedDevBadges` for the rule this applies.
    return mergeWithCachedDevBadges(cached, key, result);
  } finally {
    inFlight.delete(key);
  }
}

async function fetchAndCache(
  context: vscode.ExtensionContext,
  username: string,
  key: string,
): Promise<DevBadgeResolution> {
  if (!isHttpAvailable()) {
    return { error: makeError('unsupported-runtime') };
  }

  const encoded = encodeURIComponent(username);

  let response;
  try {
    response = await httpGetText(
      `${DEV_PROFILE_ROOT}/${encoded}`,
      DEV_HEADERS,
      REQUEST_TIMEOUT_MS,
    );
  } catch (e) {
    return { error: mapThrownError(e) };
  }

  if (!response.ok) {
    return { error: mapStatus(response) };
  }

  let html;
  try {
    html = await response.text();
  } catch {
    return { error: makeError('malformed') };
  }

  const parsed = parseDevProfileHtml(html, username);
  if (!parsed.recognized) {
    return { error: makeError('malformed') };
  }

  const cache = await writeDevCache(context, key, parsed.badges, Date.now());
  return { badges: cache.badges, fetchedAt: cache.fetchedAt };
}

function mapThrownError(e: unknown): DevBadgeError {
  if (e instanceof HttpUnavailableError) {
    return makeError('unsupported-runtime');
  }
  if (e instanceof HttpNetworkError) {
    return makeError('offline');
  }
  return makeError('unknown');
}

function mapStatus(response: {
  status: number;
  header(name: string): string | null;
}): DevBadgeError {
  if (response.status === 404) {
    return makeError('not-found');
  }
  if (response.status === 429) {
    return makeError('rate-limited');
  }
  return makeError('unknown', response.status);
}

function makeError(kind: DevBadgeErrorKind, status?: number): DevBadgeError {
  return {
    kind,
    message: describeError(kind, status),
    // An invalid username is fixed by editing it, and an old runtime will not
    // improve on retry; everything else is worth another attempt.
    retryable: kind !== 'invalid-username' && kind !== 'unsupported-runtime',
  };
}

function describeError(kind: DevBadgeErrorKind, status?: number): string {
  switch (kind) {
    case 'invalid-username':
      return vscode.l10n.t('That is not a valid DEV username.');
    case 'not-found':
      return vscode.l10n.t('DEV profile not found.');
    case 'rate-limited':
      return vscode.l10n.t(
        'DEV Community rate limit reached. Try again later.',
      );
    case 'offline':
      return vscode.l10n.t('Unable to reach DEV Community.');
    case 'malformed':
      return vscode.l10n.t('DEV badges could not be parsed.');
    case 'unsupported-runtime':
      return vscode.l10n.t(
        'The Trainer Card needs a newer version of VS Code to reach DEV Community.',
      );
    default:
      return status
        ? vscode.l10n.t('Could not load your DEV badges (HTTP {0}).', status)
        : vscode.l10n.t('Could not load your DEV badges.');
  }
}

/** Test/reset seam: drops any in-flight request bookkeeping. */
export function resetDevBadgeRequestState(): void {
  inFlight.clear();
}

/** Shapes a resolution into the view the webview actually renders - shared
 * by every surface that shows DEV badges (`TrainerCardPanel`, PokeGear's
 * BADGES tab) so "what does an error/success resolution look like on
 * screen" is defined once. */
export function toDevBadgesView(
  username: string,
  resolution: DevBadgeResolution,
): DevBadgesView {
  if (resolution.badges) {
    return {
      status: 'connected',
      username,
      badges: resolution.badges,
      error: resolution.error,
      stale: resolution.stale,
      fetchedAt: resolution.fetchedAt,
    };
  }
  return { status: 'error', username, badges: [], error: resolution.error };
}

/**
 * Resolves the DEV badges view for a given username, or the disconnected
 * state for an empty one. Cache-preferring by default (`forceRefresh:
 * false`) - see `resolveDevBadges`/`DEV_CACHE_TTL_MS` - so a surface that
 * calls this on every render (PokeGear's live-update path included) does
 * not re-fetch dev.to every time.
 */
export async function resolveDevBadgesView(
  context: vscode.ExtensionContext,
  username: string,
  options: { forceRefresh?: boolean } = {},
): Promise<DevBadgesView> {
  if (username.length === 0) {
    return { status: 'disconnected', username: '', badges: [] };
  }
  const resolution = await resolveDevBadges(context, username, options);
  return toDevBadgesView(username, resolution);
}
