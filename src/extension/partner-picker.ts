/**
 * Choosing which Pokemon is your partner.
 *
 * Before this existed the partner was simply the first usable entry of the
 * collection - an accident of insertion order rather than a decision. Since
 * the partner is the one earning experience and the one that evolves, that
 * ought to be a choice.
 *
 * Progression is keyed by nickname and stored per Pokemon, so switching
 * partners neither transfers nor destroys anything: the new partner picks up
 * from its own level, and the previous one keeps its progress exactly where it
 * was, ready to resume if chosen again.
 */
import * as vscode from 'vscode';
import { getLocalizedPokemonName } from '../common/localize';
import { MAX_POKEMON_LEVEL } from '../progression/pokemon-progression';
import { readPokemonProgress } from './progression-storage';
import {
  listPartnerCandidates,
  resolvePartnerIdentity,
  setPartnerNickname,
} from './trainer-partner';

interface PartnerQuickPickItem extends vscode.QuickPickItem {
  nickname: string;
}

/**
 * Prompts for a partner and records the choice.
 *
 * Returns true when the partner actually changed, so callers can decide
 * whether a refresh is worth doing.
 */
export async function pickPartnerPokemon(
  context: vscode.ExtensionContext,
): Promise<boolean> {
  const candidates = listPartnerCandidates(context);
  if (candidates.length === 0) {
    void vscode.window.showInformationMessage(
      vscode.l10n.t('You have no Pokemon yet. Spawn one first!'),
    );
    return false;
  }

  const current = resolvePartnerIdentity(context);
  const now = Date.now();

  const items: PartnerQuickPickItem[] = candidates.map((entry) => {
    const progress = readPokemonProgress(
      context,
      entry.nickname,
      entry.species,
      now,
    );
    const species = getLocalizedPokemonName(entry.species);
    // Spawning defaults a Pokemon's name to its species, so only show the
    // nickname when it actually says something the species does not.
    const named =
      entry.nickname.trim().toLowerCase() !== species.trim().toLowerCase();

    return {
      nickname: entry.nickname,
      label: named ? `${entry.nickname} (${species})` : species,
      description: vscode.l10n.t('Lv. {0}', progress.level),
      detail:
        entry.nickname === current?.nickname
          ? vscode.l10n.t('Current partner')
          : undefined,
      picked: entry.nickname === current?.nickname,
    };
  });

  const picked = await vscode.window.showQuickPick(items, {
    title: vscode.l10n.t('Choose your partner Pokemon'),
    placeHolder: vscode.l10n.t(
      'The partner earns experience and is the one that evolves.',
    ),
    matchOnDescription: true,
  });

  if (!picked || picked.nickname === current?.nickname) {
    return false;
  }

  await setPartnerNickname(context, picked.nickname);

  const chosen = candidates.find((e) => e.nickname === picked.nickname);
  if (chosen) {
    const progress = readPokemonProgress(
      context,
      chosen.nickname,
      chosen.species,
      now,
    );
    void vscode.window.showInformationMessage(
      progress.level >= MAX_POKEMON_LEVEL
        ? vscode.l10n.t('{0} is your partner!', picked.nickname)
        : vscode.l10n.t(
            '{0} is your partner! It is Lv. {1}.',
            picked.nickname,
            progress.level,
          ),
    );
  }
  return true;
}
