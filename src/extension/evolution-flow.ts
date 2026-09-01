/**
 * Evolving the partner: the prompt, the state change, and telling the panel.
 *
 * An evolution touches three things that must agree, in this order:
 *
 *   1. the persisted collection arrays  (authoritative on the next reload)
 *   2. the live panel                   (what the user is looking at now)
 *   3. the Trainer Card                 (if it happens to be open)
 *
 * Progression itself needs no work: it is keyed by nickname, and an evolution
 * changes species but never the name.
 */
import * as vscode from 'vscode';
import { POKEMON_DATA } from '../common/pokemon-data';
import {
  EXTRA_POKEMON_KEY_COLORS,
  EXTRA_POKEMON_KEY_TYPES,
} from '../common/storage-keys';
import { PokemonColor, PokemonType } from '../common/types';
import { getLocalizedPokemonName } from '../common/localize';
import { normalizeColor } from '../panel/pokemon-collection';
import { getAvailableEvolution } from '../progression/evolution-service';
import {
  readPokemonProgress,
  writePokemonProgress,
} from './progression-storage';
import { pokedevState } from './pokedev-state';
import type { ProgressionService } from './progression-service';
import { resolvePartnerIdentity } from './trainer-partner';

/**
 * Posts the live species swap to the Pokemon panel.
 *
 * Injected by `extension.ts` rather than imported, because everything that can
 * reach the panel lives in `extension.ts` and importing it here would form a
 * require cycle over its top-level constants.
 */
export type EvolutionPanelNotifier = (payload: {
  name: string;
  type: PokemonType;
  color: PokemonColor;
  generation: string;
  originalSpriteSize: number;
}) => void;

let notifyPanel: EvolutionPanelNotifier | undefined;

export function setEvolutionPanelNotifier(
  notifier: EvolutionPanelNotifier,
): void {
  notifyPanel = notifier;
}

/**
 * Asks whether to evolve, then does it if the user agrees.
 *
 * Uses a real notification with actions rather than a status-bar note: this is
 * the one moment in the whole system that needs a decision.
 */
export async function promptToEvolvePartner(
  context: vscode.ExtensionContext,
  service: ProgressionService,
): Promise<void> {
  const partner = resolvePartnerIdentity(context);
  if (!partner) {
    return;
  }
  const progress = readPokemonProgress(
    context,
    partner.nickname,
    partner.species,
    Date.now(),
  );
  const availability = getAvailableEvolution(
    partner.species,
    progress.level,
    partner.shiny,
  );
  if (!availability.available || !availability.rule) {
    return;
  }

  const displayName =
    partner.nickname || getLocalizedPokemonName(partner.species);
  const evolve = vscode.l10n.t('Evolve');
  const notNow = vscode.l10n.t('Not now');

  const choice = await vscode.window.showInformationMessage(
    vscode.l10n.t('What? {0} is ready to evolve!', displayName),
    evolve,
    notNow,
  );

  if (choice !== evolve) {
    // Remember the refusal against the CURRENT level only, so the offer comes
    // back on the next level-up rather than being suppressed forever.
    await writePokemonProgress(context, partner.nickname, {
      ...progress,
      declinedEvolutionAtLevel: progress.level,
    });
    return;
  }

  await applyEvolution(context, service);
}

/**
 * Performs the evolution.
 *
 * Everything user-specific is preserved because none of it is rewritten: the
 * nickname array is untouched, so the nickname and - since progression is
 * keyed by it - the level, XP, total XP and history all carry across. Only the
 * species and its colour are replaced.
 */
export async function applyEvolution(
  context: vscode.ExtensionContext,
  service: ProgressionService,
): Promise<boolean> {
  const partner = resolvePartnerIdentity(context);
  if (!partner) {
    return false;
  }
  const progress = readPokemonProgress(
    context,
    partner.nickname,
    partner.species,
    Date.now(),
  );
  const availability = getAvailableEvolution(
    partner.species,
    progress.level,
    partner.shiny,
  );
  if (!availability.available || !availability.rule) {
    return false;
  }

  const target = availability.rule.to;
  const config = POKEMON_DATA[target];
  if (!config) {
    return false;
  }

  // Rewrite the collection at the SAME index. The partner is defined as the
  // first usable entry, so writing in place is what keeps this Pokemon the
  // partner instead of sending it to the back of the collection.
  const rawTypes = context.globalState.get<unknown>(
    EXTRA_POKEMON_KEY_TYPES,
    [],
  );
  const rawColors = context.globalState.get<unknown>(
    EXTRA_POKEMON_KEY_COLORS,
    [],
  );
  if (!Array.isArray(rawTypes) || partner.index >= rawTypes.length) {
    return false;
  }
  const types = rawTypes.slice();
  const colors = Array.isArray(rawColors) ? rawColors.slice() : [];

  // getAvailableEvolution already refused a shiny whose target has no shiny
  // sprite, so this normalize is a second line of defence rather than the
  // thing that drops shininess.
  const nextColor = normalizeColor(
    partner.shiny ? PokemonColor.shiny : PokemonColor.default,
    target,
  );

  types[partner.index] = target;
  colors[partner.index] = nextColor;
  await context.globalState.update(EXTRA_POKEMON_KEY_TYPES, types);
  await context.globalState.update(EXTRA_POKEMON_KEY_COLORS, colors);

  // Species on the progression record is advisory, but leaving it stale would
  // make the activity log lie.
  await writePokemonProgress(context, partner.nickname, {
    ...progress,
    species: target,
  });

  notifyPanel?.({
    name: partner.nickname,
    type: target,
    color: nextColor,
    // The `gen`-prefixed form: the sprite root is `media/gen1/<type>/<color>`,
    // and a bare "1" would silently resolve to a missing directory.
    generation: `gen${config.generation}`,
    originalSpriteSize: config.originalSpriteSize || 32,
  });

  service.notifyCard();
  pokedevState.notify('collection');

  void vscode.window.showInformationMessage(
    vscode.l10n.t(
      'Congratulations! Your {0} evolved into {1}!',
      getLocalizedPokemonName(partner.species),
      getLocalizedPokemonName(target),
    ),
  );

  return true;
}

/**
 * The `Evolve Partner` command.
 *
 * Ignores a previous "Not now" entirely - asking for it explicitly is the
 * clearest possible statement of intent - and explains itself when there is
 * nothing to do.
 */
export async function evolvePartnerCommand(
  context: vscode.ExtensionContext,
  service: ProgressionService,
): Promise<void> {
  const partner = resolvePartnerIdentity(context);
  if (!partner) {
    void vscode.window.showInformationMessage(
      vscode.l10n.t('You have no partner Pokemon yet. Spawn one first!'),
    );
    return;
  }

  const progress = readPokemonProgress(
    context,
    partner.nickname,
    partner.species,
    Date.now(),
  );
  const availability = getAvailableEvolution(
    partner.species,
    progress.level,
    partner.shiny,
  );
  const displayName =
    partner.nickname || getLocalizedPokemonName(partner.species);

  if (availability.available) {
    await applyEvolution(context, service);
    return;
  }

  switch (availability.reason) {
    case 'level-too-low':
      void vscode.window.showInformationMessage(
        vscode.l10n.t(
          '{0} needs to reach Lv. {1} to evolve. It is Lv. {2}.',
          displayName,
          availability.requiredLevel ?? 0,
          progress.level,
        ),
      );
      return;
    case 'shiny-unavailable':
      void vscode.window.showInformationMessage(
        vscode.l10n.t(
          '{0} cannot evolve yet: no shiny sprite exists for its evolved form.',
          displayName,
        ),
      );
      return;
    default:
      void vscode.window.showInformationMessage(
        vscode.l10n.t('{0} has no known evolution yet.', displayName),
      );
  }
}
