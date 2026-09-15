/**
 * The toast hub: turns confirmed progression grants into in-world messages.
 *
 * Mirrors `reaction-service.ts` — `progression-service.ts` calls semantic
 * methods here after XP is actually written, and `extension.ts` is the only
 * subscriber that forwards events to the Pokémon world webview.
 *
 * This hub never calculates XP. It only describes what progression already
 * awarded.
 */
import * as vscode from 'vscode';
import { getLocalizedPokemonName } from '../common/localize';
import { PokemonType } from '../common/types';
import { resolvePokemonToastDisplayName } from '../progression/toast-rules';
import { WorldToastEvent, WorldToastVariant } from '../progression/toast-types';

class ToastHub {
  private readonly _emitter = new vscode.EventEmitter<WorldToastEvent>();

  /** Fires once per toast that should appear in the world. */
  public readonly onDidToast: vscode.Event<WorldToastEvent> =
    this._emitter.event;

  /** A Pokémon just received XP through the progression system. */
  public notifyXp(
    pokemonId: string,
    displayName: string,
    xpAmount: number,
    variant: WorldToastVariant = 'normal',
    timestamp: number = Date.now(),
  ): void {
    if (xpAmount <= 0) {
      return;
    }
    this._fire({
      pokemonId,
      type: 'xp',
      displayName,
      xpAmount,
      variant,
      timestamp,
    });
  }

  /** A Pokémon just reached a new level. */
  public notifyLevelUp(
    pokemonId: string,
    displayName: string,
    level: number,
    timestamp: number = Date.now(),
  ): void {
    if (level <= 0) {
      return;
    }
    this._fire({
      pokemonId,
      type: 'level-up',
      displayName,
      level,
      timestamp,
    });
  }

  /**
   * Reserved for future encounter/catch/evolution/friendship messages.
   *
   * `message` is the full toast text; `displayName` on the event is repurposed
   * as the message body for `system` toasts.
   */
  public notifySystem(
    pokemonId: string,
    message: string,
    timestamp: number = Date.now(),
  ): void {
    this._fire({
      pokemonId,
      type: 'system',
      displayName: message,
      timestamp,
    });
  }

  private _fire(event: WorldToastEvent): void {
    if (!isToastsEnabled()) {
      return;
    }
    this._emitter.fire(event);
  }

  public dispose(): void {
    this._emitter.dispose();
  }
}

/** The single hub every toast source raises through. */
export const toastHub = new ToastHub();

export function isToastsEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('pokedev')
    .get<boolean>('toasts.enabled', true);
}

/** Display name for world toasts — nickname when set, otherwise localized species. */
export function getPokemonToastDisplayName(
  nickname: string,
  species: PokemonType,
): string {
  return resolvePokemonToastDisplayName(
    nickname,
    getLocalizedPokemonName(species),
  );
}
