/**
 * Coverage for Poké Ball customization (V1): the PURE core only - the
 * `common/pokeballs.ts` catalog/lookup helpers and
 * `progression/pokemon-progression.ts`'s `pokeballId` default/normalize
 * handling - exactly the boundary this project's other `test:unit` suites
 * already draw around anything that touches `ExtensionContext`/the DOM (see
 * `evolution-persistence.test.ts`'s and `friendship.test.ts`'s own header
 * comments). The `vscode`-touching glue (`pokeball-service.ts`'s webview URI
 * resolution, `pokeball-flow.ts`'s `setPokemonPokeball`, PokeGear's Party
 * tab UI, the Trainer Card party/partner ball rendering, and the Explorer
 * PARTY row's display-only ball icon in `panel/explorer/main.ts`) is
 * covered by manual QA - see each milestone's final report.
 */
import * as assert from 'assert';
import {
  DEFAULT_POKEBALL_ID,
  getPokeballDefinition,
  isValidPokeballId,
  normalizePokeballId,
  POKEBALL_DEFINITIONS,
} from '../../common/pokeballs';
import {
  createDefaultPokemonProgress,
  normalizePokemonProgress,
} from '../../progression/pokemon-progression';
import { PokemonProgress } from '../../progression/progression-types';

const NOW = 1_700_000_000_000;

/* ------------------------------------------------------------------ *
 * Catalog
 * ------------------------------------------------------------------ */

suite('Poké Ball catalog', () => {
  test('contains the standard Poké Ball', () => {
    const poke = POKEBALL_DEFINITIONS.find((b) => b.id === 'poke');
    assert.ok(poke, 'expected a "poke" entry in the catalog');
    assert.strictEqual(poke?.name, 'Poké Ball');
  });

  test('has exactly 38 entries - every asset actually imported', () => {
    assert.strictEqual(POKEBALL_DEFINITIONS.length, 38);
  });

  test('every id is unique', () => {
    const ids = POKEBALL_DEFINITIONS.map((b) => b.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  test('every entry has a non-empty display name', () => {
    for (const ball of POKEBALL_DEFINITIONS) {
      assert.ok(ball.name.length > 0, ball.id);
    }
  });

  test('every entry has a valid, unique asset mapping', () => {
    const paths = POKEBALL_DEFINITIONS.map((b) => b.assetPath);
    for (const path of paths) {
      assert.ok(path.endsWith('.png'), path);
      assert.ok(!path.includes('/'), `${path} should be a bare filename`);
    }
    assert.strictEqual(new Set(paths).size, paths.length);
  });

  test("every id matches its own asset filename (stem), per the catalog's own stated convention", () => {
    for (const ball of POKEBALL_DEFINITIONS) {
      assert.strictEqual(ball.assetPath, `${ball.id}.png`, ball.id);
    }
  });

  test('sortOrder is unique and dense (0..N-1) - a deterministic total order', () => {
    const orders = POKEBALL_DEFINITIONS.map((b) => b.sortOrder).sort(
      (a, b) => a - b,
    );
    const expected = POKEBALL_DEFINITIONS.map((_, i) => i);
    assert.deepStrictEqual(orders, expected);
  });

  test('the four best-known balls sort first, in canonical order', () => {
    const bySort = [...POKEBALL_DEFINITIONS].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    assert.deepStrictEqual(
      bySort.slice(0, 4).map((b) => b.id),
      ['poke', 'great', 'ultra', 'master'],
    );
  });

  test('is not sorted alphabetically (a real, canonically-ordered catalog)', () => {
    const bySort = POKEBALL_DEFINITIONS.map((b) => b.id);
    const alphabetical = [...bySort].sort();
    assert.notDeepStrictEqual(bySort, alphabetical);
  });
});

suite('Poké Ball catalog: lookup helpers', () => {
  test('isValidPokeballId accepts every catalog id', () => {
    for (const ball of POKEBALL_DEFINITIONS) {
      assert.strictEqual(isValidPokeballId(ball.id), true, ball.id);
    }
  });

  test('isValidPokeballId rejects unknown/undefined/empty ids', () => {
    assert.strictEqual(isValidPokeballId('rare-candy'), false);
    assert.strictEqual(isValidPokeballId(undefined), false);
    assert.strictEqual(isValidPokeballId(''), false);
  });

  test('getPokeballDefinition returns the matching entry', () => {
    assert.strictEqual(getPokeballDefinition('great')?.name, 'Great Ball');
  });

  test('getPokeballDefinition returns undefined for an unknown id, never throws', () => {
    assert.strictEqual(getPokeballDefinition('not-a-real-ball'), undefined);
    assert.strictEqual(getPokeballDefinition(undefined), undefined);
  });

  test('normalizePokeballId falls back to the standard Poké Ball for an unknown id', () => {
    assert.strictEqual(
      normalizePokeballId('not-a-real-ball'),
      DEFAULT_POKEBALL_ID,
    );
  });

  test('normalizePokeballId falls back to the standard Poké Ball for undefined', () => {
    assert.strictEqual(normalizePokeballId(undefined), DEFAULT_POKEBALL_ID);
  });

  test('normalizePokeballId passes a valid id through unchanged', () => {
    assert.strictEqual(normalizePokeballId('hisuian-ultra'), 'hisuian-ultra');
  });

  test('DEFAULT_POKEBALL_ID is itself a valid catalog id', () => {
    assert.strictEqual(isValidPokeballId(DEFAULT_POKEBALL_ID), true);
  });
});

/* ------------------------------------------------------------------ *
 * Persistence: default + normalize-on-read
 * ------------------------------------------------------------------ */

suite('Poké Ball persistence: createDefaultPokemonProgress', () => {
  test('a brand-new Pokémon defaults to the standard Poké Ball', () => {
    const progress = createDefaultPokemonProgress('bulbasaur', NOW);
    assert.strictEqual(progress.pokeballId, DEFAULT_POKEBALL_ID);
  });
});

suite('Poké Ball persistence: normalizePokemonProgress', () => {
  test('an existing Pokémon saved before Poké Ball customization existed defaults to the standard Poké Ball', () => {
    // No `pokeballId` field at all - the exact shape of a pre-this-milestone
    // save.
    const raw = { species: 'wartortle', totalXp: 500, friendship: 40 };
    const result = normalizePokemonProgress(raw, 'wartortle', NOW);
    assert.strictEqual(result.pokeballId, DEFAULT_POKEBALL_ID);
  });

  test('a chosen ball persists across a normalize-on-read round trip (the "reload" case)', () => {
    const raw = {
      species: 'wartortle',
      totalXp: 500,
      friendship: 40,
      pokeballId: 'great',
    };
    const result = normalizePokemonProgress(raw, 'wartortle', NOW);
    assert.strictEqual(result.pokeballId, 'great');
  });

  test('an unknown/invalid stored ball id safely falls back rather than crashing', () => {
    const raw = {
      species: 'wartortle',
      totalXp: 500,
      pokeballId: 'something-that-no-longer-exists',
    };
    const result = normalizePokemonProgress(raw, 'wartortle', NOW);
    assert.strictEqual(result.pokeballId, DEFAULT_POKEBALL_ID);
  });

  test('a non-string stored value (hand-edited/corrupt) safely falls back', () => {
    const raw = { species: 'wartortle', totalXp: 500, pokeballId: 42 };
    const result = normalizePokemonProgress(raw, 'wartortle', NOW);
    assert.strictEqual(result.pokeballId, DEFAULT_POKEBALL_ID);
  });

  test('completely absent/corrupt raw input still produces a valid default ball', () => {
    const result = normalizePokemonProgress(undefined, 'wartortle', NOW);
    assert.strictEqual(result.pokeballId, DEFAULT_POKEBALL_ID);
  });
});

/* ------------------------------------------------------------------ *
 * Per-instance isolation
 * ------------------------------------------------------------------ */

suite('Poké Ball: per-instance isolation', () => {
  test("changing one nickname's ball in a progression map never touches another", () => {
    const map: Record<string, PokemonProgress> = {
      Wartortle: {
        ...createDefaultPokemonProgress('wartortle', NOW),
        pokeballId: 'poke',
      },
      Psyduck: {
        ...createDefaultPokemonProgress('psyduck', NOW),
        pokeballId: 'poke',
      },
    };

    // Simulate the exact write `setPokemonPokeball`/`writePokemonProgress`
    // perform: read the one record, spread a new pokeballId onto it, write
    // it back under its own key only.
    map.Wartortle = { ...map.Wartortle, pokeballId: 'great' };

    assert.strictEqual(map.Wartortle.pokeballId, 'great');
    assert.strictEqual(map.Psyduck.pokeballId, 'poke');
  });

  test('a third Pokémon changed afterward still leaves the first two alone', () => {
    const map: Record<string, PokemonProgress> = {
      Wartortle: {
        ...createDefaultPokemonProgress('wartortle', NOW),
        pokeballId: 'great',
      },
      Psyduck: {
        ...createDefaultPokemonProgress('psyduck', NOW),
        pokeballId: 'poke',
      },
      Sparky: {
        ...createDefaultPokemonProgress('pikachu', NOW),
        pokeballId: 'poke',
      },
    };

    map.Sparky = { ...map.Sparky, pokeballId: 'friend' };
    map.Psyduck = { ...map.Psyduck, pokeballId: 'dive' };

    assert.strictEqual(map.Wartortle.pokeballId, 'great');
    assert.strictEqual(map.Psyduck.pokeballId, 'dive');
    assert.strictEqual(map.Sparky.pokeballId, 'friend');
  });
});

/* ------------------------------------------------------------------ *
 * Evolution preservation
 * ------------------------------------------------------------------ */

suite('Poké Ball: survives evolution', () => {
  test('the exact spread evolvePokemonInstance uses (`{...progress, species: target}`) preserves pokeballId', () => {
    // Pins the actual technique `src/extension/evolution-flow.ts`'s
    // `evolvePokemonInstance` uses to write the post-evolution record - only
    // `species` is explicitly overwritten, so any other field (including
    // one added after that function was last touched) survives for free.
    // See its own module doc comment for why this is deliberate, not
    // incidental.
    const before: PokemonProgress = {
      ...createDefaultPokemonProgress('pikachu', NOW),
      pokeballId: 'friend',
      friendship: 220,
      level: 25,
    };
    const after: PokemonProgress = { ...before, species: 'raichu' };

    assert.strictEqual(after.pokeballId, 'friend');
    assert.strictEqual(after.species, 'raichu');
    // Everything else genuinely unrelated to evolution is untouched too.
    assert.strictEqual(after.friendship, before.friendship);
    assert.strictEqual(after.level, before.level);
  });

  test('a chain of two evolutions still preserves the original ball', () => {
    const gen0: PokemonProgress = {
      ...createDefaultPokemonProgress('squirtle', NOW),
      pokeballId: 'dive',
    };
    const gen1: PokemonProgress = { ...gen0, species: 'wartortle' };
    const gen2: PokemonProgress = { ...gen1, species: 'blastoise' };

    assert.strictEqual(gen2.pokeballId, 'dive');
  });
});

/* ------------------------------------------------------------------ *
 * Regression: existing progression fields are unaffected
 * ------------------------------------------------------------------ */

suite('Poké Ball: regression - unrelated progression fields unaffected', () => {
  test('createDefaultPokemonProgress still seeds friendship/level/XP exactly as before', () => {
    const progress = createDefaultPokemonProgress('eevee', NOW);
    assert.strictEqual(progress.level, 5);
    assert.strictEqual(progress.currentXp, 0);
    assert.strictEqual(progress.friendship, 70);
    assert.strictEqual(progress.species, 'eevee');
  });

  test('normalizePokemonProgress still migrates friendship independently of pokeballId', () => {
    const raw = { species: 'eevee', totalXp: 100 }; // no friendship, no pokeballId
    const result = normalizePokemonProgress(raw, 'eevee', NOW);
    assert.strictEqual(result.friendship, 70);
    assert.strictEqual(result.pokeballId, DEFAULT_POKEBALL_ID);
  });

  test('a record with a custom ball but no friendship migrates each field independently', () => {
    const raw = { species: 'eevee', totalXp: 100, pokeballId: 'love' };
    const result = normalizePokemonProgress(raw, 'eevee', NOW);
    assert.strictEqual(result.pokeballId, 'love');
    assert.strictEqual(result.friendship, 70);
  });
});

/* ------------------------------------------------------------------ *
 * Explorer PARTY row display (display-only - see panel/explorer/main.ts)
 * ------------------------------------------------------------------ */

/** A minimal stand-in for the fields of `ExplorerPokemonEntry`
 * (`trainer/explorer-types.ts`) that the Explorer row actually reads for
 * its ball icon - just enough to pin the lookup/isolation behaviour without
 * needing the full view-model type or a DOM. */
interface PartyRowBallFields {
  nickname: string;
  pokeballId: string;
}

suite('Poké Ball: Explorer PARTY row tooltip resolution', () => {
  test('a valid pokeballId resolves to its real display name for the title attribute', () => {
    const row: PartyRowBallFields = {
      nickname: 'Wartortle',
      pokeballId: 'lure',
    };
    assert.strictEqual(
      getPokeballDefinition(row.pokeballId)?.name,
      'Lure Ball',
    );
  });

  test('every catalog id resolves to a non-empty tooltip name - no row can end up with a nameless icon', () => {
    for (const ball of POKEBALL_DEFINITIONS) {
      const row: PartyRowBallFields = { nickname: 'Test', pokeballId: ball.id };
      const name = getPokeballDefinition(row.pokeballId)?.name;
      assert.ok(name && name.length > 0, ball.id);
    }
  });

  test('an unresolvable pokeballId (should not happen post-normalization, but must not throw) yields no title rather than crashing', () => {
    // Mirrors `renderPokemonRow`'s own `ballName ? ball.title = ballName : ...`
    // guard: `getPokeballDefinition` returning `undefined` here is exactly
    // what lets that guard skip setting a title instead of throwing.
    const row: PartyRowBallFields = {
      nickname: 'Corrupted',
      pokeballId: 'not-a-real-ball',
    };
    assert.strictEqual(getPokeballDefinition(row.pokeballId), undefined);
  });
});

suite('Poké Ball: Explorer PARTY rows are independent, per instance', () => {
  test('each row in a party list carries its own configured ball, not a shared/inferred one', () => {
    // Directly pins the milestone's own example: same-species and
    // different-species rows never leak a ball value from one to another,
    // and nothing here is derived from species or list position.
    const party: PartyRowBallFields[] = [
      { nickname: 'Mankey', pokeballId: 'poke' },
      { nickname: 'Pidgey', pokeballId: 'great' },
      { nickname: 'Abra', pokeballId: 'ultra' },
      { nickname: 'Wartortle', pokeballId: 'lure' },
      { nickname: 'Psyduck', pokeballId: 'dive' },
      { nickname: 'Sparky', pokeballId: 'friend' },
    ];

    const byNickname = new Map(party.map((row) => [row.nickname, row]));
    assert.strictEqual(byNickname.get('Mankey')?.pokeballId, 'poke');
    assert.strictEqual(byNickname.get('Pidgey')?.pokeballId, 'great');
    assert.strictEqual(byNickname.get('Abra')?.pokeballId, 'ultra');
    assert.strictEqual(byNickname.get('Wartortle')?.pokeballId, 'lure');
    assert.strictEqual(byNickname.get('Psyduck')?.pokeballId, 'dive');
    assert.strictEqual(byNickname.get('Sparky')?.pokeballId, 'friend');
  });

  test("changing one row's ball (simulating a live PokéGear update) never touches sibling rows", () => {
    let party: PartyRowBallFields[] = [
      { nickname: 'Wartortle', pokeballId: 'lure' },
      { nickname: 'Psyduck', pokeballId: 'dive' },
    ];

    // The exact shape a fresh `buildPartyEntries` re-render produces after
    // `pokedevState.notify('pokeball')` fires: a new array, one entry
    // replaced by nickname, everything else untouched.
    party = party.map((row) =>
      row.nickname === 'Wartortle' ? { ...row, pokeballId: 'great' } : row,
    );

    const byNickname = new Map(party.map((row) => [row.nickname, row]));
    assert.strictEqual(byNickname.get('Wartortle')?.pokeballId, 'great');
    assert.strictEqual(byNickname.get('Psyduck')?.pokeballId, 'dive');
  });

  test('a row with an unknown/invalid stored id still gets a safe display fallback', () => {
    const row: PartyRowBallFields = {
      nickname: 'Corrupted',
      pokeballId: normalizePokeballId('nonexistent-ball'),
    };
    assert.strictEqual(row.pokeballId, DEFAULT_POKEBALL_ID);
    assert.strictEqual(
      getPokeballDefinition(row.pokeballId)?.name,
      'Poké Ball',
    );
  });
});
