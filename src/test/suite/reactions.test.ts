import * as assert from 'assert';
import {
  BYSTANDER_REACTION_CHANCE,
  capReactionQueue,
  MAX_REACTION_QUEUE,
  reactionOutranks,
  ReactionEngine,
  resolveReactionTargets,
  shouldBystanderReact,
  shouldReactAgain,
} from '../../progression/reaction-rules';
import { PokemonReactionType } from '../../progression/reaction-types';

const NOW = 1_700_000_000_000;

/* ------------------------------------------------------------------ *
 * Priority
 * ------------------------------------------------------------------ */

suite('Reaction priority', () => {
  test('level-up outranks everything else', () => {
    assert.ok(reactionOutranks('level-up', 'celebrate'));
    assert.ok(reactionOutranks('level-up', 'confused'));
    assert.ok(reactionOutranks('level-up', 'notice'));
  });

  test('celebrate outranks confused and notice, but not level-up', () => {
    assert.ok(reactionOutranks('celebrate', 'confused'));
    assert.ok(reactionOutranks('celebrate', 'notice'));
    assert.strictEqual(reactionOutranks('celebrate', 'level-up'), false);
  });

  test('confused outranks notice only', () => {
    assert.ok(reactionOutranks('confused', 'notice'));
    assert.strictEqual(reactionOutranks('confused', 'celebrate'), false);
  });

  test('nothing outranks its own kind', () => {
    const types: PokemonReactionType[] = [
      'notice',
      'celebrate',
      'confused',
      'level-up',
    ];
    for (const type of types) {
      assert.strictEqual(reactionOutranks(type, type), false);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Cooldowns
 * ------------------------------------------------------------------ */

suite('Reaction cooldowns', () => {
  test('always allows the first reaction', () => {
    assert.ok(shouldReactAgain(undefined, NOW, 4000));
  });

  test('blocks a repeat inside the cooldown window', () => {
    assert.strictEqual(shouldReactAgain(NOW, NOW + 1000, 4000), false);
  });

  test('allows a repeat once the cooldown has fully elapsed', () => {
    assert.ok(shouldReactAgain(NOW, NOW + 4000, 4000));
  });
});

/* ------------------------------------------------------------------ *
 * Queue cap
 * ------------------------------------------------------------------ */

suite('Reaction queue cap', () => {
  test('keeps a short queue untouched', () => {
    const queue = [1, 2];
    assert.deepStrictEqual(capReactionQueue(queue, 3), [1, 2]);
  });

  test('truncates beyond the cap', () => {
    const queue = [1, 2, 3, 4, 5];
    assert.deepStrictEqual(
      capReactionQueue(queue, MAX_REACTION_QUEUE),
      [1, 2, 3],
    );
  });
});

/* ------------------------------------------------------------------ *
 * Bystander odds
 * ------------------------------------------------------------------ */

suite('Bystander odds', () => {
  test('a roll under the configured chance reacts', () => {
    assert.ok(shouldBystanderReact(0, BYSTANDER_REACTION_CHANCE));
    assert.ok(
      shouldBystanderReact(
        BYSTANDER_REACTION_CHANCE - 0.001,
        BYSTANDER_REACTION_CHANCE,
      ),
    );
  });

  test('a roll at or above the configured chance does not', () => {
    assert.strictEqual(
      shouldBystanderReact(
        BYSTANDER_REACTION_CHANCE,
        BYSTANDER_REACTION_CHANCE,
      ),
      false,
    );
    assert.strictEqual(
      shouldBystanderReact(0.99, BYSTANDER_REACTION_CHANCE),
      false,
    );
  });
});

/* ------------------------------------------------------------------ *
 * Targeting
 * ------------------------------------------------------------------ */

suite('Reaction targeting', () => {
  test('a meaningful save targets exactly the resolved Pokemon', () => {
    const targets = resolveReactionTargets(['Squirtle', 'Pikachu'], {
      type: 'notice',
      pokemonId: 'Squirtle',
    });
    assert.deepStrictEqual(targets, [
      { pokemonId: 'Squirtle', type: 'notice' },
    ]);
  });

  test('a git commit targets the resolved Pokemon with a celebrate reaction', () => {
    const targets = resolveReactionTargets(
      ['Squirtle'],
      { type: 'celebrate', pokemonId: 'Squirtle', allowBystander: true },
      () => 0.99, // never rolls a bystander
    );
    assert.deepStrictEqual(targets, [
      { pokemonId: 'Squirtle', type: 'celebrate' },
    ]);
  });

  test('a Pokemon not currently rendered gets no reaction at all', () => {
    const targets = resolveReactionTargets(['Pikachu'], {
      type: 'level-up',
      pokemonId: 'Squirtle',
    });
    assert.deepStrictEqual(targets, []);
  });

  test('reacts to whichever Pokemon the event names - no cached partner', () => {
    const visible = ['Squirtle', 'Charmander'];
    const first = resolveReactionTargets(visible, {
      type: 'notice',
      pokemonId: 'Squirtle',
    });
    const second = resolveReactionTargets(visible, {
      type: 'notice',
      pokemonId: 'Charmander',
    });
    assert.strictEqual(first[0].pokemonId, 'Squirtle');
    assert.strictEqual(second[0].pokemonId, 'Charmander');
  });

  test('a bystander may join a commit celebration when the roll favours it', () => {
    const targets = resolveReactionTargets(
      ['Squirtle', 'Pikachu', 'Charmander'],
      { type: 'celebrate', pokemonId: 'Squirtle', allowBystander: true },
      () => 0, // always favours the bystander roll, and picks index 0
    );
    assert.strictEqual(targets.length, 2);
    assert.strictEqual(targets[0].pokemonId, 'Squirtle');
    assert.strictEqual(targets[0].bystander, undefined);
    assert.notStrictEqual(targets[1].pokemonId, 'Squirtle');
    assert.strictEqual(targets[1].bystander, true);
  });

  test('no bystander when only the target is visible', () => {
    const targets = resolveReactionTargets(
      ['Squirtle'],
      { type: 'celebrate', pokemonId: 'Squirtle', allowBystander: true },
      () => 0,
    );
    assert.strictEqual(targets.length, 1);
  });

  test('no bystander when the event does not allow one', () => {
    const targets = resolveReactionTargets(
      ['Squirtle', 'Pikachu'],
      { type: 'notice', pokemonId: 'Squirtle' },
      () => 0,
    );
    assert.strictEqual(targets.length, 1);
  });
});

/* ------------------------------------------------------------------ *
 * ReactionEngine: one reaction at a time, priority preemption, cleanup
 * ------------------------------------------------------------------ */

suite('ReactionEngine', () => {
  test('the first reaction for a Pokemon plays immediately', () => {
    const engine = new ReactionEngine();
    const outcome = engine.submit(
      { pokemonId: 'Squirtle', type: 'notice' },
      NOW,
    );
    assert.strictEqual(outcome, 'active');
    assert.deepStrictEqual(engine.active('Squirtle'), {
      pokemonId: 'Squirtle',
      type: 'notice',
    });
  });

  test('a lower-priority reaction queues behind the active one', () => {
    const engine = new ReactionEngine();
    engine.submit({ pokemonId: 'Squirtle', type: 'celebrate' }, NOW);
    const outcome = engine.submit(
      { pokemonId: 'Squirtle', type: 'notice' },
      NOW,
    );
    assert.strictEqual(outcome, 'queued');
    assert.deepStrictEqual(engine.active('Squirtle'), {
      pokemonId: 'Squirtle',
      type: 'celebrate',
    });
  });

  test('a level-up preempts an in-progress save notice', () => {
    const engine = new ReactionEngine();
    engine.submit({ pokemonId: 'Squirtle', type: 'notice' }, NOW);
    const outcome = engine.submit(
      { pokemonId: 'Squirtle', type: 'level-up' },
      NOW,
    );
    assert.strictEqual(outcome, 'active');
    assert.deepStrictEqual(engine.active('Squirtle'), {
      pokemonId: 'Squirtle',
      type: 'level-up',
    });
  });

  test('a duplicate of the reaction already playing is dropped, not queued', () => {
    const engine = new ReactionEngine();
    engine.submit({ pokemonId: 'Squirtle', type: 'celebrate' }, NOW);
    const outcome = engine.submit(
      { pokemonId: 'Squirtle', type: 'celebrate' },
      NOW,
    );
    assert.strictEqual(outcome, 'dropped');
  });

  test('the pending queue never exceeds MAX_REACTION_QUEUE', () => {
    const engine = new ReactionEngine();
    engine.submit({ pokemonId: 'Squirtle', type: 'level-up' }, NOW);
    for (let i = 0; i < MAX_REACTION_QUEUE + 2; i++) {
      engine.submit({ pokemonId: 'Squirtle', type: 'notice' }, NOW);
    }
    // Draining the queue should yield at most MAX_REACTION_QUEUE more
    // reactions after the active one expires.
    let now = NOW;
    let drained = 0;
    for (let i = 0; i < MAX_REACTION_QUEUE + 2; i++) {
      now += 10_000;
      const result = engine.tick('Squirtle', now);
      if (result.expired && result.next) {
        drained++;
      }
    }
    assert.ok(drained <= MAX_REACTION_QUEUE, `drained ${drained}`);
  });

  test('tick is a no-op before the active reaction expires', () => {
    const engine = new ReactionEngine();
    engine.submit({ pokemonId: 'Squirtle', type: 'notice' }, NOW);
    const result = engine.tick('Squirtle', NOW + 10);
    assert.strictEqual(result.expired, false);
    assert.deepStrictEqual(engine.active('Squirtle'), {
      pokemonId: 'Squirtle',
      type: 'notice',
    });
  });

  test('an expired reaction with nothing queued clears the Pokemon back to normal', () => {
    const engine = new ReactionEngine();
    engine.submit({ pokemonId: 'Squirtle', type: 'notice' }, NOW);
    const result = engine.tick('Squirtle', NOW + 10_000);
    assert.strictEqual(result.expired, true);
    assert.strictEqual(result.next, undefined);
    assert.strictEqual(engine.active('Squirtle'), undefined);
  });

  test('a higher-priority queued reaction is dequeued ahead of a lower one', () => {
    const engine = new ReactionEngine();
    engine.submit({ pokemonId: 'Squirtle', type: 'level-up' }, NOW);
    engine.submit({ pokemonId: 'Squirtle', type: 'notice' }, NOW);
    engine.submit({ pokemonId: 'Squirtle', type: 'confused' }, NOW);
    const result = engine.tick('Squirtle', NOW + 10_000);
    assert.strictEqual(result.next?.type, 'confused');
  });

  test('clear() forgets a Pokemon that left the world', () => {
    const engine = new ReactionEngine();
    engine.submit({ pokemonId: 'Squirtle', type: 'notice' }, NOW);
    engine.clear('Squirtle');
    assert.strictEqual(engine.active('Squirtle'), undefined);
    // A fresh submit afterward still plays immediately rather than being
    // treated as queued behind stale state.
    const outcome = engine.submit(
      { pokemonId: 'Squirtle', type: 'notice' },
      NOW,
    );
    assert.strictEqual(outcome, 'active');
  });

  test('two Pokemon track their reactions independently', () => {
    const engine = new ReactionEngine();
    engine.submit({ pokemonId: 'Squirtle', type: 'celebrate' }, NOW);
    engine.submit({ pokemonId: 'Pikachu', type: 'notice' }, NOW);
    assert.strictEqual(engine.active('Squirtle')?.type, 'celebrate');
    assert.strictEqual(engine.active('Pikachu')?.type, 'notice');
  });
});
