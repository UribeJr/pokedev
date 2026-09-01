/**
 * The Pokémon-world end of the activity-toast pipeline.
 *
 *   Progression grant -> toast-service.ts (host) -> HERE
 *
 * Renders small retro message boxes anchored above the Pokémon they describe.
 * Observes progression only — never awards XP.
 */
import {
  ToastEngine,
  XP_COALESCE_DEBOUNCE_MS,
} from '../progression/toast-rules';
import {
  WorldToastEvent,
  WorldToastQueueItem,
} from '../progression/toast-types';
import { IPokemonCollection } from './pokemon-collection';
import { IPokemonType } from './states';

interface IncomingToastMessage extends WorldToastEvent {
  command: string;
}

/** Half the typical toast width used for horizontal clamping. */
const TOAST_HALF_WIDTH_PX = 72;
/** Vertical gap between toast bottom and sprite top. */
const TOAST_ABOVE_SPRITE_PX = 30;
/** Extra lift so reaction symbols and toasts do not overlap. */
const REACTION_CLEARANCE_PX = 22;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function worldContainer(): HTMLElement | null {
  return document.getElementById('pokemonContainer');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

interface ActiveToastView {
  toastEl: HTMLDivElement;
  cleanupTimer: ReturnType<typeof setTimeout>;
}

class ToastController {
  private readonly _engine = new ToastEngine();
  private readonly _views = new Map<string, ActiveToastView>();
  private readonly _coalesceTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  public handleMessage(
    message: IncomingToastMessage,
    collection: IPokemonCollection,
  ): void {
    if (message.command !== 'pokemon-toast' || !message.pokemonId) {
      return;
    }

    const visibleNames = collection.pokemonCollection.map(
      (entry) => entry.pokemon.name,
    );
    if (visibleNames.indexOf(message.pokemonId) === -1) {
      return;
    }

    const now = Date.now();
    const outcome = this._engine.submitEvent(
      {
        pokemonId: message.pokemonId,
        type: message.type,
        displayName: message.displayName,
        xpAmount: message.xpAmount,
        level: message.level,
        variant: message.variant,
        timestamp: message.timestamp ?? now,
      },
      now,
    );

    if (outcome === 'coalescing') {
      this._scheduleCoalesceFlush(message.pokemonId, collection);
      return;
    }

    this._syncActiveView(message.pokemonId, collection);
  }

  /**
   * Called once per animation tick (~100ms) for each rendered Pokémon.
   */
  public tick(pokemon: IPokemonType, collection: IPokemonCollection): void {
    const name = pokemon.name;
    const view = this._views.get(name);
    if (view) {
      this._reposition(view.toastEl, pokemon);
    }

    const result = this._engine.tick(name, Date.now());
    if (!result.expired) {
      return;
    }
    this._teardown(name);
    if (result.next) {
      this._show(result.next, collection);
    }
  }

  private _scheduleCoalesceFlush(
    pokemonId: string,
    collection: IPokemonCollection,
  ): void {
    const existing = this._coalesceTimers.get(pokemonId);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this._coalesceTimers.delete(pokemonId);
      this._flushCoalesce(pokemonId, collection, Date.now());
    }, XP_COALESCE_DEBOUNCE_MS);
    this._coalesceTimers.set(pokemonId, timer);
  }

  private _flushCoalesce(
    pokemonId: string,
    collection: IPokemonCollection,
    now: number,
  ): void {
    this._engine.flushCoalesceBuffer(pokemonId, now);
    this._syncActiveView(pokemonId, collection);
  }

  private _syncActiveView(
    pokemonId: string,
    collection: IPokemonCollection,
  ): void {
    const active = this._engine.active(pokemonId);
    if (active && !this._views.has(pokemonId)) {
      this._show(active, collection);
    }
  }

  private _show(
    item: WorldToastQueueItem,
    collection: IPokemonCollection,
  ): void {
    const element = collection.locate(item.pokemonId);
    const root = worldContainer();
    if (!element || !root) {
      this._engine.clear(item.pokemonId);
      return;
    }

    this._teardown(item.pokemonId);

    const toastEl = document.createElement('div');
    toastEl.className = `pokedev-world-toast pokedev-world-toast-${item.type}`;
    if (item.variant === 'large') {
      toastEl.classList.add('pokedev-world-toast-large');
    }
    if (prefersReducedMotion()) {
      toastEl.classList.add('pokedev-world-toast-reduced');
    }

    toastEl.innerHTML = this._formatToastHtml(item);
    root.appendChild(toastEl);
    this._reposition(toastEl, element.pokemon);

    const cleanupTimer = setTimeout(
      () => this._teardown(item.pokemonId),
      item.durationMs + 300,
    );

    this._views.set(item.pokemonId, { toastEl, cleanupTimer });
  }

  private _formatToastHtml(item: WorldToastQueueItem): string {
    if (item.type !== 'xp') {
      return `<span class="pokedev-world-toast-text">${this._escapeHtml(item.message)}</span>`;
    }

    const match = /^(.+ gained )(\d+ EXP!)$/.exec(item.message);
    if (!match) {
      return `<span class="pokedev-world-toast-text">${this._escapeHtml(item.message)}</span>`;
    }

    return `<span class="pokedev-world-toast-text">${this._escapeHtml(match[1])}<strong class="pokedev-world-toast-xp">${match[2]}</strong></span>`;
  }

  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private _reposition(toastEl: HTMLDivElement, pokemon: IPokemonType): void {
    const centerLeft = pokemon.left + pokemon.width / 2;
    const maxLeft = Math.max(
      window.innerWidth - TOAST_HALF_WIDTH_PX,
      TOAST_HALF_WIDTH_PX,
    );
    toastEl.style.left = `${clamp(centerLeft, TOAST_HALF_WIDTH_PX, maxLeft)}px`;
    toastEl.style.bottom = `${pokemon.bottom + pokemon.width + TOAST_ABOVE_SPRITE_PX + REACTION_CLEARANCE_PX}px`;
  }

  private _teardown(pokemonId: string): void {
    const view = this._views.get(pokemonId);
    if (!view) {
      return;
    }
    clearTimeout(view.cleanupTimer);
    view.toastEl.remove();
    this._views.delete(pokemonId);
  }

  public forget(pokemonId: string): void {
    const timer = this._coalesceTimers.get(pokemonId);
    if (timer) {
      clearTimeout(timer);
      this._coalesceTimers.delete(pokemonId);
    }
    this._teardown(pokemonId);
    this._engine.clear(pokemonId);
  }

  public reset(): void {
    this._coalesceTimers.forEach((timer) => clearTimeout(timer));
    this._coalesceTimers.clear();
    this._views.forEach((_view, pokemonId) => this._teardown(pokemonId));
    this._engine.reset();
  }
}

export const toastController = new ToastController();
