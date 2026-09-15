import * as assert from 'assert';
import {
  buildPokeGearActivityView,
  isSameLocalDay,
} from '../../pokegear/pokegear-activity';
import {
  POKEGEAR_ACTIVITY_FEED_LIMIT,
  POKEGEAR_TABS,
} from '../../pokegear/pokegear-types';
import { ProgressionEvent } from '../../progression/progression-types';

function event(
  type: ProgressionEvent['type'],
  timestamp: number,
  metadata?: Record<string, unknown>,
): ProgressionEvent {
  return { type, trainerXp: 0, pokemonXp: 0, timestamp, metadata };
}

suite('PokeGear: tab catalog', () => {
  test('has exactly the five tabs, in the specified order', () => {
    assert.deepStrictEqual(POKEGEAR_TABS, [
      'status',
      'activity',
      'badges',
      'party',
      'bag',
    ]);
  });

  test('has stable, unique tab ids', () => {
    const unique = new Set(POKEGEAR_TABS);
    assert.strictEqual(unique.size, POKEGEAR_TABS.length);
  });
});

suite('PokeGear: isSameLocalDay', () => {
  test('the same instant is the same day', () => {
    const now = Date.now();
    assert.strictEqual(isSameLocalDay(now, now), true);
  });

  test('two timestamps on the same calendar day are the same day', () => {
    const morning = new Date(2026, 5, 6, 8, 0, 0).getTime();
    const evening = new Date(2026, 5, 6, 22, 0, 0).getTime();
    assert.strictEqual(isSameLocalDay(morning, evening), true);
  });

  test('timestamps on different calendar days are not the same day', () => {
    const today = new Date(2026, 5, 6, 23, 59, 0).getTime();
    const tomorrow = new Date(2026, 5, 7, 0, 1, 0).getTime();
    assert.strictEqual(isSameLocalDay(today, tomorrow), false);
  });

  test('different months/years are not the same day even if date-of-month matches', () => {
    const juneSixth = new Date(2026, 5, 6, 12, 0, 0).getTime();
    const julySixth = new Date(2026, 6, 6, 12, 0, 0).getTime();
    assert.strictEqual(isSameLocalDay(juneSixth, julySixth), false);
  });
});

suite('PokeGear: buildPokeGearActivityView - today stats', () => {
  test('counts git-commit events from today only', () => {
    const now = new Date(2026, 5, 6, 12, 0, 0).getTime();
    const yesterday = new Date(2026, 5, 5, 12, 0, 0).getTime();
    const log = [
      event('git-commit', now),
      event('git-commit', now),
      event('git-commit', yesterday),
    ];
    const view = buildPokeGearActivityView(log, 0, 3, now);
    assert.strictEqual(view.today.commits, 2);
  });

  test('counts every Dev Action type (including the task-success fallback) as one group', () => {
    const now = Date.now();
    const log = [
      event('build-success', now),
      event('test-success', now),
      event('typecheck-success', now),
      event('lint-success', now),
      event('task-success', now),
    ];
    const view = buildPokeGearActivityView(log, 0, 3, now);
    assert.strictEqual(view.today.devActions, 5);
  });

  test('does not count work-batch/active-coding as commits or Dev Actions', () => {
    const now = Date.now();
    const log = [event('work-batch', now), event('active-coding', now)];
    const view = buildPokeGearActivityView(log, 0, 3, now);
    assert.strictEqual(view.today.commits, 0);
    assert.strictEqual(view.today.devActions, 0);
  });

  test('passes daily completion counts through unchanged - never recomputed here', () => {
    const view = buildPokeGearActivityView([], 2, 3, Date.now());
    assert.strictEqual(view.today.dailyCompletedCount, 2);
    assert.strictEqual(view.today.dailyTotalCount, 3);
  });
});

suite('PokeGear: buildPokeGearActivityView - recent feed', () => {
  test('excludes ambient work-batch/active-coding entries from the feed', () => {
    const now = Date.now();
    const log = [
      event('active-coding', now),
      event('git-commit', now),
      event('work-batch', now),
    ];
    const view = buildPokeGearActivityView(log, 0, 0, now);
    assert.deepStrictEqual(
      view.recent.map((e) => e.type),
      ['git-commit'],
    );
  });

  test('includes the three observational event types', () => {
    const now = Date.now();
    const log = [
      event('pokemon-level-up', now, { species: 'Pichu', level: 11 }),
      event('pokemon-evolved', now, {
        fromSpecies: 'Pichu',
        toSpecies: 'Pikachu',
      }),
      event('daily-challenge-complete', now, { title: 'Deep Work' }),
    ];
    const view = buildPokeGearActivityView(log, 0, 0, now);
    assert.strictEqual(view.recent.length, 3);
    assert.deepStrictEqual(
      view.recent.map((e) => e.type).sort(),
      [
        'daily-challenge-complete',
        'pokemon-evolved',
        'pokemon-level-up',
      ].sort(),
    );
  });

  test("preserves the log's own newest-first order without re-sorting", () => {
    const newest = Date.now();
    const older = newest - 1000;
    const oldest = newest - 2000;
    // Deliberately passed newest-first, matching `appendToLog`'s contract -
    // this function trusts that order rather than re-sorting by timestamp.
    const log = [
      event('git-commit', newest),
      event('build-success', older),
      event('test-success', oldest),
    ];
    const view = buildPokeGearActivityView(log, 0, 0, newest);
    assert.deepStrictEqual(
      view.recent.map((e) => e.timestamp),
      [newest, older, oldest],
    );
  });

  test('caps the feed at POKEGEAR_ACTIVITY_FEED_LIMIT even with a longer log', () => {
    const now = Date.now();
    const log = Array.from(
      { length: POKEGEAR_ACTIVITY_FEED_LIMIT + 10 },
      (_, i) => event('git-commit', now - i * 1000),
    );
    const view = buildPokeGearActivityView(log, 0, 0, now);
    assert.strictEqual(view.recent.length, POKEGEAR_ACTIVITY_FEED_LIMIT);
  });

  test('carries the metadata through untouched - never raw terminal/source content', () => {
    const now = Date.now();
    const log = [
      event('daily-challenge-complete', now, {
        definitionId: 'deep-work',
        title: 'Deep Work',
        rewardTrainerXp: 40,
      }),
    ];
    const view = buildPokeGearActivityView(log, 0, 0, now);
    assert.deepStrictEqual(view.recent[0].metadata, {
      definitionId: 'deep-work',
      title: 'Deep Work',
      rewardTrainerXp: 40,
    });
  });

  test('an empty log produces an empty feed and zeroed today stats', () => {
    const view = buildPokeGearActivityView([], 0, 0, Date.now());
    assert.deepStrictEqual(view.recent, []);
    assert.strictEqual(view.today.commits, 0);
    assert.strictEqual(view.today.devActions, 0);
  });
});
