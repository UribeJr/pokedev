/**
 * The handcrafted Daily Challenge catalog.
 *
 * Every challenge here rewards an activity PokeDev's existing progression
 * system already tracks reliably - see `daily-challenges-service.ts` for how
 * each `DailyChallengeEventType` is fed from the real `ProgressionService`
 * event stream. Nothing in this file is AI-generated or fetched; it is
 * shipped with the extension and selected locally and deterministically by
 * `daily-challenge-generator.ts`.
 *
 * Tiers exist so an early Trainer sees an easy goal that fits inside a normal
 * session, while a veteran gets something with a little more shape to it -
 * not so PokeDev turns into a grind. `minTrainerLevel: 1` tiers are always the
 * floor: whatever a level 1 Trainer can be shown must be finishable in one
 * ordinary sitting.
 */
import {
  DailyChallengeDefinition,
  DailyChallengeEligibilityContext,
  DevActionRequirement,
} from './daily-challenge-types';

export const DAILY_CHALLENGE_CATALOG: readonly DailyChallengeDefinition[] = [
  /* ------------------------------- coding -------------------------------- */
  {
    id: 'meaningful-saves',
    family: 'coding-saves',
    category: 'coding',
    eventType: 'meaningful-saves',
    title: 'Warm Up',
    description: 'Make 5 meaningful saves',
    tiers: [
      { minTrainerLevel: 1, target: 5, rewardTrainerXp: 20 },
      {
        minTrainerLevel: 10,
        target: 10,
        rewardTrainerXp: 30,
        title: 'In The Zone',
        description: 'Make 10 meaningful saves',
      },
      {
        minTrainerLevel: 25,
        target: 15,
        rewardTrainerXp: 45,
        title: 'Power Saver',
        description: 'Make 15 meaningful saves',
      },
    ],
  },
  {
    id: 'file-hopper',
    family: 'coding-files',
    category: 'coding',
    eventType: 'distinct-files',
    title: 'File Hopper',
    description: 'Make meaningful saves in 3 different files',
    tiers: [
      { minTrainerLevel: 1, target: 3, rewardTrainerXp: 20 },
      {
        minTrainerLevel: 15,
        target: 4,
        rewardTrainerXp: 30,
        title: 'Cross Country',
        description: 'Make meaningful saves in 4 different files',
      },
    ],
  },
  {
    id: 'coding-time',
    family: 'coding-time',
    category: 'coding',
    eventType: 'active-coding-minutes',
    title: 'Deep Work',
    description: 'Accumulate 30 minutes of active coding',
    tiers: [
      { minTrainerLevel: 1, target: 30, rewardTrainerXp: 25 },
      {
        minTrainerLevel: 20,
        target: 60,
        rewardTrainerXp: 40,
        title: 'Long Session',
        description: 'Accumulate 60 minutes of active coding',
      },
    ],
  },

  /* --------------------------------- git ---------------------------------- */
  {
    id: 'git-commits',
    family: 'git-commit-count',
    category: 'git',
    eventType: 'git-commit',
    requiresGit: true,
    title: 'Ship It',
    description: 'Make 1 commit',
    tiers: [
      { minTrainerLevel: 1, target: 1, rewardTrainerXp: 25 },
      {
        minTrainerLevel: 8,
        target: 2,
        rewardTrainerXp: 35,
        title: 'Double Commit',
        description: 'Make 2 commits',
      },
      {
        minTrainerLevel: 20,
        target: 3,
        rewardTrainerXp: 50,
        title: 'Productive Branch',
        description: 'Make 3 commits',
      },
    ],
  },

  /* ------------------------------- training ------------------------------- */
  {
    id: 'partner-training',
    family: 'partner-xp',
    category: 'training',
    eventType: 'partner-xp',
    title: 'Partner Training',
    description: 'Earn 50 EXP with your Partner',
    tiers: [
      { minTrainerLevel: 1, target: 50, rewardTrainerXp: 20 },
      {
        minTrainerLevel: 12,
        target: 100,
        rewardTrainerXp: 35,
        title: 'Serious Training',
        description: 'Earn 100 EXP with your Partner',
      },
      {
        minTrainerLevel: 30,
        target: 200,
        rewardTrainerXp: 55,
        title: 'Bond Beyond Limits',
        description: 'Earn 200 EXP with your Partner',
      },
    ],
  },
  {
    id: 'pokemon-level-up',
    family: 'pokemon-level-up',
    category: 'training',
    eventType: 'pokemon-level-up',
    title: 'Level Up',
    description: 'Gain 1 Pokémon level',
    tiers: [{ minTrainerLevel: 1, target: 1, rewardTrainerXp: 30 }],
  },
  {
    id: 'team-training',
    family: 'distinct-pokemon-xp',
    category: 'training',
    eventType: 'distinct-pokemon-xp',
    title: 'Team Training',
    description: 'Earn EXP with 2 different Pokémon',
    tiers: [
      { minTrainerLevel: 1, target: 2, rewardTrainerXp: 25 },
      {
        minTrainerLevel: 15,
        target: 3,
        rewardTrainerXp: 40,
        title: 'Party Workout',
        description: 'Earn EXP with 3 different Pokémon',
      },
    ],
  },
  {
    id: 'underdog',
    family: 'underdog-xp',
    category: 'training',
    eventType: 'underdog-xp',
    title: 'Underdog',
    description: 'Earn 50 EXP with a Pokémon below Lv. 10',
    tiers: [{ minTrainerLevel: 1, target: 50, rewardTrainerXp: 30 }],
  },

  /* ------------------------------- wildcard -------------------------------- */
  {
    id: 'momentum',
    family: 'trainer-xp-total',
    category: 'wildcard',
    eventType: 'trainer-xp-total',
    title: 'Momentum',
    description: 'Earn 40 Trainer XP from any activity',
    tiers: [
      { minTrainerLevel: 1, target: 40, rewardTrainerXp: 15 },
      {
        minTrainerLevel: 15,
        target: 70,
        rewardTrainerXp: 25,
        title: 'Full Steam',
        description: 'Earn 70 Trainer XP from any activity',
      },
    ],
  },
  {
    id: 'task-runner',
    family: 'task-success',
    category: 'wildcard',
    eventType: 'task-success',
    title: 'Green Light',
    description: 'Finish 1 successful Build or Test task',
    tiers: [
      { minTrainerLevel: 1, target: 1, rewardTrainerXp: 20 },
      {
        minTrainerLevel: 10,
        target: 2,
        rewardTrainerXp: 30,
        title: 'Two For Two',
        description: 'Finish 2 successful Build or Test tasks',
      },
    ],
  },

  /* ------------------------------ dev actions ------------------------------ */
  // Filed under 'coding'/'wildcard' rather than a new category - each of
  // these rewards a coding OUTCOME exactly like the rest of that slot, and a
  // fifth category would mean touching the generator's category-slot logic
  // for no real benefit.
  {
    id: 'build-master',
    family: 'build-success-count',
    category: 'coding',
    eventType: 'build-success',
    requiresDevAction: 'build',
    title: 'Build Master',
    description: 'Complete 2 successful builds',
    tiers: [{ minTrainerLevel: 1, target: 2, rewardTrainerXp: 25 }],
  },
  {
    id: 'test-trainer',
    family: 'test-success-count',
    category: 'coding',
    eventType: 'test-success',
    requiresDevAction: 'test',
    title: 'Test Trainer',
    description: 'Complete 2 successful test runs',
    tiers: [{ minTrainerLevel: 1, target: 2, rewardTrainerXp: 25 }],
  },
  {
    id: 'clean-check',
    family: 'dev-action-clean-count',
    category: 'coding',
    eventType: 'dev-action-clean',
    requiresDevAction: 'clean',
    title: 'Clean Check',
    description: 'Complete 2 successful lint or typecheck actions',
    tiers: [{ minTrainerLevel: 1, target: 2, rewardTrainerXp: 20 }],
  },
  {
    id: 'ship-shape',
    family: 'dev-action-any-count',
    category: 'wildcard',
    eventType: 'dev-action-any',
    requiresDevAction: 'any',
    title: 'Ship Shape',
    description: 'Complete 3 successful Dev Actions',
    tiers: [{ minTrainerLevel: 1, target: 3, rewardTrainerXp: 30 }],
  },
];

/**
 * Whether `definition` can be offered at all given the current environment,
 * independent of which tier it would resolve to.
 *
 * Two event types need the RESOLVED tier's target to judge eligibility
 * (`distinct-pokemon-xp` needs at least that many Pokemon to be possible at
 * all) - those are checked separately in `daily-challenge-generator.ts` once
 * a tier has been picked, not here.
 */
export function isDefinitionEligible(
  definition: DailyChallengeDefinition,
  context: DailyChallengeEligibilityContext,
): boolean {
  if (definition.requiresGit && !context.hasGitRepo) {
    return false;
  }
  if (definition.category === 'training' && context.partyCount <= 0) {
    // Every training challenge needs a partner to earn XP through in the
    // first place - a Trainer with no Pokemon yet cannot make progress on any
    // of them, however low the target.
    return false;
  }
  if (
    definition.eventType === 'underdog-xp' &&
    !context.hasPokemonBelowLevel10
  ) {
    return false;
  }
  if (
    definition.requiresDevAction &&
    !hasDevActionCapability(definition.requiresDevAction, context)
  ) {
    return false;
  }
  return true;
}

function hasDevActionCapability(
  requirement: DevActionRequirement,
  context: DailyChallengeEligibilityContext,
): boolean {
  const caps = context.devActionCapabilities;
  switch (requirement) {
    case 'build':
      return caps.build;
    case 'test':
      return caps.test;
    case 'lint':
      return caps.lint;
    case 'typecheck':
      return caps.typecheck;
    case 'clean':
      return caps.lint || caps.typecheck;
    case 'any':
      return caps.build || caps.test || caps.lint || caps.typecheck;
  }
}
