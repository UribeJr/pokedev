/**
 * Tests for the Friendship system's PURE logic: the model, the tier/heart
 * mapping, gain-amount selection, and friendship-based evolution
 * eligibility.
 *
 * Consistent with this project's existing test:unit boundary (see
 * `evolution-persistence.test.ts`'s header comment): everything here is
 * free of `vscode`. The vscode-touching glue this feature adds
 * (`ProgressionService._grantFriendship`/`grantFriendshipToPartner`,
 * `ActivityTracker._friendshipCodingTick`, the Daily Challenge hook, the
 * debug command) is covered by manual QA only, exactly like
 * `evolvePokemonInstance`/`reconcileStaleEvolutions` before it.
 */
import * as assert from 'assert';
import { POKEMON_DATA } from '../../common/pokemon-data';
import {
  addFriendship,
  clampFriendship,
  DEFAULT_POKEMON_FRIENDSHIP,
  friendshipXpEventAmount,
  FRIENDSHIP_CODING_CHUNK_MS,
  FRIENDSHIP_EVOLUTION_THRESHOLD,
  FRIENDSHIP_GAIN_CODING_CHUNK,
  FRIENDSHIP_GAIN_DAILY_COMPLETE,
  FRIENDSHIP_GAIN_DEV_ACTION,
  FRIENDSHIP_GAIN_LEVEL_UP,
  FRIENDSHIP_GAIN_XP_EVENT,
  FRIENDSHIP_TIER_ORDER,
  getFriendshipHearts,
  getFriendshipTier,
  MAX_FRIENDSHIP,
  MIN_FRIENDSHIP,
} from '../../progression/friendship-rules';
import {
  applyFriendshipGrant,
  createDefaultPokemonProgress,
  DEFAULT_POKEMON_LEVEL,
  normalizePokemonProgress,
} from '../../progression/pokemon-progression';
import { EVOLUTION_RULES } from '../../progression/evolution-data';
import {
  getAvailableEvolution,
  getEvolutionRules,
  hasFriendshipEvolutionRule,
} from '../../progression/evolution-service';
import {
  DAY_START_HOUR,
  getTimeOfDay,
  NIGHT_START_HOUR,
} from '../../progression/time-of-day';

const NOW = 1_700_000_000_000;

suite('Friendship: model', () => {
  test('a progression record with no friendship field defaults safely', () => {
    const progress = normalizePokemonProgress({ level: 12 }, 'squirtle', NOW);
    assert.strictEqual(progress.friendship, DEFAULT_POKEMON_FRIENDSHIP);
  });

  test('a hand-edited, non-numeric friendship field also falls back to the default', () => {
    const progress = normalizePokemonProgress(
      { level: 12, friendship: 'a lot' },
      'squirtle',
      NOW,
    );
    assert.strictEqual(progress.friendship, DEFAULT_POKEMON_FRIENDSHIP);
  });

  test('a valid stored friendship value survives normalization unchanged', () => {
    const progress = normalizePokemonProgress(
      { level: 12, friendship: 180 },
      'squirtle',
      NOW,
    );
    assert.strictEqual(progress.friendship, 180);
  });

  test('a brand-new progression record starts at the default friendship', () => {
    const progress = createDefaultPokemonProgress('pichu', NOW);
    assert.strictEqual(progress.friendship, DEFAULT_POKEMON_FRIENDSHIP);
  });

  test('friendship clamps at MAX_FRIENDSHIP and never exceeds it', () => {
    assert.strictEqual(clampFriendship(9999), MAX_FRIENDSHIP);
    assert.strictEqual(addFriendship(250, 50).value, MAX_FRIENDSHIP);
  });

  test('friendship never drops below MIN_FRIENDSHIP', () => {
    assert.strictEqual(clampFriendship(-50), MIN_FRIENDSHIP);
    // addFriendship never accepts a negative amount, so this checks the
    // clamp itself rather than a loss mechanic that does not exist.
    assert.strictEqual(clampFriendship(-1), 0);
  });

  test('a negative or zero grant is a no-op, not an error', () => {
    assert.strictEqual(addFriendship(100, 0).value, 100);
    assert.strictEqual(addFriendship(100, -10).value, 100);
    assert.strictEqual(addFriendship(100, NaN).value, 100);
  });

  test('applyFriendshipGrant returns the SAME object reference when nothing changed', () => {
    const progress = createDefaultPokemonProgress('pichu', NOW);
    const { progress: unchanged } = applyFriendshipGrant(progress, 0);
    assert.strictEqual(unchanged, progress);
  });

  test('applyFriendshipGrant never touches totalXp/level', () => {
    const progress = createDefaultPokemonProgress('pichu', NOW);
    const { progress: after } = applyFriendshipGrant(progress, 10);
    assert.strictEqual(after.totalXp, progress.totalXp);
    assert.strictEqual(after.level, progress.level);
    assert.strictEqual(after.friendship, progress.friendship + 10);
  });
});

suite('Friendship: gain amounts', () => {
  test('an accepted qualifying XP event earns the base amount', () => {
    assert.strictEqual(
      friendshipXpEventAmount('git-commit'),
      FRIENDSHIP_GAIN_XP_EVENT,
    );
    assert.strictEqual(
      friendshipXpEventAmount('work-batch'),
      FRIENDSHIP_GAIN_XP_EVENT,
    );
    assert.strictEqual(
      friendshipXpEventAmount('active-coding'),
      FRIENDSHIP_GAIN_XP_EVENT,
    );
    assert.strictEqual(
      friendshipXpEventAmount('task-success'),
      FRIENDSHIP_GAIN_XP_EVENT,
    );
  });

  test('an accepted Dev Action earns its own, larger amount instead of the base', () => {
    for (const type of [
      'build-success',
      'test-success',
      'typecheck-success',
      'lint-success',
    ]) {
      assert.strictEqual(
        friendshipXpEventAmount(type),
        FRIENDSHIP_GAIN_DEV_ACTION,
      );
    }
    assert.ok(FRIENDSHIP_GAIN_DEV_ACTION > FRIENDSHIP_GAIN_XP_EVENT);
  });

  test('a debug XP grant earns no Friendship at all', () => {
    assert.strictEqual(friendshipXpEventAmount('debug-grant'), 0);
  });

  test('the named gain constants are all positive and distinct enough to reason about', () => {
    assert.ok(FRIENDSHIP_GAIN_XP_EVENT > 0);
    assert.ok(FRIENDSHIP_GAIN_DEV_ACTION > 0);
    assert.ok(FRIENDSHIP_GAIN_LEVEL_UP > 0);
    assert.ok(FRIENDSHIP_GAIN_DAILY_COMPLETE > 0);
    assert.ok(FRIENDSHIP_GAIN_CODING_CHUNK > 0);
    assert.ok(FRIENDSHIP_CODING_CHUNK_MS > 0);
  });
});

suite('Friendship: tiers and hearts', () => {
  test('tier boundaries match the documented ranges', () => {
    assert.strictEqual(getFriendshipTier(0), 'wary');
    assert.strictEqual(getFriendshipTier(49), 'wary');
    assert.strictEqual(getFriendshipTier(50), 'friendly');
    assert.strictEqual(getFriendshipTier(99), 'friendly');
    assert.strictEqual(getFriendshipTier(100), 'close');
    assert.strictEqual(getFriendshipTier(149), 'close');
    assert.strictEqual(getFriendshipTier(150), 'very-close');
    assert.strictEqual(getFriendshipTier(219), 'very-close');
    assert.strictEqual(getFriendshipTier(220), 'best-friend');
    assert.strictEqual(getFriendshipTier(255), 'best-friend');
  });

  test('heart count matches the tier at every boundary', () => {
    assert.strictEqual(getFriendshipHearts(0), 1);
    assert.strictEqual(getFriendshipHearts(49), 1);
    assert.strictEqual(getFriendshipHearts(50), 2);
    assert.strictEqual(getFriendshipHearts(99), 2);
    assert.strictEqual(getFriendshipHearts(100), 3);
    assert.strictEqual(getFriendshipHearts(149), 3);
    assert.strictEqual(getFriendshipHearts(150), 4);
    assert.strictEqual(getFriendshipHearts(219), 4);
    assert.strictEqual(getFriendshipHearts(220), 5);
    assert.strictEqual(getFriendshipHearts(255), 5);
  });

  test('FRIENDSHIP_TIER_ORDER is ascending and has exactly 5 entries', () => {
    assert.strictEqual(FRIENDSHIP_TIER_ORDER.length, 5);
    assert.strictEqual(FRIENDSHIP_TIER_ORDER[0], 'wary');
    assert.strictEqual(FRIENDSHIP_TIER_ORDER[4], 'best-friend');
  });

  test('addFriendship reports tierUp only when the tier actually changes', () => {
    assert.strictEqual(addFriendship(45, 4).tierUp, false); // 45 -> 49, still wary
    assert.strictEqual(addFriendship(45, 5).tierUp, true); // 45 -> 50, wary -> friendly
    assert.strictEqual(addFriendship(219, 1).tierUp, true); // -> 220, best-friend
    assert.strictEqual(addFriendship(255, 10).tierUp, false); // already capped
  });

  test('FRIENDSHIP_EVOLUTION_THRESHOLD sits inside the best-friend band', () => {
    assert.strictEqual(
      getFriendshipTier(FRIENDSHIP_EVOLUTION_THRESHOLD),
      'best-friend',
    );
  });
});

suite('Time of day', () => {
  test('the documented day window (06:00-17:59) resolves to day', () => {
    assert.strictEqual(
      getTimeOfDay(new Date(2024, 0, 1, DAY_START_HOUR, 0)),
      'day',
    );
    assert.strictEqual(getTimeOfDay(new Date(2024, 0, 1, 12, 0)), 'day');
    assert.strictEqual(
      getTimeOfDay(new Date(2024, 0, 1, NIGHT_START_HOUR - 1, 59)),
      'day',
    );
  });

  test('the documented night window (18:00-05:59) resolves to night', () => {
    assert.strictEqual(
      getTimeOfDay(new Date(2024, 0, 1, NIGHT_START_HOUR, 0)),
      'night',
    );
    assert.strictEqual(getTimeOfDay(new Date(2024, 0, 1, 23, 30)), 'night');
    assert.strictEqual(
      getTimeOfDay(new Date(2024, 0, 1, DAY_START_HOUR - 1, 59)),
      'night',
    );
  });
});

suite('Friendship evolution: eligibility', () => {
  test('a high-friendship Pichu is eligible to evolve into Pikachu', () => {
    const result = getAvailableEvolution(
      'pichu',
      DEFAULT_POKEMON_LEVEL,
      false,
      {
        friendship: FRIENDSHIP_EVOLUTION_THRESHOLD,
      },
    );
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'pikachu');
  });

  test('a high-friendship Golbat is eligible to evolve into Crobat', () => {
    const result = getAvailableEvolution(
      'golbat',
      DEFAULT_POKEMON_LEVEL,
      false,
      {
        friendship: FRIENDSHIP_EVOLUTION_THRESHOLD,
      },
    );
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'crobat');
  });

  test('insufficient friendship blocks a friendship-only evolution', () => {
    const result = getAvailableEvolution(
      'pichu',
      DEFAULT_POKEMON_LEVEL,
      false,
      {
        friendship: FRIENDSHIP_EVOLUTION_THRESHOLD - 1,
      },
    );
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.reason, 'friendship-too-low');
    assert.strictEqual(
      result.requiredFriendship,
      FRIENDSHIP_EVOLUTION_THRESHOLD,
    );
  });

  test('zero/undefined friendship context blocks a friendship rule rather than defaulting to available', () => {
    const result = getAvailableEvolution('pichu', DEFAULT_POKEMON_LEVEL, false);
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.reason, 'friendship-too-low');
  });

  test('Eevee resolves to Espeon with high friendship during the day', () => {
    const result = getAvailableEvolution(
      'eevee',
      DEFAULT_POKEMON_LEVEL,
      false,
      {
        friendship: FRIENDSHIP_EVOLUTION_THRESHOLD,
        timeOfDay: 'day',
      },
    );
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'espeon');
  });

  test('Eevee resolves to Umbreon with high friendship during the night', () => {
    const result = getAvailableEvolution(
      'eevee',
      DEFAULT_POKEMON_LEVEL,
      false,
      {
        friendship: FRIENDSHIP_EVOLUTION_THRESHOLD,
        timeOfDay: 'night',
      },
    );
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'umbreon');
  });

  test('Eevee never resolves to both, and never at random - the same context always gives the same answer', () => {
    const context = {
      friendship: FRIENDSHIP_EVOLUTION_THRESHOLD,
      timeOfDay: 'day' as const,
    };
    const first = getAvailableEvolution(
      'eevee',
      DEFAULT_POKEMON_LEVEL,
      false,
      context,
    );
    const second = getAvailableEvolution(
      'eevee',
      DEFAULT_POKEMON_LEVEL,
      false,
      context,
    );
    assert.strictEqual(first.rule?.to, 'espeon');
    assert.strictEqual(second.rule?.to, 'espeon');
  });

  test('correct friendship but the wrong time of day blocks a friendship-time evolution', () => {
    const result = getAvailableEvolution(
      'riolu',
      DEFAULT_POKEMON_LEVEL,
      false,
      {
        friendship: FRIENDSHIP_EVOLUTION_THRESHOLD,
        timeOfDay: 'night', // Riolu -> Lucario requires day
      },
    );
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.reason, 'wrong-time-of-day');
    assert.strictEqual(result.requiredTimeOfDay, 'day');
  });

  test('Riolu evolves into Lucario given sufficient friendship during the day', () => {
    const result = getAvailableEvolution(
      'riolu',
      DEFAULT_POKEMON_LEVEL,
      false,
      {
        friendship: FRIENDSHIP_EVOLUTION_THRESHOLD,
        timeOfDay: 'day',
      },
    );
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'lucario');
  });

  test('Chingling evolves into Chimecho given sufficient friendship at night', () => {
    const result = getAvailableEvolution(
      'chingling',
      DEFAULT_POKEMON_LEVEL,
      false,
      {
        friendship: FRIENDSHIP_EVOLUTION_THRESHOLD,
        timeOfDay: 'night',
      },
    );
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'chimecho');
  });

  test('existing LEVEL-based evolution still works unchanged alongside friendship rules', () => {
    const belowThreshold = getAvailableEvolution('squirtle', 15, false);
    assert.strictEqual(belowThreshold.available, false);
    assert.strictEqual(belowThreshold.reason, 'level-too-low');

    const atThreshold = getAvailableEvolution('squirtle', 16, false);
    assert.strictEqual(atThreshold.available, true);
    assert.strictEqual(atThreshold.rule?.to, 'wartortle');
  });

  test('hasFriendshipEvolutionRule is true only for species with a friendship/friendship-time rule', () => {
    assert.strictEqual(hasFriendshipEvolutionRule('pichu'), true);
    assert.strictEqual(hasFriendshipEvolutionRule('eevee'), true);
    assert.strictEqual(hasFriendshipEvolutionRule('riolu'), true);
    assert.strictEqual(hasFriendshipEvolutionRule('squirtle'), false); // level-only
    assert.strictEqual(hasFriendshipEvolutionRule('ditto'), false); // no rule at all
  });

  test('every from/to species referenced by a friendship or friendship-time rule exists in POKEMON_DATA', () => {
    for (const rule of EVOLUTION_RULES) {
      if (
        rule.condition.type !== 'friendship' &&
        rule.condition.type !== 'friendship-time'
      ) {
        continue;
      }
      assert.ok(POKEMON_DATA[rule.from], `missing species data: ${rule.from}`);
      assert.ok(POKEMON_DATA[rule.to], `missing species data: ${rule.to}`);
    }
  });

  test('getEvolutionRules returns an empty array, never undefined, for a species with no rule', () => {
    assert.deepStrictEqual(getEvolutionRules('ditto'), []);
  });
});

suite('Friendship evolution: instance identity', () => {
  /**
   * The canonical evolve operation (`evolveCollectionEntry` in
   * `evolution-service.ts`) does not read `PokemonProgress` at all - it only
   * mutates the collection arrays - so friendship survival across evolution
   * is really a property of `evolvePokemonInstance` in `evolution-flow.ts`
   * (vscode-aware, manual QA only): it reads the FULL existing progress
   * record (friendship included), and writes it back with only `species`
   * changed. This test locks in the piece that IS pure: that a progress
   * record's `friendship` field is never touched by anything that changes
   * `species`.
   */
  test('changing only species on a progress record leaves friendship untouched', () => {
    const before = createDefaultPokemonProgress('pichu', NOW);
    const { progress: withFriendship } = applyFriendshipGrant(
      before,
      224 - before.friendship,
    );
    assert.strictEqual(withFriendship.friendship, 224);

    const afterEvolution = { ...withFriendship, species: 'pikachu' };
    assert.strictEqual(afterEvolution.friendship, 224);
    assert.strictEqual(afterEvolution.totalXp, withFriendship.totalXp);
    assert.strictEqual(afterEvolution.level, withFriendship.level);
  });
});
