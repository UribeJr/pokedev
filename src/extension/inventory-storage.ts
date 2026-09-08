/**
 * Persistence for the Bag: item quantities, plus the separate one-time
 * "reward already claimed" ledger a Trainer-level milestone (or any future
 * deterministic reward) needs.
 *
 * Thin glue over `progression/inventory-rules.ts`'s pure logic, exactly
 * like `evolution-flow.ts` is thin glue over `evolution-service.ts` - every
 * read normalizes, so an existing user with no Bag yet (or a hand-edited/
 * corrupt record) loads a safe default rather than throwing. No stones are
 * ever granted as part of loading a save - see `item-rewards.ts` for the
 * one deliberate, explicit grant path.
 */
import * as vscode from 'vscode';
import { ItemId } from '../common/items';
import {
  CLAIMED_ITEM_REWARDS_KEY,
  INVENTORY_KEY,
} from '../common/storage-keys';
import {
  addItemToInventory,
  consumeItemFromInventory,
  getItemQuantity as getItemQuantityFromInventory,
  normalizeInventory,
  PokedevInventory,
} from '../progression/inventory-rules';

export type { PokedevInventory };
export const getItemQuantity = getItemQuantityFromInventory;

export function readInventory(
  context: vscode.ExtensionContext,
): PokedevInventory {
  return normalizeInventory(context.globalState.get<unknown>(INVENTORY_KEY));
}

async function writeInventory(
  context: vscode.ExtensionContext,
  inventory: PokedevInventory,
): Promise<void> {
  await context.globalState.update(INVENTORY_KEY, inventory);
}

/** Adds `amount` (default 1) of `itemId`. A non-positive amount is a no-op. */
export async function addItem(
  context: vscode.ExtensionContext,
  itemId: ItemId,
  amount: number = 1,
): Promise<void> {
  const inventory = readInventory(context);
  const next = addItemToInventory(inventory, itemId, amount);
  if (next === inventory) {
    return;
  }
  await writeInventory(context, next);
}

/**
 * Consumes exactly `amount` (default 1) of `itemId` if available; returns
 * whether it actually did.
 *
 * The read, the "is there enough" check, and the computed next state
 * (`consumeItemFromInventory`) are all synchronous -
 * `ExtensionContext.globalState.get` never awaits anything - so nothing can
 * interleave between deciding there is enough and subtracting it. Only the
 * final `writeInventory` call awaits, by which point the decision already
 * happened. This is what keeps a double-click (or any other overlapping
 * call) from consuming the same stone twice: `globalState.get` reflects an
 * `update()` call's new value immediately, before that update's own
 * returned promise resolves, so a second overlapping call's synchronous read
 * already sees the decremented quantity from the first.
 */
export async function consumeItem(
  context: vscode.ExtensionContext,
  itemId: ItemId,
  amount: number = 1,
): Promise<boolean> {
  const { inventory, consumed } = consumeItemFromInventory(
    readInventory(context),
    itemId,
    amount,
  );
  if (!consumed) {
    return false;
  }
  await writeInventory(context, inventory);
  return true;
}

/* ------------------------------------------------------------------ *
 * One-time item reward claims (Trainer-level milestones today)
 * ------------------------------------------------------------------ */

export function readClaimedItemRewards(
  context: vscode.ExtensionContext,
): ReadonlySet<string> {
  const raw = context.globalState.get<unknown>(CLAIMED_ITEM_REWARDS_KEY, []);
  if (!Array.isArray(raw)) {
    return new Set();
  }
  return new Set(raw.filter((id): id is string => typeof id === 'string'));
}

/**
 * Marks `rewardId` claimed. Callers persist this BEFORE granting the actual
 * item - mirrors `daily-challenges-service.ts`'s "write the completion flag,
 * then grant" ordering, so a crash between the two can only under-deliver a
 * reward, never grant the same one twice on a later call.
 */
export async function markItemRewardClaimed(
  context: vscode.ExtensionContext,
  rewardId: string,
): Promise<void> {
  const claimed = readClaimedItemRewards(context);
  if (claimed.has(rewardId)) {
    return;
  }
  await context.globalState.update(CLAIMED_ITEM_REWARDS_KEY, [
    ...claimed,
    rewardId,
  ]);
}
