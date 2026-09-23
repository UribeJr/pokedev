/**
 * Coverage for PokéGear RADIO (V1): the PURE core only - the
 * `common/radio-tracks.ts` catalog and `pokegear-radio-player.ts`'s
 * shuffle/repeat/volume/time-formatting logic - the same boundary this
 * project's other `test:unit` suites already draw around anything that
 * touches `ExtensionContext`/the DOM (see `pokeballs.test.ts`'s own header
 * comment). The `vscode`-touching glue (`radio-service.ts`'s webview URI
 * resolution, `pokegear-panel.ts`'s persisted-prefs read/write, and the
 * actual `<audio>` element/UI in `panel/pokegear/main.ts`) is covered by
 * manual QA - see this milestone's final report.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  getRadioTrackDefinition,
  isValidRadioTrackId,
  RADIO_STATION_NAME,
  RADIO_TRACK_DEFINITIONS,
} from '../../common/radio-tracks';
import {
  clampVolume,
  formatTrackTime,
  normalizeRadioTrackId,
  pickShuffledTrackId,
  resolveManualNextTrackId,
  resolvePreviousTrackId,
  resolveTrackEndTransition,
} from '../../pokegear/pokegear-radio-player';

/* ------------------------------------------------------------------ *
 * Catalog
 * ------------------------------------------------------------------ */

suite('RADIO catalog', () => {
  test('has a curated, background-friendly track count (12-16)', () => {
    assert.ok(RADIO_TRACK_DEFINITIONS.length >= 12);
    assert.ok(RADIO_TRACK_DEFINITIONS.length <= 16);
  });

  test('every id is unique', () => {
    const ids = RADIO_TRACK_DEFINITIONS.map((t) => t.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  test('every entry has a non-empty title', () => {
    for (const track of RADIO_TRACK_DEFINITIONS) {
      assert.ok(track.title.length > 0, track.id);
    }
  });

  test('every entry has a real MUSIC_* source constant and .asm source path', () => {
    for (const track of RADIO_TRACK_DEFINITIONS) {
      assert.ok(track.sourceConstant.startsWith('MUSIC_'), track.id);
      assert.ok(
        track.sourcePath.startsWith('audio/music/') &&
          track.sourcePath.endsWith('.asm'),
        track.id,
      );
    }
  });

  test('never includes a battle/trainer/victory/Rocket track', () => {
    const bannedWords = ['battle', 'victory', 'rocket', 'gym'];
    for (const track of RADIO_TRACK_DEFINITIONS) {
      const haystack = `${track.id} ${track.sourceConstant}`.toLowerCase();
      for (const word of bannedWords) {
        assert.ok(
          !haystack.includes(word),
          `${track.id} looks like a ${word} track`,
        );
      }
    }
  });

  test('has exactly one entry per shared route/city song - no artificial duplicates', () => {
    const constants = RADIO_TRACK_DEFINITIONS.map((t) => t.sourceConstant);
    assert.strictEqual(new Set(constants).size, constants.length);
  });

  test('every asset file actually exists on disk', () => {
    const mediaRoot = path.resolve(__dirname, '../../../media/radio/gen2fm');
    for (const track of RADIO_TRACK_DEFINITIONS) {
      const assetPath = path.join(mediaRoot, track.assetPath);
      assert.ok(
        fs.existsSync(assetPath),
        `expected ${assetPath} to exist for track ${track.id}`,
      );
    }
  });

  test('the station has a real display name', () => {
    assert.strictEqual(RADIO_STATION_NAME, 'GEN II FM');
  });

  test('isValidRadioTrackId/getRadioTrackDefinition agree with the catalog', () => {
    assert.strictEqual(isValidRadioTrackId('bicycle'), true);
    assert.strictEqual(isValidRadioTrackId('not-a-real-track'), false);
    assert.strictEqual(isValidRadioTrackId(undefined), false);
    assert.strictEqual(getRadioTrackDefinition('bicycle')?.title, 'Bicycle');
    assert.strictEqual(getRadioTrackDefinition('not-a-real-track'), undefined);
  });
});

/* ------------------------------------------------------------------ *
 * Player logic
 * ------------------------------------------------------------------ */

const IDS = ['a', 'b', 'c', 'd'];

suite('RADIO player: clampVolume', () => {
  test('clamps below 0 up to 0', () => {
    assert.strictEqual(clampVolume(-5), 0);
  });

  test('clamps above 100 down to 100', () => {
    assert.strictEqual(clampVolume(150), 100);
  });

  test('rounds fractional values', () => {
    assert.strictEqual(clampVolume(42.6), 43);
  });

  test('treats non-finite input as 0', () => {
    assert.strictEqual(clampVolume(NaN), 0);
    assert.strictEqual(clampVolume(Infinity), 0);
  });
});

suite('RADIO player: normalizeRadioTrackId', () => {
  test('keeps a valid id', () => {
    assert.strictEqual(normalizeRadioTrackId('b', IDS), 'b');
  });

  test('falls back to the first catalog id for an unknown id', () => {
    assert.strictEqual(normalizeRadioTrackId('nope', IDS), 'a');
  });

  test('falls back to the first catalog id when unset', () => {
    assert.strictEqual(normalizeRadioTrackId(undefined, IDS), 'a');
  });
});

suite('RADIO player: pickShuffledTrackId', () => {
  test('always returns a different track when more than one exists', () => {
    // A random() stub that would pick the SAME index every time if shuffle
    // did not exclude the current track first.
    const alwaysZero = () => 0;
    const result = pickShuffledTrackId(IDS, 'a', alwaysZero);
    assert.notStrictEqual(result, 'a');
  });

  test('returns the only track when the catalog has just one', () => {
    assert.strictEqual(pickShuffledTrackId(['solo'], 'solo'), 'solo');
  });

  test('returns undefined for an empty catalog', () => {
    assert.strictEqual(pickShuffledTrackId([], undefined), undefined);
  });
});

suite('RADIO player: resolvePreviousTrackId', () => {
  test('moves to the prior track in catalog order', () => {
    assert.strictEqual(resolvePreviousTrackId(IDS, 'c'), 'b');
  });

  test('wraps from the first track to the last', () => {
    assert.strictEqual(resolvePreviousTrackId(IDS, 'a'), 'd');
  });

  test('treats an unset current id as index 0, wrapping to the last', () => {
    assert.strictEqual(resolvePreviousTrackId(IDS, undefined), 'd');
  });
});

suite('RADIO player: resolveManualNextTrackId', () => {
  test('moves to the next track in catalog order when shuffle is off', () => {
    assert.strictEqual(resolveManualNextTrackId(IDS, 'b', false), 'c');
  });

  test('wraps from the last track to the first when shuffle is off', () => {
    assert.strictEqual(resolveManualNextTrackId(IDS, 'd', false), 'a');
  });

  test('picks a different random track when shuffle is on', () => {
    const alwaysZero = () => 0;
    const result = resolveManualNextTrackId(IDS, 'a', true, alwaysZero);
    assert.notStrictEqual(result, 'a');
  });
});

suite('RADIO player: resolveTrackEndTransition', () => {
  test('Repeat Track replays the same track, even with shuffle also on', () => {
    const result = resolveTrackEndTransition({
      trackIds: IDS,
      currentId: 'b',
      shuffle: true,
      repeatTrack: true,
    });
    assert.strictEqual(result, 'b');
  });

  test('shuffle (without repeat) picks a different track', () => {
    const alwaysZero = () => 0;
    const result = resolveTrackEndTransition({
      trackIds: IDS,
      currentId: 'a',
      shuffle: true,
      repeatTrack: false,
      random: alwaysZero,
    });
    assert.notStrictEqual(result, 'a');
  });

  test('with neither flag set, advances sequentially and wraps at the end', () => {
    const middle = resolveTrackEndTransition({
      trackIds: IDS,
      currentId: 'b',
      shuffle: false,
      repeatTrack: false,
    });
    assert.strictEqual(middle, 'c');

    const wrapped = resolveTrackEndTransition({
      trackIds: IDS,
      currentId: 'd',
      shuffle: false,
      repeatTrack: false,
    });
    assert.strictEqual(wrapped, 'a');
  });

  test('an empty catalog resolves to undefined', () => {
    const result = resolveTrackEndTransition({
      trackIds: [],
      currentId: undefined,
      shuffle: false,
      repeatTrack: false,
    });
    assert.strictEqual(result, undefined);
  });
});

suite('RADIO player: formatTrackTime', () => {
  test('formats seconds under a minute', () => {
    assert.strictEqual(formatTrackTime(42), '0:42');
  });

  test('formats minutes and seconds, zero-padding seconds', () => {
    assert.strictEqual(formatTrackTime(91), '1:31');
  });

  test('formats a value with no seconds remainder', () => {
    assert.strictEqual(formatTrackTime(120), '2:00');
  });

  test('falls back to a placeholder for NaN (duration before metadata loads)', () => {
    assert.strictEqual(formatTrackTime(NaN), '--:--');
  });

  test('falls back to a placeholder for negative input', () => {
    assert.strictEqual(formatTrackTime(-1), '--:--');
  });
});
