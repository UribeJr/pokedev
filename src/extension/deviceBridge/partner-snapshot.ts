/**
 * Adapts existing PokéDev state into a `PartnerSnapshotPayload` for the
 * Device Bridge.
 *
 * Deliberately thin: it reuses `resolvePartnerIdentity` and
 * `readPokemonProgress` exactly as `resolvePartnerPokemon` (in
 * `trainer-partner.ts`) already does for the Trainer Card, minus the
 * webview-only sprite/pokeball-sprite URIs, plus the new stable `id`. No
 * progression rule lives here - only a read and a reshape.
 */
import * as vscode from 'vscode';
import {
  getPokemonXpForNextLevel,
  MAX_POKEMON_LEVEL,
} from '../../progression/pokemon-progression';
import { readPokemonProgress } from '../progression-storage';
import { resolvePartnerIdentity } from '../trainer-partner';
import { PartnerSnapshotPayload } from './device-protocol';

/** Returns `undefined` when nothing is spawned yet - the caller encodes
 * that as a `state_snapshot` with no `partner` field. */
export function buildPartnerSnapshotPayload(
  context: vscode.ExtensionContext,
): PartnerSnapshotPayload | undefined {
  const partner = resolvePartnerIdentity(context);
  if (!partner) {
    return undefined;
  }

  const progress = readPokemonProgress(
    context,
    partner.nickname,
    partner.species,
    Date.now(),
  );

  return {
    id: partner.id,
    species: partner.species,
    nickname: partner.nickname,
    shiny: partner.shiny,
    level: progress.level,
    xp: progress.currentXp,
    xpToNext:
      progress.level >= MAX_POKEMON_LEVEL
        ? 0
        : getPokemonXpForNextLevel(progress.level),
    friendship: progress.friendship,
    pokeball: progress.pokeballId,
  };
}
