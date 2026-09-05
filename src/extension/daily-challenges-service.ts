/**
 * Wires Daily Challenges into the rest of PokeDev.
 *
 * This is the ONLY file that observes real activity for this feature, and it
 * does so by listening to `ProgressionService.onDidApplyProgression` -
 * nothing here re-watches saves, re-detects commits, or re-times coding
 * sessions. Every signal a challenge can advance on is a re-interpretation of
 * an event `ActivityTracker`/`GitActivityTracker` already produced and
 * `ProgressionService` already paid out; this file only decides which
 * challenge, if any, cares about a given event.
 *
 * Responsibilities, in one place because they must stay consistent with each
 * other:
 *
 *   - deciding when the local calendar day has rolled over and regenerating
 *     today's three challenges exactly once for it (`ensureToday`)
 *   - translating progression outcomes into challenge progress
 *     (`_handleOutcome`, `daily-challenge-progress.ts`)
 *   - granting the Trainer XP reward for a challenge exactly once
 *     (`_grantReward` - see the ordering note there)
 *   - the completion toast/celebration, reusing the existing hubs
 */
import * as vscode from 'vscode';
import {
  buildDailySeed,
  generateDailyChallenges,
} from '../challenges/daily-challenge-generator';
import {
  applyDailyChallengeSignal,
  DailyChallengeSignal,
  markRewardsGranted,
} from '../challenges/daily-challenge-progress';
import {
  localDateKey,
  shouldRegenerateDailyChallenges,
} from '../challenges/daily-challenge-date';
import {
  DailyChallengeEligibilityContext,
  DailyChallengeInstance,
  DailyChallengeState,
} from '../challenges/daily-challenge-types';
import { detectDevActionCapabilities } from './dev-action-capabilities';
import { GitActivityTracker } from './git-activity';
import {
  bumpTotalDailyChallengesCompleted,
  readDailyChallengeState,
  writeDailyChallengeState,
} from './daily-challenges-storage';
import { pokedevState } from './pokedev-state';
import { ProgressionOutcome, ProgressionService } from './progression-service';
import { readPokemonProgress } from './progression-storage';
import { reactionHub } from './reaction-service';
import { toastHub } from './toast-service';
import {
  isExpShareEnabled,
  listPartnerCandidates,
  resolvePartnerIdentity,
} from './trainer-partner';
import { readTrainerProfile } from './trainer-storage';

/**
 * How often to check whether the local date has rolled over while Cursor
 * stays open across midnight. Deliberately coarse - a Daily Challenge reset
 * being up to this many minutes late is invisible to anyone not watching the
 * clock, and the window-focus and activity-event checks below catch the
 * common case (someone actually using the editor) far sooner than this ever
 * would.
 */
const DAY_CHECK_INTERVAL_MS = 20 * 60 * 1000;

export class DailyChallengesService implements vscode.Disposable {
  private readonly _disposables: vscode.Disposable[] = [];
  private _dayCheckTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _progression: ProgressionService,
    private readonly _gitTracker: GitActivityTracker,
  ) {}

  /**
   * Starts watching for progress and day-change. Call once, after the Git
   * extension has had a chance to resolve (`extension.ts` awaits
   * `gitTracker.start()` first) so the very first generation of a fresh
   * install or a new day sees accurate Git eligibility rather than a
   * momentary "no repository" false negative.
   */
  public async start(): Promise<void> {
    await this.ensureToday();

    this._disposables.push(
      this._progression.onDidApplyProgression((outcome) => {
        void this._handleOutcome(outcome);
      }),
      // Cheap, low-frequency day-change checks. None of these add a new
      // clock: the interval below is the only new timer, and it is coarse on
      // purpose - see its own doc comment.
      vscode.window.onDidChangeWindowState((state) => {
        if (state.focused) {
          void this.ensureToday();
        }
      }),
    );
    this._dayCheckTimer = setInterval(() => {
      void this.ensureToday();
    }, DAY_CHECK_INTERVAL_MS);
  }

  public dispose(): void {
    if (this._dayCheckTimer !== undefined) {
      clearInterval(this._dayCheckTimer);
      this._dayCheckTimer = undefined;
    }
    for (const disposable of this._disposables) {
      disposable.dispose();
    }
    this._disposables.length = 0;
  }

  /**
   * Returns today's challenges, generating them if the persisted set is
   * missing or dated. A same-day call is always a plain read - this is what
   * guarantees a challenge set is never rerolled mid-day no matter how often
   * (or from how many different triggers) this gets called.
   */
  public async ensureToday(): Promise<DailyChallengeState> {
    const now = Date.now();
    const today = localDateKey(now);
    const existing = readDailyChallengeState(this._context);
    if (existing && !shouldRegenerateDailyChallenges(existing.dateKey, today)) {
      return existing;
    }

    const eligibility = await this._buildEligibilityContext(now);
    const profile = readTrainerProfile(this._context, now);
    // Combines the date with a stable per-install identifier so two
    // different Trainers are not guaranteed the same three challenges, while
    // staying fully local: nothing here depends on GitHub, the network, or
    // any remote profile id.
    const seed = buildDailySeed(today, String(profile.createdAt));

    const state: DailyChallengeState = {
      version: 1,
      dateKey: today,
      seed,
      challenges: generateDailyChallenges(eligibility, seed),
    };
    await writeDailyChallengeState(this._context, state);
    pokedevState.notify('challenges');
    return state;
  }

  private async _buildEligibilityContext(
    now: number,
  ): Promise<DailyChallengeEligibilityContext> {
    // The only awaited step: a one-shot `vscode.tasks.fetchTasks()` scan,
    // never polled and only ever run at generation time - see its own doc
    // comment in `dev-action-capabilities.ts`.
    const devActionCapabilities = await detectDevActionCapabilities();

    const party = listPartnerCandidates(this._context);
    const partner = resolvePartnerIdentity(this._context);
    const expShareEnabled = isExpShareEnabled();

    const hasPokemonBelowLevel10 = party.some((entry) => {
      if (!partner) {
        return false;
      }
      // Only a Pokemon that can actually earn XP right now is a fair
      // "underdog" target - EXP Share off means only the partner qualifies.
      const canEarnXp = entry.nickname === partner.nickname || expShareEnabled;
      if (!canEarnXp) {
        return false;
      }
      return (
        readPokemonProgress(this._context, entry.nickname, entry.species, now)
          .level < 10
      );
    });

    return {
      trainerLevel: readTrainerProfile(this._context, now).trainerLevel,
      hasGitRepo: this._gitTracker.hasRepositories(),
      partyCount: party.length,
      hasPokemonBelowLevel10,
      devActionCapabilities,
    };
  }

  /** Turns one applied progression event into zero or more challenge
   * signals. A single event routinely produces several - a work batch is
   * both a save count and a set of files; a Pokemon XP grant is both an XP
   * amount and, on a level-up, a level-gain signal. */
  private _toSignals(outcome: ProgressionOutcome): DailyChallengeSignal[] {
    const signals: DailyChallengeSignal[] = [];
    const { event } = outcome;

    switch (event.type) {
      case 'work-batch': {
        const fileCount = readMetadataNumber(event.metadata, 'fileCount');
        if (fileCount > 0) {
          signals.push({
            kind: 'meaningful-saves',
            fileCount,
            files: readMetadataStringArray(event.metadata, 'files'),
          });
        }
        break;
      }
      case 'active-coding': {
        const minutes = readMetadataNumber(event.metadata, 'minutes');
        if (minutes > 0) {
          signals.push({ kind: 'active-coding-minutes', minutes });
        }
        break;
      }
      case 'git-commit':
        // `GitActivityTracker` only ever calls `applyEvent` for a HEAD it has
        // not rewarded before (`readRewardedCommits`), so a duplicate commit
        // never reaches here to begin with - nothing further to dedupe.
        signals.push({ kind: 'git-commit' });
        break;
      case 'task-success':
        signals.push({ kind: 'task-success' });
        break;
      case 'build-success':
      case 'test-success':
      case 'typecheck-success':
      case 'lint-success':
        signals.push({ kind: 'dev-action', devActionType: event.type });
        break;
      case 'debug-grant':
        // Debug commands exist to smoke-test progression by hand and are off
        // by default; letting them also complete Daily Challenges would turn
        // every challenge into a one-command freebie whenever they are on.
        return [];
    }

    if (outcome.trainerXpGranted > 0) {
      signals.push({ kind: 'trainer-xp', amount: outcome.trainerXpGranted });
    }

    for (const grant of outcome.pokemonGrants) {
      signals.push({
        kind: 'pokemon-xp',
        nickname: grant.nickname,
        isPartner: grant.isPartner,
        amount: grant.xpGranted,
        levelBefore: grant.levelBefore,
      });
      if (grant.levelUp) {
        signals.push({
          kind: 'pokemon-level-up',
          levelsGained: grant.levelUp.toLevel - grant.levelUp.fromLevel,
        });
      }
    }

    return signals;
  }

  private async _handleOutcome(outcome: ProgressionOutcome): Promise<void> {
    const signals = this._toSignals(outcome);
    if (signals.length === 0) {
      return;
    }

    let state = readDailyChallengeState(this._context);
    if (!state) {
      // Nothing generated yet (a race with the very first `ensureToday()`);
      // the next generation picks up from a clean slate rather than trying
      // to retroactively apply this one event.
      return;
    }

    let changed = false;
    const newlyCompleted: DailyChallengeInstance[] = [];
    for (const signal of signals) {
      const result = applyDailyChallengeSignal(state, signal);
      if (result.state !== state) {
        changed = true;
        state = result.state;
        newlyCompleted.push(...result.newlyCompleted);
      }
    }
    if (!changed) {
      return;
    }

    if (newlyCompleted.length > 0) {
      // Flagged BEFORE the reward is granted, and persisted in the same
      // write as the progress that completed it - see the `rewardGranted`
      // doc comment in `daily-challenge-types.ts` for why that order can
      // only ever cost a reward, never double-grant one.
      state = markRewardsGranted(
        state,
        newlyCompleted.map((challenge) => challenge.definitionId),
      );
    }

    await writeDailyChallengeState(this._context, state);
    pokedevState.notify('challenges');

    if (newlyCompleted.length === 0) {
      return;
    }

    await bumpTotalDailyChallengesCompleted(
      this._context,
      newlyCompleted.length,
    );
    for (const challenge of newlyCompleted) {
      this._celebrateCompletion(challenge);
      await this._progression.grantFlatTrainerXp(challenge.rewardTrainerXp);
    }
  }

  /** Reuses the existing toast/reaction hubs - see the module doc comment.
   * Never awards Partner XP; this is feedback only. */
  private _celebrateCompletion(challenge: DailyChallengeInstance): void {
    const message = vscode.l10n.t(
      'Daily Complete! {0} (+{1} Trainer XP)',
      challenge.title,
      challenge.rewardTrainerXp,
    );
    const partner = resolvePartnerIdentity(this._context);
    if (!partner) {
      // No Pokemon to anchor an in-world toast to; a plain notification is
      // the documented fallback rather than a second toast system.
      void vscode.window.showInformationMessage(message);
      return;
    }
    toastHub.notifySystem(partner.nickname, message, Date.now());
    // The only existing "celebrate" reaction call site - reused as-is rather
    // than inventing a new reaction kind for this one caller.
    reactionHub.notifyCommit(partner.nickname);
  }
}

function readMetadataNumber(
  metadata: Record<string, unknown> | undefined,
  key: string,
): number {
  const value = metadata?.[key];
  return typeof value === 'number' && isFinite(value) ? value : 0;
}

function readMetadataStringArray(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string[] {
  const value = metadata?.[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}
