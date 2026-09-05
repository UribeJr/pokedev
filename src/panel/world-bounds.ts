/**
 * Measures the playable "screen" area Pokémon roam inside.
 *
 * With no display skin selected, `#pokedevScreen` fills the whole webview and
 * this is equivalent to `window.innerWidth`/`innerHeight` (today's behavior,
 * unchanged). With a skin selected, `#pokedevScreen` is inset by the skin's
 * bezel artwork, and every boundary/spawn/clamp calculation that used to read
 * `window.innerWidth`/`innerHeight` reads this instead, so Pokémon and their
 * reactions/toasts stay inside the visible opening instead of wandering
 * underneath opaque bezel art. The walk/run/chase state machines themselves
 * are untouched - only the size they compare against changes.
 */

function getWorldElement(): HTMLElement | null {
  return document.getElementById('pokedevScreen');
}

export function getWorldWidth(): number {
  const width = getWorldElement()?.clientWidth ?? 0;
  return width > 0 ? width : window.innerWidth;
}

export function getWorldHeight(): number {
  const height = getWorldElement()?.clientHeight ?? 0;
  return height > 0 ? height : window.innerHeight;
}
