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
import { hasDistinctNickname } from '../trainer/pokemon-display-name';
import {
  EVOLUTION_RULES,
  EvolutionCondition,
  EvolutionRule,
} from './evolution-data';

/**
 * Whether a rule's condition is one stale-save reconciliation is allowed to
 * apply on its own, with nobody around to confirm it.
 *
 * Only `'level'` today, because that is the only condition
 * `evolution-data.ts` encodes - but written as an explicit check (not
 * "assume everything is level-based") specifically so that adding an item,
 * friendship, trade or any other future condition type automatically
 * excludes it from `reconcileEntryEvolutions` without that function's own
 * logic needing to change.
 */
export function isReconcilableEvolutionCondition(
  condition: EvolutionCondition,
): boolean {
  return condition.type === 'level';
}

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

/* ------------------------------------------------------------------ *
 * Collection-entry mutation
 *
 * Everything below operates on a persistent Pokemon by its STABLE INSTANCE
 * IDENTITY - this extension's `nickname` (see `progression-types.ts`'s doc
 * comment on `PokemonProgress`) plus its current array position - never by
 * species. Evolution changes species; it never changes which entry a caller
 * is talking about.
 * ------------------------------------------------------------------ */

/** The three parallel collection arrays, referenced by their shared index -
 * see `common/storage-keys.ts`. Kept as plain arrays here (not the
 * `PokemonSpecification` class) so this stays free of `vscode`. */
export interface PokemonCollectionArrays {
  types: readonly string[];
  colors: readonly string[];
  names: readonly string[];
}

export interface EvolveCollectionEntryResult {
  types: string[];
  colors: string[];
  names: string[];
  fromSpecies: PokemonType;
  toSpecies: PokemonType;
}

/**
 * Evolves the entry at `index` to `toSpecies`/`toColor`, in place.
 *
 * Pure and total: returns new arrays (never mutates `collection`), preserving
 * every other index untouched. The name at `index` is left completely alone
 * UNLESS it was never actually customized - i.e. it still equals the
 * pre-evolution species, `hasDistinctNickname`'s own definition of "nothing
 * worth showing" - in which case it is carried forward to the new species so
 * an un-nicknamed Pokemon does not silently grow a fake nickname that just
 * happens to read as its old species name. A genuine custom nickname
 * ("Bubbles") is never touched, evolution or not.
 *
 * Returns `undefined` for an out-of-range index rather than throwing - a
 * caller resolving a stale index (the collection shrank since it looked) gets
 * a clear "nothing happened" instead of a crash.
 */
export function evolveCollectionEntry(
  collection: PokemonCollectionArrays,
  index: number,
  toSpecies: PokemonType,
  toColor: PokemonColor,
): EvolveCollectionEntryResult | undefined {
  if (index < 0 || index >= collection.types.length) {
    return undefined;
  }
  const fromSpecies = collection.types[index] as PokemonType;

  const types = collection.types.slice();
  const colors = collection.colors.slice();
  const names = collection.names.slice();

  types[index] = toSpecies;
  colors[index] = toColor;

  const currentName = typeof names[index] === 'string' ? names[index] : '';
  if (!hasDistinctNickname(currentName, fromSpecies)) {
    names[index] = toSpecies;
  }

  return { types, colors, names, fromSpecies, toSpecies };
}

/** What `reconcileEntryEvolutions` needs to know about one collection entry
 * to decide whether it is stale. */
export interface ReconcilableEntry {
  species: PokemonType;
  shiny: boolean;
  level: number;
  /** Mirrors `PokemonProgress.declinedEvolutionAtLevel` - a standing refusal
   * recorded through the normal "Evolve? Not now" prompt must be respected
   * here exactly as it already is in the live level-up flow, so
   * reconciliation can never override a deliberate choice. */
  declinedEvolutionAtLevel?: number;
}

/** One step a stale entry needed to catch up on. */
export interface ReconciledEvolutionStep {
  fromSpecies: PokemonType;
  toSpecies: PokemonType;
}

/**
 * Walks one entry forward through every evolution its CURRENT level already
 * satisfies - almost always zero or one step, occasionally more for a save
 * that sat stale across two thresholds at once (e.g. a Squirtle whose XP
 * already covers both Wartortle and Blastoise).
 *
 * Deliberately conservative:
 *
 *   - stops at the first rule whose condition is not `'level'` - item,
 *     friendship, trade and every other future condition type are left
 *     completely alone, never guessed at;
 *   - stops if a standing decline (`declinedEvolutionAtLevel === level`) was
 *     recorded for the CURRENT species at the CURRENT level - reconciliation
 *     must never override a choice the user already made through the prompt;
 *   - stops if the target has no shiny sprite and this entry is shiny, the
 *     same guard `getAvailableEvolution` already applies live.
 *
 * A decline is only ever checked against the entry's ORIGINAL species: once
 * reconciliation has taken even one step, the Pokemon is no longer the
 * species the decline was recorded against, so later hops in the same chain
 * are never suppressed by it.
 *
 * Pure and bounded (`maxSteps`) so a corrupt or cyclic table could never loop
 * forever - the real table cannot cycle (every rule's `to` is a different
 * species), but nothing here should depend on that being true forever.
 */
export function reconcileEntryEvolutions(
  entry: ReconcilableEntry,
  maxSteps: number = 5,
): ReconciledEvolutionStep[] {
  const steps: ReconciledEvolutionStep[] = [];
  let species = entry.species;

  for (let i = 0; i < maxSteps; i++) {
    const rule = RULES_BY_SPECIES[species];
    if (!rule || !isReconcilableEvolutionCondition(rule.condition)) {
      break;
    }
    if (
      steps.length === 0 &&
      entry.declinedEvolutionAtLevel !== undefined &&
      entry.declinedEvolutionAtLevel === entry.level
    ) {
      break;
    }

    const availability = getAvailableEvolution(
      species,
      entry.level,
      entry.shiny,
    );
    if (!availability.available || !availability.rule) {
      break;
    }

    const target = availability.rule.to;
    steps.push({ fromSpecies: species, toSpecies: target });
    species = target;
  }

  return steps;
}
