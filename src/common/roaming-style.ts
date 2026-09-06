/**
 * Catalog of selectable Pokémon roaming strategies - a BEHAVIOR preference,
 * independent of the environment/display-skin cosmetic systems.
 *
 * Pure data, no `vscode` import: bundled into BOTH the extension host
 * (`src/extension/extension.ts`, to build the QuickPick and validate the
 * setting) and the world webview's client bundle (`src/panel/roaming/
 * roaming-mode.ts`, to know which strategy is active), mirroring
 * `display-skins.ts`/`environments.ts`'s exact split.
 */

export type RoamingStyle = 'overworld' | 'classic';

export interface RoamingStyleOption {
  id: RoamingStyle;
  label: string;
  description: string;
}

/**
 * Overworld is the default: PokéDev now has full Pokémon-style environments
 * (Ilex Forest, Johto Route, ...), and Pokémon lined up along the bottom
 * floor looks wrong against them. Classic is one QuickPick away for anyone
 * who prefers the original pet-style movement.
 */
export const DEFAULT_ROAMING_STYLE: RoamingStyle = 'overworld';

export const ROAMING_STYLES: readonly RoamingStyleOption[] = [
  {
    id: 'overworld',
    label: 'Overworld (2D)',
    description: 'Pokémon wander throughout the full 2D playable screen.',
  },
  {
    id: 'classic',
    label: 'Classic (Floor)',
    description: 'The original floor-style left/right pet movement.',
  },
];

export function isValidRoamingStyle(
  id: string | undefined,
): id is RoamingStyle {
  if (!id) {
    return false;
  }
  return ROAMING_STYLES.some((option) => option.id === id);
}

/** Falls back to the default style for an unknown/missing id, never throws. */
export function getRoamingStyleOption(
  id: string | undefined,
): RoamingStyleOption {
  const found = ROAMING_STYLES.find((option) => option.id === id);
  if (found) {
    return found;
  }
  const fallback = ROAMING_STYLES.find(
    (option) => option.id === DEFAULT_ROAMING_STYLE,
  );
  // DEFAULT_ROAMING_STYLE is always one of ROAMING_STYLES by construction;
  // asserted in tests.
  return fallback as RoamingStyleOption;
}
