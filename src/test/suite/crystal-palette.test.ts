/**
 * Coverage for Crystal Day/Night palette resolution: the PURE core only -
 * `common/crystal-palette.ts`'s catalog/resolver and
 * `panel/trainer-card/card-presentation.ts`'s `crystalPaletteAttribute` -
 * exactly the boundary this project's other `test:unit` suites already draw
 * around anything that touches `ExtensionContext`/`vscode.window` (see
 * `evolution-persistence.test.ts`'s own doc comment). The `vscode`-touching
 * glue (`crystal-palette-config.ts`'s setting read + `isIdeThemeDark`, the
 * `pokedev.change-crystal-palette` command, live `onDidChangeActiveColorTheme`
 * handling, and the three webviews actually rendering `data-crystal-palette`)
 * is covered by manual QA - see the milestone's final report.
 */
import * as assert from 'assert';
import {
  CRYSTAL_PALETTES,
  DEFAULT_CRYSTAL_PALETTE,
  getCrystalPaletteOption,
  isValidCrystalPalette,
  resolveCrystalPalette,
} from '../../common/crystal-palette';
import {
  cardClassName,
  crystalPaletteAttribute,
  skinClassName,
} from '../../panel/trainer-card/card-presentation';
import {
  DEFAULT_TRAINER_CARD_STYLE,
  TRAINER_CARD_STYLES,
} from '../../common/trainer-card-style';

suite('Crystal palette: catalog', () => {
  test('has stable, unique ids', () => {
    const ids = CRYSTAL_PALETTES.map((p) => p.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  test('exactly auto, day and night - no others', () => {
    const ids = CRYSTAL_PALETTES.map((p) => p.id).sort();
    assert.deepStrictEqual(ids, ['auto', 'day', 'night']);
  });

  test('"auto" is the default', () => {
    assert.strictEqual(DEFAULT_CRYSTAL_PALETTE, 'auto');
    assert.ok(CRYSTAL_PALETTES.some((p) => p.id === 'auto'));
  });
});

suite('Crystal palette: lookup helpers', () => {
  test('isValidCrystalPalette accepts every catalog id', () => {
    for (const palette of CRYSTAL_PALETTES) {
      assert.strictEqual(isValidCrystalPalette(palette.id), true);
    }
  });

  test('isValidCrystalPalette rejects unknown/undefined/empty ids', () => {
    assert.strictEqual(isValidCrystalPalette('midnight'), false);
    assert.strictEqual(isValidCrystalPalette(undefined), false);
    assert.strictEqual(isValidCrystalPalette(''), false);
  });

  test('getCrystalPaletteOption returns the matching option', () => {
    assert.strictEqual(getCrystalPaletteOption('night').id, 'night');
    assert.strictEqual(getCrystalPaletteOption('day').id, 'day');
  });

  test('an invalid persisted value safely falls back to auto', () => {
    assert.strictEqual(
      getCrystalPaletteOption('midnight').id,
      DEFAULT_CRYSTAL_PALETTE,
    );
    assert.strictEqual(
      getCrystalPaletteOption(undefined).id,
      DEFAULT_CRYSTAL_PALETTE,
    );
  });
});

suite('Crystal palette: resolution', () => {
  test('"day" resolves Day regardless of IDE appearance', () => {
    assert.strictEqual(resolveCrystalPalette('day', true), 'day');
    assert.strictEqual(resolveCrystalPalette('day', false), 'day');
  });

  test('"night" resolves Night regardless of IDE appearance', () => {
    assert.strictEqual(resolveCrystalPalette('night', true), 'night');
    assert.strictEqual(resolveCrystalPalette('night', false), 'night');
  });

  test('"auto" + a dark IDE resolves Night', () => {
    assert.strictEqual(resolveCrystalPalette('auto', true), 'night');
  });

  test('"auto" + a light IDE resolves Day', () => {
    assert.strictEqual(resolveCrystalPalette('auto', false), 'day');
  });
});

suite('Crystal palette: theme-change behaviour', () => {
  test('under Auto, the IDE switching dark -> light flips the resolved palette to Day', () => {
    const whileDark = resolveCrystalPalette('auto', true);
    const afterSwitchToLight = resolveCrystalPalette('auto', false);
    assert.strictEqual(whileDark, 'night');
    assert.strictEqual(afterSwitchToLight, 'day');
  });

  test('under Auto, the IDE switching light -> dark flips the resolved palette to Night', () => {
    const whileLight = resolveCrystalPalette('auto', false);
    const afterSwitchToDark = resolveCrystalPalette('auto', true);
    assert.strictEqual(whileLight, 'day');
    assert.strictEqual(afterSwitchToDark, 'night');
  });

  test('a manual Day choice ignores IDE theme changes in both directions', () => {
    assert.strictEqual(resolveCrystalPalette('day', false), 'day');
    assert.strictEqual(resolveCrystalPalette('day', true), 'day');
  });

  test('a manual Night choice ignores IDE theme changes in both directions', () => {
    assert.strictEqual(resolveCrystalPalette('night', true), 'night');
    assert.strictEqual(resolveCrystalPalette('night', false), 'night');
  });
});

suite('Crystal palette: synchronization across surfaces', () => {
  // The Trainer Card, compact Explorer HUD and PokeGear each call
  // `getResolvedCrystalPalette()` (extension.ts's thin wrapper around this
  // same `resolveCrystalPalette`) independently, but with the SAME
  // preference and the SAME live IDE state - so for any given tick they
  // must always agree. This pins that the pure resolver itself is
  // deterministic and side-effect-free, which is what makes that guarantee
  // possible; it cannot by itself prove three separate host call sites were
  // wired correctly (see the module doc comment for that boundary).
  test('resolving the same preference/IDE-state pair twice always agrees', () => {
    for (const preference of ['auto', 'day', 'night'] as const) {
      for (const ideIsDark of [true, false]) {
        const first = resolveCrystalPalette(preference, ideIsDark);
        const second = resolveCrystalPalette(preference, ideIsDark);
        assert.strictEqual(first, second);
      }
    }
  });

  test('crystalPaletteAttribute returns exactly the resolved value, for either surface', () => {
    assert.strictEqual(
      crystalPaletteAttribute({ crystalPalette: 'day' }),
      'day',
    );
    assert.strictEqual(
      crystalPaletteAttribute({ crystalPalette: 'night' }),
      'night',
    );
  });
});

suite('Crystal palette: regression - Trainer Card style is unaffected', () => {
  test('the Trainer Card style catalog and default are unchanged', () => {
    assert.strictEqual(DEFAULT_TRAINER_CARD_STYLE, 'pokedev');
    assert.deepStrictEqual(TRAINER_CARD_STYLES.map((s) => s.id).sort(), [
      'crystal',
      'pokedev',
    ]);
  });

  test('cardClassName/skinClassName do not require or depend on crystalPalette', () => {
    // Both functions still take only `{ style }` - a caller that has never
    // heard of Crystal Night continues to compile and behave identically.
    assert.strictEqual(
      cardClassName({ style: 'pokedev' }),
      'tc-card tc-skin-pokedev',
    );
    assert.strictEqual(skinClassName({ style: 'crystal' }), 'tc-skin-crystal');
  });
});
