import * as vscode from 'vscode';
import { getLocalizedPokemonName } from '../common/localize';
import { POKEMON_DATA } from '../common/pokemon-data';
import {
  EXTRA_POKEMON_KEY_COLORS,
  EXTRA_POKEMON_KEY_NAMES,
  EXTRA_POKEMON_KEY_TYPES,
} from '../common/storage-keys';
import { PokemonColor, PokemonType } from '../common/types';
import { PartnerPokemonView } from '../trainer/trainer-types';

/**
 * Resolves a "partner Pokémon" to show on the Trainer Card.
 *
 * This reads the persisted collection straight out of `globalState` rather than
 * talking to the Pokémon panel, so the Trainer Card stays decoupled: it touches
 * no panel class, no `IPokemonPanel`, and no `PokemonSpecification`.
 *
 * It also deliberately avoids `PokemonSpecification.collectionFromMemento`.
 * `POKEMON_DATA` is filtered to species with at least one available sprite
 * colour (src/common/pokemon-data.ts), while `PokemonType` is keyed off the
 * unfiltered table — so a retired or stale species key looks valid to the type
 * system but is absent at runtime, and the `PokemonSpecification` constructor
 * dereferences it unguarded. Reading raw and skipping unknown keys keeps a
 * synced-from-another-machine collection from throwing here.
 */
export function resolvePartnerPokemon(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): PartnerPokemonView | undefined {
  const types = context.globalState.get<unknown>(EXTRA_POKEMON_KEY_TYPES, []);
  if (!Array.isArray(types) || types.length === 0) {
    return undefined;
  }
  // The three arrays are index-aligned only by convention, and a partial write
  // can leave them different lengths. Read each independently.
  const rawColors = context.globalState.get<unknown>(
    EXTRA_POKEMON_KEY_COLORS,
    [],
  );
  const rawNames = context.globalState.get<unknown>(
    EXTRA_POKEMON_KEY_NAMES,
    [],
  );
  const colors = Array.isArray(rawColors) ? rawColors : [];
  const names = Array.isArray(rawNames) ? rawNames : [];

  for (let index = 0; index < types.length; index++) {
    const key = types[index];
    if (typeof key !== 'string' || key.length === 0) {
      continue;
    }
    const config = POKEMON_DATA[key as PokemonType];
    if (!config) {
      // Retired or unrecognised species: skip rather than throw.
      continue;
    }

    // A stale 'shiny' on a species with no shiny sprite would 404 the gif.
    const shiny =
      colors[index] === PokemonColor.shiny &&
      config.possibleColors.indexOf(PokemonColor.shiny) !== -1;

    const spriteUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        extensionUri,
        'media',
        `gen${config.generation}`,
        key,
        `${shiny ? 'shiny' : 'default'}_idle_8fps.gif`,
      ),
    );

    return {
      species: getLocalizedPokemonName(key as PokemonType),
      nickname: typeof names[index] === 'string' ? names[index] : '',
      shiny,
      spriteUri: spriteUri.toString(),
    };
  }

  return undefined;
}
