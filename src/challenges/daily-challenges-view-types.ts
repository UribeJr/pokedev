/**
 * The Daily Challenges Explorer view model.
 *
 * Imported by both the extension host and the Explorer webview bundle, so -
 * same constraint as `trainer/explorer-types.ts` - this stays free of
 * `vscode` imports and DOM references. `toDailyChallengesViewModel` is pure
 * for the same reason the rest of `src/challenges/` is: it is exercised
 * directly in unit tests without a webview or a VS Code host.
 */
import { DailyChallengeState } from './daily-challenge-types';

export interface DailyChallengeRowView {
  category: 'coding' | 'git' | 'training' | 'wildcard';
  title: string;
  description: string;
  target: number;
  progress: number;
  rewardTrainerXp: number;
  completed: boolean;
}

export interface DailyChallengesLabels {
  /** Compact header above the list, e.g. "TODAY". */
  todayLabel: string;
  /** Shown on a finished row, e.g. "COMPLETE". */
  completeLabel: string;
  /** "+25" is built by the view; this is the trailing unit, e.g. "XP". */
  xpLabel: string;
  /** Footer note, e.g. "New challenges tomorrow." */
  resetLabel: string;
  /** Shown before today's set has finished generating. */
  loadingLabel: string;
  /** Shown if generation could not produce anything, so the view never
   * renders blank. */
  errorLabel: string;
}

export type DailyChallengesStatus = 'ready' | 'loading' | 'error';

export interface DailyChallengesViewModel {
  status: DailyChallengesStatus;
  dateKey: string;
  completedCount: number;
  totalCount: number;
  challenges: DailyChallengeRowView[];
  labels: DailyChallengesLabels;
}

/** Maps persisted state to what the compact view actually renders. Never
 * looks the catalog back up - every instance already carries everything it
 * needs to display, by design (see `daily-challenge-types.ts`). */
export function toDailyChallengesViewModel(
  state: DailyChallengeState,
  labels: DailyChallengesLabels,
): DailyChallengesViewModel {
  const challenges: DailyChallengeRowView[] = state.challenges.map(
    (instance) => ({
      category: instance.category,
      title: instance.title,
      description: instance.description,
      target: instance.target,
      progress: instance.progress,
      rewardTrainerXp: instance.rewardTrainerXp,
      completed: instance.completed,
    }),
  );

  return {
    status: 'ready',
    dateKey: state.dateKey,
    completedCount: challenges.filter((c) => c.completed).length,
    totalCount: challenges.length,
    challenges,
    labels,
  };
}

export function buildLoadingViewModel(
  labels: DailyChallengesLabels,
): DailyChallengesViewModel {
  return {
    status: 'loading',
    dateKey: '',
    completedCount: 0,
    totalCount: 0,
    challenges: [],
    labels,
  };
}

export function buildErrorViewModel(
  labels: DailyChallengesLabels,
): DailyChallengesViewModel {
  return {
    status: 'error',
    dateKey: '',
    completedCount: 0,
    totalCount: 0,
    challenges: [],
    labels,
  };
}
