/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Pure rules for in-world activity toasts.
 *
 * Mirrors `reaction-rules.ts`: every tunable (durations, priorities, queue
 * cap, coalescing window, message formatting) lives here so the panel
 * controller and host service stay thin.
 */
import {
  WorldToastEvent,
  WorldToastQueueItem,
  WorldToastType,
  WorldToastVariant,
} from './toast-types';

/* ------------------------------- durations -------------------------------- */

export const TOAST_DURATION_MS: Record<
  WorldToastType,
  Record<WorldToastVariant, number>
> = {
  xp: { normal: 1800, large: 2200 },
  'level-up': { normal: 2800, large: 2800 },
  system: { normal: 2200, large: 2400 },
};

/* -------------------------------- priority --------------------------------- */

/**
 * Higher wins when the queue is full and a low-priority toast must be dropped.
 *
 * Level-up always beats XP. Future encounter/evolution toasts can slot in at
 * `system` priority or above.
 */
export const TOAST_PRIORITY: Record<WorldToastType, number> = {
  'level-up': 3,
  system: 2,
  xp: 0,
};

/** Large XP rewards (e.g. git commits) outrank routine save XP. */
export const TOAST_LARGE_XP_PRIORITY = 1;

export function toastPriority(
  type: WorldToastType,
  variant: WorldToastVariant = 'normal',
): number {
  if (type === 'xp' && variant === 'large') {
    return TOAST_LARGE_XP_PRIORITY;
  }
  return TOAST_PRIORITY[type];
}

export function toastOutranks(
  candidate: WorldToastQueueItem,
  incumbent: WorldToastQueueItem,
): boolean {
  return candidate.priority > incumbent.priority;
}

/* --------------------------------- queue ----------------------------------- */

/** How many toasts may wait behind the one currently playing. */
export const MAX_TOAST_QUEUE = 4;

export function capToastQueue<T>(
  queue: readonly T[],
  max: number = MAX_TOAST_QUEUE,
): T[] {
  return queue.slice(0, max);
}

/**
 * When the queue is full, drop the lowest-priority pending toast to make room.
 */
export function dropLowestPriorityToast(
  queue: readonly WorldToastQueueItem[],
): WorldToastQueueItem[] {
  if (queue.length === 0) {
    return [];
  }
  let lowestIndex = 0;
  for (let i = 1; i < queue.length; i++) {
    if (queue[i].priority < queue[lowestIndex].priority) {
      lowestIndex = i;
    }
  }
  return queue.slice(0, lowestIndex).concat(queue.slice(lowestIndex + 1));
}

/* ------------------------------- coalescing -------------------------------- */

/** Window for merging rapid small XP awards for the same Pokémon. */
export const XP_COALESCE_WINDOW_MS = 1500;

/** Brief wait before showing a buffered XP toast so bursts can merge. */
export const XP_COALESCE_DEBOUNCE_MS = 400;

export interface XpCoalesceBuffer {
  pokemonId: string;
  displayName: string;
  xpAmount: number;
  variant: WorldToastVariant;
  startedAt: number;
}

/**
 * Whether two XP events should merge into one toast.
 *
 * Large rewards (git commits) stay separate; level-up toasts never coalesce.
 */
export function shouldCoalesceXp(
  buffer: XpCoalesceBuffer | undefined,
  event: WorldToastEvent,
  now: number,
): boolean {
  if (!buffer || event.type !== 'xp' || event.xpAmount === undefined) {
    return false;
  }
  if (buffer.pokemonId !== event.pokemonId) {
    return false;
  }
  if (buffer.variant === 'large' || event.variant === 'large') {
    return false;
  }
  return now - buffer.startedAt <= XP_COALESCE_WINDOW_MS;
}

export function mergeXpIntoBuffer(
  buffer: XpCoalesceBuffer,
  event: WorldToastEvent,
): XpCoalesceBuffer {
  return {
    ...buffer,
    xpAmount: buffer.xpAmount + (event.xpAmount ?? 0),
    displayName: event.displayName,
  };
}

export function bufferFromXpEvent(
  event: WorldToastEvent,
  now: number,
): XpCoalesceBuffer {
  return {
    pokemonId: event.pokemonId,
    displayName: event.displayName,
    xpAmount: event.xpAmount ?? 0,
    variant: event.variant ?? 'normal',
    startedAt: now,
  };
}

/* ------------------------------ formatting --------------------------------- */

export function formatXpToastMessage(
  displayName: string,
  xpAmount: number,
): string {
  return `${displayName} gained ${xpAmount} EXP!`;
}

export function formatLevelUpToastMessage(
  displayName: string,
  level: number,
): string {
  return `${displayName} grew to Lv. ${level}!`;
}

/** Display name for world toasts — nickname when set, otherwise species name. */
export function resolvePokemonToastDisplayName(
  nickname: string,
  speciesDisplayName: string,
): string {
  const trimmed = nickname.trim();
  if (trimmed.length === 0) {
    return speciesDisplayName;
  }
  if (trimmed.toLowerCase() === speciesDisplayName.trim().toLowerCase()) {
    return speciesDisplayName;
  }
  return trimmed;
}

export function buildWorldToastQueueItem(
  event: WorldToastEvent,
): WorldToastQueueItem | undefined {
  const variant = event.variant ?? 'normal';

  if (event.type === 'xp') {
    if (event.xpAmount === undefined || event.xpAmount <= 0) {
      return undefined;
    }
    return {
      pokemonId: event.pokemonId,
      type: 'xp',
      message: formatXpToastMessage(event.displayName, event.xpAmount),
      priority: toastPriority('xp', variant),
      durationMs: TOAST_DURATION_MS.xp[variant],
      variant,
    };
  }

  if (event.type === 'level-up') {
    if (event.level === undefined || event.level <= 0) {
      return undefined;
    }
    return {
      pokemonId: event.pokemonId,
      type: 'level-up',
      message: formatLevelUpToastMessage(event.displayName, event.level),
      priority: toastPriority('level-up', variant),
      durationMs: TOAST_DURATION_MS['level-up'][variant],
      variant,
    };
  }

  if (event.type === 'system') {
    const message = event.displayName.trim();
    if (message.length === 0) {
      return undefined;
    }
    return {
      pokemonId: event.pokemonId,
      type: 'system',
      message,
      priority: toastPriority('system', variant),
      durationMs: TOAST_DURATION_MS.system[variant],
      variant,
    };
  }

  return undefined;
}

/**
 * Whether a toast should target a Pokémon currently rendered in the world.
 */
export function shouldShowToastForPokemon(
  visiblePokemonNames: readonly string[],
  pokemonId: string,
): boolean {
  return visiblePokemonNames.indexOf(pokemonId) !== -1;
}

/* ------------------------------- the engine -------------------------------- */

export type ToastSubmitOutcome = 'active' | 'queued' | 'dropped' | 'coalescing';

interface ToastEngineState {
  active?: { item: WorldToastQueueItem; expiresAt: number };
  queue: WorldToastQueueItem[];
  xpBuffer?: XpCoalesceBuffer;
}

/**
 * One Pokémon shows one toast at a time.
 *
 * XP events within `XP_COALESCE_WINDOW_MS` merge before entering the queue.
 * Unlike reactions, higher-priority toasts queue behind the active one so XP
 * always finishes before a level-up message plays.
 */
export class ToastEngine {
  private readonly _state = new Map<string, ToastEngineState>();

  /**
   * Entry point for any toast event from the host.
   *
   * Level-up and system toasts flush a pending XP buffer first so XP always
   * plays before a level-up message.
   */
  public submitEvent(event: WorldToastEvent, now: number): ToastSubmitOutcome {
    if (event.type === 'xp') {
      return this.submitXpEvent(event, now);
    }

    const state = this._state.get(event.pokemonId) ?? { queue: [] };
    if (state.xpBuffer) {
      this._flushXpBuffer(state, now);
      this._state.set(event.pokemonId, state);
    }

    const item = buildWorldToastQueueItem(event);
    if (!item) {
      return 'dropped';
    }
    return this.submit(item, now);
  }

  public submit(item: WorldToastQueueItem, now: number): ToastSubmitOutcome {
    const state = this._state.get(item.pokemonId) ?? { queue: [] };

    if (!state.active) {
      state.active = { item, expiresAt: now + item.durationMs };
      this._state.set(item.pokemonId, state);
      return 'active';
    }

    if (state.queue.length >= MAX_TOAST_QUEUE) {
      const trimmed = dropLowestPriorityToast(state.queue);
      if (
        trimmed.length >= MAX_TOAST_QUEUE &&
        item.priority <= Math.min(...trimmed.map((entry) => entry.priority))
      ) {
        return 'dropped';
      }
      state.queue = capToastQueue([...trimmed, item]);
    } else {
      state.queue = [...state.queue, item];
    }

    this._state.set(item.pokemonId, state);
    return 'queued';
  }

  /**
   * Buffers or immediately queues an XP toast.
   *
   * Returns `coalescing` when the event was absorbed into the buffer and a
   * timer will flush it later.
   */
  public submitXpEvent(
    event: WorldToastEvent,
    now: number,
  ): ToastSubmitOutcome {
    const item = buildWorldToastQueueItem(event);
    if (!item) {
      return 'dropped';
    }

    const state = this._state.get(event.pokemonId) ?? { queue: [] };

    if ((event.variant ?? 'normal') === 'large') {
      if (state.xpBuffer) {
        this._flushXpBuffer(state, now);
        this._state.set(event.pokemonId, state);
      }
      return this.submit(item, now);
    }

    if (shouldCoalesceXp(state.xpBuffer, event, now) && state.xpBuffer) {
      state.xpBuffer = mergeXpIntoBuffer(state.xpBuffer, event);
      this._state.set(event.pokemonId, state);
      return 'coalescing';
    }

    if (state.xpBuffer) {
      this._flushXpBuffer(state, now);
    }

    state.xpBuffer = bufferFromXpEvent(event, now);
    this._state.set(event.pokemonId, state);
    return 'coalescing';
  }

  /** Flushes a buffered XP toast into the queue. */
  public flushCoalesceBuffer(
    pokemonId: string,
    now: number,
  ): WorldToastQueueItem | undefined {
    const state = this._state.get(pokemonId);
    if (!state?.xpBuffer) {
      return undefined;
    }
    this._state.set(pokemonId, state);
    return this._flushXpBuffer(state, now);
  }

  public peekCoalesceBuffer(pokemonId: string): XpCoalesceBuffer | undefined {
    return this._state.get(pokemonId)?.xpBuffer;
  }

  public tick(
    pokemonId: string,
    now: number,
  ): { expired: boolean; next?: WorldToastQueueItem } {
    const state = this._state.get(pokemonId);
    if (!state?.active || now < state.active.expiresAt) {
      return { expired: false };
    }

    if (state.queue.length === 0) {
      state.active = undefined;
      this._state.set(pokemonId, state);
      return { expired: true };
    }

    const [next, ...rest] = state.queue;
    state.queue = rest;
    state.active = { item: next, expiresAt: now + next.durationMs };
    this._state.set(pokemonId, state);
    return { expired: true, next };
  }

  public active(pokemonId: string): WorldToastQueueItem | undefined {
    return this._state.get(pokemonId)?.active?.item;
  }

  public clear(pokemonId: string): void {
    this._state.delete(pokemonId);
  }

  public reset(): void {
    this._state.clear();
  }

  private _flushXpBuffer(
    state: ToastEngineState,
    now: number,
  ): WorldToastQueueItem | undefined {
    const buffer = state.xpBuffer;
    if (!buffer) {
      return undefined;
    }
    state.xpBuffer = undefined;
    const item = buildWorldToastQueueItem({
      pokemonId: buffer.pokemonId,
      type: 'xp',
      displayName: buffer.displayName,
      xpAmount: buffer.xpAmount,
      variant: buffer.variant,
      timestamp: now,
    });
    if (item) {
      this.submit(item, now);
    }
    return item;
  }
}
