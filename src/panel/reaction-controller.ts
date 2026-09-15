/**
 * The Pokémon-world end of the reaction pipeline.
 *
 *   Coding event -> Reaction event -> reaction-service.ts (host) -> HERE
 *
 * This is the only place that touches sprite DOM for a reaction. It owns:
 *
 *   - resolving a host reaction event to the Pokémon(s) actually rendered
 *     right now (`resolveReactionTargets`, pure, from `reaction-rules.ts`)
 *   - the per-Pokémon priority queue so nothing shows two reactions at once
 *     (`ReactionEngine`, also pure)
 *   - the DOM: a small text-symbol overlay, an optional burst of pixel-star
 *     particles, and a transient CSS class on the sprite itself
 *
 * Nothing here is idle/sleep/wake - it only ever runs in response to a
 * message the host already decided was worth reacting to.
 *
 * A reaction is pure overlay: it never touches `currentState`/`nextFrame`, so
 * a Pokémon always returns to whatever it was doing on its own once the
 * reaction ends, and there is no way for this to get a Pokémon stuck.
 */
import {
  REACTION_DURATION_MS,
  REACTION_SYMBOL,
  ReactionEngine,
  resolveReactionTargets,
} from '../progression/reaction-rules';
import {
  PokemonReactionQueueItem,
  PokemonReactionType,
} from '../progression/reaction-types';
import { IPokemonCollection } from './pokemon-collection';
import { IPokemonType } from './states';
import { getWorldWidth } from './world-bounds';

interface IncomingReactionMessage {
  command: string;
  type?: PokemonReactionType;
  pokemonId?: string;
  allowBystander?: boolean;
}

/** Reactions that also spawn a small burst of star particles. */
const PARTICLE_REACTIONS: ReadonlySet<PokemonReactionType> = new Set([
  'celebrate',
  'level-up',
]);
const PARTICLE_COUNT = 6;
const PARTICLE_SYMBOLS = ['★', '✦'];

/** Rough half-width of the symbol overlay, for keeping it inside the world. */
const SYMBOL_HALF_WIDTH_PX = 14;

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

interface ActiveReactionView {
  symbolEl: HTMLDivElement;
  spriteEl: HTMLImageElement;
  spriteClasses: string[];
  particles: HTMLElement[];
  cleanupTimer: ReturnType<typeof setTimeout>;
}

class ReactionController {
  private readonly _engine = new ReactionEngine();
  private readonly _views = new Map<string, ActiveReactionView>();

  /** Entry point from the panel's `window.addEventListener('message', ...)`. */
  public handleMessage(
    message: IncomingReactionMessage,
    collection: IPokemonCollection,
  ): void {
    if (
      message.command !== 'pokemon-reaction' ||
      !message.type ||
      !message.pokemonId
    ) {
      return;
    }

    const visibleNames = collection.pokemonCollection.map(
      (entry) => entry.pokemon.name,
    );
    const targets = resolveReactionTargets(visibleNames, {
      type: message.type,
      pokemonId: message.pokemonId,
      allowBystander: message.allowBystander,
    });

    for (const target of targets) {
      this._submit(target, collection);
    }
  }

  /**
   * Called once per animation tick (~100ms) for a single, currently-rendered
   * Pokémon - the same cadence `nextFrame()` already runs at, so this adds no
   * timer of its own.
   */
  public tick(pokemon: IPokemonType, collection: IPokemonCollection): void {
    const name = pokemon.name;
    const view = this._views.get(name);
    if (view) {
      this._reposition(view.symbolEl, pokemon);
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

  private _submit(
    item: PokemonReactionQueueItem,
    collection: IPokemonCollection,
  ): void {
    const outcome = this._engine.submit(item, Date.now());
    if (outcome === 'active') {
      this._show(item, collection);
    }
    // 'queued': nothing to render until the active reaction expires and
    // tick() dequeues it (capped at MAX_REACTION_QUEUE pending).
    // 'dropped': this Pokémon is already showing this exact reaction.
  }

  private _show(
    item: PokemonReactionQueueItem,
    collection: IPokemonCollection,
  ): void {
    const element = collection.locate(item.pokemonId);
    const root = worldContainer();
    if (!element || !root) {
      // Not currently rendered - progression already updated elsewhere.
      // Never spawn a Pokémon just to show a reaction.
      this._engine.clear(item.pokemonId);
      return;
    }

    // A preempting reaction (e.g. a level-up cutting off a save notice)
    // replaces whatever was showing rather than layering on top of it.
    this._teardown(item.pokemonId);

    const reducedMotion = prefersReducedMotion();

    const symbolEl = document.createElement('div');
    symbolEl.className = `pokedev-reaction-symbol pokedev-reaction-${item.type}`;
    symbolEl.textContent = REACTION_SYMBOL[item.type];
    root.appendChild(symbolEl);
    this._reposition(symbolEl, element.pokemon);

    const spriteClasses: string[] = [];
    // Bystanders get the symbol only - the whole point is that they are a
    // quieter, occasional echo of the partner's reaction, not a copy of it.
    if (!reducedMotion && !item.bystander) {
      spriteClasses.push(
        item.type === 'confused' ? 'pokedev-shake' : 'pokedev-bounce',
      );
      if (item.type === 'level-up') {
        spriteClasses.push('pokedev-flash');
      }
    }
    if (spriteClasses.length > 0) {
      element.el.classList.remove(
        'pokedev-bounce',
        'pokedev-shake',
        'pokedev-flash',
      );
      // Force a reflow so re-adding a class already present restarts its
      // animation instead of being a no-op.
      void element.el.offsetWidth;
      element.el.classList.add(...spriteClasses);
    }

    const particles =
      !reducedMotion && !item.bystander && PARTICLE_REACTIONS.has(item.type)
        ? this._spawnParticles(element.pokemon, root)
        : [];

    const cleanupTimer = setTimeout(
      () => this._teardown(item.pokemonId),
      REACTION_DURATION_MS[item.type] + 400,
    );

    this._views.set(item.pokemonId, {
      symbolEl,
      spriteEl: element.el,
      spriteClasses,
      particles,
      cleanupTimer,
    });
  }

  private _reposition(symbolEl: HTMLDivElement, pokemon: IPokemonType): void {
    const centerLeft = pokemon.left + pokemon.width / 2;
    const maxLeft = Math.max(
      getWorldWidth() - SYMBOL_HALF_WIDTH_PX,
      SYMBOL_HALF_WIDTH_PX,
    );
    symbolEl.style.left = `${clamp(centerLeft, SYMBOL_HALF_WIDTH_PX, maxLeft)}px`;
    symbolEl.style.bottom = `${pokemon.bottom + pokemon.width}px`;
  }

  private _spawnParticles(
    pokemon: IPokemonType,
    root: HTMLElement,
  ): HTMLElement[] {
    const centerLeft = pokemon.left + pokemon.width / 2;
    const bottom = pokemon.bottom + pokemon.width * 0.75;
    const particles: HTMLElement[] = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const particle = document.createElement('div');
      particle.className = 'pokedev-particle';
      particle.textContent = PARTICLE_SYMBOLS[i % PARTICLE_SYMBOLS.length];
      particle.style.left = `${centerLeft}px`;
      particle.style.bottom = `${bottom}px`;
      particle.style.setProperty(
        '--px',
        `${Math.round((Math.random() - 0.5) * 46)}px`,
      );
      particle.style.animationDelay = `${Math.round(Math.random() * 120)}ms`;
      root.appendChild(particle);

      const remove = () => particle.remove();
      particle.addEventListener('animationend', remove, { once: true });
      // Belt and suspenders, mirroring the shiny-spawn overlay cleanup: an
      // animation that never fires `animationend` (e.g. the tab was
      // backgrounded) must not leak the element forever.
      setTimeout(remove, 1500);

      particles.push(particle);
    }

    return particles;
  }

  private _teardown(pokemonId: string): void {
    const view = this._views.get(pokemonId);
    if (!view) {
      return;
    }
    clearTimeout(view.cleanupTimer);
    view.symbolEl.remove();
    view.particles.forEach((particle) => particle.remove());
    if (view.spriteClasses.length > 0) {
      view.spriteEl.classList.remove(...view.spriteClasses);
    }
    this._views.delete(pokemonId);
  }

  /** Called when a Pokémon is removed from the world, so it stops tracking it. */
  public forget(pokemonId: string): void {
    this._teardown(pokemonId);
    this._engine.clear(pokemonId);
  }

  /** Test/debug seam. */
  public reset(): void {
    this._views.forEach((_view, pokemonId) => this._teardown(pokemonId));
    this._engine.reset();
  }
}

export const reactionController = new ReactionController();
