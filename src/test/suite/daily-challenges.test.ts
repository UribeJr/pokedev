import * as assert from 'assert';
import {
  DAILY_CHALLENGE_CATALOG,
  isDefinitionEligible,
} from '../../challenges/daily-challenge-catalog';
import {
  localDateKey,
  shouldRegenerateDailyChallenges,
} from '../../challenges/daily-challenge-date';
import {
  buildDailySeed,
  DAILY_CHALLENGE_COUNT,
  generateDailyChallenges,
} from '../../challenges/daily-challenge-generator';
import {
  applyDailyChallengeSignal,
  DailyChallengeSignal,
  markRewardsGranted,
  normalizeDailyChallengeState,
} from '../../challenges/daily-challenge-progress';
import { createSeededRandom } from '../../challenges/daily-challenge-rng';
import {
  DailyChallengeDefinition,
  DailyChallengeEligibilityContext,
  DailyChallengeInstance,
  DailyChallengeState,
} from '../../challenges/daily-challenge-types';
import {
  buildLoadingViewModel,
  toDailyChallengesViewModel,
} from '../../challenges/daily-challenges-view-types';

const ALL_DEV_ACTIONS = {
  build: true,
  test: true,
  typecheck: true,
  lint: true,
};
const NO_DEV_ACTIONS = {
  build: false,
  test: false,
  typecheck: false,
  lint: false,
};

const RICH_CONTEXT: DailyChallengeEligibilityContext = {
  trainerLevel: 40,
  hasGitRepo: true,
  partyCount: 5,
  hasPokemonBelowLevel10: true,
  devActionCapabilities: ALL_DEV_ACTIONS,
};

const THIN_CONTEXT: DailyChallengeEligibilityContext = {
  trainerLevel: 1,
  hasGitRepo: false,
  partyCount: 0,
  hasPokemonBelowLevel10: false,
  devActionCapabilities: NO_DEV_ACTIONS,
};

function makeLabels() {
  return {
    todayLabel: 'Today',
    completeLabel: 'Complete',
    xpLabel: 'XP',
    resetLabel: 'New challenges tomorrow',
    loadingLabel: 'Loading',
    errorLabel: 'Error',
  };
}

/* ------------------------------------------------------------------ *
 * Generator
 * ------------------------------------------------------------------ */

suite('Daily Challenges: generator', () => {
  test('generates exactly three challenges for a rich context', () => {
    const seed = buildDailySeed('2026-09-02', 'trainer-a');
    const challenges = generateDailyChallenges(RICH_CONTEXT, seed);
    assert.strictEqual(challenges.length, DAILY_CHALLENGE_COUNT);
  });

  test('is deterministic for the same date and profile seed', () => {
    const seed = buildDailySeed('2026-09-02', 'trainer-a');
    const first = generateDailyChallenges(RICH_CONTEXT, seed);
    const second = generateDailyChallenges(RICH_CONTEXT, seed);
    assert.deepStrictEqual(
      first.map((c) => c.definitionId),
      second.map((c) => c.definitionId),
    );
  });

  test('a different date can produce a different set', () => {
    const resultsByDay = new Set<string>();
    for (let day = 1; day <= 28; day++) {
      const dateKey = `2026-09-${String(day).padStart(2, '0')}`;
      const seed = buildDailySeed(dateKey, 'trainer-a');
      const ids = generateDailyChallenges(RICH_CONTEXT, seed)
        .map((c) => c.definitionId)
        .join(',');
      resultsByDay.add(ids);
    }
    assert.ok(
      resultsByDay.size > 1,
      'expected at least two distinct daily sets across a month of seeds',
    );
  });

  test('never repeats a definition id within one day', () => {
    for (let day = 1; day <= 10; day++) {
      const seed = buildDailySeed(`2026-0${(day % 9) + 1}-01`, 'trainer-b');
      const challenges = generateDailyChallenges(RICH_CONTEXT, seed);
      const ids = challenges.map((c) => c.definitionId);
      assert.strictEqual(new Set(ids).size, ids.length);
    }
  });

  test('never repeats a family within one day', () => {
    for (let day = 1; day <= 10; day++) {
      const seed = buildDailySeed(`2026-0${(day % 9) + 1}-02`, 'trainer-c');
      const challenges = generateDailyChallenges(RICH_CONTEXT, seed);
      const families = challenges.map((c) => c.family);
      assert.strictEqual(new Set(families).size, families.length);
    }
  });

  test('draws from more than one category when everything is eligible', () => {
    const seed = buildDailySeed('2026-09-02', 'trainer-d');
    const challenges = generateDailyChallenges(RICH_CONTEXT, seed);
    const categories = new Set(challenges.map((c) => c.category));
    assert.ok(categories.size >= 2);
  });

  test('excludes Git challenges when no repository is open', () => {
    const context: DailyChallengeEligibilityContext = {
      ...RICH_CONTEXT,
      hasGitRepo: false,
    };
    for (let day = 1; day <= 15; day++) {
      const seed = buildDailySeed(
        `2026-10-${String(day).padStart(2, '0')}`,
        'x',
      );
      const challenges = generateDailyChallenges(context, seed);
      assert.ok(challenges.every((c) => c.category !== 'git'));
    }
  });

  test('excludes the multi-Pokemon challenge without enough Pokemon', () => {
    const context: DailyChallengeEligibilityContext = {
      ...RICH_CONTEXT,
      partyCount: 1,
    };
    for (let day = 1; day <= 15; day++) {
      const seed = buildDailySeed(
        `2026-11-${String(day).padStart(2, '0')}`,
        'x',
      );
      const challenges = generateDailyChallenges(context, seed);
      assert.ok(challenges.every((c) => c.definitionId !== 'team-training'));
    }
  });

  test('excludes every training challenge with zero Pokemon', () => {
    const context: DailyChallengeEligibilityContext = {
      ...RICH_CONTEXT,
      partyCount: 0,
      hasPokemonBelowLevel10: false,
    };
    const seed = buildDailySeed('2026-09-02', 'no-party');
    const challenges = generateDailyChallenges(context, seed);
    assert.ok(challenges.every((c) => c.category !== 'training'));
  });

  test('falls back to a thin context without throwing', () => {
    const seed = buildDailySeed('2026-09-02', 'thin');
    const challenges = generateDailyChallenges(THIN_CONTEXT, seed);
    assert.strictEqual(challenges.length, DAILY_CHALLENGE_COUNT);
    assert.ok(challenges.every((c) => c.category !== 'training'));
    assert.ok(challenges.every((c) => c.category !== 'git'));
  });

  test('selects the tier matching the current Trainer level', () => {
    const definition = DAILY_CHALLENGE_CATALOG.find(
      (d) => d.id === 'meaningful-saves',
    ) as DailyChallengeDefinition;
    const catalog: DailyChallengeDefinition[] = [definition];

    const seed = buildDailySeed('2026-09-02', 'tier-check');
    const level1 = generateDailyChallenges(
      { ...RICH_CONTEXT, trainerLevel: 1 },
      seed,
      catalog,
    );
    assert.strictEqual(level1[0].target, 5);
    assert.strictEqual(level1[0].rewardTrainerXp, 20);
    assert.strictEqual(level1[0].title, 'Warm Up');

    const level30 = generateDailyChallenges(
      { ...RICH_CONTEXT, trainerLevel: 30 },
      seed,
      catalog,
    );
    assert.strictEqual(level30[0].target, 15);
    assert.strictEqual(level30[0].rewardTrainerXp, 45);
    assert.strictEqual(level30[0].title, 'Power Saver');
  });

  test('isDefinitionEligible: underdog requires a Pokemon below level 10', () => {
    const underdog = DAILY_CHALLENGE_CATALOG.find(
      (d) => d.id === 'underdog',
    ) as DailyChallengeDefinition;
    assert.strictEqual(
      isDefinitionEligible(underdog, {
        ...RICH_CONTEXT,
        hasPokemonBelowLevel10: false,
      }),
      false,
    );
    assert.strictEqual(
      isDefinitionEligible(underdog, {
        ...RICH_CONTEXT,
        hasPokemonBelowLevel10: true,
      }),
      true,
    );
  });
});

/* ------------------------------------------------------------------ *
 * Local date / regeneration boundary
 * ------------------------------------------------------------------ */

suite('Daily Challenges: local date boundary', () => {
  test('localDateKey uses local calendar fields, not a rolling window', () => {
    const key = localDateKey(new Date(2026, 8, 2, 23, 59).getTime());
    assert.strictEqual(key, '2026-09-02');
  });

  test('does not regenerate for the same local day (survives reload)', () => {
    assert.strictEqual(
      shouldRegenerateDailyChallenges('2026-09-02', '2026-09-02'),
      false,
    );
  });

  test('regenerates once the local day has changed', () => {
    assert.strictEqual(
      shouldRegenerateDailyChallenges('2026-09-02', '2026-09-03'),
      true,
    );
  });

  test('regenerates when nothing was ever persisted', () => {
    assert.strictEqual(
      shouldRegenerateDailyChallenges(undefined, '2026-09-02'),
      true,
    );
  });
});

/* ------------------------------------------------------------------ *
 * Progress
 * ------------------------------------------------------------------ */

function makeInstance(
  overrides: Partial<DailyChallengeInstance> = {},
): DailyChallengeInstance {
  return {
    definitionId: 'meaningful-saves',
    family: 'coding-saves',
    category: 'coding',
    eventType: 'meaningful-saves',
    title: 'Warm Up',
    description: 'Make 5 meaningful saves',
    target: 5,
    progress: 0,
    rewardTrainerXp: 20,
    completed: false,
    rewardGranted: false,
    ...overrides,
  };
}

function makeState(challenges: DailyChallengeInstance[]): DailyChallengeState {
  return { version: 1, dateKey: '2026-09-02', seed: 'seed', challenges };
}

suite('Daily Challenges: progress', () => {
  test('a meaningful save increments the save-count challenge', () => {
    const state = makeState([makeInstance()]);
    const signal: DailyChallengeSignal = {
      kind: 'meaningful-saves',
      fileCount: 2,
      files: ['a.ts', 'b.ts'],
    };
    const result = applyDailyChallengeSignal(state, signal);
    assert.strictEqual(result.state.challenges[0].progress, 2);
    assert.strictEqual(result.state.challenges[0].completed, false);
  });

  test('the file-hopper challenge tracks distinct files, not save count', () => {
    const state = makeState([
      makeInstance({
        definitionId: 'file-hopper',
        family: 'coding-files',
        eventType: 'distinct-files',
        title: 'File Hopper',
        target: 3,
        uniqueFiles: [],
      }),
    ]);
    const first = applyDailyChallengeSignal(state, {
      kind: 'meaningful-saves',
      fileCount: 3,
      files: ['a.ts', 'a.ts', 'b.ts'],
    });
    // Two distinct files despite three saves/one repeated path.
    assert.strictEqual(first.state.challenges[0].progress, 2);

    const second = applyDailyChallengeSignal(first.state, {
      kind: 'meaningful-saves',
      fileCount: 1,
      files: ['c.ts'],
    });
    assert.strictEqual(second.state.challenges[0].progress, 3);
    assert.strictEqual(second.state.challenges[0].completed, true);
  });

  test('a commit increments the Git challenge', () => {
    const state = makeState([
      makeInstance({
        definitionId: 'git-commits',
        family: 'git-commit-count',
        category: 'git',
        eventType: 'git-commit',
        title: 'Ship It',
        target: 1,
      }),
    ]);
    const result = applyDailyChallengeSignal(state, { kind: 'git-commit' });
    assert.strictEqual(result.state.challenges[0].progress, 1);
    assert.strictEqual(result.state.challenges[0].completed, true);
    assert.strictEqual(result.newlyCompleted.length, 1);
  });

  test('an unrelated signal does not move an unrelated challenge', () => {
    const state = makeState([makeInstance()]);
    const result = applyDailyChallengeSignal(state, { kind: 'git-commit' });
    assert.strictEqual(result.state, state);
    assert.strictEqual(result.newlyCompleted.length, 0);
  });

  test('Partner XP uses the actual granted amount, not a fixed increment', () => {
    const state = makeState([
      makeInstance({
        definitionId: 'partner-training',
        family: 'partner-xp',
        category: 'training',
        eventType: 'partner-xp',
        title: 'Partner Training',
        target: 50,
      }),
    ]);
    const result = applyDailyChallengeSignal(state, {
      kind: 'pokemon-xp',
      nickname: 'Sparky',
      isPartner: true,
      amount: 37,
      levelBefore: 12,
    });
    assert.strictEqual(result.state.challenges[0].progress, 37);
  });

  test('shared (non-partner) XP does not advance the partner-only challenge', () => {
    const state = makeState([
      makeInstance({
        definitionId: 'partner-training',
        family: 'partner-xp',
        category: 'training',
        eventType: 'partner-xp',
        title: 'Partner Training',
        target: 50,
      }),
    ]);
    const result = applyDailyChallengeSignal(state, {
      kind: 'pokemon-xp',
      nickname: 'Buddy',
      isPartner: false,
      amount: 20,
      levelBefore: 12,
    });
    assert.strictEqual(result.state, state);
  });

  test('distinct-Pokemon challenge tracks unique nicknames, switching partner included', () => {
    const state = makeState([
      makeInstance({
        definitionId: 'team-training',
        family: 'distinct-pokemon-xp',
        category: 'training',
        eventType: 'distinct-pokemon-xp',
        title: 'Team Training',
        target: 2,
        uniquePokemon: [],
      }),
    ]);
    const first = applyDailyChallengeSignal(state, {
      kind: 'pokemon-xp',
      nickname: 'Sparky',
      isPartner: true,
      amount: 10,
      levelBefore: 5,
    });
    assert.strictEqual(first.state.challenges[0].progress, 1);

    // Same Pokemon again: no progress.
    const repeat = applyDailyChallengeSignal(first.state, {
      kind: 'pokemon-xp',
      nickname: 'Sparky',
      isPartner: true,
      amount: 10,
      levelBefore: 5,
    });
    assert.strictEqual(repeat.state, first.state);

    // A different Pokemon (as if the partner was switched): completes it.
    const second = applyDailyChallengeSignal(first.state, {
      kind: 'pokemon-xp',
      nickname: 'Buddy',
      isPartner: true,
      amount: 5,
      levelBefore: 8,
    });
    assert.strictEqual(second.state.challenges[0].progress, 2);
    assert.strictEqual(second.state.challenges[0].completed, true);
  });

  test('underdog XP only counts a Pokemon that was below level 10', () => {
    const state = makeState([
      makeInstance({
        definitionId: 'underdog',
        family: 'underdog-xp',
        category: 'training',
        eventType: 'underdog-xp',
        title: 'Underdog',
        target: 50,
      }),
    ]);
    const tooStrong = applyDailyChallengeSignal(state, {
      kind: 'pokemon-xp',
      nickname: 'Champ',
      isPartner: true,
      amount: 30,
      levelBefore: 42,
    });
    assert.strictEqual(tooStrong.state, state);

    const underdog = applyDailyChallengeSignal(state, {
      kind: 'pokemon-xp',
      nickname: 'Rookie',
      isPartner: true,
      amount: 30,
      levelBefore: 6,
    });
    assert.strictEqual(underdog.state.challenges[0].progress, 30);
  });

  test('a level-up increments by the number of levels actually gained', () => {
    const state = makeState([
      makeInstance({
        definitionId: 'pokemon-level-up',
        family: 'pokemon-level-up',
        category: 'training',
        eventType: 'pokemon-level-up',
        title: 'Level Up',
        target: 1,
      }),
    ]);
    const result = applyDailyChallengeSignal(state, {
      kind: 'pokemon-level-up',
      levelsGained: 2,
    });
    assert.strictEqual(result.state.challenges[0].progress, 1); // clamped to target
    assert.strictEqual(result.state.challenges[0].completed, true);
  });

  test('progress never advances past a completed challenge', () => {
    const completed = makeInstance({ progress: 5, target: 5, completed: true });
    const state = makeState([completed]);
    const result = applyDailyChallengeSignal(state, {
      kind: 'meaningful-saves',
      fileCount: 3,
      files: ['a.ts'],
    });
    assert.strictEqual(result.state, state);
    assert.strictEqual(result.newlyCompleted.length, 0);
  });
});

/* ------------------------------------------------------------------ *
 * Rewards
 * ------------------------------------------------------------------ */

suite('Daily Challenges: rewards', () => {
  test('completing a challenge reports it exactly once as newly completed', () => {
    const state = makeState([makeInstance({ progress: 4, target: 5 })]);
    const result = applyDailyChallengeSignal(state, {
      kind: 'meaningful-saves',
      fileCount: 1,
      files: ['a.ts'],
    });
    assert.strictEqual(result.newlyCompleted.length, 1);

    const again = applyDailyChallengeSignal(result.state, {
      kind: 'meaningful-saves',
      fileCount: 5,
      files: ['a.ts', 'b.ts', 'c.ts'],
    });
    assert.strictEqual(again.newlyCompleted.length, 0);
    assert.strictEqual(again.state, result.state);
  });

  test('markRewardsGranted flips only the named challenges, once', () => {
    const state = makeState([
      makeInstance({ definitionId: 'a', completed: true }),
      makeInstance({ definitionId: 'b', completed: true }),
    ]);
    const granted = markRewardsGranted(state, ['a']);
    assert.strictEqual(granted.challenges[0].rewardGranted, true);
    assert.strictEqual(granted.challenges[1].rewardGranted, false);

    // Calling it again for the same id is a no-op, not a second flip.
    const again = markRewardsGranted(granted, ['a']);
    assert.strictEqual(again, granted);
  });

  test('a reload cannot re-grant: a completed+granted challenge stays inert', () => {
    const state = makeState([
      makeInstance({
        progress: 5,
        target: 5,
        completed: true,
        rewardGranted: true,
      }),
    ]);
    // Round-trip through storage.
    const restored = normalizeDailyChallengeState(
      JSON.parse(JSON.stringify(state)),
    );
    assert.ok(restored);
    const result = applyDailyChallengeSignal(restored as DailyChallengeState, {
      kind: 'meaningful-saves',
      fileCount: 5,
      files: ['a.ts'],
    });
    assert.strictEqual(result.newlyCompleted.length, 0);
    assert.strictEqual(result.state.challenges[0].rewardGranted, true);
  });
});

/* ------------------------------------------------------------------ *
 * Storage validation
 * ------------------------------------------------------------------ */

suite('Daily Challenges: storage validation', () => {
  test('round-trips a well-formed state', () => {
    const state = makeState([makeInstance({ progress: 3 })]);
    const restored = normalizeDailyChallengeState(
      JSON.parse(JSON.stringify(state)),
    );
    assert.deepStrictEqual(restored, state);
  });

  test('rejects garbage without throwing', () => {
    assert.strictEqual(normalizeDailyChallengeState(undefined), undefined);
    assert.strictEqual(normalizeDailyChallengeState(null), undefined);
    assert.strictEqual(normalizeDailyChallengeState('nonsense'), undefined);
    assert.strictEqual(normalizeDailyChallengeState({}), undefined);
    assert.strictEqual(
      normalizeDailyChallengeState({ dateKey: '2026-09-02', challenges: [] }),
      undefined,
    );
  });

  test('drops malformed individual challenges rather than the whole state', () => {
    const state = makeState([makeInstance(), { garbage: true } as never]);
    const restored = normalizeDailyChallengeState(
      JSON.parse(JSON.stringify(state)),
    );
    assert.strictEqual(restored?.challenges.length, 1);
  });
});

/* ------------------------------------------------------------------ *
 * View model
 * ------------------------------------------------------------------ */

suite('Daily Challenges: view model', () => {
  test('maps state to a view model with a correct completed count', () => {
    const state = makeState([
      makeInstance({ definitionId: 'a', completed: true }),
      makeInstance({ definitionId: 'b', completed: false }),
    ]);
    const view = toDailyChallengesViewModel(state, makeLabels());
    assert.strictEqual(view.status, 'ready');
    assert.strictEqual(view.completedCount, 1);
    assert.strictEqual(view.totalCount, 2);
  });

  test('the loading view model carries no challenges', () => {
    const view = buildLoadingViewModel(makeLabels());
    assert.strictEqual(view.status, 'loading');
    assert.strictEqual(view.challenges.length, 0);
  });
});

/* ------------------------------------------------------------------ *
 * Seeded randomness
 * ------------------------------------------------------------------ */

suite('Daily Challenges: seeded randomness', () => {
  test('the same seed always produces the same sequence', () => {
    const a = createSeededRandom('same-seed');
    const b = createSeededRandom('same-seed');
    for (let i = 0; i < 10; i++) {
      assert.strictEqual(a(), b());
    }
  });

  test('different seeds usually diverge', () => {
    const a = createSeededRandom('seed-one');
    const b = createSeededRandom('seed-two');
    assert.notStrictEqual(a(), b());
  });
});
