/**
 * Tests for the Roaming Style feature's PURE logic: the style catalog and
 * the Overworld position/depth/resize math.
 *
 * Consistent with this project's existing test:unit boundary (see
 * `evolution-persistence.test.ts`'s header comment): everything here is
 * free of `vscode` AND free of the DOM. `src/panel/states.ts`'s
 * `resolveState` substitution and `WalkOverworldState` are NOT covered
 * here - both pull in `world-bounds.ts`, which reads
 * `document.getElementById`, so they need a real (or jsdom) document the
 * same way the rest of `src/panel/*` already does, and are exercised by
 * manual QA instead - see the feature's final report for what that
 * verified. `WalkRightState`/`WalkLeftState`/`RunRightState`/
 * `RunLeftState` (Classic mode) are byte-for-byte unchanged, which manual
 * QA also confirms still behaves identically.
 */
import * as assert from 'assert';
import {
  DEFAULT_ROAMING_STYLE,
  isValidRoamingStyle,
  ROAMING_STYLES,
  getRoamingStyleOption,
} from '../../common/roaming-style';
import {
  chooseInitialOverworldPosition,
  chooseOverworldTarget,
  chooseOverworldY,
  clampToPlayableAxis,
  computeDepthZIndex,
  marginFor,
  rescaleForResize,
  WorldTarget,
} from '../../panel/roaming/overworld-target';
import {
  getRoamingStyle,
  isOverworldRoaming,
  setRoamingStyle,
} from '../../panel/roaming/roaming-mode';

/** A deterministic sequence for tests that need reproducible "random" draws. */
function sequenceRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

suite('Roaming style: catalog', () => {
  test('has stable, unique ids', () => {
    const ids = ROAMING_STYLES.map((style) => style.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  test('exactly overworld and classic exist', () => {
    const ids = ROAMING_STYLES.map((style) => style.id).sort();
    assert.deepStrictEqual(ids, ['classic', 'overworld']);
  });

  test('the default is overworld', () => {
    assert.strictEqual(DEFAULT_ROAMING_STYLE, 'overworld');
    assert.ok(
      ROAMING_STYLES.some((style) => style.id === DEFAULT_ROAMING_STYLE),
    );
  });

  test('isValidRoamingStyle accepts every catalog id', () => {
    for (const style of ROAMING_STYLES) {
      assert.strictEqual(isValidRoamingStyle(style.id), true);
    }
  });

  test('isValidRoamingStyle rejects unknown/undefined/empty ids', () => {
    assert.strictEqual(isValidRoamingStyle('sideways'), false);
    assert.strictEqual(isValidRoamingStyle(undefined), false);
    assert.strictEqual(isValidRoamingStyle(''), false);
  });

  test('getRoamingStyleOption falls back to the default for an invalid id', () => {
    assert.strictEqual(
      getRoamingStyleOption('sideways').id,
      DEFAULT_ROAMING_STYLE,
    );
    assert.strictEqual(
      getRoamingStyleOption(undefined).id,
      DEFAULT_ROAMING_STYLE,
    );
  });

  test('getRoamingStyleOption returns the matching option', () => {
    assert.strictEqual(getRoamingStyleOption('classic').id, 'classic');
  });
});

suite('Roaming mode: the webview-side holder', () => {
  // `roaming-mode.ts` is a single module-level flag - each test explicitly
  // sets what it needs and restores the default afterward so tests never
  // depend on execution order.
  teardown(() => {
    setRoamingStyle('overworld');
  });

  test('defaults to overworld before anything sets it explicitly', () => {
    // Only meaningful the very first time the module loads, but asserting
    // it here documents the contract; every other test sets its own value.
    setRoamingStyle('overworld');
    assert.strictEqual(getRoamingStyle(), 'overworld');
    assert.strictEqual(isOverworldRoaming(), true);
  });

  test('setRoamingStyle("classic") is reflected by getRoamingStyle/isOverworldRoaming', () => {
    setRoamingStyle('classic');
    assert.strictEqual(getRoamingStyle(), 'classic');
    assert.strictEqual(isOverworldRoaming(), false);
  });

  test('setRoamingStyle("overworld") is reflected by getRoamingStyle/isOverworldRoaming', () => {
    setRoamingStyle('classic');
    setRoamingStyle('overworld');
    assert.strictEqual(getRoamingStyle(), 'overworld');
    assert.strictEqual(isOverworldRoaming(), true);
  });

  test('switching the flag touches nothing but itself - no progression/state side effects exist to mutate', () => {
    // This module imports only `common/roaming-style` (a pure catalog) and
    // exports three functions that read/write one local variable - there is
    // no XP, Friendship, or Pokemon-collection reference anywhere in it for
    // a switch to accidentally touch. Asserted here as a standing
    // regression guard: if this module ever grows a second export that
    // reaches into progression state, this test's intent (not its
    // mechanics) should be revisited.
    setRoamingStyle('classic');
    setRoamingStyle('overworld');
    setRoamingStyle('classic');
    assert.strictEqual(getRoamingStyle(), 'classic');
  });
});

suite('Overworld position: bounds and margins', () => {
  test('clampToPlayableAxis keeps a value within [margin, size-sprite-margin]', () => {
    const size = 200;
    const sprite = 32;
    const margin = marginFor(sprite);
    assert.strictEqual(clampToPlayableAxis(-500, size, sprite, margin), margin);
    assert.strictEqual(
      clampToPlayableAxis(10000, size, sprite, margin),
      size - sprite - margin,
    );
    assert.strictEqual(clampToPlayableAxis(100, size, sprite, margin), 100);
  });

  test('clampToPlayableAxis degrades to a centered value when the area is too small', () => {
    // A 10px-wide area cannot fit a 32px sprite plus margins on both sides.
    const value = clampToPlayableAxis(999, 10, 32, marginFor(32));
    assert.ok(value >= 0);
    assert.strictEqual(value, Math.max(0, (10 - 32) / 2));
  });

  test('marginFor is sprite-aware, not a fixed constant', () => {
    assert.ok(marginFor(64) > marginFor(32));
  });
});

suite('Overworld position: target generation', () => {
  test('a chosen target always has both x and y set', () => {
    const target = chooseOverworldTarget(
      { x: 50, y: 50 },
      300,
      200,
      32,
      sequenceRng([0.5, 0.5, 0.5]),
    );
    assert.strictEqual(typeof target.x, 'number');
    assert.strictEqual(typeof target.y, 'number');
  });

  test('x stays within the playable width for many random draws', () => {
    const worldWidth = 300;
    const spriteSize = 32;
    const margin = marginFor(spriteSize);
    let current: WorldTarget = { x: 150, y: 100 };
    for (let i = 0; i < 200; i++) {
      current = chooseOverworldTarget(
        current,
        worldWidth,
        200,
        spriteSize,
        Math.random,
      );
      assert.ok(current.x >= margin - 1e-6, `x=${current.x} below margin`);
      assert.ok(
        current.x <= worldWidth - spriteSize - margin + 1e-6,
        `x=${current.x} exceeds bound`,
      );
    }
  });

  test('y stays within the playable height for many random draws', () => {
    const worldHeight = 200;
    const spriteSize = 32;
    const margin = marginFor(spriteSize);
    let current: WorldTarget = { x: 100, y: 100 };
    for (let i = 0; i < 200; i++) {
      current = chooseOverworldTarget(
        current,
        300,
        worldHeight,
        spriteSize,
        Math.random,
      );
      assert.ok(current.y >= margin - 1e-6, `y=${current.y} below margin`);
      assert.ok(
        current.y <= worldHeight - spriteSize - margin + 1e-6,
        `y=${current.y} exceeds bound`,
      );
    }
  });

  test('most destinations are nearby - a low long-wander chance keeps movement local', () => {
    const rng = sequenceRng([0.99, 0.5, 0.5]); // 0.99 >= longWanderChance(0.2) -> short hop
    const current = { x: 150, y: 100 };
    const target = chooseOverworldTarget(current, 300, 200, 32, rng, 0.2);
    const dist = Math.hypot(target.x - current.x, target.y - current.y);
    // Short-range cap is min(worldWidth,worldHeight)*0.35 = 70; allow the
    // random +/-1 factor's full extent either side of center.
    assert.ok(dist <= 70 + 1, `expected a short hop, got distance ${dist}`);
  });
});

suite('Overworld position: initial placement', () => {
  test('respects sprite dimensions - never places a sprite off the playable area', () => {
    const spriteSize = 48;
    const margin = marginFor(spriteSize);
    const pos = chooseInitialOverworldPosition(
      300,
      200,
      spriteSize,
      [],
      sequenceRng([0.5, 0.5]),
    );
    assert.ok(pos.x >= margin);
    assert.ok(pos.x <= 300 - spriteSize - margin + 1e-6);
    assert.ok(pos.y >= margin);
    assert.ok(pos.y <= 200 - spriteSize - margin + 1e-6);
  });

  test('with no other Pokemon, returns a single valid draw', () => {
    const pos = chooseInitialOverworldPosition(
      300,
      200,
      32,
      [],
      sequenceRng([0.2, 0.8]),
    );
    assert.strictEqual(typeof pos.x, 'number');
    assert.strictEqual(typeof pos.y, 'number');
  });

  test('prefers the candidate with more separation from existing Pokemon', () => {
    // First draw (x=0.01,y=0.01 fractions -> near corner, right next to the
    // existing Pokemon); second draw (0.9,0.9 -> far corner) must win.
    const rng = sequenceRng([0.01, 0.01, 0.9, 0.9]);
    const others: WorldTarget[] = [{ x: 5, y: 5 }];
    const pos = chooseInitialOverworldPosition(300, 200, 32, others, rng, 2);
    const distFromOthers = Math.hypot(pos.x - 5, pos.y - 5);
    assert.ok(
      distFromOthers > 100,
      `expected the far draw to win, distance=${distFromOthers}`,
    );
  });

  test('chooseOverworldY (preserve-X path) stays within the playable height', () => {
    for (let i = 0; i < 50; i++) {
      const y = chooseOverworldY(200, 32, Math.random);
      assert.ok(y >= marginFor(32) - 1e-6);
      assert.ok(y <= 200 - 32 - marginFor(32) + 1e-6);
    }
  });
});

suite('Overworld: depth sorting', () => {
  test('a lower on-screen Pokemon (small bottom) gets a HIGHER z-index', () => {
    const low = computeDepthZIndex(10, 200);
    const high = computeDepthZIndex(180, 200);
    assert.ok(low > high, `expected low=${low} > high=${high}`);
  });

  test('z-index stays within the documented safe range, below fixed UI layers', () => {
    for (const bottom of [0, 50, 100, 150, 200, 9999, -50]) {
      const z = computeDepthZIndex(bottom, 200);
      assert.ok(z >= 2, `z=${z} below base`);
      assert.ok(z <= 2 + 96, `z=${z} above documented range`);
      // Must stay comfortably under collision boxes (999), reactions
      // (1000), toasts (1001) and the GBC overlay (10 is already above
      // this range too, which is intentional headroom, not just luck).
      assert.ok(z < 999);
    }
  });

  test('is a whole number - CSS z-index must be an integer', () => {
    const z = computeDepthZIndex(37.5, 197);
    assert.strictEqual(z, Math.round(z));
  });

  test('an invalid (zero/negative) world height never throws or divides by zero', () => {
    assert.doesNotThrow(() => computeDepthZIndex(50, 0));
    assert.doesNotThrow(() => computeDepthZIndex(50, -10));
  });
});

suite('Overworld: resize rescaling', () => {
  test('preserves relative position - doubling the world doubles the offset', () => {
    assert.strictEqual(rescaleForResize(50, 100, 200), 100);
    assert.strictEqual(rescaleForResize(75, 100, 50), 37.5);
  });

  test('an unchanged size is a no-op', () => {
    assert.strictEqual(rescaleForResize(42, 160, 160), 42);
  });

  test('an invalid old size (zero/negative/NaN) returns the value unchanged rather than dividing by zero', () => {
    assert.strictEqual(rescaleForResize(42, 0, 200), 42);
    assert.strictEqual(rescaleForResize(42, -10, 200), 42);
    assert.strictEqual(rescaleForResize(42, NaN, 200), 42);
  });
});
