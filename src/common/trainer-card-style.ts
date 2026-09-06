/**
 * Catalog of selectable Trainer Card visual skins - a PRESENTATION
 * preference, independent of the Trainer Card's data model
 * (`src/trainer/trainer-types.ts`) and its tier system (`TrainerCardTier`,
 * which is a progression-driven cosmetic already, not a user choice).
 *
 * Pure data, no `vscode` import: bundled into BOTH the extension host
 * (`src/extension/extension.ts`/`src/extension/trainer-card-panel.ts`, to
 * build the QuickPick and resolve the configured style) and the Trainer
 * Card webview's client bundle (`src/panel/trainer-card/main.ts`, to apply
 * the right CSS class), mirroring `display-skins.ts`/`environments.ts`/
 * `roaming-style.ts`'s exact split.
 */

export type TrainerCardStyle = 'pokedev' | 'crystal';

export interface TrainerCardStyleOption {
  id: TrainerCardStyle;
  label: string;
  description: string;
}

/**
 * PokéDev is the default: it is the card's original, already-approved
 * design. Crystal is an opt-in skin so nobody's card unexpectedly changes
 * look after an update.
 */
export const DEFAULT_TRAINER_CARD_STYLE: TrainerCardStyle = 'pokedev';

export const TRAINER_CARD_STYLES: readonly TrainerCardStyleOption[] = [
  {
    id: 'pokedev',
    label: 'PokéDev',
    description: 'The original PokéDev Trainer Card design.',
  },
  {
    id: 'crystal',
    label: 'Crystal',
    description:
      "A Pokémon Crystal-styled card: the game's window framing, GBC palette, and pixel UI language.",
  },
];

export function isValidTrainerCardStyle(
  id: string | undefined,
): id is TrainerCardStyle {
  if (!id) {
    return false;
  }
  return TRAINER_CARD_STYLES.some((option) => option.id === id);
}

/** Falls back to the default style for an unknown/missing id, never throws. */
export function getTrainerCardStyleOption(
  id: string | undefined,
): TrainerCardStyleOption {
  const found = TRAINER_CARD_STYLES.find((option) => option.id === id);
  if (found) {
    return found;
  }
  const fallback = TRAINER_CARD_STYLES.find(
    (option) => option.id === DEFAULT_TRAINER_CARD_STYLE,
  );
  // DEFAULT_TRAINER_CARD_STYLE is always one of TRAINER_CARD_STYLES by
  // construction; asserted in tests.
  return fallback as TrainerCardStyleOption;
}
