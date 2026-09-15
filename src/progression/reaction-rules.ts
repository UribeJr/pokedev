/* eslint-disable @typescript-eslint/naming-convention */
/**
 * The entire balance and decision surface of the reaction system.
 *
 * Mirrors the split `xp-rules.ts` / `activity-rules.ts` use for progression:
 * every tunable (symbols, durations, priorities, cooldowns, the queue cap,
 * the bystander odds) lives here so tuning never means hunting through the
 * host service or the panel controller, and every decision is a pure
 * function over plain values so it can be unit tested without `vscode` or a
 * DOM.
 *
 * Nothing here schedules anything or touches state on its own; `ReactionEngine`
 * is the one stateful piece, and it is still pure (a plain `Map`, no timers -
 * callers drive it by passing `now`).
 */
import {
  PokemonReactionQueueItem,
  PokemonReactionType,
} from './reaction-types';

/* -------------------------------- symbols -------------------------------- */

export const REACTION_SYMBOL: Record<PokemonReactionType, string> = {
  notice: '!',
  celebrate: '★',
  confused: '?',
  'level-up': '✦',
  'friendship-up': '♥',
};

/* ------------------------------- durations -------------------------------- */

export const REACTION_DURATION_MS: Record<PokemonReactionType, number> = {
  notice: 1200,
  celebrate: 2500,
  confused: 2000,
  'level-up': 3000,
  'friendship-up': 2500,
};

/* -------------------------------- priority --------------------------------- */

/**
 * Higher wins. LEVEL UP > GIT COMMIT/FRIENDSHIP (celebrate-tier) > CONFUSED >
 * SAVE NOTICE, exactly the order a Pokémon should prefer when more than one
 * reaction wants to play at once. Friendship shares `celebrate`'s tier
 * deliberately - both are "good news" moments of equal weight - rather than
 * outranking or being outranked by a commit reaction.
 */
export const REACTION_PRIORITY: Record<PokemonReactionType, number> = {
  'level-up': 3,
  celebrate: 2,
  'friendship-up': 2,
  confused: 1,
  notice: 0,
};

export function reactionOutranks(
  candidate: PokemonReactionType,
  incumbent: PokemonReactionType,
): boolean {
  return REACTION_PRIORITY[candidate] > REACTION_PRIORITY[incumbent];
}

/* -------------------------------- cooldowns -------------------------------- */

/** Minimum gap between two save reactions for the same Pokémon. */
export const SAVE_REACTION_COOLDOWN_MS = 4000;

/** Minimum gap between two failure reactions for the same task name. */
export const TASK_FAILURE_REACTION_COOLDOWN_MS = 3000;

/**
 * Whether enough time has passed since the last reaction of this kind.
 *
 * Shared shape with `shouldAwardBatch` in `activity-rules.ts` deliberately -
 * same question, same answer, applied to a different clock.
 */
export function shouldReactAgain(
  lastAt: number | undefined,
  now: number,
  cooldownMs: number,
): boolean {
  if (lastAt === undefined) {
    return true;
  }
  return now - lastAt >= cooldownMs;
}

/* --------------------------------- queue ----------------------------------- */

/** How many reactions may wait behind the one currently playing. */
export const MAX_REACTION_QUEUE = 3;

export function capReactionQueue<T>(
  queue: readonly T[],
  max: number = MAX_REACTION_QUEUE,
): T[] {
  return queue.slice(0, max);
}

/** Odds a non-target, currently-visible Pokémon also reacts to a commit. */
export const BYSTANDER_REACTION_CHANCE = 0.25;

/** `roll` is caller-supplied (usually `Math.random()`) so this stays pure. */
export function shouldBystanderReact(
  roll: number,
  chance: number = BYSTANDER_REACTION_CHANCE,
): boolean {
  return roll < chance;
}

/**
 * Picks which Pokémon a reaction event should actually target.
 *
 * The one rule that matters: a Pokémon not currently rendered in the world
 * gets no reaction at all, however progression already updated it - there is
 * nothing here to point at. `event.pokemonId` is resolved by the caller at
 * the moment the event fired, so this never needs to guess who the partner
 * is or whether it has since changed.
 */
export function resolveReactionTargets(
  visiblePokemonNames: readonly string[],
  event: {
    type: PokemonReactionType;
    pokemonId: string;
    allowBystander?: boolean;
  },
  rng: () => number = Math.random,
): PokemonReactionQueueItem[] {
  if (visiblePokemonNames.indexOf(event.pokemonId) === -1) {
    return [];
  }

  const targets: PokemonReactionQueueItem[] = [
    { pokemonId: event.pokemonId, type: event.type },
  ];

  if (
    event.allowBystander &&
    visiblePokemonNames.length > 1 &&
    shouldBystanderReact(rng())
  ) {
    const others = visiblePokemonNames.filter(
      (name) => name !== event.pokemonId,
    );
    const chosen = others[Math.floor(rng() * others.length)];
    if (chosen !== undefined) {
      targets.push({ pokemonId: chosen, type: event.type, bystander: true });
    }
  }

  return targets;
}

/* ------------------------------- the engine --------------------------------- */

export type ReactionSubmitOutcome = 'active' | 'queued' | 'dropped';

interface ReactionEngineState {
  active?: { item: PokemonReactionQueueItem; expiresAt: number };
  queue: PokemonReactionQueueItem[];
}

function dequeueHighestPriority(queue: readonly PokemonReactionQueueItem[]): {
  next: PokemonReactionQueueItem | undefined;
  queue: PokemonReactionQueueItem[];
} {
  if (queue.length === 0) {
    return { next: undefined, queue: [] };
  }
  let bestIndex = 0;
  for (let i = 1; i < queue.length; i++) {
    if (
      REACTION_PRIORITY[queue[i].type] >
      REACTION_PRIORITY[queue[bestIndex].type]
    ) {
      bestIndex = i;
    }
  }
  const next = queue[bestIndex];
  const rest = queue.slice(0, bestIndex).concat(queue.slice(bestIndex + 1));
  return { next, queue: rest };
}

/**
 * One Pokémon must never show two reactions at once.
 *
 * Per-`pokemonId` state: what is currently playing (and when it expires) plus
 * a small capped queue of what is waiting. A higher-priority reaction
 * preempts - drops - whatever is currently showing rather than waiting its
 * turn, which is what lets a level-up cut in front of a save notice. Equal or
 * lower priority queues instead, capped at `MAX_REACTION_QUEUE`.
 *
 * Pure and timer-free: callers (the panel's per-Pokémon animation tick) drive
 * it by calling `tick()` with the current time; nothing here schedules
 * anything itself.
 */
export class ReactionEngine {
  private readonly _state = new Map<string, ReactionEngineState>();

  public submit(
    item: PokemonReactionQueueItem,
    now: number,
  ): ReactionSubmitOutcome {
    const state = this._state.get(item.pokemonId) ?? { queue: [] };

    if (!state.active || reactionOutranks(item.type, state.active.item.type)) {
      state.active = { item, expiresAt: now + REACTION_DURATION_MS[item.type] };
      this._state.set(item.pokemonId, state);
      return 'active';
    }

    if (state.active.item.type === item.type && !item.bystander) {
      // Already showing this same reaction to this Pokémon; a second copy
      // behind it would just repeat itself.
      return 'dropped';
    }

    state.queue = capReactionQueue([...state.queue, item]);
    this._state.set(item.pokemonId, state);
    return 'queued';
  }

  /** Advances the clock for one Pokémon. A no-op unless its reaction expired. */
  public tick(
    pokemonId: string,
    now: number,
  ): { expired: boolean; next?: PokemonReactionQueueItem } {
    const state = this._state.get(pokemonId);
    if (!state?.active || now < state.active.expiresAt) {
      return { expired: false };
    }

    const dequeued = dequeueHighestPriority(state.queue);
    state.queue = dequeued.queue;
    state.active = dequeued.next
      ? {
          item: dequeued.next,
          expiresAt: now + REACTION_DURATION_MS[dequeued.next.type],
        }
      : undefined;
    this._state.set(pokemonId, state);

    return { expired: true, next: dequeued.next };
  }

  /** Whatever is currently playing for this Pokémon, if anything. */
  public active(pokemonId: string): PokemonReactionQueueItem | undefined {
    return this._state.get(pokemonId)?.active?.item;
  }

  /** Forgets a Pokémon entirely - used when it leaves the world. */
  public clear(pokemonId: string): void {
    this._state.delete(pokemonId);
  }

  /** Test/debug seam. */
  public reset(): void {
    this._state.clear();
  }
}
