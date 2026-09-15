import * as assert from 'assert';
import {
  DEFAULT_ENVIRONMENT_ID,
  ENVIRONMENTS,
  getEnvironmentById,
  isValidEnvironmentId,
} from '../../common/environments';

suite('Environments: catalog', () => {
  test('has stable, unique ids', () => {
    const ids = ENVIRONMENTS.map((environment) => environment.id);
    const unique = new Set(ids);
    assert.strictEqual(unique.size, ids.length);
  });

  test('"none" always exists and is the default', () => {
    assert.strictEqual(DEFAULT_ENVIRONMENT_ID, 'none');
    const none = ENVIRONMENTS.find((environment) => environment.id === 'none');
    assert.ok(none, 'expected a "none" environment in the catalog');
    assert.strictEqual(none?.imageFile, undefined);
  });

  test('every non-"none" environment declares an image file under media/environments/', () => {
    for (const environment of ENVIRONMENTS) {
      if (environment.id === 'none') {
        continue;
      }
      assert.ok(
        environment.imageFile,
        `${environment.id}: expected an imageFile`,
      );
      assert.ok(
        environment.imageFile?.startsWith('environments/'),
        `${environment.id}: imageFile should live under environments/`,
      );
    }
  });

  test('the four V1 scenes are present, and no others', () => {
    const ids = ENVIRONMENTS.map((environment) => environment.id);
    for (const expected of ['none', 'johto-route', 'ilex-forest', 'cave']) {
      assert.ok(ids.includes(expected), `missing environment: ${expected}`);
    }
    // Deliberately exactly these four for PokéDev Environment V1 - Ice
    // Path and Pokémon Center were removed (never fully polished; see the
    // milestone that dropped them), leaving only the three approved scenes
    // plus "none".
    assert.strictEqual(ids.length, 4);
  });

  test('Ice Path and Pokémon Center were removed and are not selectable', () => {
    const ids = ENVIRONMENTS.map((environment) => environment.id);
    assert.ok(!ids.includes('ice-path'));
    assert.ok(!ids.includes('pokemon-center'));
  });
});

suite('Environments: lookup helpers', () => {
  test('isValidEnvironmentId accepts every catalog id', () => {
    for (const environment of ENVIRONMENTS) {
      assert.strictEqual(isValidEnvironmentId(environment.id), true);
    }
  });

  test('isValidEnvironmentId rejects unknown/undefined/empty ids', () => {
    assert.strictEqual(isValidEnvironmentId('not-a-real-environment'), false);
    assert.strictEqual(isValidEnvironmentId(undefined), false);
    assert.strictEqual(isValidEnvironmentId(''), false);
  });

  test('isValidEnvironmentId rejects the removed ice-path/pokemon-center ids', () => {
    assert.strictEqual(isValidEnvironmentId('ice-path'), false);
    assert.strictEqual(isValidEnvironmentId('pokemon-center'), false);
  });

  test('getEnvironmentById returns the matching environment', () => {
    const environment = getEnvironmentById('cave');
    assert.strictEqual(environment.id, 'cave');
  });

  test('getEnvironmentById falls back to "none" for an invalid/missing id', () => {
    assert.strictEqual(getEnvironmentById('does-not-exist').id, 'none');
    assert.strictEqual(getEnvironmentById(undefined).id, 'none');
  });

  test('getEnvironmentById falls back to "none" for a persisted but now-removed id', () => {
    // A user who selected Ice Path or Pokémon Center before this milestone
    // may still have that id persisted in their settings - this is the
    // generic "removed environment" fallback, not special-cased to these
    // two ids specifically.
    assert.strictEqual(getEnvironmentById('ice-path').id, 'none');
    assert.strictEqual(getEnvironmentById('pokemon-center').id, 'none');
  });
});
