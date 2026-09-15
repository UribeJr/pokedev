import * as assert from 'assert';
import {
  DevBadgeCache,
  isDevCacheFresh,
  isValidDevUsername,
  mergeWithCachedDevBadges,
  parseDevBadgeCache,
  parseDevProfileHtml,
} from '../../trainer/dev-badge-parse';

const NOW = 1_700_000_000_000;
const TTL = 12 * 60 * 60 * 1000;

/**
 * Builds a fixture profile page mirroring dev.to's actual rendered markup
 * (verified against a live public profile): a canonical link, then one
 * `js-profile-badge` trigger div plus a matching `<template>` detail block
 * per badge.
 */
function fixtureProfileHtml(
  username: string,
  badges: {
    id: string;
    title: string;
    imageUrl: string;
    description?: string;
  }[],
): string {
  const trigger = (b: (typeof badges)[number]) => `
    <div role="button" onclick="window.Forem.showModal({size: 'medium', showHeader: false, contentSelector: '#${b.id}', overlay: true, backdropDismissible: true})"
       title="${b.title}"
       class="js-profile-badge  relative">
      <img src="${b.imageUrl}"
           alt="${b.title}"
           class="mx-auto w-75 h-auto align-middle"
           loading="lazy" />
    </div>`;

  const template = (b: (typeof badges)[number]) => `
    <template id="${b.id}">
      <div class="badge_details">
        <div class="badge-image-container p-3">
          <img class="badge-image" src="${b.imageUrl}" alt="${b.title} badge" title="${b.title}" loading="lazy" />
        </div>
        <div class="badge_text_content">
          <h4 class="title fw-800 fs-l">${b.title}</h4>
          ${b.description ? `<p class="description">${b.description}</p>` : ''}
        </div>
      </div>
    </template>`;

  return `<!DOCTYPE html>
<html>
<head><link rel="canonical" href="https://dev.to/${username}"></head>
<body>
  <div class="crayons-card crayons-card--secondary">
    <div class="crayons-card__body">
      <div class="grid gap-4 grid-cols-6 s:grid-cols-8 m:grid-cols-12 align-center items-center js-profile-badges">
        ${badges.map((b) => `${trigger(b)}\n${template(b)}`).join('\n')}
      </div>
    </div>
  </div>
</body>
</html>`;
}

suite('DEV username validation', () => {
  test('accepts real-world usernames', () => {
    for (const name of [
      'uribejr',
      'ben',
      'a',
      'user_123',
      'user-123',
      'A'.repeat(32),
    ]) {
      assert.strictEqual(isValidDevUsername(name), true, name);
    }
  });

  test('rejects malformed usernames', () => {
    for (const name of [
      '',
      'has space',
      'has/slash',
      '../etc/passwd',
      'user?query=1',
      'a'.repeat(33),
      undefined,
      42,
      null,
    ]) {
      assert.strictEqual(isValidDevUsername(name), false, String(name));
    }
  });
});

suite('DEV profile HTML parsing', () => {
  test('extracts a single badge with name and image', () => {
    const html = fixtureProfileHtml('octocat', [
      {
        id: 'badge-1',
        title: 'Warm Welcome',
        imageUrl: 'https://media2.dev.to/badge/warm-welcome.png',
        description: 'Awarded for a thoughtful first comment.',
      },
    ]);
    const result = parseDevProfileHtml(html, 'octocat');
    assert.strictEqual(result.recognized, true);
    assert.strictEqual(result.badges.length, 1);
    assert.strictEqual(result.badges[0].name, 'Warm Welcome');
    assert.strictEqual(
      result.badges[0].imageUrl,
      'https://media2.dev.to/badge/warm-welcome.png',
    );
    assert.strictEqual(
      result.badges[0].description,
      'Awarded for a thoughtful first comment.',
    );
  });

  test('extracts multiple badges in document order', () => {
    const html = fixtureProfileHtml('octocat', [
      {
        id: 'badge-1',
        title: 'First',
        imageUrl: 'https://media0.dev.to/a.png',
      },
      {
        id: 'badge-2',
        title: 'Second',
        imageUrl: 'https://media1.dev.to/b.png',
      },
      {
        id: 'badge-3',
        title: 'Third',
        imageUrl: 'https://media2.dev.to/c.png',
      },
    ]);
    const result = parseDevProfileHtml(html, 'octocat');
    assert.strictEqual(result.recognized, true);
    assert.deepStrictEqual(
      result.badges.map((b) => b.name),
      ['First', 'Second', 'Third'],
    );
  });

  test('decodes HTML entities in the badge name and description', () => {
    const html = fixtureProfileHtml('octocat', [
      {
        id: 'badge-1',
        title: 'AI Engineer World&#39;s Fair Badge',
        imageUrl: 'https://media2.dev.to/a.png',
        description: 'Cats &amp; dogs &#39;welcome&#39;.',
      },
    ]);
    const result = parseDevProfileHtml(html, 'octocat');
    assert.strictEqual(result.badges[0].name, "AI Engineer World's Fair Badge");
    assert.strictEqual(result.badges[0].description, "Cats & dogs 'welcome'.");
  });

  test('a badge with no matching template has no description', () => {
    const html = fixtureProfileHtml('octocat', [
      {
        id: 'badge-1',
        title: 'No Detail',
        imageUrl: 'https://media2.dev.to/a.png',
      },
    ]);
    const result = parseDevProfileHtml(html, 'octocat');
    assert.strictEqual(result.badges[0].description, undefined);
  });

  test('a non-https image url is discarded, dropping the badge', () => {
    const html = fixtureProfileHtml('octocat', [
      {
        id: 'badge-1',
        title: 'Sketchy',
        imageUrl: 'javascript:alert(1)',
      },
    ]);
    const result = parseDevProfileHtml(html, 'octocat');
    assert.strictEqual(result.recognized, true);
    assert.deepStrictEqual(result.badges, []);
  });

  test('duplicate badges (same name and image) are deduplicated', () => {
    const html = fixtureProfileHtml('octocat', [
      {
        id: 'badge-1',
        title: 'Repeat',
        imageUrl: 'https://media2.dev.to/a.png',
      },
      {
        id: 'badge-2',
        title: 'Repeat',
        imageUrl: 'https://media2.dev.to/a.png',
      },
    ]);
    const result = parseDevProfileHtml(html, 'octocat');
    assert.strictEqual(result.badges.length, 1);
  });

  test('a real profile with no badges section yields an empty, recognized result', () => {
    const html = `<!DOCTYPE html><html><head><link rel="canonical" href="https://dev.to/nobadges"></head><body>
      <div class="crayons-card crayons-card--secondary"><div class="crayons-card__body">No badges here.</div></div>
    </body></html>`;
    const result = parseDevProfileHtml(html, 'nobadges');
    assert.strictEqual(result.recognized, true);
    assert.deepStrictEqual(result.badges, []);
  });

  test('username casing does not affect the canonical-link check', () => {
    const html = fixtureProfileHtml('OctoCat', []);
    const result = parseDevProfileHtml(html, 'octocat');
    assert.strictEqual(result.recognized, true);
  });

  test('a page whose canonical link does not match is not recognized (malformed/wrong page)', () => {
    const html = fixtureProfileHtml('someone-else', [
      {
        id: 'badge-1',
        title: 'Not Yours',
        imageUrl: 'https://media2.dev.to/a.png',
      },
    ]);
    const result = parseDevProfileHtml(html, 'octocat');
    assert.strictEqual(result.recognized, false);
    assert.deepStrictEqual(result.badges, []);
  });

  test('a page with no canonical link at all is not recognized', () => {
    const html = '<html><body><h1>Something unexpected</h1></body></html>';
    const result = parseDevProfileHtml(html, 'octocat');
    assert.strictEqual(result.recognized, false);
  });

  test('empty input is not recognized rather than throwing', () => {
    assert.strictEqual(parseDevProfileHtml('', 'octocat').recognized, false);
  });
});

suite('DEV badge cache freshness', () => {
  function cache(overrides: Partial<DevBadgeCache> = {}): DevBadgeCache {
    return {
      version: 1,
      username: 'octocat',
      fetchedAt: NOW,
      badges: [
        { name: 'Warm Welcome', imageUrl: 'https://media2.dev.to/a.png' },
      ],
      ...overrides,
    };
  }

  test('a just-written cache is fresh', () => {
    assert.strictEqual(isDevCacheFresh(cache(), 'octocat', NOW, TTL), true);
  });

  test('fresh right up to the ttl, stale at and past it', () => {
    assert.strictEqual(
      isDevCacheFresh(cache(), 'octocat', NOW + TTL - 1, TTL),
      true,
    );
    assert.strictEqual(
      isDevCacheFresh(cache(), 'octocat', NOW + TTL, TTL),
      false,
    );
    assert.strictEqual(
      isDevCacheFresh(cache(), 'octocat', NOW + TTL + 1, TTL),
      false,
    );
  });

  test('a negative age is stale, not eternally fresh', () => {
    assert.strictEqual(
      isDevCacheFresh(cache(), 'octocat', NOW - 60_000, TTL),
      false,
    );
  });

  test('changing the configured username invalidates the old cache', () => {
    assert.strictEqual(
      isDevCacheFresh(cache(), 'someone-else', NOW, TTL),
      false,
    );
  });

  test('username comparison is case-insensitive', () => {
    assert.strictEqual(isDevCacheFresh(cache(), 'OctoCat', NOW, TTL), true);
    assert.strictEqual(isDevCacheFresh(cache(), '  octocat  ', NOW, TTL), true);
  });

  test('a missing or wrong-version cache is not fresh', () => {
    assert.strictEqual(isDevCacheFresh(undefined, 'octocat', NOW, TTL), false);
    assert.strictEqual(
      isDevCacheFresh(
        cache({ version: 2 as unknown as 1 }),
        'octocat',
        NOW,
        TTL,
      ),
      false,
    );
  });
});

suite('Persisted DEV cache validation', () => {
  test('accepts a well-formed record and lowercases the username', () => {
    const parsed = parseDevBadgeCache({
      version: 1,
      username: 'OctoCat',
      fetchedAt: NOW,
      badges: [
        { name: 'Warm Welcome', imageUrl: 'https://media2.dev.to/a.png' },
      ],
    });
    assert.ok(parsed);
    assert.strictEqual(parsed.username, 'octocat');
    assert.strictEqual(parsed.badges.length, 1);
  });

  test('drops individually malformed badge entries without failing the whole cache', () => {
    const parsed = parseDevBadgeCache({
      version: 1,
      username: 'octocat',
      fetchedAt: NOW,
      badges: [
        { name: 'Good', imageUrl: 'https://media2.dev.to/a.png' },
        { name: 'Bad image', imageUrl: 'javascript:alert(1)' },
        { name: '', imageUrl: 'https://media2.dev.to/b.png' },
        { imageUrl: 'https://media2.dev.to/c.png' },
        null,
        'nope',
      ],
    });
    assert.ok(parsed);
    assert.strictEqual(parsed.badges.length, 1);
    assert.strictEqual(parsed.badges[0].name, 'Good');
  });

  test('rejects records that cannot be trusted', () => {
    for (const raw of [
      undefined,
      null,
      {},
      [],
      { version: 2, username: 'a', fetchedAt: NOW, badges: [] },
      { version: 1, username: 5, fetchedAt: NOW, badges: [] },
      { version: 1, username: 'a', fetchedAt: 'soon', badges: [] },
      { version: 1, username: 'a', fetchedAt: NOW, badges: 'nope' },
    ]) {
      assert.strictEqual(
        parseDevBadgeCache(raw),
        undefined,
        JSON.stringify(raw),
      );
    }
  });
});

suite('mergeWithCachedDevBadges (failed-refresh fallback)', () => {
  const goodCache: DevBadgeCache = {
    version: 1,
    username: 'octocat',
    fetchedAt: NOW - 1000,
    badges: [{ name: 'Warm Welcome', imageUrl: 'https://media2.dev.to/a.png' }],
  };

  test('a failed refresh with matching cached data falls back to it, flagged stale', () => {
    const result = mergeWithCachedDevBadges(goodCache, 'octocat', {
      error: { kind: 'offline', message: 'offline', retryable: true },
    });
    assert.strictEqual(result.stale, true);
    assert.deepStrictEqual(result.badges, goodCache.badges);
    assert.strictEqual(result.fetchedAt, goodCache.fetchedAt);
    assert.deepStrictEqual(result.error, {
      kind: 'offline',
      message: 'offline',
      retryable: true,
    });
  });

  test('a failed refresh with no cache for this username surfaces the raw error', () => {
    const result = mergeWithCachedDevBadges(undefined, 'octocat', {
      error: { kind: 'not-found', message: 'not found', retryable: false },
    });
    assert.strictEqual(result.stale, undefined);
    assert.strictEqual(result.badges, undefined);
  });

  test('a failed refresh with cache for a DIFFERENT username does not fall back to it', () => {
    const result = mergeWithCachedDevBadges(goodCache, 'someone-else', {
      error: { kind: 'offline', message: 'offline', retryable: true },
    });
    assert.strictEqual(result.stale, undefined);
    assert.strictEqual(result.badges, undefined);
  });

  test('a successful refresh is returned as-is, even with a cache present', () => {
    const fresh = {
      badges: [{ name: 'New Badge', imageUrl: 'https://media2.dev.to/b.png' }],
      fetchedAt: NOW,
    };
    const result = mergeWithCachedDevBadges(goodCache, 'octocat', fresh);
    assert.deepStrictEqual(result, fresh);
  });
});
