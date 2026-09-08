/**
 * Pure Bag inventory logic - normalization, adding, and consuming - kept
 * free of `vscode` so it can be unit-tested directly, mirroring this
 * project's existing split between a pure rules module and the thin
 * `vscode`-touching storage glue around it (compare `friendship-rules.ts` /
 * `progression-service.ts`, or `evolution-service.ts` / `evolution-flow.ts`).
 * `src/extension/inventory-storage.ts` is that glue for this module.
 */
import { ItemId, isValidItemId } from '../common/items';

export interface PokedevInventory {
  items: Readonly<Record<string, number>>;
}

export const EMPTY_INVENTORY: PokedevInventory = { items: {} };

/**
 * Normalizes whatever was read from storage into a safe inventory shape.
 * Unknown item ids (a future downgrade, or hand-edited state) are dropped
 * rather than carried forward, so a bad value can never surface as a real
 * Bag entry; a non-finite or negative quantity clamps to 0 rather than being
 * trusted. `undefined`/non-object input (an existing save with no Bag yet)
 * normalizes to an empty inventory - this normalization IS the migration for
 * pre-Bag saves, and is naturally idempotent since every read runs it.
 */
export function normalizeInventory(raw: unknown): PokedevInventory {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { items: {} };
  }
  const rawItems = (raw as { items?: unknown }).items;
  if (!rawItems || typeof rawItems !== 'object' || Array.isArray(rawItems)) {
    return { items: {} };
  }

  const items: Record<string, number> = {};
  for (const [id, value] of Object.entries(
    rawItems as Record<string, unknown>,
  )) {
    if (!isValidItemId(id)) {
      continue;
    }
    const quantity =
      typeof value === 'number' && Number.isFinite(value)
        ? Math.floor(value)
        : 0;
    items[id] = Math.max(0, quantity);
  }
  return { items };
}

/** Missing item means 0 - never `undefined`, never negative. */
export function getItemQuantity(
  inventory: PokedevInventory,
  itemId: ItemId,
): number {
  return inventory.items[itemId] ?? 0;
}

/**
 * Adds `amount` (default 1) of `itemId`. A non-finite or non-positive amount
 * returns the SAME inventory reference unchanged, so a caller can cheaply
 * check `result === inventory` to know nothing happened.
 */
export function addItemToInventory(
  inventory: PokedevInventory,
  itemId: ItemId,
  amount: number = 1,
): PokedevInventory {
  if (!Number.isFinite(amount) || amount <= 0) {
    return inventory;
  }
  return {
    items: {
      ...inventory.items,
      [itemId]: getItemQuantity(inventory, itemId) + Math.floor(amount),
    },
  };
}

export interface ConsumeItemResult {
  inventory: PokedevInventory;
  /** Whether the full `amount` was actually available and subtracted. On
   * `false`, `inventory` is the SAME reference passed in - completely
   * unchanged, never partially decremented. */
  consumed: boolean;
}

/**
 * Consumes exactly `amount` (default 1) of `itemId` if - and only if - at
 * least that much is available. Quantity never goes negative: a request for
 * more than is held changes nothing and reports `consumed: false`, rather
 * than clamping to 0 and silently succeeding.
 */
export function consumeItemFromInventory(
  inventory: PokedevInventory,
  itemId: ItemId,
  amount: number = 1,
): ConsumeItemResult {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { inventory, consumed: false };
  }
  const current = getItemQuantity(inventory, itemId);
  if (current < amount) {
    return { inventory, consumed: false };
  }
  return {
    inventory: {
      items: { ...inventory.items, [itemId]: current - amount },
    },
    consumed: true,
  };
}
