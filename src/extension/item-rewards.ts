/**
 * The Bag's one real (non-debug) acquisition path: an evolution stone at
 * each of a handful of Trainer-level milestones.
 *
 * Deliberately the simplest possible design - no random drops, no shop, no
 * currency - a fixed level -> item table, granted at most once each. Levels
 * are spaced against the real Trainer XP curve (`trainer-profile.ts`:
 * 100/150/225/325/450/600 XP per level, rising) so they land across a normal
 * early/mid play session rather than a burst at the very start or a wall
 * nobody reaches.
 */
import * as vscode from 'vscode';
import { EvolutionStoneId } from '../common/items';
import {
  addItem,
  markItemRewardClaimed,
  readClaimedItemRewards,
} from './inventory-storage';

export interface TrainerLevelStoneReward {
  /** Persisted in `CLAIMED_ITEM_REWARDS_KEY` - stable forever once shipped;
   * never reuse or repurpose an id even if the table's levels/items change
   * later, or an already-claimed reward could look unclaimed again. */
  id: string;
  level: number;
  itemId: EvolutionStoneId;
}

export const TRAINER_LEVEL_STONE_REWARDS: readonly TrainerLevelStoneReward[] = [
  { id: 'trainer-level-5-thunder-stone', level: 5, itemId: 'thunder-stone' },
  { id: 'trainer-level-10-fire-stone', level: 10, itemId: 'fire-stone' },
  { id: 'trainer-level-15-water-stone', level: 15, itemId: 'water-stone' },
  { id: 'trainer-level-20-leaf-stone', level: 20, itemId: 'leaf-stone' },
  { id: 'trainer-level-25-moon-stone', level: 25, itemId: 'moon-stone' },
  { id: 'trainer-level-30-sun-stone', level: 30, itemId: 'sun-stone' },
];

/**
 * Pure: which of `rewards` `trainerLevel` qualifies for and `claimed` does
 * not already contain. Kept separate from the `vscode`-touching grant loop
 * below so the "grant once, never again, regardless of how far past the
 * milestone the Trainer already is" behaviour is directly unit-testable
 * without a fake `ExtensionContext`.
 */
export function selectUnclaimedEarnedRewards(
  rewards: readonly TrainerLevelStoneReward[],
  trainerLevel: number,
  claimed: ReadonlySet<string>,
): TrainerLevelStoneReward[] {
  return rewards.filter(
    (reward) => trainerLevel >= reward.level && !claimed.has(reward.id),
  );
}

/**
 * Grants every Trainer-level milestone stone `trainerLevel` already
 * qualifies for and has not yet claimed, and returns which item ids were
 * newly granted (for the caller's own feedback message, if any).
 *
 * Safe to call after every Trainer XP grant and on every activation:
 * `markItemRewardClaimed` persists the claim BEFORE this ever grants the
 * item, so a Trainer already well above a milestone level - an existing user
 * the moment this feature ships, or one whose single XP grant crosses
 * several milestones at once - receives each unclaimed reward exactly once,
 * never on a later call for the same reward id.
 */
export async function grantEarnedTrainerLevelStoneRewards(
  context: vscode.ExtensionContext,
  trainerLevel: number,
): Promise<EvolutionStoneId[]> {
  const claimed = readClaimedItemRewards(context);
  const earned = selectUnclaimedEarnedRewards(
    TRAINER_LEVEL_STONE_REWARDS,
    trainerLevel,
    claimed,
  );
  const granted: EvolutionStoneId[] = [];
  for (const reward of earned) {
    await markItemRewardClaimed(context, reward.id);
    await addItem(context, reward.itemId, 1);
    granted.push(reward.itemId);
  }
  return granted;
}
