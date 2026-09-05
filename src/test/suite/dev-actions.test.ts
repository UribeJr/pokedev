import * as assert from 'assert';
import {
  buildTaskIdentity,
  classifyTaskAsDevAction,
  ClassifiableTask,
} from '../../progression/dev-action-classifier';
import {
  devActionCooldownKey,
  MAX_REMEMBERED_DEV_ACTION_COOLDOWNS,
  rememberDevActionAcceptedIn,
  shouldAcceptDevAction,
} from '../../progression/dev-action-rules';
import { XP_RULES } from '../../progression/xp-rules';
import {
  applyDailyChallengeSignal,
  DailyChallengeSignal,
} from '../../challenges/daily-challenge-progress';
import {
  DailyChallengeDefinition,
  DailyChallengeEligibilityContext,
  DailyChallengeInstance,
  DailyChallengeState,
} from '../../challenges/daily-challenge-types';
import { isDefinitionEligible } from '../../challenges/daily-challenge-catalog';
import { generateDailyChallenges } from '../../challenges/daily-challenge-generator';

const NOW = 1_700_000_000_000;

function task(overrides: Partial<ClassifiableTask>): ClassifiableTask {
  return { name: '', definitionType: 'npm', ...overrides };
}

/* ------------------------------------------------------------------ *
 * Classification
 * ------------------------------------------------------------------ */

suite('Dev Actions: classification', () => {
  test('an npm build script classifies as build-success', () => {
    assert.strictEqual(
      classifyTaskAsDevAction(task({ name: 'build', npmScript: 'build' })),
      'build-success',
    );
  });

  test('pnpm/yarn build via a shell command line classifies as build-success', () => {
    assert.strictEqual(
      classifyTaskAsDevAction(
        task({
          name: 'ci-build',
          definitionType: 'shell',
          command: 'pnpm build',
        }),
      ),
      'build-success',
    );
    assert.strictEqual(
      classifyTaskAsDevAction(
        task({
          name: 'ci-build',
          definitionType: 'shell',
          command: 'yarn build',
        }),
      ),
      'build-success',
    );
  });

  test('an npm test script classifies as test-success', () => {
    assert.strictEqual(
      classifyTaskAsDevAction(task({ name: 'test', npmScript: 'test' })),
      'test-success',
    );
  });

  test('a jest/vitest/mocha command classifies as test-success', () => {
    assert.strictEqual(
      classifyTaskAsDevAction(
        task({ name: 'ci', definitionType: 'shell', command: 'npx jest' }),
      ),
      'test-success',
    );
  });

  test('an npm lint script classifies as lint-success', () => {
    assert.strictEqual(
      classifyTaskAsDevAction(task({ name: 'lint', npmScript: 'lint' })),
      'lint-success',
    );
  });

  test('an eslint command classifies as lint-success', () => {
    assert.strictEqual(
      classifyTaskAsDevAction(
        task({ name: 'ci', definitionType: 'shell', command: 'eslint src' }),
      ),
      'lint-success',
    );
  });

  test('typecheck / type-check / check-types script names classify as typecheck-success', () => {
    for (const name of ['typecheck', 'type-check', 'check-types']) {
      assert.strictEqual(
        classifyTaskAsDevAction(task({ name, npmScript: name })),
        'typecheck-success',
        name,
      );
    }
  });

  test('a bare `tsc --noEmit` shell command classifies as typecheck-success', () => {
    assert.strictEqual(
      classifyTaskAsDevAction(
        task({
          name: 'check',
          definitionType: 'shell',
          command: 'tsc --noEmit',
        }),
      ),
      'typecheck-success',
    );
  });

  test('an unrelated task classifies as null', () => {
    for (const name of ['watch', 'dev', 'start', 'clean', 'docs']) {
      assert.strictEqual(
        classifyTaskAsDevAction(task({ name, npmScript: name })),
        null,
        name,
      );
    }
  });

  test('an ambiguous name resolves to exactly one safe classification, never several', () => {
    // "build:test" contains both keywords; the classifier must still return
    // a single DevActionType, not attempt to represent both.
    const result = classifyTaskAsDevAction(
      task({ name: 'build:test', npmScript: 'build:test' }),
    );
    assert.ok(result === 'test-success' || result === 'build-success');
  });

  test('typecheck is checked ahead of the broader build/test keywords', () => {
    // A realistic compound name: this must not accidentally read as "build".
    assert.strictEqual(
      classifyTaskAsDevAction(
        task({ name: 'build-typecheck', npmScript: 'build-typecheck' }),
      ),
      'typecheck-success',
    );
  });

  test('task identity is stable and does not include command text', () => {
    const a = task({
      name: 'build',
      npmScript: 'build',
      command: 'npm run build --silent',
    });
    const b = task({
      name: 'build',
      npmScript: 'build',
      command: 'npm run build',
    });
    assert.strictEqual(buildTaskIdentity(a), buildTaskIdentity(b));
    assert.strictEqual(buildTaskIdentity(a), 'npm:build');
  });
});

/* ------------------------------------------------------------------ *
 * XP
 * ------------------------------------------------------------------ */

suite('Dev Actions: XP rules', () => {
  test('every Dev Action type is priced, Trainer and Partner both', () => {
    for (const type of [
      'build-success',
      'test-success',
      'typecheck-success',
      'lint-success',
    ] as const) {
      assert.ok(XP_RULES[type].trainerXp > 0, type);
      assert.ok(XP_RULES[type].pokemonXp > 0, type);
    }
  });

  test('Partner XP always exceeds Trainer XP, matching every other event type', () => {
    for (const type of [
      'build-success',
      'test-success',
      'typecheck-success',
      'lint-success',
    ] as const) {
      assert.ok(XP_RULES[type].pokemonXp > XP_RULES[type].trainerXp, type);
    }
  });

  test('every Dev Action is worth strictly less than a Git commit', () => {
    for (const type of [
      'build-success',
      'test-success',
      'typecheck-success',
      'lint-success',
    ] as const) {
      assert.ok(
        XP_RULES['git-commit'].trainerXp > XP_RULES[type].trainerXp,
        type,
      );
      assert.ok(
        XP_RULES['git-commit'].pokemonXp > XP_RULES[type].pokemonXp,
        type,
      );
    }
  });

  test('typecheck/lint are worth no more than build/test', () => {
    assert.ok(
      XP_RULES['typecheck-success'].trainerXp <=
        XP_RULES['build-success'].trainerXp,
    );
    assert.ok(
      XP_RULES['lint-success'].trainerXp <= XP_RULES['test-success'].trainerXp,
    );
  });
});

/* ------------------------------------------------------------------ *
 * Anti-farming: cooldown
 * ------------------------------------------------------------------ */

suite('Dev Actions: cooldown', () => {
  test('the first occurrence is always accepted', () => {
    assert.strictEqual(shouldAcceptDevAction(undefined, NOW), true);
  });

  test('a repeat inside the cooldown window is rejected', () => {
    assert.strictEqual(
      shouldAcceptDevAction(NOW, NOW + 60_000, 5 * 60_000),
      false,
    );
  });

  test('a repeat after the cooldown window elapses is accepted', () => {
    assert.strictEqual(
      shouldAcceptDevAction(NOW, NOW + 5 * 60_000, 5 * 60_000),
      true,
    );
  });

  test('cooldown keys separate action type and task identity', () => {
    assert.notStrictEqual(
      devActionCooldownKey('build-success', 'npm:build'),
      devActionCooldownKey('test-success', 'npm:build'),
    );
    assert.notStrictEqual(
      devActionCooldownKey('build-success', 'npm:build'),
      devActionCooldownKey('build-success', 'npm:build:prod'),
    );
  });

  test('persisted cooldown state survives a reload (same key, later call reads it back)', () => {
    // Simulates: run build -> persist -> "reload" (fresh read of the same
    // persisted map) -> rerun immediately -> must still be rejected.
    let stored = rememberDevActionAcceptedIn(
      {},
      'build-success::npm:build',
      NOW,
    );
    const reloaded = { ...stored }; // stand-in for a fresh read after restart
    assert.strictEqual(
      shouldAcceptDevAction(reloaded['build-success::npm:build'], NOW + 1000),
      false,
    );
  });

  test('remembering the same key again updates its timestamp in place', () => {
    let stored = rememberDevActionAcceptedIn({}, 'k', NOW);
    stored = rememberDevActionAcceptedIn(stored, 'k', NOW + 10_000);
    assert.strictEqual(Object.keys(stored).length, 1);
    assert.strictEqual(stored['k'], NOW + 10_000);
  });

  test('the cooldown map stays bounded, evicting the oldest entries first', () => {
    let stored: Record<string, number> = {};
    for (let i = 0; i < MAX_REMEMBERED_DEV_ACTION_COOLDOWNS + 20; i++) {
      stored = rememberDevActionAcceptedIn(
        stored,
        `key-${i}`,
        NOW + i,
        MAX_REMEMBERED_DEV_ACTION_COOLDOWNS,
      );
    }
    assert.strictEqual(
      Object.keys(stored).length,
      MAX_REMEMBERED_DEV_ACTION_COOLDOWNS,
    );
    // The earliest keys were evicted; the most recent one survives.
    assert.strictEqual(stored['key-0'], undefined);
    assert.ok(
      stored[`key-${MAX_REMEMBERED_DEV_ACTION_COOLDOWNS + 19}`] !== undefined,
    );
  });
});

/* ------------------------------------------------------------------ *
 * Daily Challenge integration
 * ------------------------------------------------------------------ */

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

const BASE_CONTEXT: DailyChallengeEligibilityContext = {
  trainerLevel: 40,
  hasGitRepo: true,
  partyCount: 5,
  hasPokemonBelowLevel10: true,
  devActionCapabilities: ALL_DEV_ACTIONS,
};

function makeInstance(
  overrides: Partial<DailyChallengeInstance>,
): DailyChallengeInstance {
  return {
    definitionId: 'build-master',
    family: 'build-success-count',
    category: 'coding',
    eventType: 'build-success',
    title: 'Build Master',
    description: 'Complete 2 successful builds',
    target: 2,
    progress: 0,
    rewardTrainerXp: 25,
    completed: false,
    rewardGranted: false,
    ...overrides,
  };
}

function makeState(challenges: DailyChallengeInstance[]): DailyChallengeState {
  return { version: 1, dateKey: '2026-09-02', seed: 'seed', challenges };
}

suite('Dev Actions: Daily Challenge eligibility', () => {
  test('Build Master is only eligible when a build task exists', () => {
    const definition = {
      requiresDevAction: 'build',
    } as DailyChallengeDefinition;
    assert.strictEqual(
      isDefinitionEligible(definition, {
        ...BASE_CONTEXT,
        devActionCapabilities: NO_DEV_ACTIONS,
      }),
      false,
    );
    assert.strictEqual(isDefinitionEligible(definition, BASE_CONTEXT), true);
  });

  test('Clean Check accepts either lint or typecheck capability alone', () => {
    const definition = {
      requiresDevAction: 'clean',
    } as DailyChallengeDefinition;
    assert.strictEqual(
      isDefinitionEligible(definition, {
        ...BASE_CONTEXT,
        devActionCapabilities: { ...NO_DEV_ACTIONS, lint: true },
      }),
      true,
    );
    assert.strictEqual(
      isDefinitionEligible(definition, {
        ...BASE_CONTEXT,
        devActionCapabilities: { ...NO_DEV_ACTIONS, typecheck: true },
      }),
      true,
    );
    assert.strictEqual(
      isDefinitionEligible(definition, {
        ...BASE_CONTEXT,
        devActionCapabilities: NO_DEV_ACTIONS,
      }),
      false,
    );
  });

  test('Ship Shape needs at least one Dev Action capability', () => {
    const definition = { requiresDevAction: 'any' } as DailyChallengeDefinition;
    assert.strictEqual(
      isDefinitionEligible(definition, {
        ...BASE_CONTEXT,
        devActionCapabilities: NO_DEV_ACTIONS,
      }),
      false,
    );
    assert.strictEqual(
      isDefinitionEligible(definition, {
        ...BASE_CONTEXT,
        devActionCapabilities: { ...NO_DEV_ACTIONS, test: true },
      }),
      true,
    );
  });

  test('no impossible Dev Action daily is ever generated with zero capabilities', () => {
    const context: DailyChallengeEligibilityContext = {
      ...BASE_CONTEXT,
      hasGitRepo: false,
      devActionCapabilities: NO_DEV_ACTIONS,
    };
    for (let day = 1; day <= 15; day++) {
      const seed = `2026-12-${String(day).padStart(2, '0')}:x`;
      const challenges = generateDailyChallenges(context, seed);
      assert.ok(
        challenges.every(
          (c) =>
            c.definitionId !== 'build-master' &&
            c.definitionId !== 'test-trainer' &&
            c.definitionId !== 'clean-check' &&
            c.definitionId !== 'ship-shape',
        ),
      );
    }
  });
});

suite('Dev Actions: Daily Challenge progress', () => {
  test('a build-success signal advances only the build challenge', () => {
    const state = makeState([makeInstance({})]);
    const signal: DailyChallengeSignal = {
      kind: 'dev-action',
      devActionType: 'build-success',
    };
    const result = applyDailyChallengeSignal(state, signal);
    assert.strictEqual(result.state.challenges[0].progress, 1);
  });

  test('a test-success signal does not advance the build challenge', () => {
    const state = makeState([makeInstance({})]);
    const result = applyDailyChallengeSignal(state, {
      kind: 'dev-action',
      devActionType: 'test-success',
    });
    assert.strictEqual(result.state, state);
  });

  test('Clean Check advances on either lint or typecheck, not on build/test', () => {
    const state = makeState([
      makeInstance({
        definitionId: 'clean-check',
        family: 'dev-action-clean-count',
        eventType: 'dev-action-clean',
        title: 'Clean Check',
        target: 2,
      }),
    ]);
    const afterLint = applyDailyChallengeSignal(state, {
      kind: 'dev-action',
      devActionType: 'lint-success',
    });
    assert.strictEqual(afterLint.state.challenges[0].progress, 1);

    const afterTypecheck = applyDailyChallengeSignal(afterLint.state, {
      kind: 'dev-action',
      devActionType: 'typecheck-success',
    });
    assert.strictEqual(afterTypecheck.state.challenges[0].progress, 2);
    assert.strictEqual(afterTypecheck.state.challenges[0].completed, true);

    const unaffected = applyDailyChallengeSignal(state, {
      kind: 'dev-action',
      devActionType: 'build-success',
    });
    assert.strictEqual(unaffected.state, state);
  });

  test('Ship Shape advances on any Dev Action type', () => {
    const state = makeState([
      makeInstance({
        definitionId: 'ship-shape',
        family: 'dev-action-any-count',
        category: 'wildcard',
        eventType: 'dev-action-any',
        title: 'Ship Shape',
        target: 3,
      }),
    ]);
    let current = state;
    for (const devActionType of [
      'build-success',
      'lint-success',
      'test-success',
    ] as const) {
      current = applyDailyChallengeSignal(current, {
        kind: 'dev-action',
        devActionType,
      }).state;
    }
    assert.strictEqual(current.challenges[0].progress, 3);
    assert.strictEqual(current.challenges[0].completed, true);
  });

  test('the reward is reported exactly once when the target is reached', () => {
    const state = makeState([makeInstance({ progress: 1 })]);
    const first = applyDailyChallengeSignal(state, {
      kind: 'dev-action',
      devActionType: 'build-success',
    });
    assert.strictEqual(first.newlyCompleted.length, 1);

    const again = applyDailyChallengeSignal(first.state, {
      kind: 'dev-action',
      devActionType: 'build-success',
    });
    assert.strictEqual(again.newlyCompleted.length, 0);
    assert.strictEqual(again.state, first.state);
  });
});
