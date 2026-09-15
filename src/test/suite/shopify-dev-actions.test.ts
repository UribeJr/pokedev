/**
 * Shopify Dev Actions: pure-logic coverage only, matching this project's own
 * test boundary convention (see `dev-actions.test.ts`, `evolution-
 * persistence.test.ts`) - anything touching `vscode.ExtensionContext`,
 * `vscode.tasks`, or the filesystem (task-end wiring in `activity-
 * tracker.ts`, file-existence capability detection in `shopify-project-
 * detection.ts`, managed command execution in `shopify-cli.ts`) is covered by
 * manual QA instead, documented in the feature's final report.
 */
import * as assert from 'assert';
import {
  ClassifiableShopifyTask,
  classifyShopifyTask,
} from '../../progression/shopify-dev-action-classifier';
import {
  shopifyDevActionCooldownKey,
  shopifyDevActionCooldownMs,
} from '../../progression/shopify-dev-action-rules';
import { ShopifyDevActionType } from '../../progression/shopify-dev-action-types';
import {
  rememberDevActionAcceptedIn,
  shouldAcceptDevAction,
} from '../../progression/dev-action-rules';
import { friendshipXpEventAmount } from '../../progression/friendship-rules';
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

const NOW = 1_700_000_000_000;

const SHIP_TYPES: readonly ShopifyDevActionType[] = [
  'shopify-theme-push-success',
  'shopify-app-deploy-success',
  'shopify-extension-deploy-success',
  'shopify-function-deploy-success',
  'shopify-theme-publish-success',
];
const VERIFY_TYPES: readonly ShopifyDevActionType[] = [
  'shopify-theme-check-success',
  'shopify-app-build-success',
];
const ALL_SHOPIFY_TYPES: readonly ShopifyDevActionType[] = [
  ...VERIFY_TYPES,
  ...SHIP_TYPES,
];

function task(
  overrides: Partial<ClassifiableShopifyTask>,
): ClassifiableShopifyTask {
  return { name: '', definitionType: 'shell', ...overrides };
}

/* ------------------------------------------------------------------ *
 * Classification
 * ------------------------------------------------------------------ */

suite('Shopify Dev Actions: classification', () => {
  test('every real supported CLI action classifies from its declared command', () => {
    const cases: Array<[string, ShopifyDevActionType]> = [
      ['shopify theme check', 'shopify-theme-check-success'],
      ['shopify theme push', 'shopify-theme-push-success'],
      ['shopify theme push --path=./theme -f', 'shopify-theme-push-success'],
      ['shopify theme publish -t 123 -f', 'shopify-theme-publish-success'],
      ['shopify app build', 'shopify-app-build-success'],
      ['shopify app deploy', 'shopify-app-deploy-success'],
    ];
    for (const [command, expected] of cases) {
      assert.strictEqual(
        classifyShopifyTask(task({ name: 'shopify', command })),
        expected,
        command,
      );
    }
  });

  test('hand-authored extension/function deploy task names classify for forward-compatibility', () => {
    assert.strictEqual(
      classifyShopifyTask(
        task({
          name: 'shopify:extension:deploy',
          command: 'shopify extension deploy',
        }),
      ),
      'shopify-extension-deploy-success',
    );
    assert.strictEqual(
      classifyShopifyTask(
        task({
          name: 'shopify:function:deploy',
          command: 'shopify function deploy',
        }),
      ),
      'shopify-function-deploy-success',
    );
  });

  test('a PokéDev-managed task is trusted directly via managedAction, bypassing pattern matching', () => {
    assert.strictEqual(
      classifyShopifyTask(
        task({
          name: 'anything at all',
          command: undefined,
          managedAction: 'shopify-app-deploy-success',
        }),
      ),
      'shopify-app-deploy-success',
    );
  });

  test('sync/start commands never earn anything: theme dev, app dev, pull, auth, info, list, help, version', () => {
    const commands = [
      'shopify theme dev',
      'shopify app dev',
      'shopify theme pull',
      'shopify app config pull',
      'shopify auth login',
      'shopify version',
      'shopify help',
      'shopify theme list',
      'shopify app info',
    ];
    for (const command of commands) {
      assert.strictEqual(
        classifyShopifyTask(task({ name: 'shopify', command })),
        null,
        command,
      );
    }
  });

  test('a task with no "shopify" keyword never classifies, even if it says "theme push"', () => {
    assert.strictEqual(
      classifyShopifyTask(
        task({ name: 'theme push', command: 'my-custom-theme-push-script' }),
      ),
      null,
    );
  });

  test('a plain unrelated task classifies as null', () => {
    for (const name of ['watch', 'dev', 'start', 'clean']) {
      assert.strictEqual(
        classifyShopifyTask(task({ name, npmScript: name })),
        null,
        name,
      );
    }
  });
});

/* ------------------------------------------------------------------ *
 * XP
 * ------------------------------------------------------------------ */

suite('Shopify Dev Actions: XP rules', () => {
  test('every Shopify Dev Action type is priced, Trainer and Partner both', () => {
    for (const type of ALL_SHOPIFY_TYPES) {
      assert.ok(XP_RULES[type].trainerXp > 0, type);
      assert.ok(XP_RULES[type].pokemonXp > 0, type);
    }
  });

  test('every SHIP-tier action is worth at least as much as every VERIFY-tier action', () => {
    const maxVerifyTrainer = Math.max(
      ...VERIFY_TYPES.map((type) => XP_RULES[type].trainerXp),
    );
    for (const type of SHIP_TYPES) {
      assert.ok(
        XP_RULES[type].trainerXp >= maxVerifyTrainer,
        `${type} should be worth at least as much as the priciest VERIFY action`,
      );
    }
  });

  test('every Shopify Dev Action is worth strictly less than a Git commit', () => {
    for (const type of ALL_SHOPIFY_TYPES) {
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

  test('app deploy is priced at or above every other Shopify action - the highest V1 action', () => {
    const deploy = XP_RULES['shopify-app-deploy-success'];
    for (const type of ALL_SHOPIFY_TYPES) {
      assert.ok(deploy.trainerXp >= XP_RULES[type].trainerXp, type);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Friendship
 * ------------------------------------------------------------------ */

suite('Shopify Dev Actions: Friendship', () => {
  test('every Shopify Dev Action grants exactly the generic Dev Action Friendship amount', () => {
    const genericAmount = friendshipXpEventAmount('build-success');
    for (const type of ALL_SHOPIFY_TYPES) {
      assert.strictEqual(friendshipXpEventAmount(type), genericAmount, type);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Cooldowns
 * ------------------------------------------------------------------ */

suite('Shopify Dev Actions: cooldown', () => {
  test('SHIP-tier actions cool down for at least as long as VERIFY-tier actions', () => {
    const maxVerifyCooldown = Math.max(
      ...VERIFY_TYPES.map(shopifyDevActionCooldownMs),
    );
    for (const type of SHIP_TYPES) {
      assert.ok(shopifyDevActionCooldownMs(type) >= maxVerifyCooldown, type);
    }
  });

  test('app deploy and theme publish carry the longest cooldowns', () => {
    const deployMs = shopifyDevActionCooldownMs('shopify-app-deploy-success');
    const publishMs = shopifyDevActionCooldownMs(
      'shopify-theme-publish-success',
    );
    for (const type of ALL_SHOPIFY_TYPES) {
      assert.ok(deployMs >= shopifyDevActionCooldownMs(type), type);
      assert.ok(publishMs >= shopifyDevActionCooldownMs(type), type);
    }
  });

  test('cooldown keys separate action type, task identity and workspace folder', () => {
    assert.notStrictEqual(
      shopifyDevActionCooldownKey('shopify-theme-check-success', 'npm:x', 'a'),
      shopifyDevActionCooldownKey('shopify-theme-push-success', 'npm:x', 'a'),
    );
    assert.notStrictEqual(
      shopifyDevActionCooldownKey('shopify-theme-check-success', 'npm:x', 'a'),
      shopifyDevActionCooldownKey('shopify-theme-check-success', 'npm:y', 'a'),
    );
    assert.notStrictEqual(
      shopifyDevActionCooldownKey('shopify-theme-check-success', 'npm:x', 'a'),
      shopifyDevActionCooldownKey('shopify-theme-check-success', 'npm:x', 'b'),
    );
  });

  test('the cooldown is honored during the window and expires afterward', () => {
    const key = shopifyDevActionCooldownKey(
      'shopify-app-deploy-success',
      'pokedev-shopify:PokéDev: Shopify App Deploy',
      'app-repo',
    );
    const cooldownMs = shopifyDevActionCooldownMs('shopify-app-deploy-success');
    assert.strictEqual(shouldAcceptDevAction(undefined, NOW, cooldownMs), true);
    assert.strictEqual(
      shouldAcceptDevAction(NOW, NOW + cooldownMs - 1, cooldownMs),
      false,
    );
    assert.strictEqual(
      shouldAcceptDevAction(NOW, NOW + cooldownMs, cooldownMs),
      true,
    );
    void key;
  });

  test('a reload does not bypass the cooldown - the persisted timestamp survives', () => {
    let stored = rememberDevActionAcceptedIn(
      {},
      shopifyDevActionCooldownKey(
        'shopify-theme-push-success',
        'shell:push',
        'theme-repo',
      ),
      NOW,
    );
    const reloaded = { ...stored }; // stand-in for a fresh read after restart
    const key = shopifyDevActionCooldownKey(
      'shopify-theme-push-success',
      'shell:push',
      'theme-repo',
    );
    assert.strictEqual(
      shouldAcceptDevAction(
        reloaded[key],
        NOW + 1000,
        shopifyDevActionCooldownMs('shopify-theme-push-success'),
      ),
      false,
    );
  });
});

/* ------------------------------------------------------------------ *
 * Daily Challenge eligibility
 * ------------------------------------------------------------------ */

const NO_DEV_ACTIONS = {
  build: false,
  test: false,
  typecheck: false,
  lint: false,
};
const NO_SHOPIFY = { theme: false, app: false, extensions: false };

const BASE_CONTEXT: DailyChallengeEligibilityContext = {
  trainerLevel: 40,
  hasGitRepo: true,
  partyCount: 5,
  hasPokemonBelowLevel10: true,
  devActionCapabilities: NO_DEV_ACTIONS,
  shopifyCapabilities: NO_SHOPIFY,
};

suite('Shopify Dev Actions: Daily Challenge eligibility', () => {
  test('Theme Doctor / Ship The Theme need theme capability, unaffected by app', () => {
    const definition = {
      requiresShopifyCapability: 'theme',
    } as DailyChallengeDefinition;
    assert.strictEqual(
      isDefinitionEligible(definition, {
        ...BASE_CONTEXT,
        shopifyCapabilities: { theme: false, app: true, extensions: false },
      }),
      false,
    );
    assert.strictEqual(
      isDefinitionEligible(definition, {
        ...BASE_CONTEXT,
        shopifyCapabilities: { theme: true, app: false, extensions: false },
      }),
      true,
    );
  });

  test('App Builder / Deploy Day need app capability, unaffected by theme', () => {
    const definition = {
      requiresShopifyCapability: 'app',
    } as DailyChallengeDefinition;
    assert.strictEqual(
      isDefinitionEligible(definition, {
        ...BASE_CONTEXT,
        shopifyCapabilities: { theme: true, app: false, extensions: false },
      }),
      false,
    );
    assert.strictEqual(
      isDefinitionEligible(definition, {
        ...BASE_CONTEXT,
        shopifyCapabilities: { theme: false, app: true, extensions: false },
      }),
      true,
    );
  });

  test('Storefront Sprint accepts either theme or app, never neither', () => {
    const definition = {
      requiresShopifyCapability: 'any',
    } as DailyChallengeDefinition;
    assert.strictEqual(isDefinitionEligible(definition, BASE_CONTEXT), false);
    assert.strictEqual(
      isDefinitionEligible(definition, {
        ...BASE_CONTEXT,
        shopifyCapabilities: { theme: true, app: false, extensions: false },
      }),
      true,
    );
    assert.strictEqual(
      isDefinitionEligible(definition, {
        ...BASE_CONTEXT,
        shopifyCapabilities: { theme: false, app: true, extensions: false },
      }),
      true,
    );
  });

  test('an unrelated (non-Shopify) repo is never offered a Shopify daily', () => {
    const definitions: DailyChallengeDefinition[] = [
      { requiresShopifyCapability: 'theme' } as DailyChallengeDefinition,
      { requiresShopifyCapability: 'app' } as DailyChallengeDefinition,
      { requiresShopifyCapability: 'any' } as DailyChallengeDefinition,
    ];
    for (const definition of definitions) {
      assert.strictEqual(isDefinitionEligible(definition, BASE_CONTEXT), false);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Daily Challenge progress
 * ------------------------------------------------------------------ */

function makeInstance(
  overrides: Partial<DailyChallengeInstance>,
): DailyChallengeInstance {
  return {
    definitionId: 'theme-doctor',
    family: 'shopify-theme-check-count',
    category: 'coding',
    eventType: 'shopify-theme-check-success',
    title: 'Theme Doctor',
    description: 'Complete 2 successful Shopify theme checks',
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

suite('Shopify Dev Actions: Daily Challenge progress', () => {
  test('a matching signal advances the matching challenge only', () => {
    const state = makeState([makeInstance({})]);
    const matching: DailyChallengeSignal = {
      kind: 'shopify-dev-action',
      shopifyActionType: 'shopify-theme-check-success',
    };
    const result = applyDailyChallengeSignal(state, matching);
    assert.strictEqual(result.state.challenges[0].progress, 1);

    const nonMatching = applyDailyChallengeSignal(state, {
      kind: 'shopify-dev-action',
      shopifyActionType: 'shopify-app-build-success',
    });
    assert.strictEqual(nonMatching.state, state);
  });

  test('a generic (non-Shopify) dev-action signal never advances a Shopify challenge', () => {
    const state = makeState([makeInstance({})]);
    const result = applyDailyChallengeSignal(state, {
      kind: 'dev-action',
      devActionType: 'build-success',
    });
    assert.strictEqual(result.state, state);
  });

  test('Storefront Sprint (shopify-dev-action-any) advances on any Shopify Dev Action', () => {
    const state = makeState([
      makeInstance({
        definitionId: 'storefront-sprint',
        family: 'shopify-dev-action-any-count',
        category: 'wildcard',
        eventType: 'shopify-dev-action-any',
        title: 'Storefront Sprint',
        target: 3,
      }),
    ]);
    let current = state;
    for (const shopifyActionType of [
      'shopify-theme-check-success',
      'shopify-app-build-success',
      'shopify-theme-push-success',
    ] as const) {
      current = applyDailyChallengeSignal(current, {
        kind: 'shopify-dev-action',
        shopifyActionType,
      }).state;
    }
    assert.strictEqual(current.challenges[0].progress, 3);
    assert.strictEqual(current.challenges[0].completed, true);
  });

  test('Deploy Day completes after exactly one successful app deploy', () => {
    const state = makeState([
      makeInstance({
        definitionId: 'deploy-day',
        family: 'shopify-app-deploy-count',
        eventType: 'shopify-app-deploy-success',
        title: 'Deploy Day',
        target: 1,
      }),
    ]);
    const result = applyDailyChallengeSignal(state, {
      kind: 'shopify-dev-action',
      shopifyActionType: 'shopify-app-deploy-success',
    });
    assert.strictEqual(result.newlyCompleted.length, 1);
    assert.strictEqual(result.state.challenges[0].completed, true);
  });

  test('the reward is reported exactly once when the target is reached', () => {
    const state = makeState([makeInstance({ progress: 1 })]);
    const first = applyDailyChallengeSignal(state, {
      kind: 'shopify-dev-action',
      shopifyActionType: 'shopify-theme-check-success',
    });
    assert.strictEqual(first.newlyCompleted.length, 1);

    const again = applyDailyChallengeSignal(first.state, {
      kind: 'shopify-dev-action',
      shopifyActionType: 'shopify-theme-check-success',
    });
    assert.strictEqual(again.newlyCompleted.length, 0);
    assert.strictEqual(again.state, first.state);
  });
});
