/**
 * The configured Trainer Card style - a tiny leaf module, deliberately
 * separate from `trainer-card-panel.ts`.
 *
 * `pokedev-state.ts` (which builds the compact Explorer HUD's view model,
 * see `buildTrainerView`) needs this same getter so BOTH Trainer Card
 * surfaces read the identical single persisted preference (never a
 * separate "Explorer style") - but `trainer-card-panel.ts` already imports
 * `pokedev-state.ts` (for `pokedevState.onDidChange`/`notify`), so putting
 * this getter there instead would create a circular import. Same reasoning
 * as `friendship-labels.ts`'s own separate-leaf-module precedent.
 */
import * as vscode from 'vscode';
import {
  DEFAULT_TRAINER_CARD_STYLE,
  isValidTrainerCardStyle,
  TrainerCardStyle,
} from '../common/trainer-card-style';

const CONFIG_SECTION = 'pokedev';
const TRAINER_CARD_STYLE_SETTING = 'trainerCard.style';

/**
 * The user's chosen Trainer Card visual skin (`pokedev.trainerCard.style`).
 * Presentation only - see `src/common/trainer-card-style.ts` for the
 * catalog and `.tc-skin-*` in `media/trainer-card.css`/`media/explorer.css`
 * for what each skin actually changes on the full card and the compact
 * Explorer HUD respectively.
 */
export function getConfiguredTrainerCardStyle(): TrainerCardStyle {
  const styleId = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<string>(TRAINER_CARD_STYLE_SETTING, DEFAULT_TRAINER_CARD_STYLE);
  return isValidTrainerCardStyle(styleId)
    ? styleId
    : DEFAULT_TRAINER_CARD_STYLE;
}
