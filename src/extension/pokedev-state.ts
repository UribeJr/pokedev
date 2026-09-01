/**
 * The shared state layer behind every PokeDev UI surface.
 *
 * Three surfaces now show the same underlying data — the full Trainer Card,
 * the Explorer Trainer HUD and the Explorer team list. Without a hub each
 * would have to read storage itself and, worse, know about the other two in
 * order to keep them in step. That is how a fourth surface becomes a rewrite.
 *
 *   progression / partner / GitHub services
 *                    |
 *              PokedevState            <- reads storage, emits one event
 *          /         |         \
 *   Full Card   Trainer View   Pokemon View
 *
 * This module owns no state of its own. It reads from the existing services on
 * demand and broadcasts "something changed"; the surfaces decide what to do
 * about it. Keeping it stateless means a webview that VS Code disposed and
 * recreated simply asks again and gets the truth, with no cache to reconcile.
 */
import * as vscode from 'vscode';
import { getLocalizedPokemonName } from '../common/localize';
import { POKEMON_DATA } from '../common/pokemon-data';
import {
  ExplorerLabels,
  ExplorerPokemonEntry,
  ExplorerPokemonViewModel,
  ExplorerTrainerViewModel,
} from '../trainer/explorer-types';
import {
  getPokemonXpForNextLevel,
  MAX_POKEMON_LEVEL,
} from '../progression/pokemon-progression';
import {
  getXpForNextTrainerLevel,
  MAX_TRAINER_LEVEL,
} from '../trainer/trainer-profile';
import { readPokemonProgress } from './progression-storage';
import { getConfiguredGithubUsername } from './trainer-card-panel';
import { readGithubCache, readTrainerProfile } from './trainer-storage';
import {
  listPartnerCandidates,
  resolvePartnerIdentity,
} from './trainer-partner';

/**
 * What changed, for surfaces that can act more cheaply on some kinds.
 *
 * Every surface may simply re-render on any of them; the distinction exists so
 * that, for example, a coding-time tick does not have to be treated as
 * urgently as a partner switch.
 */
export type PokedevChangeKind =
  | 'progression'
  | 'partner'
  | 'github'
  | 'collection';

class PokedevState {
  private readonly _emitter = new vscode.EventEmitter<PokedevChangeKind>();

  /** Fires whenever anything a PokeDev surface displays has changed. */
  public readonly onDidChange: vscode.Event<PokedevChangeKind> =
    this._emitter.event;

  public notify(kind: PokedevChangeKind): void {
    this._emitter.fire(kind);
  }

  public dispose(): void {
    this._emitter.dispose();
  }

  /* --------------------------- trainer HUD --------------------------- */

  /**
   * The compact trainer view model.
   *
   * GitHub data is read from the CACHE only — never fetched. This runs on
   * every XP event and every view reveal, and unauthenticated GitHub allows 60
   * requests an hour per IP. Refreshing is an explicit user action, routed
   * through the existing Trainer Card service so there is exactly one fetch
   * path in the extension.
   */
  public buildTrainerView(
    context: vscode.ExtensionContext,
    webview: vscode.Webview,
  ): ExplorerTrainerViewModel {
    const now = Date.now();
    const username = getConfiguredGithubUsername();
    const profile = readTrainerProfile(context, now, username);
    const cached = readGithubCache(context);
    const github =
      cached && cached.username === username.toLowerCase()
        ? cached.data
        : undefined;

    return {
      connected: username.length > 0,
      displayName: github?.displayName || username,
      login: github?.login || username,
      avatarUrl: github?.avatarUrl ?? '',
      trainerLevel: profile.trainerLevel,
      trainerXp: profile.trainerXp,
      xpForNextLevel:
        profile.trainerLevel >= MAX_TRAINER_LEVEL
          ? 0
          : getXpForNextTrainerLevel(profile.trainerLevel),
      totalCodingTimeMs: profile.totalCodingTimeMs,
      partner: this._buildPartner(context, webview, now),
      labels: buildExplorerLabels(),
    };
  }

  private _buildPartner(
    context: vscode.ExtensionContext,
    webview: vscode.Webview,
    now: number,
  ): ExplorerTrainerViewModel['partner'] {
    const partner = resolvePartnerIdentity(context);
    if (!partner) {
      return undefined;
    }
    const progress = readPokemonProgress(
      context,
      partner.nickname,
      partner.species,
      now,
    );
    return {
      species: getLocalizedPokemonName(partner.species),
      nickname: partner.nickname,
      spriteUri: spriteUriFor(
        webview,
        context.extensionUri,
        partner.species,
        partner.shiny,
      ),
      shiny: partner.shiny,
      level: progress.level,
      currentXp: progress.currentXp,
      xpForNextLevel:
        progress.level >= MAX_POKEMON_LEVEL
          ? 0
          : getPokemonXpForNextLevel(progress.level),
    };
  }

  /* ---------------------------- team list ---------------------------- */

  /**
   * The team list, in the collection's own stored order.
   *
   * Uses `listPartnerCandidates`, the same enumeration the partner picker
   * reads, so the sidebar can never disagree with the picker about what you
   * own or which one is current.
   */
  public buildPokemonView(
    context: vscode.ExtensionContext,
    webview: vscode.Webview,
  ): ExplorerPokemonViewModel {
    const now = Date.now();
    const current = resolvePartnerIdentity(context);
    const pokemon: ExplorerPokemonEntry[] = listPartnerCandidates(context).map(
      (entry) => {
        const progress = readPokemonProgress(
          context,
          entry.nickname,
          entry.species,
          now,
        );
        const species = getLocalizedPokemonName(entry.species);
        return {
          nickname: entry.nickname,
          species,
          spriteUri: spriteUriFor(
            webview,
            context.extensionUri,
            entry.species,
            entry.shiny,
          ),
          shiny: entry.shiny,
          level: progress.level,
          currentXp: progress.currentXp,
          xpForNextLevel:
            progress.level >= MAX_POKEMON_LEVEL
              ? 0
              : getPokemonXpForNextLevel(progress.level),
          isPartner: entry.nickname === current?.nickname,
        };
      },
    );
    return { pokemon, labels: buildExplorerLabels() };
  }
}

/** The single hub every surface subscribes to. */
export const pokedevState = new PokedevState();

/**
 * Resolves an idle sprite for a species.
 *
 * Mirrors the resolution in `trainer-partner.ts`: the colour is a filename
 * PREFIX, not a directory, and generations use the `gen`-prefixed form.
 */
function spriteUriFor(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  species: string,
  shiny: boolean,
): string {
  const config = POKEMON_DATA[species];
  if (!config) {
    return '';
  }
  return webview
    .asWebviewUri(
      vscode.Uri.joinPath(
        extensionUri,
        'media',
        `gen${config.generation}`,
        species,
        `${shiny ? 'shiny' : 'default'}_idle_8fps.gif`,
      ),
    )
    .toString();
}

/** Localized on the host, because the webview has no `vscode.l10n`. */
export function buildExplorerLabels(): ExplorerLabels {
  return {
    trainerWord: vscode.l10n.t('Trainer'),
    levelLabel: vscode.l10n.t('Lv.'),
    xpLabel: vscode.l10n.t('XP'),
    codingTimeLabel: vscode.l10n.t('Coding time'),
    partnerLabel: vscode.l10n.t('Partner'),
    noPartnerLabel: vscode.l10n.t('No partner selected'),
    noPokemonLabel: vscode.l10n.t('No Pokemon yet'),
    connectPrompt: vscode.l10n.t(
      'Connect a GitHub account to finish your card.',
    ),
    connectButton: vscode.l10n.t('Connect'),
    openFullCardButton: vscode.l10n.t('Open Full Card'),
    refreshButton: vscode.l10n.t('Refresh'),
    changePartnerButton: vscode.l10n.t('Change Partner'),
    makePartnerHint: vscode.l10n.t('Make this your partner'),
    partnerBadge: vscode.l10n.t('PARTNER'),
    shinyLabel: vscode.l10n.t('Shiny'),
  };
}
