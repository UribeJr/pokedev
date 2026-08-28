import * as assert from 'assert';
import { POKEMON_DATA } from '../../common/pokemon-data';
import { PokemonColor } from '../../common/types';
import {
  countsAsActivity,
  hasDocumentChanged,
  idleTimeoutForMode,
  isCommitRewarded,
  isIgnoredPath,
  normalizeProgressionMode,
  rememberCommitIn,
  shouldAccrueCodingTime,
  shouldAwardBatch,
} from '../../progression/activity-rules';
import { EVOLUTION_RULES } from '../../progression/evolution-data';
import {
  getAvailableEvolution,
  getEvolutionLevel,
  getEvolutionRule,
} from '../../progression/evolution-service';
import {
  addPokemonXp,
  createDefaultPokemonProgress,
  DEFAULT_POKEMON_LEVEL,
  getCumulativePokemonXp,
  getPokemonLevelFromXp,
  getPokemonXpForNextLevel,
  MAX_POKEMON_LEVEL,
  normalizePokemonProgress,
} from '../../progression/pokemon-progression';
import { ProgressionEvent } from '../../progression/progression-types';
import {
  appendToLog,
  normalizeLog,
  XpLedger,
} from '../../progression/xp-ledger';
import {
  BATCH_COOLDOWN_MS,
  computeWorkBatchAward,
  MAX_EVENTS_PER_MINUTE,
  MAX_TRAINER_XP_PER_HOUR,
  XP_RULES,
} from '../../progression/xp-rules';
import {
  addTrainerXp,
  createDefaultTrainerProfile,
  getCumulativeTrainerXp,
  getTrainerLevelFromXp,
  getXpForNextTrainerLevel,
  MAX_TRAINER_LEVEL,
  normalizeTrainerProfile,
} from '../../trainer/trainer-profile';

const NOW = 1_700_000_000_000;

/* ------------------------------------------------------------------ *
 * Trainer curve
 * ------------------------------------------------------------------ */

suite('Trainer level curve', () => {
  test('matches the designed early progression', () => {
    assert.strictEqual(getXpForNextTrainerLevel(1), 100);
    assert.strictEqual(getXpForNextTrainerLevel(2), 150);
    assert.strictEqual(getXpForNextTrainerLevel(3), 225);
    assert.strictEqual(getXpForNextTrainerLevel(4), 325);
    assert.strictEqual(getXpForNextTrainerLevel(5), 450);
  });

  test('the cost rises by a flat 25 more each level', () => {
    for (let level = 2; level < 40; level++) {
      const secondDifference =
        getXpForNextTrainerLevel(level + 1) -
        2 * getXpForNextTrainerLevel(level) +
        getXpForNextTrainerLevel(level - 1);
      assert.strictEqual(secondDifference, 25, `at level ${level}`);
    }
  });

  test('every requirement is a whole number', () => {
    for (let level = 1; level <= MAX_TRAINER_LEVEL; level++) {
      const cost = getXpForNextTrainerLevel(level);
      assert.strictEqual(cost, Math.floor(cost), `at level ${level}`);
    }
  });

  test('growth stays reachable rather than exploding', () => {
    // A geometric curve would be in the millions by here; this must not be.
    assert.ok(getCumulativeTrainerXp(20) < 60_000);
    assert.ok(getCumulativeTrainerXp(10) < 6_000);
  });

  test('nonsense levels fall back to the level 1 requirement', () => {
    for (const level of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.strictEqual(getXpForNextTrainerLevel(level), 100);
    }
  });

  test('cumulative xp is the running sum of the curve', () => {
    assert.strictEqual(getCumulativeTrainerXp(1), 0);
    assert.strictEqual(getCumulativeTrainerXp(2), 100);
    assert.strictEqual(getCumulativeTrainerXp(3), 250);
    assert.strictEqual(getCumulativeTrainerXp(5), 800);
  });

  test('level and cumulative xp are inverses of each other', () => {
    for (let level = 1; level <= MAX_TRAINER_LEVEL; level++) {
      const exact = getCumulativeTrainerXp(level);
      assert.strictEqual(getTrainerLevelFromXp(exact), level, `at ${level}`);
      if (level < MAX_TRAINER_LEVEL) {
        assert.strictEqual(getTrainerLevelFromXp(exact - 1), level - 1 || 1);
      }
    }
  });
});

suite('Trainer XP grants', () => {
  test('a partial grant accumulates without levelling', () => {
    const profile = addTrainerXp(createDefaultTrainerProfile(NOW), 40);
    assert.strictEqual(profile.trainerLevel, 1);
    assert.strictEqual(profile.trainerXp, 40);
    assert.strictEqual(profile.totalTrainerXp, 40);
  });

  test('reaching the requirement levels up and carries the remainder', () => {
    const profile = addTrainerXp(createDefaultTrainerProfile(NOW), 130);
    assert.strictEqual(profile.trainerLevel, 2);
    assert.strictEqual(profile.trainerXp, 30);
    assert.strictEqual(profile.totalTrainerXp, 130);
  });

  test('one grant can span several levels', () => {
    // 100 + 150 + 225 + 325 = 800 to reach level 5, leaving 250.
    const profile = addTrainerXp(createDefaultTrainerProfile(NOW), 1050);
    assert.strictEqual(profile.trainerLevel, 5);
    assert.strictEqual(profile.trainerXp, 250);
    assert.strictEqual(profile.totalTrainerXp, 1050);
  });

  test('many small grants equal one large grant', () => {
    let incremental = createDefaultTrainerProfile(NOW);
    for (let i = 0; i < 100; i++) {
      incremental = addTrainerXp(incremental, 7);
    }
    const single = addTrainerXp(createDefaultTrainerProfile(NOW), 700);
    assert.strictEqual(incremental.totalTrainerXp, single.totalTrainerXp);
    assert.strictEqual(incremental.trainerLevel, single.trainerLevel);
    assert.strictEqual(incremental.trainerXp, single.trainerXp);
  });

  test('invalid grants are a no-op', () => {
    const base = createDefaultTrainerProfile(NOW);
    for (const amount of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.deepStrictEqual(addTrainerXp(base, amount), base);
    }
  });

  test('the level cap holds and clears residual xp', () => {
    const profile = addTrainerXp(
      createDefaultTrainerProfile(NOW),
      Number.MAX_SAFE_INTEGER,
    );
    assert.strictEqual(profile.trainerLevel, MAX_TRAINER_LEVEL);
    assert.strictEqual(profile.trainerXp, 0);
  });
});

suite('Trainer profile migration', () => {
  test('a v1 profile with no total is reconstructed from its level', () => {
    const migrated = normalizeTrainerProfile(
      { version: 1, trainerLevel: 3, trainerXp: 40, createdAt: NOW },
      NOW,
    );
    assert.strictEqual(migrated.version, 2);
    // 100 + 150 to reach level 3, plus the 40 held within it.
    assert.strictEqual(migrated.totalTrainerXp, 290);
    assert.strictEqual(migrated.trainerLevel, 3);
    assert.strictEqual(migrated.trainerXp, 40);
  });

  test('the real-world v1 profile - level 1, no xp - migrates to zero', () => {
    const migrated = normalizeTrainerProfile(
      { version: 1, trainerLevel: 1, trainerXp: 0, createdAt: NOW },
      NOW,
    );
    assert.strictEqual(migrated.totalTrainerXp, 0);
    assert.strictEqual(migrated.trainerLevel, 1);
  });

  test('a hand-edited level is overruled by the xp that justifies it', () => {
    const normalized = normalizeTrainerProfile(
      { version: 2, totalTrainerXp: 100, trainerLevel: 99, trainerXp: 5 },
      NOW,
    );
    assert.strictEqual(normalized.trainerLevel, 2);
    assert.strictEqual(normalized.trainerXp, 0);
  });

  test('createdAt survives normalization', () => {
    const normalized = normalizeTrainerProfile(
      { version: 1, trainerLevel: 1, trainerXp: 0, createdAt: 12345 },
      NOW,
    );
    assert.strictEqual(normalized.createdAt, 12345);
  });

  test('garbage produces a usable default rather than throwing', () => {
    for (const raw of [undefined, null, 42, 'nope', []]) {
      const normalized = normalizeTrainerProfile(raw, NOW);
      assert.strictEqual(normalized.trainerLevel, 1);
      assert.strictEqual(normalized.totalTrainerXp, 0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Pokemon curve
 * ------------------------------------------------------------------ */

suite('Pokemon level curve', () => {
  test('early levels are cheap and later ones are not', () => {
    assert.strictEqual(getPokemonXpForNextLevel(5), 75);
    assert.strictEqual(getPokemonXpForNextLevel(15), 375);
    assert.strictEqual(getPokemonXpForNextLevel(50), 3000);
  });

  test('the requirement rises monotonically to the cap', () => {
    for (let level = 1; level < MAX_POKEMON_LEVEL - 1; level++) {
      assert.ok(
        getPokemonXpForNextLevel(level + 1) > getPokemonXpForNextLevel(level),
        `at level ${level}`,
      );
    }
  });

  test('a capped Pokemon has nothing left to earn', () => {
    assert.strictEqual(getPokemonXpForNextLevel(MAX_POKEMON_LEVEL), 0);
  });

  test('the first starter evolution is a multi-session goal, not a grind', () => {
    // Level 5 (where partners start) to 16 (Bulbasaur's threshold).
    const cost = getCumulativePokemonXp(16) - getCumulativePokemonXp(5);
    assert.strictEqual(cost, 2310);
  });

  test('level and cumulative xp are inverses of each other', () => {
    for (let level = 1; level <= MAX_POKEMON_LEVEL; level++) {
      const exact = getCumulativePokemonXp(level);
      assert.strictEqual(getPokemonLevelFromXp(exact), level, `at ${level}`);
    }
  });
});

suite('Pokemon XP grants', () => {
  function fresh() {
    return createDefaultPokemonProgress('bulbasaur', NOW);
  }

  test('a new partner starts at the default level with matching xp', () => {
    const progress = fresh();
    assert.strictEqual(progress.level, DEFAULT_POKEMON_LEVEL);
    assert.strictEqual(progress.currentXp, 0);
    // Seeded with the XP that actually buys level 5, so level and total agree.
    assert.strictEqual(progress.totalXp, getCumulativePokemonXp(5));
    assert.strictEqual(progress.totalXp, 130);
  });

  test('a partial grant accumulates without levelling', () => {
    const { progress, result } = addPokemonXp(fresh(), 40);
    assert.strictEqual(result.levelledUp, false);
    assert.strictEqual(progress.level, 5);
    assert.strictEqual(progress.currentXp, 40);
  });

  test('reaching the requirement levels up and carries the remainder', () => {
    const { progress, result } = addPokemonXp(fresh(), 80);
    assert.strictEqual(result.levelledUp, true);
    assert.strictEqual(result.fromLevel, 5);
    assert.strictEqual(result.toLevel, 6);
    assert.strictEqual(progress.level, 6);
    assert.strictEqual(progress.currentXp, 5);
  });

  test('one grant can span several levels', () => {
    const { progress, result } = addPokemonXp(fresh(), 5000);
    assert.ok(progress.level > 10);
    assert.strictEqual(result.fromLevel, 5);
    assert.strictEqual(result.toLevel, progress.level);
  });

  test('invalid grants are a no-op', () => {
    const base = fresh();
    for (const amount of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { progress, result } = addPokemonXp(base, amount);
      assert.deepStrictEqual(progress, base);
      assert.strictEqual(result.levelledUp, false);
    }
  });

  test('addPokemonXp does not mutate its input', () => {
    const base = fresh();
    addPokemonXp(base, 500);
    assert.strictEqual(base.level, 5);
    assert.strictEqual(base.totalXp, 130);
  });

  test('the level cap holds', () => {
    const { progress } = addPokemonXp(fresh(), Number.MAX_SAFE_INTEGER);
    assert.strictEqual(progress.level, MAX_POKEMON_LEVEL);
    assert.strictEqual(progress.currentXp, 0);
  });

  test('levelling up clears a previous evolution refusal', () => {
    const declined = { ...fresh(), declinedEvolutionAtLevel: 5 };
    const { progress } = addPokemonXp(declined, 80);
    assert.strictEqual(progress.declinedEvolutionAtLevel, undefined);
  });

  test('a refusal survives a grant that does not level up', () => {
    const declined = { ...fresh(), declinedEvolutionAtLevel: 5 };
    const { progress } = addPokemonXp(declined, 10);
    assert.strictEqual(progress.declinedEvolutionAtLevel, 5);
  });
});

suite('Pokemon progression migration', () => {
  test('a Pokemon saved before progression existed gets a safe default', () => {
    const progress = normalizePokemonProgress(undefined, 'pikachu', NOW);
    assert.strictEqual(progress.level, DEFAULT_POKEMON_LEVEL);
    assert.strictEqual(progress.species, 'pikachu');
    assert.strictEqual(progress.currentXp, 0);
  });

  test('a record with only a level is reconstructed into a total', () => {
    const progress = normalizePokemonProgress(
      { version: 1, level: 12 },
      'gible',
      NOW,
    );
    assert.strictEqual(progress.level, 12);
    assert.strictEqual(progress.totalXp, getCumulativePokemonXp(12));
  });

  test('a hand-edited level is overruled by its xp', () => {
    const progress = normalizePokemonProgress(
      { version: 1, totalXp: 130, level: 90 },
      'gible',
      NOW,
    );
    assert.strictEqual(progress.level, 5);
  });

  test('garbage produces a usable default rather than throwing', () => {
    for (const raw of [null, 7, 'nope', []]) {
      const progress = normalizePokemonProgress(raw, 'eevee', NOW);
      assert.strictEqual(progress.level, DEFAULT_POKEMON_LEVEL);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Anti-farming
 * ------------------------------------------------------------------ */

suite('Work batch rules', () => {
  test('the first save of a document is new work', () => {
    assert.strictEqual(hasDocumentChanged(undefined, 'a'), true);
  });

  test('re-saving unchanged content is never work, however long the wait', () => {
    const previous = { at: NOW, fingerprint: 'a' };
    assert.strictEqual(hasDocumentChanged(previous, 'a'), false);
  });

  test('a genuinely changed document is work again', () => {
    assert.strictEqual(
      hasDocumentChanged({ at: NOW, fingerprint: 'a' }, 'b'),
      true,
    );
  });

  test('the first batch is always paid', () => {
    assert.strictEqual(shouldAwardBatch(undefined, NOW), true);
  });

  test('batches wait out a global cooldown', () => {
    assert.strictEqual(shouldAwardBatch(NOW, NOW + 1000), false);
    assert.strictEqual(
      shouldAwardBatch(NOW, NOW + BATCH_COOLDOWN_MS - 1),
      false,
    );
    assert.strictEqual(shouldAwardBatch(NOW, NOW + BATCH_COOLDOWN_MS), true);
  });

  test('the cooldown is global, so a many-file burst cannot slip past it', () => {
    // The regression this replaced: a per-document cooldown never applies
    // across distinct files, so forty files paid forty times.
    let lastAward: number | undefined = undefined;
    let awarded = 0;
    for (let i = 0; i < 40; i++) {
      const at = NOW + i * 100; // forty files inside four seconds
      if (shouldAwardBatch(lastAward, at)) {
        awarded++;
        lastAward = at;
      }
    }
    assert.strictEqual(awarded, 1);
  });

  test('breadth is worth something, but not proportionally', () => {
    assert.deepStrictEqual(computeWorkBatchAward(1), {
      trainerXp: 2,
      pokemonXp: 4,
    });
    assert.deepStrictEqual(computeWorkBatchAward(3), {
      trainerXp: 4,
      pokemonXp: 8,
    });
    assert.deepStrictEqual(computeWorkBatchAward(9), {
      trainerXp: 10,
      pokemonXp: 20,
    });
  });

  test('an enormous batch pays no more than a large one', () => {
    const large = computeWorkBatchAward(9);
    for (const count of [10, 40, 500, 10_000]) {
      assert.deepStrictEqual(
        computeWorkBatchAward(count),
        large,
        String(count),
      );
    }
  });

  test('a nonsense file count still yields a single-file award', () => {
    for (const count of [0, -5, Number.NaN]) {
      assert.deepStrictEqual(computeWorkBatchAward(count), {
        trainerXp: 2,
        pokemonXp: 4,
      });
    }
  });

  test('generated and vendored files are ignored', () => {
    for (const path of [
      '/repo/node_modules/lib/index.js',
      '/repo/out/extension.js',
      '/repo/dist/main.js',
      '/repo/.git/COMMIT_EDITMSG',
      '/repo/coverage/lcov.info',
      '/repo/src/app.min.js',
      '/repo/package-lock.json',
      '/repo/yarn.lock',
      '/repo/out/main.js.map',
    ]) {
      assert.strictEqual(isIgnoredPath(path), true, path);
    }
  });

  test('real source files are not ignored', () => {
    for (const path of [
      '/repo/src/extension.ts',
      '/repo/src/panel/main.ts',
      '/repo/README.md',
      '/repo/media/trainer-card.css',
    ]) {
      assert.strictEqual(isIgnoredPath(path), false, path);
    }
  });

  test('windows separators are normalised before matching', () => {
    assert.strictEqual(
      isIgnoredPath('C:\\repo\\node_modules\\pkg\\index.js'),
      true,
    );
  });
});

suite('Active coding rules', () => {
  test('an unfocused window never accrues time', () => {
    assert.strictEqual(shouldAccrueCodingTime(false, NOW, NOW), false);
  });

  test('a focused window with recent activity accrues time', () => {
    assert.strictEqual(shouldAccrueCodingTime(true, NOW, NOW + 1000), true);
  });

  test('idling past the timeout stops accrual', () => {
    const fiveMinutes = 5 * 60 * 1000;
    assert.strictEqual(
      shouldAccrueCodingTime(true, NOW, NOW + fiveMinutes),
      true,
    );
    assert.strictEqual(
      shouldAccrueCodingTime(true, NOW, NOW + fiveMinutes + 1),
      false,
    );
  });

  test('an editor left open overnight earns nothing', () => {
    const eightHours = 8 * 60 * 60 * 1000;
    assert.strictEqual(
      shouldAccrueCodingTime(true, NOW, NOW + eightHours),
      false,
    );
  });
});

suite('Progression modes', () => {
  test('auto trusts every signal, so either style of work earns', () => {
    for (const source of [
      'human-input',
      'document-change',
      'editor-switch',
    ] as const) {
      assert.strictEqual(countsAsActivity('auto', source), true, source);
    }
  });

  test('agentic trusts every signal too', () => {
    for (const source of [
      'human-input',
      'document-change',
      'editor-switch',
    ] as const) {
      assert.strictEqual(countsAsActivity('agentic', source), true, source);
    }
  });

  test('manual trusts only keyboard and mouse input', () => {
    assert.strictEqual(countsAsActivity('manual', 'human-input'), true);
    assert.strictEqual(countsAsActivity('manual', 'document-change'), false);
    assert.strictEqual(countsAsActivity('manual', 'editor-switch'), false);
  });

  test('in manual mode an agent editing files does not keep the clock alive', () => {
    // The behaviour the mode exists for: a burst of agent edits arrives as
    // document-change events, none of which should stand in for presence.
    let lastActivity = NOW;
    for (let i = 0; i < 100; i++) {
      if (countsAsActivity('manual', 'document-change')) {
        lastActivity = NOW + i * 1000;
      }
    }
    assert.strictEqual(lastActivity, NOW);
    // Ten minutes of agent work later, the session reads as idle.
    assert.strictEqual(
      shouldAccrueCodingTime(true, lastActivity, NOW + 600_000),
      false,
    );
  });

  test('in auto mode the same burst does keep the clock alive', () => {
    let lastActivity = NOW;
    for (let i = 0; i < 100; i++) {
      if (countsAsActivity('auto', 'document-change')) {
        lastActivity = NOW + i * 1000;
      }
    }
    assert.strictEqual(
      shouldAccrueCodingTime(true, lastActivity, lastActivity + 1000),
      true,
    );
  });

  test('agentic widens the idle window for long unattended runs', () => {
    assert.strictEqual(idleTimeoutForMode('auto'), 5 * 60 * 1000);
    assert.strictEqual(idleTimeoutForMode('manual'), 5 * 60 * 1000);
    assert.strictEqual(idleTimeoutForMode('agentic'), 15 * 60 * 1000);
  });

  test('a ten-minute agent pause survives in agentic but not in auto', () => {
    const tenMinutesLater = NOW + 10 * 60 * 1000;
    assert.strictEqual(
      shouldAccrueCodingTime(
        true,
        NOW,
        tenMinutesLater,
        idleTimeoutForMode('agentic'),
      ),
      true,
    );
    assert.strictEqual(
      shouldAccrueCodingTime(
        true,
        NOW,
        tenMinutesLater,
        idleTimeoutForMode('auto'),
      ),
      false,
    );
  });

  test('an unfocused window earns nothing in any mode', () => {
    for (const mode of ['auto', 'manual', 'agentic'] as const) {
      assert.strictEqual(
        shouldAccrueCodingTime(false, NOW, NOW, idleTimeoutForMode(mode)),
        false,
        mode,
      );
    }
  });

  test('an unrecognised or missing mode falls back to auto', () => {
    for (const value of [undefined, null, '', 'nonsense', 7, {}]) {
      assert.strictEqual(normalizeProgressionMode(value), 'auto');
    }
  });

  test('each valid mode reads back unchanged', () => {
    for (const mode of ['auto', 'manual', 'agentic'] as const) {
      assert.strictEqual(normalizeProgressionMode(mode), mode);
    }
  });
});

suite('Commit deduplication', () => {
  test('a commit is rewarded once and never again', () => {
    let commits: string[] = [];
    assert.strictEqual(isCommitRewarded(commits, 'abc'), false);
    commits = rememberCommitIn(commits, 'abc');
    assert.strictEqual(isCommitRewarded(commits, 'abc'), true);
  });

  test('remembering the same commit twice does not duplicate it', () => {
    let commits = rememberCommitIn([], 'abc');
    commits = rememberCommitIn(commits, 'abc');
    assert.deepStrictEqual(commits, ['abc']);
  });

  test('the stored set stays bounded, dropping the oldest', () => {
    let commits: string[] = [];
    for (let i = 0; i < 500; i++) {
      commits = rememberCommitIn(commits, `sha-${i}`, 200);
    }
    assert.strictEqual(commits.length, 200);
    assert.strictEqual(commits[0], 'sha-499');
    assert.strictEqual(isCommitRewarded(commits, 'sha-0'), false);
    assert.strictEqual(isCommitRewarded(commits, 'sha-499'), true);
  });
});

suite('XP ledger', () => {
  function event(overrides: Partial<ProgressionEvent> = {}): ProgressionEvent {
    return {
      type: 'work-batch',
      trainerXp: 1,
      pokemonXp: 2,
      timestamp: NOW,
      ...overrides,
    };
  }

  test('ordinary activity is never throttled', () => {
    const ledger = new XpLedger();
    // A save every 45 seconds for an hour, the realistic maximum.
    for (let i = 0; i < 80; i++) {
      const decision = ledger.accept(event({ timestamp: NOW + i * 45_000 }));
      assert.strictEqual(decision.accepted, true, `event ${i}`);
    }
  });

  test('an event loop is cut off within a minute', () => {
    const ledger = new XpLedger();
    let accepted = 0;
    for (let i = 0; i < 1000; i++) {
      if (ledger.accept(event({ timestamp: NOW })).accepted) {
        accepted++;
      }
    }
    assert.strictEqual(accepted, MAX_EVENTS_PER_MINUTE);
  });

  test('the per-minute window rolls forward', () => {
    const ledger = new XpLedger();
    for (let i = 0; i < MAX_EVENTS_PER_MINUTE; i++) {
      ledger.accept(event({ timestamp: NOW }));
    }
    assert.strictEqual(
      ledger.accept(event({ timestamp: NOW })).accepted,
      false,
    );
    assert.strictEqual(
      ledger.accept(event({ timestamp: NOW + 61_000 })).accepted,
      true,
    );
  });

  test('the hourly cap bounds trainer xp within one window', () => {
    const ledger = new XpLedger();
    let granted = 0;
    // 600 commit-sized events over 50 minutes: paced slowly enough to clear
    // the per-minute throttle, and confined to a single rolling hour so no
    // entry ages out of the window mid-test.
    for (let i = 0; i < 600; i++) {
      const e = event({ trainerXp: 15, timestamp: NOW + i * 5000 });
      if (ledger.accept(e).accepted) {
        granted += e.trainerXp;
      }
    }
    assert.ok(
      granted <= MAX_TRAINER_XP_PER_HOUR,
      `granted ${granted}, cap ${MAX_TRAINER_XP_PER_HOUR}`,
    );
  });

  test('the hourly cap lifts as the window rolls forward', () => {
    const ledger = new XpLedger();
    for (let i = 0; i < 60; i++) {
      ledger.accept(event({ trainerXp: 10, timestamp: NOW + i * 5000 }));
    }
    // Cap reached; nothing more this hour.
    assert.strictEqual(
      ledger.accept(event({ trainerXp: 10, timestamp: NOW + 300_000 }))
        .accepted,
      false,
    );
    // An hour later the earlier events have aged out and earning resumes.
    assert.strictEqual(
      ledger.accept(event({ trainerXp: 10, timestamp: NOW + 3_900_000 }))
        .accepted,
      true,
    );
  });

  test('rejections name their reason', () => {
    const ledger = new XpLedger();
    for (let i = 0; i < MAX_EVENTS_PER_MINUTE; i++) {
      ledger.accept(event({ timestamp: NOW }));
    }
    assert.strictEqual(
      ledger.accept(event({ timestamp: NOW })).reason,
      'rate-limited',
    );
  });
});

suite('Activity log', () => {
  function event(index: number): ProgressionEvent {
    return {
      type: 'git-commit',
      trainerXp: 15,
      pokemonXp: 25,
      timestamp: NOW + index,
    };
  }

  test('the newest event is first', () => {
    const log = appendToLog(appendToLog([], event(1)), event(2));
    assert.strictEqual(log[0].timestamp, NOW + 2);
  });

  test('the log stays bounded', () => {
    let log: ProgressionEvent[] = [];
    for (let i = 0; i < 500; i++) {
      log = appendToLog(log, event(i), 50);
    }
    assert.strictEqual(log.length, 50);
    assert.strictEqual(log[0].timestamp, NOW + 499);
  });

  test('malformed persisted entries are discarded, not thrown on', () => {
    const log = normalizeLog([
      { type: 'git-commit', trainerXp: 1, pokemonXp: 2, timestamp: NOW },
      { type: 'git-commit' },
      null,
      'nope',
      { trainerXp: 1, pokemonXp: 2, timestamp: NOW },
    ]);
    assert.strictEqual(log.length, 1);
  });

  test('a non-array reads as an empty log', () => {
    assert.deepStrictEqual(normalizeLog(undefined), []);
    assert.deepStrictEqual(normalizeLog({}), []);
  });
});

suite('XP rules table', () => {
  test('every event type is priced', () => {
    for (const type of [
      'work-batch',
      'active-coding',
      'git-commit',
      'task-success',
      'debug-grant',
    ] as const) {
      assert.ok(XP_RULES[type], type);
    }
  });

  test('a commit outweighs every other single event', () => {
    // A commit is the strongest signal available: someone chose to record it,
    // and that stays true whether a human or an agent wrote the diff.
    for (const type of [
      'work-batch',
      'active-coding',
      'task-success',
    ] as const) {
      assert.ok(
        XP_RULES['git-commit'].trainerXp > XP_RULES[type].trainerXp,
        type,
      );
    }
  });

  test('the partner always earns more than the trainer', () => {
    for (const type of [
      'work-batch',
      'active-coding',
      'git-commit',
      'task-success',
    ] as const) {
      assert.ok(XP_RULES[type].pokemonXp > XP_RULES[type].trainerXp, type);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Evolution
 * ------------------------------------------------------------------ */

suite('Evolution data integrity', () => {
  test('every species named in the table actually ships in this build', () => {
    const missing: string[] = [];
    for (const rule of EVOLUTION_RULES) {
      if (!POKEMON_DATA[rule.from]) {
        missing.push(`from: ${rule.from}`);
      }
      if (!POKEMON_DATA[rule.to]) {
        missing.push(`to: ${rule.to}`);
      }
    }
    assert.deepStrictEqual(missing, []);
  });

  test('no species has two conflicting rules', () => {
    const seen = new Set<string>();
    for (const rule of EVOLUTION_RULES) {
      assert.strictEqual(seen.has(rule.from), false, rule.from);
      seen.add(rule.from);
    }
  });

  test('nothing evolves into itself', () => {
    for (const rule of EVOLUTION_RULES) {
      assert.notStrictEqual(rule.from, rule.to);
    }
  });

  test('every threshold is a sane level', () => {
    for (const rule of EVOLUTION_RULES) {
      assert.ok(
        rule.condition.level >= 2 && rule.condition.level <= MAX_POKEMON_LEVEL,
        `${rule.from} at ${rule.condition.level}`,
      );
    }
  });

  test('the documented starter lines are present and correct', () => {
    const expected: [string, string, number][] = [
      ['bulbasaur', 'ivysaur', 16],
      ['ivysaur', 'venusaur', 32],
      ['charmander', 'charmeleon', 16],
      ['charmeleon', 'charizard', 36],
      ['squirtle', 'wartortle', 16],
      ['wartortle', 'blastoise', 36],
      ['gastly', 'haunter', 25],
    ];
    for (const [from, to, level] of expected) {
      const rule = getEvolutionRule(from);
      assert.ok(rule, from);
      assert.strictEqual(rule.to, to);
      assert.strictEqual(rule.condition.level, level);
    }
  });

  test('conditions this milestone does not model are left out', () => {
    // Stone, trade and friendship evolutions must not have been guessed at.
    for (const from of [
      'pikachu', // thunder stone
      'kadabra', // trade
      'machoke', // trade
      'graveler', // trade
      'haunter', // trade
      'golbat', // friendship
      'eevee', // stone / friendship / location
      'togepi', // friendship
      'feebas', // beauty
      'tyrogue', // stat-dependent split
      'wurmple', // random split
    ]) {
      assert.strictEqual(getEvolutionRule(from), undefined, from);
    }
  });
});

suite('Evolution availability', () => {
  test('a Pokemon below its threshold cannot evolve', () => {
    const result = getAvailableEvolution('bulbasaur', 15, false);
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.reason, 'level-too-low');
    assert.strictEqual(result.requiredLevel, 16);
  });

  test('reaching the threshold makes it available', () => {
    const result = getAvailableEvolution('bulbasaur', 16, false);
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'ivysaur');
  });

  test('staying above the threshold keeps it available', () => {
    assert.strictEqual(
      getAvailableEvolution('bulbasaur', 40, false).available,
      true,
    );
  });

  test('a species with no rule reports so rather than failing', () => {
    const result = getAvailableEvolution('ditto', 100, false);
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.reason, 'no-rule');
  });

  test('an unknown species is handled, not thrown on', () => {
    const result = getAvailableEvolution('not-a-pokemon', 50, false);
    assert.strictEqual(result.available, false);
  });

  test('a shiny evolves only when the evolved form has a shiny sprite', () => {
    // Every Gen 1-4 target ships one, so shininess must never block these.
    for (const rule of EVOLUTION_RULES) {
      const target = POKEMON_DATA[rule.to];
      if (target.possibleColors.indexOf(PokemonColor.shiny) === -1) {
        const blocked = getAvailableEvolution(
          rule.from,
          rule.condition.level,
          true,
        );
        assert.strictEqual(blocked.reason, 'shiny-unavailable', rule.from);
      } else {
        const allowed = getAvailableEvolution(
          rule.from,
          rule.condition.level,
          true,
        );
        assert.strictEqual(allowed.available, true, rule.from);
      }
    }
  });

  test('a shiny partner is never silently turned into a normal one', () => {
    // Whenever a shiny is refused, the reason must say so explicitly rather
    // than the evolution quietly proceeding without shininess.
    for (const rule of EVOLUTION_RULES) {
      const result = getAvailableEvolution(
        rule.from,
        rule.condition.level,
        true,
      );
      if (!result.available) {
        assert.strictEqual(result.reason, 'shiny-unavailable', rule.from);
      }
    }
  });

  test('the evolution level is reported for threshold checks', () => {
    assert.strictEqual(getEvolutionLevel('gastly'), 25);
    assert.strictEqual(getEvolutionLevel('ditto'), undefined);
  });
});

suite('Identity across evolution', () => {
  /**
   * Progression is keyed by nickname, and evolution never rewrites the
   * nickname array - so "does progression survive" is really "does the key
   * stay the same". These assert the property the design depends on.
   */
  test('progression carries across a species change untouched', () => {
    const before = createDefaultPokemonProgress('bulbasaur', NOW);
    const { progress: levelled } = addPokemonXp(
      before,
      getCumulativePokemonXp(16) - getCumulativePokemonXp(5),
    );
    assert.strictEqual(levelled.level, 16);

    // What the evolution writes back: same record, new species.
    const evolved = { ...levelled, species: 'ivysaur' };

    assert.strictEqual(evolved.level, levelled.level);
    assert.strictEqual(evolved.totalXp, levelled.totalXp);
    assert.strictEqual(evolved.currentXp, levelled.currentXp);
    assert.strictEqual(evolved.createdAt, before.createdAt);
    assert.strictEqual(evolved.species, 'ivysaur');
  });

  test('an evolved Pokemon keeps earning on the same curve', () => {
    const evolved = {
      ...createDefaultPokemonProgress('ivysaur', NOW),
      totalXp: getCumulativePokemonXp(16),
      level: 16,
      currentXp: 0,
    };
    const { progress, result } = addPokemonXp(evolved, 500);
    assert.strictEqual(result.fromLevel, 16);
    assert.ok(progress.level > 16);
  });

  test('a normalized record round-trips without drifting', () => {
    const original = addPokemonXp(
      createDefaultPokemonProgress('gible', NOW),
      4000,
    ).progress;
    const round = normalizePokemonProgress(original, 'gible', NOW);
    assert.deepStrictEqual(round, original);
  });
});
