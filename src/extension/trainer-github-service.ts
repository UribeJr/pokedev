/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import {
  buildGithubProfileView,
  isCacheFresh,
  isValidGithubUsername,
  parseGithubRepos,
  parseGithubUser,
  REPO_PAGE_SIZE,
  summarizeRepos,
} from '../trainer/github-parse';
import {
  HttpNetworkError,
  HttpUnavailableError,
  httpGetJson,
  isHttpAvailable,
} from '../trainer/trainer-http';
import {
  GithubProfileView,
  TrainerError,
  TrainerErrorKind,
} from '../trainer/trainer-types';
import { readGithubCache, writeGithubCache } from './trainer-storage';

/**
 * All GitHub network access for the Trainer Card.
 *
 * This runs in the extension host, never in the webview: the card's CSP sets
 * `default-src 'none'` with no `connect-src`, so the webview is structurally
 * unable to reach api.github.com even if it tried.
 *
 * No authentication is used. Unauthenticated GitHub allows 60 requests per hour
 * per IP and a refresh costs two, so results are cached and refreshes are
 * deduplicated.
 */

/** Cached GitHub data is served without a network call for this long. */
export const GITHUB_CACHE_TTL_MS = 45 * 60 * 1000;

const GITHUB_API_ROOT = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 10_000;

const GITHUB_HEADERS: Record<string, string> = {
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  // Required by the GitHub API for server-side clients; browsers and
  // webworkers ignore it.
  'user-agent': 'vscode-pokemon',
};

export interface GithubResolution {
  data?: GithubProfileView;
  /** Epoch ms the data was fetched. */
  fetchedAt?: number;
  /** True when `data` came from an expired cache after a failed refresh. */
  stale?: boolean;
  error?: TrainerError;
}

/**
 * In-flight requests keyed by lowercased username, so rapid Refresh clicks
 * share one round trip instead of burning the hourly budget.
 */
const inFlight = new Map<string, Promise<GithubResolution>>();

/**
 * Resolves a GitHub profile, preferring fresh cache.
 *
 * On failure with a cache present, the cached data is returned alongside the
 * error and flagged `stale` — the card then shows real data plus a "couldn't
 * refresh" notice rather than dropping the user onto a blank error screen.
 */
export async function resolveGithubProfile(
  context: vscode.ExtensionContext,
  username: string,
  options: { forceRefresh?: boolean } = {},
): Promise<GithubResolution> {
  const trimmed = username.trim();
  if (!isValidGithubUsername(trimmed)) {
    return { error: makeError('invalid-username') };
  }

  const key = trimmed.toLowerCase();
  const now = Date.now();
  const cached = readGithubCache(context);

  if (
    !options.forceRefresh &&
    isCacheFresh(cached, key, now, GITHUB_CACHE_TTL_MS)
  ) {
    // isCacheFresh already established that cached is defined.
    return { data: cached?.data, fetchedAt: cached?.fetchedAt };
  }

  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }

  const request = fetchAndCache(context, trimmed, key).catch(
    (e: unknown): GithubResolution => {
      // fetchAndCache maps expected failures itself; this is the backstop for
      // anything unforeseen, so a bug there cannot reject into the panel.
      console.error('vscode-pokemon: trainer profile fetch failed', e);
      return { error: makeError('unknown') };
    },
  );
  inFlight.set(key, request);

  try {
    const result = await request;
    if (result.error && cached && cached.username === key) {
      // Refresh failed but we still have something real to show.
      return {
        data: cached.data,
        fetchedAt: cached.fetchedAt,
        stale: true,
        error: result.error,
      };
    }
    return result;
  } finally {
    inFlight.delete(key);
  }
}

async function fetchAndCache(
  context: vscode.ExtensionContext,
  username: string,
  key: string,
): Promise<GithubResolution> {
  if (!isHttpAvailable()) {
    return { error: makeError('unsupported-runtime') };
  }

  const encoded = encodeURIComponent(username);

  let userResponse;
  try {
    userResponse = await httpGetJson(
      `${GITHUB_API_ROOT}/users/${encoded}`,
      GITHUB_HEADERS,
      REQUEST_TIMEOUT_MS,
    );
  } catch (e) {
    return { error: mapThrownError(e) };
  }

  if (!userResponse.ok) {
    return { error: mapStatus(userResponse) };
  }

  let user;
  try {
    user = parseGithubUser(await userResponse.json());
  } catch {
    return { error: makeError('malformed') };
  }
  if (!user) {
    return { error: makeError('malformed') };
  }

  // Repositories are a bonus: if this request fails the card still renders with
  // stars unknown and no languages, rather than failing outright.
  const summary = await fetchRepoSummary(encoded);
  const data = buildGithubProfileView(user, summary);
  const cache = await writeGithubCache(context, key, data, Date.now());
  return { data: cache.data, fetchedAt: cache.fetchedAt };
}

async function fetchRepoSummary(encodedUsername: string) {
  try {
    const response = await httpGetJson(
      `${GITHUB_API_ROOT}/users/${encodedUsername}/repos` +
        `?per_page=${REPO_PAGE_SIZE}&sort=pushed&type=owner`,
      GITHUB_HEADERS,
      REQUEST_TIMEOUT_MS,
    );
    if (!response.ok) {
      return undefined;
    }
    const repos = parseGithubRepos(await response.json());
    return repos ? summarizeRepos(repos) : undefined;
  } catch {
    return undefined;
  }
}

function mapThrownError(e: unknown): TrainerError {
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
}): TrainerError {
  if (response.status === 404) {
    return makeError('not-found');
  }
  if (response.status === 403 || response.status === 429) {
    const remaining = response.header('x-ratelimit-remaining');
    const reset = response.header('x-ratelimit-reset');
    const retryAfter = response.header('retry-after');

    if (remaining === '0' && reset) {
      const resetMs = Number(reset) * 1000;
      if (isFinite(resetMs) && resetMs > 0) {
        return makeError('rate-limited', resetMs);
      }
    }
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (isFinite(seconds) && seconds >= 0) {
        return makeError('rate-limited', Date.now() + seconds * 1000);
      }
    }
    return makeError('rate-limited');
  }
  return makeError('unknown', undefined, response.status);
}

function makeError(
  kind: TrainerErrorKind,
  retryAt?: number,
  status?: number,
): TrainerError {
  return {
    kind,
    message: describeError(kind, status),
    retryAt,
    // An invalid username is fixed by editing it, and an old runtime will not
    // improve on retry; everything else is worth another attempt.
    retryable: kind !== 'invalid-username' && kind !== 'unsupported-runtime',
  };
}

function describeError(kind: TrainerErrorKind, status?: number): string {
  switch (kind) {
    case 'invalid-username':
      return vscode.l10n.t('That is not a valid GitHub username.');
    case 'not-found':
      return vscode.l10n.t('GitHub user not found.');
    case 'rate-limited':
      return vscode.l10n.t('GitHub API rate limit reached. Try again later.');
    case 'offline':
      return vscode.l10n.t('Unable to connect to GitHub.');
    case 'malformed':
      return vscode.l10n.t('GitHub returned an unexpected response.');
    case 'unsupported-runtime':
      return vscode.l10n.t(
        'The Trainer Card needs a newer version of VS Code to reach GitHub.',
      );
    default:
      return status
        ? vscode.l10n.t(
            'Could not load your GitHub profile (HTTP {0}).',
            status,
          )
        : vscode.l10n.t('Could not load your GitHub profile.');
  }
}

/** Test/reset seam: drops any in-flight request bookkeeping. */
export function resetGithubRequestState(): void {
  inFlight.clear();
}
