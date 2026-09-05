/**
 * Turns the catalog into today's three challenges.
 *
 * Pure and total: given the same catalog, the same eligibility context and
 * the same seed, this always returns the same three challenges. That is what
 * lets a Cursor restart on the same day show exactly what was there before
 * without persisting anything beyond the result itself, and what lets
 * `daily-challenges-service.ts` regenerate on a date change without ever
 * consulting `Math.random()`.
 *
 * "Do not reroll mid-day" is enforced entirely by the CALLER: this function is
 * always safe to call again with the same inputs (it returns the same set),
 * but `daily-challenges-service.ts` only ever calls it once per local
 * calendar day, on the transition itself - never in response to a Trainer
 * level-up, a Party change, Git becoming available, or the view reopening.
 * Eligibility is therefore always evaluated at THAT one moment; a definition
 * that becomes eligible an hour later is simply not reconsidered until
 * tomorrow.
 */
import {
  isDefinitionEligible,
  DAILY_CHALLENGE_CATALOG,
} from './daily-challenge-catalog';
import { createSeededRandom, pickWeighted } from './daily-challenge-rng';
import {
  ChallengeCategory,
  ChallengeTier,
  DailyChallengeDefinition,
  DailyChallengeEligibilityContext,
  DailyChallengeInstance,
} from './daily-challenge-types';

/** Exactly this many challenges are generated per day. */
export const DAILY_CHALLENGE_COUNT = 3;

/** The seed a given local date and stable profile identifier produce. */
export function buildDailySeed(dateKey: string, profileSeedId: string): string {
  return `${dateKey}:${profileSeedId}`;
}

interface EligibleOption {
  definition: DailyChallengeDefinition;
  tier: ChallengeTier;
}

/**
 * The highest tier `definition` can actually offer right now, or `undefined`
 * if none can.
 *
 * Tiers are considered from the highest `minTrainerLevel` down. A tier that
 * clears the Trainer-level bar but fails a dynamic check - today only
 * `distinct-pokemon-xp`, which cannot ask for more Pokemon than the party
 * has - is skipped in favour of a lower, still-clearable tier rather than
 * disqualifying the whole definition outright.
 */
function resolveTier(
  definition: DailyChallengeDefinition,
  context: DailyChallengeEligibilityContext,
): ChallengeTier | undefined {
  const sorted = [...definition.tiers].sort(
    (a, b) => a.minTrainerLevel - b.minTrainerLevel,
  );
  for (let i = sorted.length - 1; i >= 0; i--) {
    const tier = sorted[i];
    if (context.trainerLevel < tier.minTrainerLevel) {
      continue;
    }
    if (
      definition.eventType === 'distinct-pokemon-xp' &&
      tier.target > context.partyCount
    ) {
      continue;
    }
    return tier;
  }
  return undefined;
}

function buildEligibleOptions(
  catalog: readonly DailyChallengeDefinition[],
  context: DailyChallengeEligibilityContext,
): EligibleOption[] {
  const options: EligibleOption[] = [];
  for (const definition of catalog) {
    if (!isDefinitionEligible(definition, context)) {
      continue;
    }
    const tier = resolveTier(definition, context);
    if (!tier) {
      continue;
    }
    options.push({ definition, tier });
  }
  return options;
}

function toInstance(option: EligibleOption): DailyChallengeInstance {
  const { definition, tier } = option;
  return {
    definitionId: definition.id,
    family: definition.family,
    category: definition.category,
    eventType: definition.eventType,
    title: tier.title ?? definition.title,
    description: tier.description ?? definition.description,
    target: tier.target,
    progress: 0,
    rewardTrainerXp: tier.rewardTrainerXp,
    completed: false,
    rewardGranted: false,
    uniqueFiles: definition.eventType === 'distinct-files' ? [] : undefined,
    uniquePokemon:
      definition.eventType === 'distinct-pokemon-xp' ? [] : undefined,
  };
}

/**
 * Picks one eligible, not-yet-used-family option from `categories`, marking
 * its family used and appending it to `picked` on success.
 */
function pickFromCategories(
  options: readonly EligibleOption[],
  categories: readonly ChallengeCategory[],
  usedFamilies: Set<string>,
  random: () => number,
  picked: DailyChallengeInstance[],
): boolean {
  const pool = options.filter(
    (option) =>
      categories.indexOf(option.definition.category) !== -1 &&
      !usedFamilies.has(option.definition.family),
  );
  const chosen = pickWeighted(
    pool,
    (option) => option.definition.weight ?? 1,
    random,
  );
  if (!chosen) {
    return false;
  }
  usedFamilies.add(chosen.definition.family);
  picked.push(toInstance(chosen));
  return true;
}

/**
 * Generates today's set.
 *
 * The default shape is one coding challenge, one Pokemon training challenge,
 * and one Git challenge - or, when no Git repository is open (or nothing
 * eligible remains in that slot for any other reason), one wildcard challenge
 * instead. If the environment is thin enough that even that fails (for
 * example: zero Pokemon AND no Git repository), the remaining slots are
 * filled from whatever is still eligible in any category, always respecting
 * the one-per-family rule. May return fewer than `DAILY_CHALLENGE_COUNT`
 * entries only if the catalog itself cannot produce that many distinct
 * families for this context - the caller renders whatever comes back rather
 * than treating a short list as an error.
 */
export function generateDailyChallenges(
  context: DailyChallengeEligibilityContext,
  seed: string,
  catalog: readonly DailyChallengeDefinition[] = DAILY_CHALLENGE_CATALOG,
): DailyChallengeInstance[] {
  const options = buildEligibleOptions(catalog, context);
  const random = createSeededRandom(seed);
  const usedFamilies = new Set<string>();
  const picked: DailyChallengeInstance[] = [];

  pickFromCategories(options, ['coding'], usedFamilies, random, picked);
  pickFromCategories(options, ['training'], usedFamilies, random, picked);
  if (!pickFromCategories(options, ['git'], usedFamilies, random, picked)) {
    pickFromCategories(options, ['wildcard'], usedFamilies, random, picked);
  }

  while (picked.length < DAILY_CHALLENGE_COUNT) {
    const filledMore = pickFromCategories(
      options,
      ['coding', 'training', 'git', 'wildcard'],
      usedFamilies,
      random,
      picked,
    );
    if (!filledMore) {
      break;
    }
  }

  return picked;
}
