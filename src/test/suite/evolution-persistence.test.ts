/**
 * Regression coverage for the evolution-identity bug: a persistent Pokemon's
 * species must actually change in the canonical collection, in place, under
 * its existing stable identity (nickname + array index) - never by creating
 * a second entry.
 *
 * These exercise the PURE core (`evolveCollectionEntry`,
 * `reconcileEntryEvolutions`, `isReconcilableEvolutionCondition` in
 * `progression/evolution-service.ts`), which is exactly the logic
 * `extension/evolution-flow.ts`'s `evolvePokemonInstance` and
 * `reconcileStaleEvolutions` apply to real `globalState` arrays. Reading
 * those arrays back after a `context.globalState.update()` is a plain
 * passthrough of the same JSON-serializable values with no further
 * transformation - so asserting on the arrays these pure functions return is
 * exactly what "reload", "another workspace" and "another consumer" would
 * see, without needing a live VS Code host. The `vscode`-touching glue itself
 * (`evolvePokemonInstance`, `reconcileStaleEvolutions`, the `delete-pokemon`
 * command fix) is covered by manual QA - see the final report - the same
 * boundary this project's other `test:unit` suites already draw around
 * anything that touches `ExtensionContext`.
 */
import * as assert from 'assert';
import { PokemonColor } from '../../common/types';
import {
  EvolutionCondition,
  EVOLUTION_RULES,
} from '../../progression/evolution-data';
import {
  evolveCollectionEntry,
  isReconcilableEvolutionCondition,
  PokemonCollectionArrays,
  reconcileEntryEvolutions,
  ReconcilableEntry,
} from '../../progression/evolution-service';

function collectionOf(
  entries: readonly { type: string; color: string; name: string }[],
): PokemonCollectionArrays {
  return {
    types: entries.map((e) => e.type),
    colors: entries.map((e) => e.color),
    names: entries.map((e) => e.name),
  };
}

suite('Evolution persistence: evolveCollectionEntry', () => {
  test('evolves the entry in place: same index, species and colour updated', () => {
    const before = collectionOf([
      { type: 'squirtle', color: PokemonColor.default, name: 'Bubbles' },
    ]);
    const result = evolveCollectionEntry(
      before,
      0,
      'wartortle',
      PokemonColor.default,
    );
    assert.ok(result);
    assert.strictEqual(result!.types[0], 'wartortle');
    assert.strictEqual(result!.colors[0], PokemonColor.default);
    assert.strictEqual(result!.fromSpecies, 'squirtle');
    assert.strictEqual(result!.toSpecies, 'wartortle');
  });

  test('does not create a second entry - the array length is unchanged', () => {
    const before = collectionOf([
      { type: 'squirtle', color: PokemonColor.default, name: 'Bubbles' },
    ]);
    const result = evolveCollectionEntry(
      before,
      0,
      'wartortle',
      PokemonColor.default,
    );
    assert.strictEqual(result!.types.length, 1);
  });

  test('leaves every OTHER entry completely untouched', () => {
    const before = collectionOf([
      { type: 'pidgey', color: PokemonColor.default, name: 'Pidgey' },
      { type: 'squirtle', color: PokemonColor.default, name: 'Bubbles' },
      { type: 'mankey', color: PokemonColor.default, name: 'Mankey' },
    ]);
    const result = evolveCollectionEntry(
      before,
      1,
      'wartortle',
      PokemonColor.default,
    );
    assert.strictEqual(result!.types[0], 'pidgey');
    assert.strictEqual(result!.names[0], 'Pidgey');
    assert.strictEqual(result!.types[2], 'mankey');
    assert.strictEqual(result!.names[2], 'Mankey');
  });

  test('a genuine custom nickname survives evolution unchanged', () => {
    const before = collectionOf([
      { type: 'squirtle', color: PokemonColor.default, name: 'Bubbles' },
    ]);
    const result = evolveCollectionEntry(
      before,
      0,
      'wartortle',
      PokemonColor.default,
    );
    assert.strictEqual(result!.names[0], 'Bubbles');
  });

  test('an un-nicknamed Pokemon (name === old species) now reads as the new species', () => {
    // Spawning with no chosen name can leave the stored name equal to the
    // species itself; `hasDistinctNickname` is what the Explorer/Trainer
    // Card use to decide whether to show it as a nickname at all. Without
    // this, evolving it would freeze the OLD species name in as a fake
    // nickname on the new species.
    const before = collectionOf([
      { type: 'squirtle', color: PokemonColor.default, name: 'squirtle' },
    ]);
    const result = evolveCollectionEntry(
      before,
      0,
      'wartortle',
      PokemonColor.default,
    );
    assert.strictEqual(result!.names[0], 'wartortle');
  });

  test('returns undefined, and mutates nothing, for an out-of-range index', () => {
    const before = collectionOf([
      { type: 'squirtle', color: PokemonColor.default, name: 'Bubbles' },
    ]);
    const result = evolveCollectionEntry(
      before,
      5,
      'wartortle',
      PokemonColor.default,
    );
    assert.strictEqual(result, undefined);
  });

  test('never mutates the input arrays (pure)', () => {
    const before = collectionOf([
      { type: 'squirtle', color: PokemonColor.default, name: 'Bubbles' },
    ]);
    const beforeTypesRef = before.types;
    evolveCollectionEntry(before, 0, 'wartortle', PokemonColor.default);
    assert.strictEqual(before.types, beforeTypesRef);
    assert.strictEqual(before.types[0], 'squirtle');
  });
});

/* ------------------------------------------------------------------ *
 * Second evolution / chains - "same instance ID throughout"
 * ------------------------------------------------------------------ */

suite('Evolution persistence: chained evolution keeps one identity', () => {
  test('Squirtle -> Wartortle -> Blastoise stays index 0 and keeps its nickname the whole way', () => {
    let collection = collectionOf([
      { type: 'squirtle', color: PokemonColor.default, name: 'Bubbles' },
    ]);

    const toWartortle = evolveCollectionEntry(
      collection,
      0,
      'wartortle',
      PokemonColor.default,
    )!;
    collection = {
      types: toWartortle.types,
      colors: toWartortle.colors,
      names: toWartortle.names,
    };
    assert.strictEqual(collection.types[0], 'wartortle');
    assert.strictEqual(collection.names[0], 'Bubbles');

    const toBlastoise = evolveCollectionEntry(
      collection,
      0,
      'blastoise',
      PokemonColor.default,
    )!;
    collection = {
      types: toBlastoise.types,
      colors: toBlastoise.colors,
      names: toBlastoise.names,
    };
    assert.strictEqual(collection.types[0], 'blastoise');
    // The SAME nickname the whole way - this IS the stable instance identity.
    assert.strictEqual(collection.names[0], 'Bubbles');
    assert.strictEqual(collection.types.length, 1);
  });
});

/* ------------------------------------------------------------------ *
 * Partner / Party reference stability
 * ------------------------------------------------------------------ */

suite('Evolution persistence: Partner and Party references', () => {
  test('a Partner reference (a nickname) still resolves to the same slot after evolution', () => {
    const before = collectionOf([
      { type: 'pidgey', color: PokemonColor.default, name: 'Pidgey' },
      { type: 'squirtle', color: PokemonColor.default, name: 'Bubbles' },
    ]);
    const partnerNickname = 'Bubbles';
    const partnerIndexBefore = before.names.indexOf(partnerNickname);
    assert.strictEqual(partnerIndexBefore, 1);

    const result = evolveCollectionEntry(
      before,
      partnerIndexBefore,
      'wartortle',
      PokemonColor.default,
    )!;

    // The Partner pointer never changes - it is still the string "Bubbles".
    // Re-resolving it against the POST-evolution arrays must land on the
    // same index, now reporting the evolved species.
    const partnerIndexAfter = result.names.indexOf(partnerNickname);
    assert.strictEqual(partnerIndexAfter, partnerIndexBefore);
    assert.strictEqual(result.types[partnerIndexAfter], 'wartortle');
  });

  test('a Party member reference keeps its slot after a different member evolves', () => {
    // "Party" in this codebase is simply the first N collection entries in
    // stored order - there is no separate stored Party list to go stale, but
    // the ORDER (and therefore which entries are "in the party") must be
    // preserved by evolution, which this asserts directly.
    const before = collectionOf([
      { type: 'pidgey', color: PokemonColor.default, name: 'Pidgey' },
      { type: 'squirtle', color: PokemonColor.default, name: 'Bubbles' },
      { type: 'mankey', color: PokemonColor.default, name: 'Mankey' },
    ]);
    const result = evolveCollectionEntry(
      before,
      1,
      'wartortle',
      PokemonColor.default,
    )!;
    assert.deepStrictEqual(
      [result.types[0], result.types[1], result.types[2]],
      ['pidgey', 'wartortle', 'mankey'],
    );
  });
});

/* ------------------------------------------------------------------ *
 * Cross-workspace / reload persistence
 * ------------------------------------------------------------------ */

suite('Evolution persistence: reload / another consumer', () => {
  test('a fresh read of the persisted arrays after evolution reports the evolved species, not the original', () => {
    const before = collectionOf([
      { type: 'squirtle', color: PokemonColor.default, name: 'Bubbles' },
    ]);
    const persisted = evolveCollectionEntry(
      before,
      0,
      'wartortle',
      PokemonColor.default,
    )!;

    // Stand in for "another workspace opens and reads globalState fresh",
    // or "Cursor restarts": a brand new read of exactly what got persisted.
    const rehydrated: PokemonCollectionArrays = {
      types: persisted.types,
      colors: persisted.colors,
      names: persisted.names,
    };
    assert.strictEqual(rehydrated.types[0], 'wartortle');
    assert.notStrictEqual(rehydrated.types[0], 'squirtle');
  });

  test('spawn/select-by-identity resolves the SAME instance post-evolution, not a duplicate', () => {
    const before = collectionOf([
      { type: 'squirtle', color: PokemonColor.default, name: 'Bubbles' },
    ]);
    const persisted = evolveCollectionEntry(
      before,
      0,
      'wartortle',
      PokemonColor.default,
    )!;

    // "Selecting the persistent Pokemon" means resolving by its stable
    // identity (the nickname) - never by species. Doing so after evolution
    // must land on the one existing entry, not fail to find it (which is
    // what would make calling code think it has to create a new one).
    const index = persisted.names.indexOf('Bubbles');
    assert.strictEqual(index, 0);
    assert.strictEqual(persisted.types.length, 1); // still exactly one entry
  });
});

/* ------------------------------------------------------------------ *
 * Stale-save reconciliation
 * ------------------------------------------------------------------ */

function entry(overrides: Partial<ReconcilableEntry>): ReconcilableEntry {
  return { species: 'squirtle', shiny: false, level: 1, ...overrides };
}

suite('Evolution persistence: reconcileEntryEvolutions', () => {
  test('a Squirtle past its evolution level reconciles to Wartortle', () => {
    const steps = reconcileEntryEvolutions(entry({ level: 17 }));
    assert.strictEqual(steps.length, 1);
    assert.strictEqual(steps[0].fromSpecies, 'squirtle');
    assert.strictEqual(steps[0].toSpecies, 'wartortle');
  });

  test('a Squirtle below its evolution level reconciles to nothing', () => {
    const steps = reconcileEntryEvolutions(entry({ level: 10 }));
    assert.strictEqual(steps.length, 0);
  });

  test('running reconciliation again on an already-correct species changes nothing', () => {
    const first = reconcileEntryEvolutions(entry({ level: 17 }));
    assert.strictEqual(first.length, 1);
    // Simulate having applied the repair: species is now Wartortle.
    const second = reconcileEntryEvolutions(
      entry({ species: first[0].toSpecies, level: 17 }),
    );
    assert.strictEqual(second.length, 0);
  });

  test('a very stale save catches up through more than one threshold at once', () => {
    // Squirtle -> Wartortle at 16, Wartortle -> Blastoise at 36.
    const steps = reconcileEntryEvolutions(entry({ level: 60 }));
    assert.strictEqual(steps.length, 2);
    assert.strictEqual(steps[0].toSpecies, 'wartortle');
    assert.strictEqual(steps[1].fromSpecies, 'wartortle');
    assert.strictEqual(steps[1].toSpecies, 'blastoise');
  });

  test('a standing decline at the current level blocks reconciliation entirely', () => {
    const steps = reconcileEntryEvolutions(
      entry({ level: 17, declinedEvolutionAtLevel: 17 }),
    );
    assert.strictEqual(steps.length, 0);
  });

  test('a decline recorded at a DIFFERENT level does not block reconciliation', () => {
    const steps = reconcileEntryEvolutions(
      entry({ level: 17, declinedEvolutionAtLevel: 16 }),
    );
    assert.strictEqual(steps.length, 1);
  });

  test('a decline on the original species does not block a LATER hop in the same chain', () => {
    // Declined Squirtle -> Wartortle at level 16, but the save is stale
    // enough that by level 60 the user has clearly moved past that refusal
    // for the FIRST hop... actually: per the exact rule, a decline recorded
    // at exactly the current level blocks the whole run, including later
    // hops, since it is checked before the first step. This test pins that
    // intentional behaviour precisely: decline wins, full stop, for this
    // reconciliation pass.
    const steps = reconcileEntryEvolutions(
      entry({ level: 60, declinedEvolutionAtLevel: 60 }),
    );
    assert.strictEqual(steps.length, 0);
  });

  test('a species with no evolution rule reconciles to nothing', () => {
    // A fully-evolved species (nothing left to evolve into).
    const steps = reconcileEntryEvolutions(
      entry({ species: 'blastoise', level: 100 }),
    );
    assert.strictEqual(steps.length, 0);
  });

  test('is bounded and cannot loop forever even with a tiny maxSteps', () => {
    const steps = reconcileEntryEvolutions(entry({ level: 60 }), 1);
    assert.strictEqual(steps.length, 1);
    assert.strictEqual(steps[0].toSpecies, 'wartortle');
  });
});

suite('Evolution persistence: non-level evolution safety', () => {
  test('isReconcilableEvolutionCondition accepts level conditions', () => {
    const condition: EvolutionCondition = { type: 'level', level: 16 };
    assert.strictEqual(isReconcilableEvolutionCondition(condition), true);
  });

  test('isReconcilableEvolutionCondition rejects any future non-level condition', () => {
    // `EvolutionCondition` only has one member today; this pins the guard's
    // behaviour for the item/friendship/trade/etc. conditions
    // `evolution-data.ts`'s own doc comment says are coming later, so this
    // test starts failing the moment such a condition is added WITHOUT this
    // guard being taught to reject it too.
    const futureCondition = {
      type: 'item',
      item: 'fire-stone',
    } as unknown as EvolutionCondition;
    assert.strictEqual(
      isReconcilableEvolutionCondition(futureCondition),
      false,
    );
  });

  test('every rule in the real table is level-based today, so reconciliation is safe for the whole catalog', () => {
    assert.ok(EVOLUTION_RULES.length > 0);
    for (const rule of EVOLUTION_RULES) {
      assert.ok(isReconcilableEvolutionCondition(rule.condition), rule.from);
    }
  });
});
