/**
 * EXP Share: the one place that decides which Pokemon receives how much XP
 * from a single base award.
 *
 * Every activity listener (saves, git commits, tasks, the coding ticker)
 * already funnels into `ProgressionService.applyEvent`, which is the single
 * writer of progression. This module is that writer's one source of truth
 * for splitting `event.pokemonXp` across the party, so EXP Share never has to
 * be recomputed - or drift - per listener.
 *
 * Pure: no `vscode`, no DOM.
 */

/** Fixed share fraction for this milestone. Not user-configurable yet. */
export const EXP_SHARE_FRACTION = 0.5;

/**
 * The minimal shape this module needs from a party member.
 *
 * Deliberately narrower than `PartnerIdentity` (`src/extension/trainer-partner.ts`)
 * so this file stays free of a `vscode` import. Nickname is this extension's
 * existing instance identity - it is what separates two Pokemon of the same
 * species, exactly as progression storage already keys on it.
 */
export interface PartyMember {
  nickname: string;
}

/** One Pokemon's share of a base XP award. */
export interface PokemonXpGrant {
  nickname: string;
  amount: number;
  isPartner: boolean;
}

export interface DistributePokemonXpParams {
  /** The full award a single activity event grants, before any sharing. */
  baseXp: number;
  /** Undefined when nobody has a partner yet - nothing is distributed. */
  partnerNickname: string | undefined;
  /** The active party: every Pokemon a shared award can reach, partner included. */
  party: readonly PartyMember[];
  expShareEnabled: boolean;
}

/**
 * Splits one base Pokemon XP award across the partner and, when EXP Share is
 * on, the rest of the active party.
 *
 * The partner always receives the full `baseXp`, exactly once - `party`
 * ordinarily includes the partner too, but this never pays them twice.
 * EXP Share does not divide that award; it grants ADDITIONAL XP on top, to
 * every other active party member, of `Math.floor(baseXp * EXP_SHARE_FRACTION)`.
 * There is no artificial minimum: a small enough award rounds down to 0, in
 * which case that member is left out of the result entirely rather than
 * granted a token amount.
 */
export function distributePokemonXp(
  params: DistributePokemonXpParams,
): PokemonXpGrant[] {
  const { baseXp, partnerNickname, party, expShareEnabled } = params;
  if (!isFinite(baseXp) || baseXp <= 0 || !partnerNickname) {
    return [];
  }

  const grants: PokemonXpGrant[] = [
    { nickname: partnerNickname, amount: Math.floor(baseXp), isPartner: true },
  ];

  if (!expShareEnabled) {
    return grants;
  }

  const sharedAmount = Math.floor(baseXp * EXP_SHARE_FRACTION);
  if (sharedAmount <= 0) {
    return grants;
  }

  for (const member of party) {
    if (member.nickname === partnerNickname) {
      continue;
    }
    grants.push({
      nickname: member.nickname,
      amount: sharedAmount,
      isPartner: false,
    });
  }

  return grants;
}
