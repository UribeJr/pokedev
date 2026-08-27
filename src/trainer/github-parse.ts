/**
 * Parsing and validation for GitHub's public REST responses.
 *
 * Everything here is pure so it can be unit-tested without a network or a
 * `vscode` instance. The responses come from a third party, so each field is
 * validated rather than trusted: a malformed payload must yield `undefined`
 * (surfaced as a 'malformed' error) instead of a half-populated card.
 */
import {
  GithubProfileCache,
  GithubProfileView,
  LanguageCount,
} from './trainer-types';

/**
 * GitHub logins: 1-39 characters, alphanumeric or single hyphens, not leading
 * or trailing with a hyphen.
 */
export const GITHUB_USERNAME_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** One page of repositories is all we ever request. */
export const REPO_PAGE_SIZE = 100;

/** How many languages the card shows. */
export const TOP_LANGUAGE_COUNT = 3;

export function isValidGithubUsername(value: unknown): value is string {
  return typeof value === 'string' && GITHUB_USERNAME_PATTERN.test(value);
}

/** Core account fields, before repository stats are merged in. */
export interface GithubUserCore {
  id: number;
  login: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  location: string;
  profileUrl: string;
  publicRepos: number;
  followers: number;
  following: number;
  joinedAt: string;
}

export interface GithubRepoCore {
  fork: boolean;
  stars: number;
  language: string;
}

export interface RepoSummary {
  totalStars: number;
  topLanguages: LanguageCount[];
  sampledRepos: number;
  sampleTruncated: boolean;
}

/**
 * Parses `GET /users/{username}`.
 *
 * `login` is the only truly required field — without it there is no account to
 * show. Everything else degrades to a sensible empty value, because GitHub
 * legitimately returns `null` for bio, location and name.
 */
export function parseGithubUser(raw: unknown): GithubUserCore | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const login = raw['login'];
  if (typeof login !== 'string' || login.trim().length === 0) {
    return undefined;
  }

  const displayName = asText(raw['name']);
  return {
    id: toCount(raw['id']),
    login: login.trim(),
    // GitHub returns null for accounts with no display name set.
    displayName: displayName.length > 0 ? displayName : login.trim(),
    avatarUrl: asHttpsUrl(raw['avatar_url']),
    bio: asText(raw['bio']),
    location: asText(raw['location']),
    profileUrl: asHttpsUrl(raw['html_url']),
    publicRepos: toCount(raw['public_repos']),
    followers: toCount(raw['followers']),
    following: toCount(raw['following']),
    joinedAt: asText(raw['created_at']),
  };
}

/**
 * Parses `GET /users/{username}/repos`.
 *
 * Returns `undefined` when the payload is not an array — GitHub returns an
 * object for error responses, and silently treating that as "no repositories"
 * would show a confident 0 stars.
 */
export function parseGithubRepos(raw: unknown): GithubRepoCore[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const repos: GithubRepoCore[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      continue;
    }
    repos.push({
      fork: entry['fork'] === true,
      stars: toCount(entry['stargazers_count']),
      language: asText(entry['language']),
    });
  }
  return repos;
}

/**
 * Derives star and language stats from a repository page.
 *
 * Forks are excluded: their stars belong to the upstream project. Note that
 * GitHub reports a single primary language per repository, so the counts below
 * are "repositories whose primary language is X", not a byte breakdown — the
 * UI says as much rather than implying more precision than exists.
 */
export function summarizeRepos(repos: readonly GithubRepoCore[]): RepoSummary {
  const owned = repos.filter((repo) => !repo.fork);
  let totalStars = 0;
  const counts: Record<string, number> = {};

  for (const repo of owned) {
    totalStars += repo.stars;
    const language = repo.language.trim();
    if (language.length === 0) {
      continue;
    }
    counts[language] = (counts[language] ?? 0) + 1;
  }

  // Count descending, then language ascending, so equal counts are ordered
  // deterministically rather than by object key insertion order.
  const topLanguages = Object.keys(counts)
    .sort((a, b) => {
      const diff = counts[b] - counts[a];
      return diff !== 0 ? diff : a < b ? -1 : a > b ? 1 : 0;
    })
    .map((language) => ({ language, repoCount: counts[language] }));

  return {
    totalStars,
    topLanguages,
    sampledRepos: owned.length,
    sampleTruncated: repos.length >= REPO_PAGE_SIZE,
  };
}

/** Merges account fields with repository stats into the cacheable view. */
export function buildGithubProfileView(
  user: GithubUserCore,
  summary: RepoSummary | undefined,
): GithubProfileView {
  return {
    id: user.id,
    login: user.login,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    location: user.location,
    profileUrl: user.profileUrl,
    publicRepos: user.publicRepos,
    followers: user.followers,
    following: user.following,
    joinedAt: user.joinedAt,
    totalStars: summary ? summary.totalStars : null,
    topLanguages: summary ? summary.topLanguages : [],
    sampledRepos: summary ? summary.sampledRepos : 0,
    sampleTruncated: summary ? summary.sampleTruncated : false,
  };
}

/**
 * Whether cached GitHub data may be served without hitting the network.
 *
 * A negative age counts as stale: a clock change, or a globalState synced from
 * a machine running ahead, would otherwise mark the cache fresh forever.
 */
export function isCacheFresh(
  cache: GithubProfileCache | undefined,
  username: string,
  now: number,
  ttlMs: number,
): boolean {
  if (!cache || cache.version !== 1) {
    return false;
  }
  if (typeof cache.fetchedAt !== 'number' || !isFinite(cache.fetchedAt)) {
    return false;
  }
  if (cache.username !== username.trim().toLowerCase()) {
    return false;
  }
  const age = now - cache.fetchedAt;
  return age >= 0 && age < ttlMs;
}

/** Validates a persisted cache record before it is trusted. */
export function parseGithubCache(raw: unknown): GithubProfileCache | undefined {
  if (!isRecord(raw) || raw['version'] !== 1) {
    return undefined;
  }
  const username = raw['username'];
  const fetchedAt = raw['fetchedAt'];
  const data = raw['data'];
  if (
    typeof username !== 'string' ||
    typeof fetchedAt !== 'number' ||
    !isFinite(fetchedAt) ||
    !isRecord(data) ||
    typeof data['login'] !== 'string'
  ) {
    return undefined;
  }
  return {
    version: 1,
    username: username.toLowerCase(),
    fetchedAt,
    data: data as unknown as GithubProfileView,
  };
}

/* ------------------------------- helpers ------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Coerces a count, tolerating the numeric strings GitHub proxies sometimes emit. */
function toCount(value: unknown): number {
  if (typeof value === 'number' && isFinite(value)) {
    return Math.max(Math.floor(value), 0);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (isFinite(parsed)) {
      return Math.max(Math.floor(parsed), 0);
    }
  }
  return 0;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Accepts only https URLs. The card's CSP restricts img-src to
 * githubusercontent.com, but dropping anything non-https here means a hostile
 * payload cannot even attempt a javascript: or data: src.
 */
function asHttpsUrl(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed.toLowerCase().indexOf('https://') === 0 ? trimmed : '';
}
