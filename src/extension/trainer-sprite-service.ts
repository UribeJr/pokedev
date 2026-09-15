/**
 * Resolves Trainer Sprite catalog entries into webview-safe image URIs.
 *
 * The one place that joins `TrainerSprite.assetPath` onto `media/trainers/`
 * and calls `webview.asWebviewUri` - both the full Trainer Card
 * (`trainer-card-panel.ts`) and the compact Explorer Trainer HUD
 * (`pokedev-state.ts`) call into this rather than each growing their own copy
 * of that path-joining logic.
 */
import * as vscode from 'vscode';
import {
  getTrainerSprite,
  TRAINER_SPRITES,
} from '../trainer/trainer-sprite-catalog';
import { TrainerSpriteOption } from '../trainer/trainer-types';

function trainerSpriteUri(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  assetPath: string,
): string {
  return webview
    .asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'trainers', assetPath),
    )
    .toString();
}

/**
 * The resolved image for a chosen sprite id, or `undefined` when `spriteId`
 * is `null` or no longer resolves in the catalog - callers fall back to the
 * GitHub avatar in that case.
 */
export function resolveTrainerSpriteUri(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  spriteId: string | null,
): string | undefined {
  const sprite = getTrainerSprite(spriteId);
  if (!sprite) {
    return undefined;
  }
  return trainerSpriteUri(webview, extensionUri, sprite.assetPath);
}

/** The full picker catalog, every entry already resolved to a webview URI. */
export function buildTrainerSpriteCatalog(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): TrainerSpriteOption[] {
  return TRAINER_SPRITES.map((sprite) => ({
    id: sprite.id,
    name: sprite.name,
    generation: sprite.generation,
    game: sprite.game,
    spriteUri: trainerSpriteUri(webview, extensionUri, sprite.assetPath),
  }));
}
