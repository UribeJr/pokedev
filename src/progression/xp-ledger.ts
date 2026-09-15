/**
 * Anti-farming gate and bounded activity log.
 *
 * Every event passes through `accept()` before any XP is written. Two limits
 * apply, both rolling windows held in memory only:
 *
 *   - an events-per-minute throttle, which is a loop breaker rather than a
 *     balance lever: no amount of real editor activity approaches it, so it
 *     only fires if a listener misbehaves;
 *   - an hourly trainer-XP soft cap with roughly 3.6x headroom over a hard
 *     session, so productive work is never throttled.
 *
 * Both windows are intentionally NOT persisted. Restarting the editor to reset
 * them is far more effort than simply doing the work, and persisting them
 * would mean a write on every event.
 *
 * Pure: no `vscode`, no DOM.
 */
import { ProgressionEvent } from './progression-types';
import {
  MAX_EVENTS_PER_MINUTE,
  MAX_LOGGED_EVENTS,
  MAX_TRAINER_XP_PER_HOUR,
  XP_CAP_WINDOW_MS,
} from './xp-rules';

export type LedgerRejection = 'rate-limited' | 'hourly-cap';

export interface LedgerDecision {
  accepted: boolean;
  reason?: LedgerRejection;
}

interface Stamped {
  timestamp: number;
  trainerXp: number;
}

export class XpLedger {
  /** Accepted events in the last minute and the last hour respectively. */
  private _recent: Stamped[] = [];

  /**
   * Decides whether an event may be paid out.
   *
   * Rejections are silent by design: telling a user "you have been rate
   * limited" for something they cannot see and did not trigger would be
   * alarming and useless.
   */
  public accept(event: ProgressionEvent): LedgerDecision {
    this._prune(event.timestamp);

    const lastMinute = this._recent.filter(
      (entry) => event.timestamp - entry.timestamp < 60_000,
    );
    if (lastMinute.length >= MAX_EVENTS_PER_MINUTE) {
      return { accepted: false, reason: 'rate-limited' };
    }

    const hourlyXp = this._recent.reduce(
      (sum, entry) => sum + entry.trainerXp,
      0,
    );
    if (hourlyXp + event.trainerXp > MAX_TRAINER_XP_PER_HOUR) {
      return { accepted: false, reason: 'hourly-cap' };
    }

    this._recent.push({
      timestamp: event.timestamp,
      trainerXp: event.trainerXp,
    });
    return { accepted: true };
  }

  /** Test seam: forget every window. */
  public reset(): void {
    this._recent = [];
  }

  private _prune(now: number): void {
    this._recent = this._recent.filter(
      (entry) => now - entry.timestamp < XP_CAP_WINDOW_MS,
    );
  }
}

/**
 * Appends to the activity log, keeping only the most recent entries.
 *
 * Pure so the bound is testable without storage. The log has no UI yet; it
 * exists so that future Trainer Card activity, achievements and balancing work
 * have real data to read.
 */
export function appendToLog(
  log: readonly ProgressionEvent[],
  event: ProgressionEvent,
  limit: number = MAX_LOGGED_EVENTS,
): ProgressionEvent[] {
  const next = [event, ...log];
  return next.slice(0, Math.max(0, limit));
}

/** Rebuilds a log from persisted state, discarding anything malformed. */
export function normalizeLog(
  raw: unknown,
  limit: number = MAX_LOGGED_EVENTS,
): ProgressionEvent[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: ProgressionEvent[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (
      typeof record['type'] !== 'string' ||
      typeof record['timestamp'] !== 'number' ||
      typeof record['trainerXp'] !== 'number' ||
      typeof record['pokemonXp'] !== 'number'
    ) {
      continue;
    }
    result.push({
      type: record['type'] as ProgressionEvent['type'],
      timestamp: record['timestamp'],
      trainerXp: record['trainerXp'],
      pokemonXp: record['pokemonXp'],
      metadata: isRecord(record['metadata']) ? record['metadata'] : undefined,
    });
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
