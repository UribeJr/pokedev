/**
 * Evolution lookup.
 *
 * Kept separate from generic Pokemon XP: levelling is a continuous numeric
 * process, evolution is a discrete branch with its own data, its own
 * eligibility rules and its own UX. Mixing them would mean every future
 * condition type (stone, trade, friendship) leaked into the XP path.
 *
 * Pure: no `vscode`, no DOM.
 */
import { POKEMON_DATA } from '../common/pokemon-data';
import { PokemonColor, PokemonType } from '../common/types';
import { EVOLUTION_RULES, EvolutionRule } from './evolution-data';

/** Why a species with a matching rule still cannot evolve right now. */
export type EvolutionBlockedReason =
  | 'no-rule'
  | 'level-too-low'
  | 'species-unavailable'
  | 'shiny-unavailable';

export interface EvolutionAvailability {
  available: boolean;
  rule?: EvolutionRule;
  reason?: EvolutionBlockedReason;
  /** Level the species needs to reach, when a rule exists but is unmet. */
  requiredLevel?: number;
}

/** Index built once at module load: this table is read on every level-up. */
const RULES_BY_SPECIES: Record<string, EvolutionRule> = {};
for (const rule of EVOLUTION_RULES) {
  RULES_BY_SPECIES[rule.from] = rule;
}

/** The rule for a species, regardless of whether its condition is met. */
export function getEvolutionRule(
  species: PokemonType,
): EvolutionRule | undefined {
  return RULES_BY_SPECIES[species];
}

/**
 * Whether `species` at `level` can evolve right now.
 *
 * `shiny` matters: a shiny Pokemon whose evolved form ships no shiny sprite is
 * reported as blocked rather than evolved into a default-coloured one.
 * Silently dropping shininess would destroy something the user is very likely
 * to care about, and the sprite would 404 besides. Every target in the V1
 * table does have a shiny sprite, so this guard is defensive.
 */
export function getAvailableEvolution(
  species: PokemonType,
  level: number,
  shiny: boolean,
): EvolutionAvailability {
  const rule = RULES_BY_SPECIES[species];
  if (!rule) {
    return { available: false, reason: 'no-rule' };
  }

  const target = POKEMON_DATA[rule.to];
  if (!target) {
    // `PokemonType` collapses to `string`, so a target can type-check and
    // still be absent at runtime - POKEMON_DATA is filtered to species that
    // actually ship sprites.
    return { available: false, rule, reason: 'species-unavailable' };
  }

  if (shiny && target.possibleColors.indexOf(PokemonColor.shiny) === -1) {
    return { available: false, rule, reason: 'shiny-unavailable' };
  }

  switch (rule.condition.type) {
    case 'level':
      if (level < rule.condition.level) {
        return {
          available: false,
          rule,
          reason: 'level-too-low',
          requiredLevel: rule.condition.level,
        };
      }
      return { available: true, rule, requiredLevel: rule.condition.level };
  }
}

/**
 * The level at which `species` would next be able to evolve, if ever.
 *
 * Used to decide whether a level-up has just crossed an evolution threshold.
 */
export function getEvolutionLevel(species: PokemonType): number | undefined {
  const rule = RULES_BY_SPECIES[species];
  if (!rule || rule.condition.type !== 'level') {
    return undefined;
  }
  return rule.condition.level;
}
