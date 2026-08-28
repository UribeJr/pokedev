import * as assert from 'assert';
import {
  buildGithubProfileView,
  isCacheFresh,
  isValidGithubUsername,
  parseGithubCache,
  parseGithubRepos,
  parseGithubUser,
  summarizeRepos,
} from '../../trainer/github-parse';
import {
  computeTrainerClass,
  TRAINER_CLASS_FALLBACK_LABELS,
} from '../../trainer/trainer-class';
import {
  addTrainerXp,
  createDefaultTrainerProfile,
  getTrainerCardTier,
  getXpForNextTrainerLevel,
  MAX_TRAINER_LEVEL,
  normalizeTrainerProfile,
} from '../../trainer/trainer-profile';
import { GithubProfileCache, LanguageCount } from '../../trainer/trainer-types';

const NOW = 1_700_000_000_000;
const TTL = 45 * 60 * 1000;

function languages(entries: [string, number][]): LanguageCount[] {
  return entries.map(([language, repoCount]) => ({ language, repoCount }));
}

suite('TrainerProfile defaults', () => {
  test('a fresh profile starts at level 1 with nothing earned', () => {
    const profile = createDefaultTrainerProfile(NOW, 'octocat');
    assert.strictEqual(profile.version, 2);
    assert.strictEqual(profile.githubUsername, 'octocat');
    assert.strictEqual(profile.trainerLevel, 1);
    assert.strictEqual(profile.trainerXp, 0);
    assert.strictEqual(profile.pokemonCaught, 0);
    assert.strictEqual(profile.shinyPokemonCaught, 0);
    assert.deepStrictEqual(profile.badges, []);
    assert.deepStrictEqual(profile.achievements, []);
    assert.strictEqual(profile.totalCodingTimeMs, 0);
    assert.strictEqual(profile.createdAt, NOW);
  });

  test('username defaults to empty when omitted', () => {
    assert.strictEqual(createDefaultTrainerProfile(NOW).githubUsername, '');
  });
});

suite('normalizeTrainerProfile', () => {
  test('missing or non-object storage yields defaults', () => {
    for (const raw of [undefined, null, 42, 'nope', []]) {
      const profile = normalizeTrainerProfile(raw, NOW);
      assert.strictEqual(profile.trainerLevel, 1);
      assert.strictEqual(profile.createdAt, NOW);
    }
  });

  test('createdAt survives normalization', () => {
    const created = NOW - 90 * 24 * 60 * 60 * 1000;
    const profile = normalizeTrainerProfile(
      { version: 1, createdAt: created, trainerLevel: 4 },
      NOW,
    );
    assert.strictEqual(profile.createdAt, created);
    assert.strictEqual(profile.trainerLevel, 4);
  });

  test('a record with no version field is migrated rather than discarded', () => {
    const created = NOW - 1000;
    const profile = normalizeTrainerProfile(
      { githubUsername: 'ash', trainerLevel: 3, createdAt: created },
      NOW,
    );
    assert.strictEqual(profile.version, 2);
    assert.strictEqual(profile.githubUsername, 'ash');
    assert.strictEqual(profile.trainerLevel, 3);
    assert.strictEqual(profile.createdAt, created);
  });

  test('corrupt numbers are coerced, not propagated', () => {
    const profile = normalizeTrainerProfile(
      {
        version: 1,
        trainerLevel: -5,
        trainerXp: Number.NaN,
        pokemonCaught: -2,
        totalCodingTimeMs: 'lots',
        createdAt: 'yesterday',
      },
      NOW,
    );
    assert.strictEqual(profile.trainerLevel, 1);
    assert.strictEqual(profile.trainerXp, 0);
    assert.strictEqual(profile.pokemonCaught, 0);
    assert.strictEqual(profile.totalCodingTimeMs, 0);
    assert.strictEqual(profile.createdAt, NOW);
  });

  test('xp is clamped below the current level requirement', () => {
    const profile = normalizeTrainerProfile(
      { version: 1, trainerLevel: 1, trainerXp: 999_999 },
      NOW,
    );
    assert.ok(profile.trainerXp < getXpForNextTrainerLevel(1));
  });

  test('level is capped at the maximum', () => {
    const profile = normalizeTrainerProfile(
      { version: 1, trainerLevel: 9999 },
      NOW,
    );
    assert.strictEqual(profile.trainerLevel, MAX_TRAINER_LEVEL);
  });

  test('malformed badge and achievement entries are dropped and deduped', () => {
    const profile = normalizeTrainerProfile(
      {
        version: 1,
        badges: [
          { id: 'boulder', earnedAt: 5 },
          { id: 'boulder', earnedAt: 9 },
          { id: '' },
          'cascade',
          null,
          { earnedAt: 1 },
        ],
        achievements: 'not an array',
      },
      NOW,
    );
    assert.deepStrictEqual(profile.badges, [{ id: 'boulder', earnedAt: 5 }]);
    assert.deepStrictEqual(profile.achievements, []);
  });

  test('an explicit username argument wins over the stored one', () => {
    const profile = normalizeTrainerProfile(
      { version: 1, githubUsername: 'old' },
      NOW,
      'new',
    );
    assert.strictEqual(profile.githubUsername, 'new');
  });
});

suite('Trainer XP helpers', () => {
  test('the curve grows steadily from level 1', () => {
    assert.strictEqual(getXpForNextTrainerLevel(1), 100);
    assert.strictEqual(getXpForNextTrainerLevel(2), 150);
    assert.strictEqual(getXpForNextTrainerLevel(3), 225);
  });

  test('non-positive and non-finite levels fall back to level 1', () => {
    assert.strictEqual(getXpForNextTrainerLevel(0), 100);
    assert.strictEqual(getXpForNextTrainerLevel(-7), 100);
    assert.strictEqual(getXpForNextTrainerLevel(Number.NaN), 100);
  });

  test('the level cap bounds the requirement', () => {
    assert.strictEqual(
      getXpForNextTrainerLevel(1000),
      getXpForNextTrainerLevel(MAX_TRAINER_LEVEL),
    );
  });

  test('a partial grant accumulates without levelling', () => {
    const profile = addTrainerXp(createDefaultTrainerProfile(NOW), 40);
    assert.strictEqual(profile.trainerLevel, 1);
    assert.strictEqual(profile.trainerXp, 40);
  });

  test('reaching the requirement levels up and carries the remainder', () => {
    const profile = addTrainerXp(createDefaultTrainerProfile(NOW), 130);
    assert.strictEqual(profile.trainerLevel, 2);
    assert.strictEqual(profile.trainerXp, 30);
  });

  test('one grant can span several levels', () => {
    // 100 (1->2) + 150 (2->3) + 225 (3->4) + 325 (4->5) = 800, leaving 250.
    const profile = addTrainerXp(createDefaultTrainerProfile(NOW), 1050);
    assert.strictEqual(profile.trainerLevel, 5);
    assert.strictEqual(profile.trainerXp, 250);
  });

  test('invalid grants are a no-op', () => {
    const base = createDefaultTrainerProfile(NOW);
    for (const amount of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.deepStrictEqual(addTrainerXp(base, amount), base);
    }
  });

  test('addTrainerXp does not mutate its input', () => {
    const base = createDefaultTrainerProfile(NOW);
    addTrainerXp(base, 500);
    assert.strictEqual(base.trainerXp, 0);
    assert.strictEqual(base.trainerLevel, 1);
  });

  test('the level cap holds and clears residual xp', () => {
    const profile = addTrainerXp(
      createDefaultTrainerProfile(NOW),
      Number.MAX_SAFE_INTEGER,
    );
    assert.strictEqual(profile.trainerLevel, MAX_TRAINER_LEVEL);
    assert.strictEqual(profile.trainerXp, 0);
  });

  test('card tier follows level', () => {
    assert.strictEqual(getTrainerCardTier(1), 'base');
    assert.strictEqual(getTrainerCardTier(24), 'base');
    assert.strictEqual(getTrainerCardTier(25), 'copper');
    assert.strictEqual(getTrainerCardTier(50), 'silver');
    assert.strictEqual(getTrainerCardTier(75), 'gold');
    assert.strictEqual(getTrainerCardTier(Number.NaN), 'base');
  });
});

suite('Trainer class calculation', () => {
  test('TypeScript-heavy trainers are Frontend', () => {
    assert.strictEqual(
      computeTrainerClass(
        languages([
          ['TypeScript', 8],
          ['Go', 1],
        ]),
      ),
      'frontend',
    );
  });

  test('JavaScript also maps to Frontend', () => {
    assert.strictEqual(
      computeTrainerClass(languages([['JavaScript', 5]])),
      'frontend',
    );
  });

  test('Python-heavy trainers are Research', () => {
    assert.strictEqual(
      computeTrainerClass(
        languages([
          ['Python', 6],
          ['Jupyter Notebook', 2],
        ]),
      ),
      'research',
    );
  });

  test('Go and Rust map to Systems', () => {
    assert.strictEqual(computeTrainerClass(languages([['Go', 4]])), 'systems');
    assert.strictEqual(
      computeTrainerClass(languages([['Rust', 3]])),
      'systems',
    );
  });

  test('language matching is case and whitespace insensitive', () => {
    assert.strictEqual(
      computeTrainerClass(languages([['  typescript ', 4]])),
      'frontend',
    );
  });

  test('a three-way split with no dominant bucket is Full-Stack', () => {
    // 3 frontend / 3 research / 3 systems: top share is 1/3, below the 40%
    // dominance threshold.
    assert.strictEqual(
      computeTrainerClass(
        languages([
          ['TypeScript', 3],
          ['Python', 3],
          ['Rust', 3],
        ]),
      ),
      'fullstack',
    );
  });

  test('an exact two-way tie breaks alphabetically by bucket', () => {
    // frontend vs systems, 4 each. 'frontend' < 'systems', and 50% clears the
    // dominance threshold, so the result is deterministic.
    assert.strictEqual(
      computeTrainerClass(
        languages([
          ['Rust', 4],
          ['TypeScript', 4],
        ]),
      ),
      'frontend',
    );
    // Same input, reversed order: the answer must not change.
    assert.strictEqual(
      computeTrainerClass(
        languages([
          ['TypeScript', 4],
          ['Rust', 4],
        ]),
      ),
      'frontend',
    );
  });

  test('too little signal yields the novice class', () => {
    assert.strictEqual(computeTrainerClass(undefined), 'novice');
    assert.strictEqual(computeTrainerClass([]), 'novice');
    assert.strictEqual(
      computeTrainerClass(languages([['TypeScript', 2]])),
      'novice',
    );
  });

  test('unrecognised languages do not count toward the threshold', () => {
    assert.strictEqual(
      computeTrainerClass(languages([['Brainfuck', 40]])),
      'novice',
    );
  });

  test('zero and malformed counts are ignored', () => {
    assert.strictEqual(
      computeTrainerClass(
        languages([
          ['TypeScript', 0],
          ['Python', 0],
        ]),
      ),
      'novice',
    );
  });

  test('every class id has a fallback label', () => {
    for (const id of [
      'frontend',
      'research',
      'systems',
      'fullstack',
      'novice',
    ] as const) {
      assert.ok(TRAINER_CLASS_FALLBACK_LABELS[id].length > 0);
    }
  });
});

suite('GitHub username validation', () => {
  test('accepts real-world logins', () => {
    for (const name of ['octocat', 'a', 'jakob-hoeg', 'user123', 'a-b-c']) {
      assert.strictEqual(isValidGithubUsername(name), true, name);
    }
  });

  test('rejects malformed logins', () => {
    for (const name of [
      '',
      '-leading',
      'trailing-',
      'double--hyphen',
      'has space',
      'has_underscore',
      'a'.repeat(40),
      'sql;drop',
      '../etc/passwd',
      undefined,
      42,
      null,
    ]) {
      assert.strictEqual(isValidGithubUsername(name), false, String(name));
    }
  });
});

suite('GitHub response parsing', () => {
  const validUser = {
    id: 583231,
    login: 'octocat',
    name: 'The Octocat',
    avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
    html_url: 'https://github.com/octocat',
    bio: 'a cat',
    location: 'San Francisco',
    public_repos: 8,
    followers: 17200,
    following: 9,
    created_at: '2011-01-25T18:44:36Z',
  };

  test('parses a well-formed user', () => {
    const user = parseGithubUser(validUser);
    assert.ok(user);
    assert.strictEqual(user.login, 'octocat');
    assert.strictEqual(user.displayName, 'The Octocat');
    assert.strictEqual(user.id, 583231);
    assert.strictEqual(user.publicRepos, 8);
    assert.strictEqual(user.followers, 17200);
    assert.strictEqual(user.joinedAt, '2011-01-25T18:44:36Z');
  });

  test('rejects payloads with no usable login', () => {
    for (const raw of [
      null,
      undefined,
      {},
      [],
      'octocat',
      { login: 123 },
      { login: '   ' },
      { name: 'no login here' },
    ]) {
      assert.strictEqual(parseGithubUser(raw), undefined, JSON.stringify(raw));
    }
  });

  test('null name, bio and location degrade to sensible values', () => {
    const user = parseGithubUser({
      ...validUser,
      name: null,
      bio: null,
      location: null,
    });
    assert.ok(user);
    // With no display name set, the login stands in.
    assert.strictEqual(user.displayName, 'octocat');
    assert.strictEqual(user.bio, '');
    assert.strictEqual(user.location, '');
  });

  test('numeric strings are coerced and missing counts become zero', () => {
    const user = parseGithubUser({
      login: 'octocat',
      public_repos: '12',
      followers: 'not a number',
    });
    assert.ok(user);
    assert.strictEqual(user.publicRepos, 12);
    assert.strictEqual(user.followers, 0);
    assert.strictEqual(user.following, 0);
    assert.strictEqual(user.id, 0);
  });

  test('non-https avatar and profile urls are discarded', () => {
    const user = parseGithubUser({
      ...validUser,
      avatar_url: 'javascript:alert(1)',
      html_url: 'http://github.com/octocat',
    });
    assert.ok(user);
    assert.strictEqual(user.avatarUrl, '');
    assert.strictEqual(user.profileUrl, '');
  });

  test('the repos endpoint must return an array', () => {
    assert.deepStrictEqual(parseGithubRepos([]), []);
    for (const raw of [null, undefined, {}, { message: 'Not Found' }, 'nope']) {
      assert.strictEqual(parseGithubRepos(raw), undefined, JSON.stringify(raw));
    }
  });

  test('non-object repo entries are skipped', () => {
    const repos = parseGithubRepos([
      { stargazers_count: 3, language: 'Go', fork: false },
      null,
      'nope',
      42,
    ]);
    assert.ok(repos);
    assert.strictEqual(repos.length, 1);
    assert.strictEqual(repos[0].stars, 3);
  });
});

suite('Repository summarization', () => {
  test('sums stars over non-forks and ranks languages', () => {
    const repos = parseGithubRepos([
      { stargazers_count: 10, language: 'TypeScript', fork: false },
      { stargazers_count: 5, language: 'TypeScript', fork: false },
      { stargazers_count: 1, language: 'Go', fork: false },
      { stargazers_count: 999, language: 'C', fork: true },
      { stargazers_count: 2, language: null, fork: false },
    ]);
    assert.ok(repos);
    const summary = summarizeRepos(repos);
    assert.strictEqual(summary.totalStars, 18);
    assert.strictEqual(summary.sampledRepos, 4);
    assert.strictEqual(summary.sampleTruncated, false);
    assert.deepStrictEqual(summary.topLanguages, [
      { language: 'TypeScript', repoCount: 2 },
      { language: 'Go', repoCount: 1 },
    ]);
  });

  test('equal language counts are ordered alphabetically', () => {
    const repos = parseGithubRepos([
      { stargazers_count: 0, language: 'Zig', fork: false },
      { stargazers_count: 0, language: 'Ada', fork: false },
      { stargazers_count: 0, language: 'Ruby', fork: false },
    ]);
    assert.ok(repos);
    assert.deepStrictEqual(
      summarizeRepos(repos).topLanguages.map((l) => l.language),
      ['Ada', 'Ruby', 'Zig'],
    );
  });

  test('a full page is reported as truncated', () => {
    const repos = parseGithubRepos(
      new Array(100).fill({
        stargazers_count: 1,
        language: 'Go',
        fork: false,
      }),
    );
    assert.ok(repos);
    assert.strictEqual(summarizeRepos(repos).sampleTruncated, true);
  });

  test('an empty repo list yields zeroes rather than throwing', () => {
    const summary = summarizeRepos([]);
    assert.strictEqual(summary.totalStars, 0);
    assert.deepStrictEqual(summary.topLanguages, []);
    assert.strictEqual(summary.sampledRepos, 0);
  });

  test('a missing summary marks stars unknown rather than zero', () => {
    const user = parseGithubUser({ login: 'octocat' });
    assert.ok(user);
    const view = buildGithubProfileView(user, undefined);
    assert.strictEqual(view.totalStars, null);
    assert.deepStrictEqual(view.topLanguages, []);
    assert.strictEqual(view.sampleTruncated, false);
  });
});

suite('GitHub cache freshness', () => {
  function cache(overrides: Partial<GithubProfileCache> = {}) {
    const user = parseGithubUser({ login: 'octocat' });
    assert.ok(user);
    return {
      version: 1,
      username: 'octocat',
      fetchedAt: NOW,
      data: buildGithubProfileView(user, undefined),
      ...overrides,
    } as GithubProfileCache;
  }

  test('a just-written cache is fresh', () => {
    assert.strictEqual(isCacheFresh(cache(), 'octocat', NOW, TTL), true);
  });

  test('fresh right up to the ttl, stale at and past it', () => {
    assert.strictEqual(
      isCacheFresh(cache(), 'octocat', NOW + TTL - 1, TTL),
      true,
    );
    assert.strictEqual(isCacheFresh(cache(), 'octocat', NOW + TTL, TTL), false);
    assert.strictEqual(
      isCacheFresh(cache(), 'octocat', NOW + TTL + 1, TTL),
      false,
    );
  });

  test('a negative age is stale, not eternally fresh', () => {
    // Clock moved backwards, or a globalState synced from a machine running
    // ahead. Without this guard the cache would never expire.
    assert.strictEqual(
      isCacheFresh(cache(), 'octocat', NOW - 60_000, TTL),
      false,
    );
  });

  test('a cache for a different user is never served', () => {
    assert.strictEqual(isCacheFresh(cache(), 'someone-else', NOW, TTL), false);
  });

  test('username comparison is case-insensitive', () => {
    assert.strictEqual(isCacheFresh(cache(), 'OctoCat', NOW, TTL), true);
    assert.strictEqual(isCacheFresh(cache(), '  octocat  ', NOW, TTL), true);
  });

  test('a missing or wrong-version cache is not fresh', () => {
    assert.strictEqual(isCacheFresh(undefined, 'octocat', NOW, TTL), false);
    assert.strictEqual(
      isCacheFresh(cache({ version: 2 as unknown as 1 }), 'octocat', NOW, TTL),
      false,
    );
  });

  test('a non-numeric timestamp is not fresh', () => {
    assert.strictEqual(
      isCacheFresh(
        cache({ fetchedAt: 'recently' as unknown as number }),
        'octocat',
        NOW,
        TTL,
      ),
      false,
    );
  });
});

suite('Persisted cache validation', () => {
  test('accepts a well-formed record and lowercases the username', () => {
    const parsed = parseGithubCache({
      version: 1,
      username: 'OctoCat',
      fetchedAt: NOW,
      data: { login: 'octocat' },
    });
    assert.ok(parsed);
    assert.strictEqual(parsed.username, 'octocat');
    assert.strictEqual(parsed.fetchedAt, NOW);
  });

  test('rejects records that cannot be trusted', () => {
    for (const raw of [
      undefined,
      null,
      {},
      [],
      { version: 2, username: 'a', fetchedAt: NOW, data: { login: 'a' } },
      { version: 1, username: 5, fetchedAt: NOW, data: { login: 'a' } },
      { version: 1, username: 'a', fetchedAt: 'soon', data: { login: 'a' } },
      { version: 1, username: 'a', fetchedAt: NOW, data: null },
      { version: 1, username: 'a', fetchedAt: NOW, data: {} },
    ]) {
      assert.strictEqual(parseGithubCache(raw), undefined, JSON.stringify(raw));
    }
  });
});
