import * as assert from 'assert';
import {
  DEFAULT_TRAINER_CARD_STYLE,
  getTrainerCardStyleOption,
  isValidTrainerCardStyle,
  TRAINER_CARD_STYLES,
} from '../../common/trainer-card-style';
import {
  cardClassName,
  skinClassName,
  stripEmoji,
} from '../../panel/trainer-card/card-presentation';

suite('Trainer Card style: catalog', () => {
  test('has stable, unique ids', () => {
    const ids = TRAINER_CARD_STYLES.map((style) => style.id);
    const unique = new Set(ids);
    assert.strictEqual(unique.size, ids.length);
  });

  test('"pokedev" is the default, and remains the original approved design', () => {
    assert.strictEqual(DEFAULT_TRAINER_CARD_STYLE, 'pokedev');
    const pokedev = TRAINER_CARD_STYLES.find((style) => style.id === 'pokedev');
    assert.ok(pokedev, 'expected a "pokedev" style in the catalog');
  });

  test('"crystal" is selectable', () => {
    const crystal = TRAINER_CARD_STYLES.find((style) => style.id === 'crystal');
    assert.ok(crystal, 'expected a "crystal" style in the catalog');
  });

  test('exactly pokedev and crystal - no others', () => {
    const ids = TRAINER_CARD_STYLES.map((style) => style.id);
    assert.deepStrictEqual([...ids].sort(), ['crystal', 'pokedev']);
  });
});

suite('Trainer Card style: lookup helpers', () => {
  test('isValidTrainerCardStyle accepts every catalog id', () => {
    for (const style of TRAINER_CARD_STYLES) {
      assert.strictEqual(isValidTrainerCardStyle(style.id), true);
    }
  });

  test('isValidTrainerCardStyle rejects unknown/undefined/empty ids', () => {
    assert.strictEqual(isValidTrainerCardStyle('not-a-real-style'), false);
    assert.strictEqual(isValidTrainerCardStyle(undefined), false);
    assert.strictEqual(isValidTrainerCardStyle(''), false);
  });

  test('getTrainerCardStyleOption returns the matching option', () => {
    const option = getTrainerCardStyleOption('crystal');
    assert.strictEqual(option.id, 'crystal');
  });

  test('getTrainerCardStyleOption falls back safely for an invalid/missing style', () => {
    // "Invalid style falls back safely": never throws, always resolves to
    // the default (pokedev) rather than a broken/undefined style.
    assert.strictEqual(
      getTrainerCardStyleOption('not-a-real-style').id,
      DEFAULT_TRAINER_CARD_STYLE,
    );
    assert.strictEqual(
      getTrainerCardStyleOption(undefined).id,
      DEFAULT_TRAINER_CARD_STYLE,
    );
  });
});

suite('Trainer Card style: presentation-only application', () => {
  test('cardClassName always includes the base tc-card class', () => {
    assert.ok(
      cardClassName({ style: 'pokedev' }).split(' ').includes('tc-card'),
    );
    assert.ok(
      cardClassName({ style: 'crystal' }).split(' ').includes('tc-card'),
    );
  });

  test('cardClassName encodes the style as its own class, distinct per style', () => {
    const pokedev = cardClassName({ style: 'pokedev' });
    const crystal = cardClassName({ style: 'crystal' });
    assert.ok(pokedev.split(' ').includes('tc-skin-pokedev'));
    assert.ok(crystal.split(' ').includes('tc-skin-crystal'));
    assert.notStrictEqual(pokedev, crystal);
  });

  test('cardClassName preserves any extra class alongside the skin class', () => {
    const withExtra = cardClassName({ style: 'crystal' }, 'tc-tier-gold');
    const classes = withExtra.split(' ');
    assert.ok(classes.includes('tc-card'));
    assert.ok(classes.includes('tc-skin-crystal'));
    assert.ok(classes.includes('tc-tier-gold'));
  });

  test('cardClassName omits nothing when extra is undefined (no stray whitespace)', () => {
    const className = cardClassName({ style: 'pokedev' });
    assert.strictEqual(className, 'tc-card tc-skin-pokedev');
  });
});

suite(
  'Trainer Card style: skinClassName (shared by full + compact Explorer HUD)',
  () => {
    test('produces the same class the full card embeds inside cardClassName', () => {
      assert.strictEqual(
        skinClassName({ style: 'pokedev' }),
        'tc-skin-pokedev',
      );
      assert.strictEqual(
        skinClassName({ style: 'crystal' }),
        'tc-skin-crystal',
      );
      assert.ok(
        cardClassName({ style: 'crystal' })
          .split(' ')
          .includes(skinClassName({ style: 'crystal' })),
      );
    });

    test('never includes the tc-card class - the compact HUD is its own component', () => {
      assert.ok(!skinClassName({ style: 'crystal' }).includes('tc-card'));
    });
  },
);

suite('Trainer Card style: stripEmoji (Crystal-only profile metadata)', () => {
  test('leaves plain text untouched', () => {
    assert.strictEqual(stripEmoji('Oklahoma City, OK'), 'Oklahoma City, OK');
  });

  test('removes a simple pictographic emoji and collapses the leftover space', () => {
    assert.strictEqual(
      stripEmoji('\u{1F4CD} Oklahoma City, OK'),
      'Oklahoma City, OK',
    );
  });

  test('removes a ZWJ + skin-tone-modifier emoji sequence entirely', () => {
    // A "man technologist" emoji built from base + Fitzpatrick modifier +
    // zero-width joiner + laptop emoji - the exact shape of the kind of
    // profession emoji a real GitHub bio might use. Written with explicit
    // \u escapes (not the literal characters) so the joiner stays visible
    // in source rather than an invisible character between two other
    // escapes.
    const manTechnologist = '\u{1F468}\u{1F3FD}\u200d\u{1F4BB}';
    assert.strictEqual(
      stripEmoji(`${manTechnologist} Developer | \u{1F3A8} Designer`),
      'Developer | Designer',
    );
  });

  test('trims a leading/trailing space left behind by a removed emoji', () => {
    assert.strictEqual(stripEmoji('\u{1F3AE} '), '');
    assert.strictEqual(stripEmoji('  \u{1F3AE}Frontend'), 'Frontend');
  });

  test('collapses internal double spaces from removing an emoji mid-string', () => {
    assert.strictEqual(
      stripEmoji('Developer \u{1F4BB} and Designer'),
      'Developer and Designer',
    );
  });

  test('returns an empty string for emoji-only input', () => {
    assert.strictEqual(stripEmoji('\u{1F3AE}\u{1F47E}'), '');
  });
});
