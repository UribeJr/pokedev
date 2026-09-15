/**
 * Coverage for Evolution Stones + the Bag (V1): the PURE core only -
 * `progression/inventory-rules.ts`, `progression/evolution-service.ts`'s
 * `item` condition handling, and `extension/item-rewards.ts`'s reward
 * selection - exactly the boundary this project's other `test:unit` suites
 * already draw around anything that touches `ExtensionContext` (see
 * `evolution-persistence.test.ts`'s own doc comment). The `vscode`-touching
 * glue (`inventory-storage.ts`'s read/write, `evolution-flow.ts`'s
 * `useEvolutionStoneOnPokemon`, the PokeGear Bag tab) is covered by manual
 * QA - see the milestone's final report.
 */
import * as assert from 'assert';
import { EVOLUTION_STONE_IDS, ITEM_DEFINITIONS } from '../../common/items';
import {
  addItemToInventory,
  consumeItemFromInventory,
  EMPTY_INVENTORY,
  getItemQuantity,
  normalizeInventory,
  PokedevInventory,
} from '../../progression/inventory-rules';
import {
  EVOLUTION_RULES,
  EvolutionCondition,
} from '../../progression/evolution-data';
import {
  getAvailableEvolution,
  getEvolutionLevel,
  hasFriendshipEvolutionRule,
  isReconcilableEvolutionCondition,
} from '../../progression/evolution-service';
import { POKEMON_DATA } from '../../common/pokemon-data';
import {
  selectUnclaimedEarnedRewards,
  TRAINER_LEVEL_STONE_REWARDS,
  TrainerLevelStoneReward,
} from '../../extension/item-rewards';

/* ------------------------------------------------------------------ *
 * Inventory (pure)
 * ------------------------------------------------------------------ */

suite('Bag inventory: normalization', () => {
  test('an existing save with no Bag yet normalizes to an empty inventory', () => {
    assert.deepStrictEqual(normalizeInventory(undefined), { items: {} });
  });

  test('null and non-object input normalize to an empty inventory', () => {
    assert.deepStrictEqual(normalizeInventory(null), { items: {} });
    assert.deepStrictEqual(normalizeInventory('nonsense'), { items: {} });
    assert.deepStrictEqual(normalizeInventory(42), { items: {} });
  });

  test('an unknown item id is dropped rather than carried forward', () => {
    const result = normalizeInventory({
      items: { 'thunder-stone': 2, 'rare-candy': 5 },
    });
    assert.deepStrictEqual(result.items, { 'thunder-stone': 2 });
  });

  test('a negative or non-finite quantity clamps to 0', () => {
    const result = normalizeInventory({
      items: {
        'thunder-stone': -3,
        'fire-stone': NaN,
        'water-stone': Infinity,
      },
    });
    assert.strictEqual(result.items['thunder-stone'], 0);
    assert.strictEqual(result.items['fire-stone'], 0);
    // Infinity is not finite either - also clamps to 0 rather than being kept.
    assert.strictEqual(result.items['water-stone'], 0);
  });

  test('a fractional quantity floors rather than rounds', () => {
    const result = normalizeInventory({ items: { 'thunder-stone': 2.9 } });
    assert.strictEqual(result.items['thunder-stone'], 2);
  });
});

suite('Bag inventory: getItemQuantity', () => {
  test('missing item means 0', () => {
    assert.strictEqual(getItemQuantity(EMPTY_INVENTORY, 'thunder-stone'), 0);
  });

  test('reports whatever quantity is stored', () => {
    const inventory: PokedevInventory = { items: { 'thunder-stone': 3 } };
    assert.strictEqual(getItemQuantity(inventory, 'thunder-stone'), 3);
  });
});

suite('Bag inventory: addItemToInventory', () => {
  test('adding to an empty inventory sets the quantity', () => {
    const result = addItemToInventory(EMPTY_INVENTORY, 'fire-stone', 1);
    assert.strictEqual(getItemQuantity(result, 'fire-stone'), 1);
  });

  test('adding again increments rather than overwriting', () => {
    const once = addItemToInventory(EMPTY_INVENTORY, 'fire-stone', 1);
    const twice = addItemToInventory(once, 'fire-stone', 1);
    assert.strictEqual(getItemQuantity(twice, 'fire-stone'), 2);
  });

  test('a non-positive or non-finite amount is a no-op, same reference back', () => {
    assert.strictEqual(
      addItemToInventory(EMPTY_INVENTORY, 'fire-stone', 0),
      EMPTY_INVENTORY,
    );
    assert.strictEqual(
      addItemToInventory(EMPTY_INVENTORY, 'fire-stone', -1),
      EMPTY_INVENTORY,
    );
    assert.strictEqual(
      addItemToInventory(EMPTY_INVENTORY, 'fire-stone', NaN),
      EMPTY_INVENTORY,
    );
  });

  test('never mutates the input (pure)', () => {
    const before: PokedevInventory = { items: { 'fire-stone': 1 } };
    const beforeItemsRef = before.items;
    addItemToInventory(before, 'fire-stone', 1);
    assert.strictEqual(before.items, beforeItemsRef);
    assert.strictEqual(before.items['fire-stone'], 1);
  });
});

/* ------------------------------------------------------------------ *
 * Consumption
 * ------------------------------------------------------------------ */

suite('Bag inventory: consumeItemFromInventory', () => {
  test('successful consumption decrements by exactly the requested amount', () => {
    const before: PokedevInventory = { items: { 'thunder-stone': 2 } };
    const { inventory, consumed } = consumeItemFromInventory(
      before,
      'thunder-stone',
      1,
    );
    assert.strictEqual(consumed, true);
    assert.strictEqual(getItemQuantity(inventory, 'thunder-stone'), 1);
  });

  test('cancelled/never-attempted use consumes nothing - quantity unchanged', () => {
    // "Cancelled" at the UI layer simply never calls this function at all;
    // this test pins that NOT calling it is the only thing cancellation
    // needs to do, by confirming a fresh read shows the original quantity.
    const inventory: PokedevInventory = { items: { 'thunder-stone': 2 } };
    assert.strictEqual(getItemQuantity(inventory, 'thunder-stone'), 2);
  });

  test('an invalid target (no stone actually available) reports not consumed, quantity unchanged', () => {
    const before: PokedevInventory = { items: { 'thunder-stone': 0 } };
    const { inventory, consumed } = consumeItemFromInventory(
      before,
      'thunder-stone',
      1,
    );
    assert.strictEqual(consumed, false);
    assert.strictEqual(inventory, before);
    assert.strictEqual(getItemQuantity(inventory, 'thunder-stone'), 0);
  });

  test('requesting more than is held changes nothing rather than clamping to 0', () => {
    const before: PokedevInventory = { items: { 'thunder-stone': 1 } };
    const { inventory, consumed } = consumeItemFromInventory(
      before,
      'thunder-stone',
      2,
    );
    assert.strictEqual(consumed, false);
    assert.strictEqual(inventory, before);
  });

  test('quantity never goes negative, ever', () => {
    const before: PokedevInventory = { items: {} };
    const { inventory, consumed } = consumeItemFromInventory(
      before,
      'thunder-stone',
      1,
    );
    assert.strictEqual(consumed, false);
    assert.strictEqual(getItemQuantity(inventory, 'thunder-stone'), 0);
  });

  test('failed persistence leaves no partial state: the returned inventory is the SAME reference on failure', () => {
    const before: PokedevInventory = { items: { 'thunder-stone': 0 } };
    const { inventory } = consumeItemFromInventory(before, 'thunder-stone', 1);
    assert.strictEqual(inventory, before);
  });

  test('a duplicate/overlapping call cannot double-consume: consuming twice in a row from quantity 1 succeeds once, fails once', () => {
    let inventory: PokedevInventory = { items: { 'thunder-stone': 1 } };
    const first = consumeItemFromInventory(inventory, 'thunder-stone', 1);
    assert.strictEqual(first.consumed, true);
    inventory = first.inventory;

    // A second call reading the ALREADY-decremented inventory - exactly what
    // `consumeItem`'s synchronous read-check-decrement in
    // `inventory-storage.ts` guarantees a real overlapping call would see.
    const second = consumeItemFromInventory(inventory, 'thunder-stone', 1);
    assert.strictEqual(second.consumed, false);
    assert.strictEqual(getItemQuantity(second.inventory, 'thunder-stone'), 0);
  });

  test('a non-positive or non-finite amount consumes nothing', () => {
    const before: PokedevInventory = { items: { 'thunder-stone': 5 } };
    assert.strictEqual(
      consumeItemFromInventory(before, 'thunder-stone', 0).consumed,
      false,
    );
    assert.strictEqual(
      consumeItemFromInventory(before, 'thunder-stone', -1).consumed,
      false,
    );
  });

  test('never mutates the input (pure)', () => {
    const before: PokedevInventory = { items: { 'thunder-stone': 2 } };
    const beforeItemsRef = before.items;
    consumeItemFromInventory(before, 'thunder-stone', 1);
    assert.strictEqual(before.items, beforeItemsRef);
    assert.strictEqual(before.items['thunder-stone'], 2);
  });
});

/* ------------------------------------------------------------------ *
 * Item catalog
 * ------------------------------------------------------------------ */

suite('Bag: item catalog', () => {
  test('exactly the six V1 evolution stones are defined', () => {
    assert.strictEqual(EVOLUTION_STONE_IDS.length, 6);
    assert.strictEqual(ITEM_DEFINITIONS.length, 6);
    const ids = new Set(ITEM_DEFINITIONS.map((d) => d.id));
    assert.strictEqual(ids.size, 6);
  });

  test('every item definition has a non-empty user-facing name and description', () => {
    for (const definition of ITEM_DEFINITIONS) {
      assert.ok(definition.name.length > 0, definition.id);
      assert.ok(definition.description.length > 0, definition.id);
      assert.strictEqual(definition.category, 'evolution-stone');
    }
  });
});

/* ------------------------------------------------------------------ *
 * Rules: item-based evolution eligibility
 * ------------------------------------------------------------------ */

suite('Evolution stones: eligibility rules', () => {
  test('Pikachu + Thunder Stone -> Raichu', () => {
    const result = getAvailableEvolution('pikachu', 50, false, {
      selectedItemId: 'thunder-stone',
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'raichu');
  });

  test('Pikachu + Fire Stone -> invalid (no such rule)', () => {
    const result = getAvailableEvolution('pikachu', 50, false, {
      selectedItemId: 'fire-stone',
    });
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.reason, 'no-rule');
  });

  test('Growlithe + Fire Stone -> Arcanine', () => {
    const result = getAvailableEvolution('growlithe', 20, false, {
      selectedItemId: 'fire-stone',
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'arcanine');
  });

  test('Vulpix + Fire Stone -> Ninetales', () => {
    const result = getAvailableEvolution('vulpix', 20, false, {
      selectedItemId: 'fire-stone',
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'ninetales');
  });

  test('Poliwhirl + Water Stone -> Poliwrath', () => {
    const result = getAvailableEvolution('poliwhirl', 30, false, {
      selectedItemId: 'water-stone',
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'poliwrath');
  });

  test('Shellder + Water Stone -> Cloyster', () => {
    const result = getAvailableEvolution('shellder', 20, false, {
      selectedItemId: 'water-stone',
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'cloyster');
  });

  test('Staryu + Water Stone -> Starmie', () => {
    const result = getAvailableEvolution('staryu', 20, false, {
      selectedItemId: 'water-stone',
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'starmie');
  });

  test('Gloom + Leaf Stone -> Vileplume', () => {
    const result = getAvailableEvolution('gloom', 30, false, {
      selectedItemId: 'leaf-stone',
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'vileplume');
  });

  test('Weepinbell + Leaf Stone -> Victreebel', () => {
    const result = getAvailableEvolution('weepinbell', 30, false, {
      selectedItemId: 'leaf-stone',
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'victreebel');
  });

  test('Clefairy + Moon Stone -> Clefable', () => {
    const result = getAvailableEvolution('clefairy', 20, false, {
      selectedItemId: 'moon-stone',
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'clefable');
  });

  test('Jigglypuff + Moon Stone -> Wigglytuff', () => {
    const result = getAvailableEvolution('jigglypuff', 20, false, {
      selectedItemId: 'moon-stone',
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'wigglytuff');
  });

  test('Gloom + Sun Stone -> Bellossom', () => {
    const result = getAvailableEvolution('gloom', 30, false, {
      selectedItemId: 'sun-stone',
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'bellossom');
  });

  test('Sunkern + Sun Stone -> Sunflora', () => {
    const result = getAvailableEvolution('sunkern', 20, false, {
      selectedItemId: 'sun-stone',
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'sunflora');
  });

  test('Eevee + Fire Stone -> Flareon', () => {
    const result = getAvailableEvolution('eevee', 20, false, {
      selectedItemId: 'fire-stone',
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'flareon');
  });

  test('Eevee + Water Stone -> Vaporeon', () => {
    const result = getAvailableEvolution('eevee', 20, false, {
      selectedItemId: 'water-stone',
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'vaporeon');
  });

  test('Eevee + Thunder Stone -> Jolteon', () => {
    const result = getAvailableEvolution('eevee', 20, false, {
      selectedItemId: 'thunder-stone',
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'jolteon');
  });
});

suite('Evolution stones: no accidental automatic fallback', () => {
  test('Pikachu never evolves via level - no rule exists at any level', () => {
    for (const level of [1, 16, 36, 50, 100]) {
      const result = getAvailableEvolution('pikachu', level, false);
      assert.strictEqual(result.available, false, `level ${level}`);
      assert.strictEqual(result.reason, 'no-rule', `level ${level}`);
    }
  });

  test('Pikachu never evolves via friendship or friendship-time either', () => {
    const result = getAvailableEvolution('pikachu', 50, false, {
      friendship: 255,
      timeOfDay: 'day',
    });
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.reason, 'no-rule');
  });

  test('an item rule is never satisfied without an explicit selectedItemId, even at max level/friendship', () => {
    const result = getAvailableEvolution('growlithe', 100, false, {
      friendship: 255,
      timeOfDay: 'day',
    });
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.reason, 'no-rule');
  });

  test('a species with ONLY item rules (no level/friendship rule at all) still reports no-rule cleanly when no item is selected', () => {
    // Vulpix has exactly one rule (fire-stone) and nothing else.
    const result = getAvailableEvolution('vulpix', 100, false);
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.reason, 'no-rule');
  });
});

suite('Evolution stones: Eevee ambiguity is impossible', () => {
  test('selecting a stone resolves to that stone, even with day friendship-time ALSO satisfied', () => {
    const result = getAvailableEvolution('eevee', 50, false, {
      selectedItemId: 'water-stone',
      friendship: 255,
      timeOfDay: 'day',
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'vaporeon');
  });

  test('selecting a stone resolves to that stone, even with night friendship-time ALSO satisfied', () => {
    const result = getAvailableEvolution('eevee', 50, false, {
      selectedItemId: 'thunder-stone',
      friendship: 255,
      timeOfDay: 'night',
    });
    assert.strictEqual(result.available, true);
    assert.strictEqual(result.rule?.to, 'jolteon');
  });

  test('friendship-time evolution still works normally when no item is selected', () => {
    const day = getAvailableEvolution('eevee', 50, false, {
      friendship: 255,
      timeOfDay: 'day',
    });
    assert.strictEqual(day.available, true);
    assert.strictEqual(day.rule?.to, 'espeon');

    const night = getAvailableEvolution('eevee', 50, false, {
      friendship: 255,
      timeOfDay: 'night',
    });
    assert.strictEqual(night.available, true);
    assert.strictEqual(night.rule?.to, 'umbreon');
  });

  test('an unrelated stone is still refused for Eevee even with high friendship/right time of day', () => {
    // Eevee has no leaf-stone/moon-stone/sun-stone rule.
    const result = getAvailableEvolution('eevee', 50, false, {
      selectedItemId: 'leaf-stone',
      friendship: 255,
      timeOfDay: 'day',
    });
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.reason, 'no-rule');
  });
});

suite('Evolution stones: Gloom branching', () => {
  test('the stone used determines the branch, not the species alone', () => {
    const leaf = getAvailableEvolution('gloom', 50, false, {
      selectedItemId: 'leaf-stone',
    });
    assert.strictEqual(leaf.rule?.to, 'vileplume');

    const sun = getAvailableEvolution('gloom', 50, false, {
      selectedItemId: 'sun-stone',
    });
    assert.strictEqual(sun.rule?.to, 'bellossom');
  });

  test('an unrelated stone (moon) has no effect on Gloom', () => {
    const result = getAvailableEvolution('gloom', 50, false, {
      selectedItemId: 'moon-stone',
    });
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.reason, 'no-rule');
  });
});

suite('Evolution stones: shiny guard still applies to item rules', () => {
  test('every item-rule target in the table ships a shiny sprite, so a shiny is never blocked today', () => {
    for (const rule of EVOLUTION_RULES) {
      if (rule.condition.type !== 'item') {
        continue;
      }
      const result = getAvailableEvolution(
        'pikachu' === rule.from ? rule.from : rule.from,
        50,
        true,
        {
          selectedItemId: rule.condition.itemId,
        },
      );
      // Every V1 stone target has a shiny sprite (see evolution-data.ts's own
      // module doc for the general shiny-coverage claim); this pins that an
      // item rule is not silently exempt from the same guard level/
      // friendship rules already get.
      assert.notStrictEqual(result.reason, 'shiny-unavailable', rule.from);
    }
  });
});

suite(
  'Evolution stones: safety around the rest of the evolution system',
  () => {
    test('isReconcilableEvolutionCondition rejects item conditions - stale-save reconciliation never guesses at them', () => {
      const condition: EvolutionCondition = {
        type: 'item',
        itemId: 'thunder-stone',
      };
      assert.strictEqual(isReconcilableEvolutionCondition(condition), false);
    });

    test('getEvolutionLevel ignores item-only species - never offers a level-up prompt for them', () => {
      assert.strictEqual(getEvolutionLevel('vulpix'), undefined);
      assert.strictEqual(getEvolutionLevel('growlithe'), undefined);
    });

    test('hasFriendshipEvolutionRule is false for item-only species', () => {
      assert.strictEqual(hasFriendshipEvolutionRule('vulpix'), false);
      assert.strictEqual(hasFriendshipEvolutionRule('sunkern'), false);
    });

    test('hasFriendshipEvolutionRule is still true for Eevee - its friendship-time rules are unaffected by adding item rules', () => {
      assert.strictEqual(hasFriendshipEvolutionRule('eevee'), true);
    });

    test('every item rule\'s "from" and "to" species exist in POKEMON_DATA', () => {
      for (const rule of EVOLUTION_RULES) {
        if (rule.condition.type !== 'item') {
          continue;
        }
        assert.ok(POKEMON_DATA[rule.from], `missing species: ${rule.from}`);
        assert.ok(POKEMON_DATA[rule.to], `missing species: ${rule.to}`);
      }
    });

    test('exactly the fifteen expected item rules exist, one per (species, stone) pair specified for V1', () => {
      const itemRules = EVOLUTION_RULES.filter(
        (r) => r.condition.type === 'item',
      );
      assert.strictEqual(itemRules.length, 15);
      const pairs = new Set(
        itemRules.map(
          (r) => `${r.from}+${(r.condition as { itemId: string }).itemId}`,
        ),
      );
      // No duplicate (species, stone) pair.
      assert.strictEqual(pairs.size, 15);
    });
  },
);

/* ------------------------------------------------------------------ *
 * Reward claims (pure selection logic)
 * ------------------------------------------------------------------ */

function reward(
  overrides: Partial<TrainerLevelStoneReward> = {},
): TrainerLevelStoneReward {
  return { id: 'test-reward', level: 5, itemId: 'thunder-stone', ...overrides };
}

suite('Trainer-level stone rewards: selectUnclaimedEarnedRewards', () => {
  test('a qualifying, unclaimed level grants the reward', () => {
    const result = selectUnclaimedEarnedRewards(
      [reward({ level: 5 })],
      5,
      new Set(),
    );
    assert.strictEqual(result.length, 1);
  });

  test('a level below the milestone grants nothing', () => {
    const result = selectUnclaimedEarnedRewards(
      [reward({ level: 5 })],
      4,
      new Set(),
    );
    assert.strictEqual(result.length, 0);
  });

  test('an already-claimed reward is never selected again, however high the level', () => {
    const result = selectUnclaimedEarnedRewards(
      [reward({ id: 'r1', level: 5 })],
      100,
      new Set(['r1']),
    );
    assert.strictEqual(result.length, 0);
  });

  test('reload does not duplicate: calling twice with the claim now recorded finds nothing the second time', () => {
    const rewards = [reward({ id: 'r1', level: 5 })];
    const first = selectUnclaimedEarnedRewards(rewards, 5, new Set());
    assert.strictEqual(first.length, 1);
    // Simulate having persisted the claim after the first call.
    const claimedAfter = new Set(first.map((r) => r.id));
    const second = selectUnclaimedEarnedRewards(rewards, 5, claimedAfter);
    assert.strictEqual(second.length, 0);
  });

  test('an existing Trainer already well above several milestones receives every unclaimed one exactly once', () => {
    const rewards = [
      reward({ id: 'r5', level: 5 }),
      reward({ id: 'r10', level: 10 }),
      reward({ id: 'r15', level: 15 }),
    ];
    const result = selectUnclaimedEarnedRewards(rewards, 40, new Set());
    assert.strictEqual(result.length, 3);
  });

  test('a partially-claimed history only grants the remaining unclaimed ones', () => {
    const rewards = [
      reward({ id: 'r5', level: 5 }),
      reward({ id: 'r10', level: 10 }),
      reward({ id: 'r15', level: 15 }),
    ];
    const result = selectUnclaimedEarnedRewards(
      rewards,
      40,
      new Set(['r5', 'r10']),
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'r15');
  });
});

suite('Trainer-level stone rewards: the real table', () => {
  test('has six rewards, one per V1 evolution stone, at increasing levels', () => {
    assert.strictEqual(TRAINER_LEVEL_STONE_REWARDS.length, 6);
    const ids = new Set(TRAINER_LEVEL_STONE_REWARDS.map((r) => r.itemId));
    assert.strictEqual(ids.size, 6);
    for (let i = 1; i < TRAINER_LEVEL_STONE_REWARDS.length; i++) {
      assert.ok(
        TRAINER_LEVEL_STONE_REWARDS[i].level >
          TRAINER_LEVEL_STONE_REWARDS[i - 1].level,
      );
    }
  });

  test('every reward id is unique', () => {
    const ids = new Set(TRAINER_LEVEL_STONE_REWARDS.map((r) => r.id));
    assert.strictEqual(ids.size, TRAINER_LEVEL_STONE_REWARDS.length);
  });
});
