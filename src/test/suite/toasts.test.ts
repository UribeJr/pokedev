import * as assert from 'assert';
import {
  buildWorldToastQueueItem,
  capToastQueue,
  dropLowestPriorityToast,
  formatLevelUpToastMessage,
  formatXpToastMessage,
  MAX_TOAST_QUEUE,
  mergeXpIntoBuffer,
  resolvePokemonToastDisplayName,
  shouldCoalesceXp,
  shouldShowToastForPokemon,
  ToastEngine,
  toastOutranks,
  toastPriority,
  XP_COALESCE_WINDOW_MS,
} from '../../progression/toast-rules';

const NOW = 1_700_000_000_000;

/* ------------------------------------------------------------------ *
 * Message formatting
 * ------------------------------------------------------------------ */

suite('Toast message formatting', () => {
  test('formats XP toast with actual amount', () => {
    assert.strictEqual(
      formatXpToastMessage('Squirtle', 2),
      'Squirtle gained 2 EXP!',
    );
    assert.strictEqual(
      formatXpToastMessage('Cacturne', 25),
      'Cacturne gained 25 EXP!',
    );
  });

  test('formats level-up toast with actual level', () => {
    assert.strictEqual(
      formatLevelUpToastMessage('Squirtle', 13),
      'Squirtle grew to Lv. 13!',
    );
  });

  test('uses nickname for display name helper', () => {
    assert.strictEqual(
      resolvePokemonToastDisplayName('Shellboi', 'Squirtle'),
      'Shellboi',
    );
  });

  test('buildWorldToastQueueItem rejects invalid XP amounts', () => {
    assert.strictEqual(
      buildWorldToastQueueItem({
        pokemonId: 'Squirtle',
        type: 'xp',
        displayName: 'Squirtle',
        xpAmount: 0,
        timestamp: NOW,
      }),
      undefined,
    );
  });

  test('buildWorldToastQueueItem builds XP queue item', () => {
    const item = buildWorldToastQueueItem({
      pokemonId: 'Squirtle',
      type: 'xp',
      displayName: 'Squirtle',
      xpAmount: 8,
      timestamp: NOW,
    });
    assert.ok(item);
    assert.strictEqual(item?.message, 'Squirtle gained 8 EXP!');
    assert.strictEqual(item?.priority, toastPriority('xp', 'normal'));
  });
});

/* ------------------------------------------------------------------ *
 * Priority
 * ------------------------------------------------------------------ */

suite('Toast priority', () => {
  test('level-up outranks XP', () => {
    const levelUp = buildWorldToastQueueItem({
      pokemonId: 'Squirtle',
      type: 'level-up',
      displayName: 'Squirtle',
      level: 13,
      timestamp: NOW,
    })!;
    const xp = buildWorldToastQueueItem({
      pokemonId: 'Squirtle',
      type: 'xp',
      displayName: 'Squirtle',
      xpAmount: 2,
      timestamp: NOW,
    })!;
    assert.ok(toastOutranks(levelUp, xp));
  });

  test('large XP outranks normal XP', () => {
    assert.ok(toastPriority('xp', 'large') > toastPriority('xp', 'normal'));
  });
});

/* ------------------------------------------------------------------ *
 * Visibility
 * ------------------------------------------------------------------ */

suite('Toast visibility', () => {
  test('only shows for rendered Pokémon', () => {
    assert.ok(shouldShowToastForPokemon(['Squirtle'], 'Squirtle'));
    assert.strictEqual(
      shouldShowToastForPokemon(['Pikachu'], 'Squirtle'),
      false,
    );
  });

  test('targets the event pokemonId, not a cached partner', () => {
    const visible = ['Squirtle', 'Charmander'];
    assert.ok(shouldShowToastForPokemon(visible, 'Squirtle'));
    assert.ok(shouldShowToastForPokemon(visible, 'Charmander'));
    assert.strictEqual(shouldShowToastForPokemon(visible, 'Bulbasaur'), false);
  });
});

/* ------------------------------------------------------------------ *
 * Coalescing
 * ------------------------------------------------------------------ */

suite('Toast XP coalescing', () => {
  test('merges rapid normal XP within the coalesce window', () => {
    const buffer = {
      pokemonId: 'Squirtle',
      displayName: 'Squirtle',
      xpAmount: 2,
      variant: 'normal' as const,
      startedAt: NOW,
    };
    const merged = mergeXpIntoBuffer(buffer, {
      pokemonId: 'Squirtle',
      type: 'xp',
      displayName: 'Squirtle',
      xpAmount: 2,
      timestamp: NOW + 500,
    });
    assert.strictEqual(merged.xpAmount, 4);
  });

  test('does not coalesce large XP rewards', () => {
    const buffer = {
      pokemonId: 'Squirtle',
      displayName: 'Squirtle',
      xpAmount: 2,
      variant: 'normal' as const,
      startedAt: NOW,
    };
    assert.strictEqual(
      shouldCoalesceXp(
        buffer,
        {
          pokemonId: 'Squirtle',
          type: 'xp',
          displayName: 'Squirtle',
          xpAmount: 40,
          variant: 'large',
          timestamp: NOW + 200,
        },
        NOW + 200,
      ),
      false,
    );
  });

  test('does not coalesce outside the window', () => {
    const buffer = {
      pokemonId: 'Squirtle',
      displayName: 'Squirtle',
      xpAmount: 2,
      variant: 'normal' as const,
      startedAt: NOW,
    };
    assert.strictEqual(
      shouldCoalesceXp(
        buffer,
        {
          pokemonId: 'Squirtle',
          type: 'xp',
          displayName: 'Squirtle',
          xpAmount: 2,
          timestamp: NOW + XP_COALESCE_WINDOW_MS + 1,
        },
        NOW + XP_COALESCE_WINDOW_MS + 1,
      ),
      false,
    );
  });
});

/* ------------------------------------------------------------------ *
 * Queue
 * ------------------------------------------------------------------ */

suite('Toast queue', () => {
  test('caps the pending queue', () => {
    const queue = [1, 2, 3, 4, 5];
    assert.deepStrictEqual(capToastQueue(queue, MAX_TOAST_QUEUE), [1, 2, 3, 4]);
  });

  test('drops the lowest-priority pending toast when full', () => {
    const xp = buildWorldToastQueueItem({
      pokemonId: 'Squirtle',
      type: 'xp',
      displayName: 'Squirtle',
      xpAmount: 2,
      timestamp: NOW,
    })!;
    const levelUp = buildWorldToastQueueItem({
      pokemonId: 'Squirtle',
      type: 'level-up',
      displayName: 'Squirtle',
      level: 13,
      timestamp: NOW,
    })!;
    const trimmed = dropLowestPriorityToast([xp, levelUp, xp]);
    assert.strictEqual(trimmed.length, 2);
    assert.ok(trimmed.some((entry) => entry.type === 'level-up'));
  });
});

/* ------------------------------------------------------------------ *
 * ToastEngine
 * ------------------------------------------------------------------ */

suite('ToastEngine', () => {
  test('shows one toast at a time per Pokémon', () => {
    const engine = new ToastEngine();
    const xp = buildWorldToastQueueItem({
      pokemonId: 'Squirtle',
      type: 'xp',
      displayName: 'Squirtle',
      xpAmount: 2,
      timestamp: NOW,
    })!;
    const outcome = engine.submit(xp, NOW);
    assert.strictEqual(outcome, 'active');
    const levelUp = buildWorldToastQueueItem({
      pokemonId: 'Squirtle',
      type: 'level-up',
      displayName: 'Squirtle',
      level: 13,
      timestamp: NOW,
    })!;
    const queued = engine.submit(levelUp, NOW);
    assert.strictEqual(queued, 'queued');
    assert.strictEqual(engine.active('Squirtle')?.type, 'xp');
  });

  test('queues XP before level-up without overlap', () => {
    const engine = new ToastEngine();
    engine.submitEvent(
      {
        pokemonId: 'Squirtle',
        type: 'xp',
        displayName: 'Squirtle',
        xpAmount: 25,
        timestamp: NOW,
      },
      NOW,
    );
    engine.flushCoalesceBuffer('Squirtle', NOW);
    engine.submitEvent(
      {
        pokemonId: 'Squirtle',
        type: 'level-up',
        displayName: 'Squirtle',
        level: 13,
        timestamp: NOW,
      },
      NOW,
    );
    assert.strictEqual(engine.active('Squirtle')?.type, 'xp');
    const afterXp = engine.tick('Squirtle', NOW + 5000);
    assert.strictEqual(afterXp.next?.type, 'level-up');
  });

  test('queues multiple level-up messages in order', () => {
    const engine = new ToastEngine();
    const first = buildWorldToastQueueItem({
      pokemonId: 'Squirtle',
      type: 'level-up',
      displayName: 'Squirtle',
      level: 13,
      timestamp: NOW,
    })!;
    const second = buildWorldToastQueueItem({
      pokemonId: 'Squirtle',
      type: 'level-up',
      displayName: 'Squirtle',
      level: 14,
      timestamp: NOW,
    })!;
    engine.submit(first, NOW);
    engine.submit(second, NOW);
    const result = engine.tick('Squirtle', NOW + 5000);
    assert.strictEqual(result.next?.message, 'Squirtle grew to Lv. 14!');
  });

  test('coalesces buffered XP before showing', () => {
    const engine = new ToastEngine();
    engine.submitEvent(
      {
        pokemonId: 'Squirtle',
        type: 'xp',
        displayName: 'Squirtle',
        xpAmount: 2,
        timestamp: NOW,
      },
      NOW,
    );
    engine.submitEvent(
      {
        pokemonId: 'Squirtle',
        type: 'xp',
        displayName: 'Squirtle',
        xpAmount: 2,
        timestamp: NOW + 300,
      },
      NOW + 300,
    );
    engine.flushCoalesceBuffer('Squirtle', NOW + 400);
    assert.strictEqual(
      engine.active('Squirtle')?.message,
      'Squirtle gained 4 EXP!',
    );
  });

  test('clear forgets a Pokémon that left the world', () => {
    const engine = new ToastEngine();
    const xp = buildWorldToastQueueItem({
      pokemonId: 'Squirtle',
      type: 'xp',
      displayName: 'Squirtle',
      xpAmount: 2,
      timestamp: NOW,
    })!;
    engine.submit(xp, NOW);
    engine.clear('Squirtle');
    assert.strictEqual(engine.active('Squirtle'), undefined);
  });
});
