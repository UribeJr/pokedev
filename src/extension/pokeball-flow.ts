/**
 * Sets a persistent Pokemon instance's cosmetic Poké Ball.
 *
 * The one function that ever writes `PokemonProgress.pokeballId` - PokeGear's
 * PARTY tab (`pokegear-panel.ts`'s `pokegear/setPokeballId` handler) is the
 * only caller today, but this stays a dedicated module (mirroring
 * `evolution-flow.ts`'s "one function owns the mutation" convention) so a
 * future entry point never has to re-derive the identity-resolution +
 * validate + write + notify + toast sequence.
 *
 * Purely cosmetic: never touches XP, Friendship, level, or evolution
 * eligibility, and is not itself a `ProgressionEvent` - no XP is granted for
 * changing a ball.
 */
import * as vscode from 'vscode';
import { getPokeballDefinition, isValidPokeballId } from '../common/pokeballs';
import { pokedevState } from './pokedev-state';
import {
  readPokemonProgress,
  writePokemonProgress,
} from './progression-storage';
import { getPokemonToastDisplayName, toastHub } from './toast-service';
import { listPartnerCandidates } from './trainer-partner';

/**
 * Resolves `nickname` to a live collection entry, validates `pokeballId`
 * against the catalog, and persists the change. Returns `false` (writing
 * nothing) for an unknown Pokemon or an invalid ball id - the caller
 * (`pokegear-panel.ts`) has already done a cheaper version of this check,
 * but the collection can change between a webview render and a click, so
 * this never trusts that check alone.
 */
export async function setPokemonPokeball(
  context: vscode.ExtensionContext,
  nickname: string,
  pokeballId: string,
): Promise<boolean> {
  if (!isValidPokeballId(pokeballId)) {
    return false;
  }

  const identity = listPartnerCandidates(context).find(
    (candidate) => candidate.nickname === nickname,
  );
  if (!identity) {
    return false;
  }

  const progress = readPokemonProgress(
    context,
    identity.nickname,
    identity.species,
    Date.now(),
  );
  if (progress.pokeballId === pokeballId) {
    // Already set - not an error, just nothing to do. Still reports success
    // so the webview doesn't treat re-selecting the current ball as a
    // failure.
    return true;
  }

  await writePokemonProgress(context, identity.nickname, {
    ...progress,
    pokeballId,
  });
  pokedevState.notify('pokeball');

  const displayName = getPokemonToastDisplayName(
    identity.nickname,
    identity.species,
  );
  const ball = getPokeballDefinition(pokeballId);
  toastHub.notifySystem(
    identity.nickname,
    vscode.l10n.t(
      "{0}'s Ball was changed to {1}!",
      displayName,
      ball?.name ?? pokeballId,
    ),
    Date.now(),
  );

  return true;
}
