/**
 * In-world activity toast types.
 *
 * Toasts visualize progression that already happened elsewhere. They never
 * calculate or award XP — they only describe what the progression service
 * already granted.
 */
export type WorldToastType = 'xp' | 'level-up' | 'system';

/** Visual weight for larger rewards (e.g. git commits). */
export type WorldToastVariant = 'normal' | 'large';

/**
 * Payload the extension host sends to the Pokémon world webview.
 *
 * Structured rather than pre-formatted so message text, priority and duration
 * stay testable in `toast-rules.ts`.
 */
export interface WorldToastEvent {
  pokemonId: string;
  type: WorldToastType;
  displayName: string;
  timestamp: number;
  /** Present for `xp` toasts — the actual amount granted. */
  xpAmount?: number;
  /** Present for `level-up` toasts — the level reached. */
  level?: number;
  variant?: WorldToastVariant;
}

/** A toast ready for the per-Pokémon queue engine. */
export interface WorldToastQueueItem {
  pokemonId: string;
  type: WorldToastType;
  message: string;
  priority: number;
  durationMs: number;
  variant: WorldToastVariant;
}
