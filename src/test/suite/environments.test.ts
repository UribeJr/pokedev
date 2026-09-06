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

  test('the five initial scenes are present', () => {
    const ids = ENVIRONMENTS.map((environment) => environment.id);
    for (const expected of [
      'none',
      'johto-route',
      'ilex-forest',
      'cave',
      'ice-path',
      'pokemon-center',
    ]) {
      assert.ok(ids.includes(expected), `missing environment: ${expected}`);
    }
    // Deliberately exactly these six for this milestone - see the module
    // doc on `ENVIRONMENTS` / the "Initial Deliverable" scope.
    assert.strictEqual(ids.length, 6);
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

  test('getEnvironmentById returns the matching environment', () => {
    const environment = getEnvironmentById('ice-path');
    assert.strictEqual(environment.id, 'ice-path');
  });

  test('getEnvironmentById falls back to "none" for an invalid/missing id', () => {
    assert.strictEqual(getEnvironmentById('does-not-exist').id, 'none');
    assert.strictEqual(getEnvironmentById(undefined).id, 'none');
  });
});
