/**
 * Localized display strings for Friendship tiers.
 *
 * A standalone leaf module rather than living in `progression-service.ts`:
 * both `pokedev-state.ts` and `trainer-card-panel.ts` need these labels, and
 * `progression-service.ts` itself imports `evolution-flow.ts`, which imports
 * `pokedev-state.ts` - so importing `progression-service.ts` FROM
 * `pokedev-state.ts` would close a require cycle. This file depends on
 * nothing but `vscode` and the pure `friendship-rules.ts`, so every consumer
 * (including `progression-service.ts`, for the tier-up toast) can import it
 * with no cycle risk either way.
 */
import * as vscode from 'vscode';
import {
  FriendshipTierId,
  FRIENDSHIP_TIER_ORDER,
} from '../progression/friendship-rules';

/** Localized display name for a Friendship tier - see
 * `progression/friendship-rules.ts` for the numeric boundaries. */
export function friendshipTierDisplayName(tier: FriendshipTierId): string {
  switch (tier) {
    case 'wary':
      return vscode.l10n.t('Wary');
    case 'friendly':
      return vscode.l10n.t('Friendly');
    case 'close':
      return vscode.l10n.t('Close');
    case 'very-close':
      return vscode.l10n.t('Very Close');
    case 'best-friend':
      return vscode.l10n.t('Best Friend');
  }
}

/** All five Friendship tier names, for the Explorer and Trainer Card label
 * builders (`ExplorerLabels.friendshipTierLabels`/
 * `TrainerCardLabels.friendshipTierLabels`). */
export function buildFriendshipTierLabels(): Record<FriendshipTierId, string> {
  const labels = {} as Record<FriendshipTierId, string>;
  for (const tier of FRIENDSHIP_TIER_ORDER) {
    labels[tier] = friendshipTierDisplayName(tier);
  }
  return labels;
}
