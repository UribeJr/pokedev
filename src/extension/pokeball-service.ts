/**
 * Resolves Poké Ball catalog entries into webview-safe image URIs.
 *
 * The one place that joins `PokeballDefinition.assetPath` onto
 * `media/pokeballs/` and calls `webview.asWebviewUri` - mirrors
 * `trainer-sprite-service.ts` exactly. Every surface that needs to render a
 * ball sprite (PokeGear's PARTY tab and its ball selector, the full Trainer
 * Card's party grid and Partner panel, via `pokedev-state.ts`/
 * `trainer-partner.ts`) calls into this rather than each growing its own
 * copy of the path-joining logic.
 */
import * as vscode from 'vscode';
import {
  getPokeballDefinition,
  normalizePokeballId,
  POKEBALL_DEFINITIONS,
} from '../common/pokeballs';

function pokeballSpriteUri(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  assetPath: string,
): string {
  return webview
    .asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'pokeballs', assetPath),
    )
    .toString();
}

/**
 * The resolved sprite for a persisted (possibly invalid/missing) ball id -
 * always resolves to SOMETHING, since `normalizePokeballId` falls back to
 * the standard Poké Ball first. Callers never need their own fallback logic.
 */
export function resolvePokeballSpriteUri(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  pokeballId: string | undefined,
): string {
  const ball = getPokeballDefinition(normalizePokeballId(pokeballId));
  // `normalizePokeballId` only ever returns an id this catalog actually
  // defines, so `ball` is never undefined here - the `?? poke.png` fallback
  // exists only in case the catalog itself is ever edited down to nothing,
  // which would be a bug elsewhere, not a runtime input to guard against.
  return pokeballSpriteUri(
    webview,
    extensionUri,
    ball?.assetPath ?? 'poke.png',
  );
}

export interface PokeballOption {
  id: string;
  name: string;
  spriteUri: string;
}

/** The full ball selector catalog, every entry already resolved to a
 * webview URI, in catalog (sort) order. */
export function buildPokeballCatalog(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): PokeballOption[] {
  return POKEBALL_DEFINITIONS.map((ball) => ({
    id: ball.id,
    name: ball.name,
    spriteUri: pokeballSpriteUri(webview, extensionUri, ball.assetPath),
  }));
}
