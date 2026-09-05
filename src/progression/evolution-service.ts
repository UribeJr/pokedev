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
import { TimeOfDay } from './time-of-day';

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
  | 'friendship-too-low'
  | 'wrong-time-of-day'
  | 'species-unavailable'
  | 'shiny-unavailable';

export interface EvolutionAvailability {
  available: boolean;
  rule?: EvolutionRule;
  reason?: EvolutionBlockedReason;
  /** Level the species needs to reach, when a rule exists but is unmet. */
  requiredLevel?: number;
  /** Friendship the species needs to reach, when a `friendship`/
   * `friendship-time` rule exists but is unmet. */
  requiredFriendship?: number;
  /** The time of day a `friendship-time` rule requires, when friendship is
   * already sufficient but the clock is not. */
  requiredTimeOfDay?: TimeOfDay;
}

/**
 * What the live/host side already knows about the Pokemon that a
 * `friendship`/`friendship-time` rule needs to evaluate.
 *
 * Optional and defaulted to "never eligible" (0 friendship, no time
 * context) rather than required, so every EXISTING call site that only ever
 * dealt with `level` rules keeps compiling and behaving identically -
 * `reconcileEntryEvolutions`'s internal call in particular only ever reaches
 * a `level` rule (see its own doc comment), so it is correct to never pass
 * this at all.
 */
export interface EvolutionEligibilityContext {
  friendship?: number;
  timeOfDay?: TimeOfDay;
}

/**
 * Index built once at module load: this table is read on every level-up.
 *
 * A species maps to an ARRAY, not a single rule, because one species can
 * have more than one mutually-exclusive evolution path - Eevee's Espeon/
 * Umbreon split by time of day is the only current example, but the shape
 * exists generally so a future stone/trade split does not need another
 * rework of this file.
 */
const RULES_BY_SPECIES: Record<string, EvolutionRule[]> = {};
for (const rule of EVOLUTION_RULES) {
  const existing = RULES_BY_SPECIES[rule.from];
  if (existing) {
    existing.push(rule);
  } else {
    RULES_BY_SPECIES[rule.from] = [rule];
  }
}

/** Every rule for a species, regardless of whether any condition is met. */
export function getEvolutionRules(species: PokemonType): EvolutionRule[] {
  return RULES_BY_SPECIES[species] ?? [];
}

/**
 * Whether `species` at `level`/`friendship`/`timeOfDay` can evolve right now.
 *
 * `shiny` matters: a shiny Pokemon whose evolved form ships no shiny sprite is
 * reported as blocked rather than evolved into a default-coloured one.
 * Silently dropping shininess would destroy something the user is very likely
 * to care about, and the sprite would 404 besides. Every target in the V1
 * table does have a shiny sprite, so this guard is defensive.
 *
 * When a species has more than one rule (Eevee), each is checked in turn and
 * the first one whose condition is actually satisfied wins - so Eevee
 * resolves to whichever of Espeon/Umbreon matches the CURRENT time of day,
 * never both, never at random. If none is currently satisfied, the reason
 * reported is whichever rule was checked last; for every rule in this table
 * today, sibling rules for one species share the same `minFriendship`, so
 * the rejection reason is equivalent regardless of which one is reported.
 */
export function getAvailableEvolution(
  species: PokemonType,
  level: number,
  shiny: boolean,
  context: EvolutionEligibilityContext = {},
): EvolutionAvailability {
  const rules = RULES_BY_SPECIES[species];
  if (!rules || rules.length === 0) {
    return { available: false, reason: 'no-rule' };
  }

  let lastResult: EvolutionAvailability | undefined;
  for (const rule of rules) {
    const result = evaluateRule(rule, level, shiny, context);
    if (result.available) {
      return result;
    }
    lastResult = result;
  }
  // Every rule was checked; `rules.length > 0` guarantees this is defined.
  return lastResult as EvolutionAvailability;
}

function evaluateRule(
  rule: EvolutionRule,
  level: number,
  shiny: boolean,
  context: EvolutionEligibilityContext,
): EvolutionAvailability {
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

    case 'friendship': {
      const friendship = context.friendship ?? 0;
      if (friendship < rule.condition.minFriendship) {
        return {
          available: false,
          rule,
          reason: 'friendship-too-low',
          requiredFriendship: rule.condition.minFriendship,
        };
      }
      return {
        available: true,
        rule,
        requiredFriendship: rule.condition.minFriendship,
      };
    }

    case 'friendship-time': {
      const friendship = context.friendship ?? 0;
      if (friendship < rule.condition.minFriendship) {
        return {
          available: false,
          rule,
          reason: 'friendship-too-low',
          requiredFriendship: rule.condition.minFriendship,
        };
      }
      if (context.timeOfDay !== rule.condition.time) {
        return {
          available: false,
          rule,
          reason: 'wrong-time-of-day',
          requiredFriendship: rule.condition.minFriendship,
          requiredTimeOfDay: rule.condition.time,
        };
      }
      return {
        available: true,
        rule,
        requiredFriendship: rule.condition.minFriendship,
        requiredTimeOfDay: rule.condition.time,
      };
    }
  }
}

/**
 * The level at which `species` would next be able to evolve, if ever.
 *
 * Used to decide whether a level-up has just crossed an evolution threshold.
 * `undefined` both for a species with no rule at all and for one whose only
 * rule(s) are friendship-based - a level-up is never the right moment to
 * check those; see `ProgressionService`'s friendship-driven check instead.
 */
export function getEvolutionLevel(species: PokemonType): number | undefined {
  const rules = RULES_BY_SPECIES[species];
  const levelRule = rules?.find((rule) => rule.condition.type === 'level');
  return levelRule?.condition.type === 'level'
    ? levelRule.condition.level
    : undefined;
}

/** Whether `species` has at least one friendship-based (with or without a
 * time-of-day requirement) evolution rule. Lets callers cheaply skip the
 * friendship-evolution check for the vast majority of species that have
 * none, mirroring how `getEvolutionLevel` lets the level-up path skip
 * species with no level rule. */
export function hasFriendshipEvolutionRule(species: PokemonType): boolean {
  const rules = RULES_BY_SPECIES[species];
  return (
    rules?.some(
      (rule) =>
        rule.condition.type === 'friendship' ||
        rule.condition.type === 'friendship-time',
    ) ?? false
  );
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
    // A species with more than one rule (Eevee) never has a reconcilable one -
    // friendship/friendship-time conditions always fail
    // `isReconcilableEvolutionCondition` - so finding the first reconcilable
    // rule here is equivalent to finding THE rule for every species that
    // actually reaches this point.
    const rule = RULES_BY_SPECIES[species]?.find((candidate) =>
      isReconcilableEvolutionCondition(candidate.condition),
    );
    if (!rule) {
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
