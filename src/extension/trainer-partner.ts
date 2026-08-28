import * as vscode from 'vscode';
import { getLocalizedPokemonName } from '../common/localize';
import { POKEMON_DATA } from '../common/pokemon-data';
import {
  EXTRA_POKEMON_KEY_COLORS,
  EXTRA_POKEMON_KEY_NAMES,
  EXTRA_POKEMON_KEY_TYPES,
  PROGRESSION_PARTNER_KEY,
} from '../common/storage-keys';
import { PokemonColor, PokemonType } from '../common/types';
import {
  getPokemonXpForNextLevel,
  MAX_POKEMON_LEVEL,
} from '../progression/pokemon-progression';
import { PartnerPokemonView } from '../trainer/trainer-types';
import { readPokemonProgress } from './progression-storage';

/**
 * The partner's identity in the persisted collection, without any webview.
 *
 * Progression needs to know who the partner IS on every save, tick and commit,
 * long before - and usually without - a Trainer Card being open. Splitting
 * identity resolution from view construction keeps the sprite URI, which is
 * the only part that needs a webview, out of that path.
 */
export interface PartnerIdentity {
  /** Index into the three parallel collection arrays. Evolution writes here. */
  index: number;
  species: PokemonType;
  /** The instance identity: progression is keyed by this. */
  nickname: string;
  shiny: boolean;
}

/**
 * Every collection entry this build can actually render, in stored order.
 *
 * Reads the raw `globalState` arrays rather than going through
 * `PokemonSpecification.collectionFromMemento`. `POKEMON_DATA` is filtered to
 * species with at least one available sprite colour, while `PokemonType` is
 * keyed off the unfiltered table - so a retired or stale species key looks
 * valid to the type system but is absent at runtime, and the
 * `PokemonSpecification` constructor dereferences it unguarded. Reading raw
 * and skipping unknown keys keeps a synced-from-another-machine collection
 * from throwing here.
 */
export function listPartnerCandidates(
  context: vscode.ExtensionContext,
): PartnerIdentity[] {
  const types = context.globalState.get<unknown>(EXTRA_POKEMON_KEY_TYPES, []);
  if (!Array.isArray(types) || types.length === 0) {
    return [];
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

  const result: PartnerIdentity[] = [];
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

    result.push({
      index,
      species: key as PokemonType,
      // Spawning defaults a Pokemon's name to its species, so an empty
      // nickname still needs a stable progression key.
      nickname: typeof names[index] === 'string' ? names[index] : key,
      shiny,
    });
  }
  return result;
}

/**
 * Resolves the current partner.
 *
 * Prefers the Pokemon the user explicitly chose. Falls back to the first
 * usable entry when nothing has been chosen, when the chosen one has since
 * been released, or for anyone who has simply never opened the picker - which
 * is exactly the behaviour that existed before choosing was possible.
 */
export function resolvePartnerIdentity(
  context: vscode.ExtensionContext,
): PartnerIdentity | undefined {
  const candidates = listPartnerCandidates(context);
  if (candidates.length === 0) {
    return undefined;
  }

  const chosen = context.globalState.get<unknown>(PROGRESSION_PARTNER_KEY);
  if (typeof chosen === 'string' && chosen.length > 0) {
    const match = candidates.find((entry) => entry.nickname === chosen);
    if (match) {
      return match;
    }
  }
  return candidates[0];
}

/** Records the user's choice of partner. */
export async function setPartnerNickname(
  context: vscode.ExtensionContext,
  nickname: string,
): Promise<void> {
  await context.globalState.update(PROGRESSION_PARTNER_KEY, nickname);
}

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
  const partner = resolvePartnerIdentity(context);
  if (!partner) {
    return undefined;
  }

  const config = POKEMON_DATA[partner.species];
  const spriteUri = webview.asWebviewUri(
    vscode.Uri.joinPath(
      extensionUri,
      'media',
      `gen${config.generation}`,
      partner.species,
      `${partner.shiny ? 'shiny' : 'default'}_idle_8fps.gif`,
    ),
  );

  const progress = readPokemonProgress(
    context,
    partner.nickname,
    partner.species,
    Date.now(),
  );

  return {
    species: getLocalizedPokemonName(partner.species),
    nickname: partner.nickname,
    shiny: partner.shiny,
    spriteUri: spriteUri.toString(),
    level: progress.level,
    currentXp: progress.currentXp,
    xpForNextLevel:
      progress.level >= MAX_POKEMON_LEVEL
        ? 0
        : getPokemonXpForNextLevel(progress.level),
  };
}
