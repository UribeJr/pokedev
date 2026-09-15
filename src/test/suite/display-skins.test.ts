import * as assert from 'assert';
import {
  DEFAULT_DISPLAY_SKIN_ID,
  DISPLAY_SKINS,
  getDisplaySkinById,
  isValidDisplaySkinId,
} from '../../common/display-skins';

suite('Display skins: catalog', () => {
  test('has stable, unique ids', () => {
    const ids = DISPLAY_SKINS.map((skin) => skin.id);
    const unique = new Set(ids);
    assert.strictEqual(unique.size, ids.length);
  });

  test('"none" always exists and is the default', () => {
    assert.strictEqual(DEFAULT_DISPLAY_SKIN_ID, 'none');
    const none = DISPLAY_SKINS.find((skin) => skin.id === 'none');
    assert.ok(none, 'expected a "none" skin in the catalog');
    assert.strictEqual(none?.imageFile, undefined);
  });

  test('every skin with artwork declares a screen rectangle within source bounds', () => {
    for (const skin of DISPLAY_SKINS) {
      assert.ok(
        skin.sourceWidth > 0,
        `${skin.id}: sourceWidth must be positive`,
      );
      assert.ok(
        skin.sourceHeight > 0,
        `${skin.id}: sourceHeight must be positive`,
      );

      const { x, y, width, height } = skin.screen;
      assert.ok(x >= 0 && x <= 1, `${skin.id}: screen.x out of [0,1]`);
      assert.ok(y >= 0 && y <= 1, `${skin.id}: screen.y out of [0,1]`);
      assert.ok(
        width > 0 && width <= 1,
        `${skin.id}: screen.width out of (0,1]`,
      );
      assert.ok(
        height > 0 && height <= 1,
        `${skin.id}: screen.height out of (0,1]`,
      );
      assert.ok(
        x + width <= 1 + 1e-9,
        `${skin.id}: screen rectangle overflows the right edge`,
      );
      assert.ok(
        y + height <= 1 + 1e-9,
        `${skin.id}: screen rectangle overflows the bottom edge`,
      );
    }
  });

  test('every non-"none" skin declares an image file', () => {
    for (const skin of DISPLAY_SKINS) {
      if (skin.id === 'none') {
        continue;
      }
      assert.ok(skin.imageFile, `${skin.id}: expected an imageFile`);
    }
  });
});

suite('Display skins: lookup helpers', () => {
  test('isValidDisplaySkinId accepts every catalog id', () => {
    for (const skin of DISPLAY_SKINS) {
      assert.strictEqual(isValidDisplaySkinId(skin.id), true);
    }
  });

  test('isValidDisplaySkinId rejects unknown/undefined ids', () => {
    assert.strictEqual(isValidDisplaySkinId('not-a-real-skin'), false);
    assert.strictEqual(isValidDisplaySkinId(undefined), false);
    assert.strictEqual(isValidDisplaySkinId(''), false);
  });

  test('getDisplaySkinById returns the matching skin', () => {
    const skin = getDisplaySkinById('gbc-power');
    assert.strictEqual(skin.id, 'gbc-power');
  });

  test('getDisplaySkinById falls back to "none" for an invalid/missing skin', () => {
    assert.strictEqual(getDisplaySkinById('does-not-exist').id, 'none');
    assert.strictEqual(getDisplaySkinById(undefined).id, 'none');
  });
});
