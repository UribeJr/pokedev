/**
 * Catalog of selectable Crystal palettes - a PRESENTATION preference,
 * independent of and layered on top of `pokedev.trainerCard.style`
 * (`src/common/trainer-card-style.ts`). Only matters when that style is
 * `'crystal'`: it decides whether the Crystal skin renders as CRYSTAL DAY
 * (the original, approved cream palette) or CRYSTAL NIGHT (a dark Gen-II-
 * inspired palette), the same way Gold/Silver/Crystal itself re-palettes the
 * whole world between day and night without changing a single sprite.
 *
 * `'auto'` is a PREFERENCE, not a resolved value - see `ResolvedCrystalPalette`
 * and `resolveCrystalPalette` below for how it becomes one.
 *
 * Pure data, no `vscode` import: bundled into BOTH the extension host and
 * every Crystal-capable webview client bundle (Trainer Card, compact
 * Explorer HUD, PokeGear), mirroring `trainer-card-style.ts`/
 * `roaming-style.ts`'s exact split.
 */

export type CrystalPalette = 'auto' | 'day' | 'night';

/** What `CrystalPalette` resolves to once `'auto'` has been settled one way
 * or the other - this is the value CSS actually keys on
 * (`[data-crystal-palette="day"|"night"]`), never `'auto'` itself. */
export type ResolvedCrystalPalette = 'day' | 'night';

export interface CrystalPaletteOption {
  id: CrystalPalette;
  label: string;
  description: string;
}

/**
 * Auto is the default: it is the most useful behaviour for an IDE
 * integration (follow VS Code/Cursor's own appearance) and requires no
 * decision from anyone who has not opted into a specific look.
 */
export const DEFAULT_CRYSTAL_PALETTE: CrystalPalette = 'auto';

export const CRYSTAL_PALETTES: readonly CrystalPaletteOption[] = [
  {
    id: 'auto',
    label: 'Auto',
    description:
      "Follows VS Code/Cursor's light or dark appearance - Crystal Night when the IDE is dark, Crystal Day when it is light.",
  },
  {
    id: 'day',
    label: 'Day',
    description: 'Always the original cream Crystal Day palette.',
  },
  {
    id: 'night',
    label: 'Night',
    description: 'Always the dark Crystal Night palette.',
  },
];

export function isValidCrystalPalette(
  id: string | undefined,
): id is CrystalPalette {
  if (!id) {
    return false;
  }
  return CRYSTAL_PALETTES.some((option) => option.id === id);
}

/** Falls back to the default preference for an unknown/missing id, never
 * throws. */
export function getCrystalPaletteOption(
  id: string | undefined,
): CrystalPaletteOption {
  const found = CRYSTAL_PALETTES.find((option) => option.id === id);
  if (found) {
    return found;
  }
  const fallback = CRYSTAL_PALETTES.find(
    (option) => option.id === DEFAULT_CRYSTAL_PALETTE,
  );
  // DEFAULT_CRYSTAL_PALETTE is always one of CRYSTAL_PALETTES by
  // construction; asserted in tests.
  return fallback as CrystalPaletteOption;
}

/**
 * Resolves a preference to an actual palette. Pure and total - the one
 * place `'auto'` gets decided, so every consumer (Trainer Card, Explorer
 * HUD, PokeGear) resolves it identically rather than each guessing.
 *
 * `ideIsDark` is the ONLY external signal for V1 - deliberately not local
 * clock time (see the module doc on this milestone's own scope; a future
 * `'time'` preference can reuse this same resolver by adding a branch here,
 * without changing its signature for existing callers).
 */
export function resolveCrystalPalette(
  preference: CrystalPalette,
  ideIsDark: boolean,
): ResolvedCrystalPalette {
  if (preference === 'day' || preference === 'night') {
    return preference;
  }
  return ideIsDark ? 'night' : 'day';
}
