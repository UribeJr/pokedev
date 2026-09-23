/**
 * Adapts existing PokéDev state into a `TrainerSnapshotPayload` for the
 * Device Bridge - the Trainer Card's counterpart to `partner-snapshot.ts`.
 *
 * Deliberately thin and read-only, same as that file: it reuses the exact
 * services the Trainer Card panel and Explorer HUD already read from
 * (`readTrainerProfile`, `readGithubCache`, `readDevCache`,
 * `listPartnerCandidates`/`resolvePartnerIdentity`, `readPokemonProgress`),
 * cache-only for GitHub/DEV data - this must never itself trigger a network
 * fetch, since it runs on every `state_snapshot` (connect, reconnect, every
 * progression/collection change). No progression rule lives here, only a
 * read and a reshape - and unlike `buildPartyEntries`/`buildTrainerView` in
 * `pokedev-state.ts`, no `vscode.Webview` is available or needed here, so
 * sprite/pokeball URIs are omitted entirely (the device renders its own
 * embedded sprites by species name).
 */
import * as vscode from 'vscode';
import { stripEmoji } from '../../panel/trainer-card/card-presentation';
import {
  computeTrainerClass,
  TRAINER_CLASS_FALLBACK_LABELS,
} from '../../trainer/trainer-class';
import {
  getXpForNextTrainerLevel,
  MAX_TRAINER_LEVEL,
} from '../../trainer/trainer-profile';
import { readPokemonProgress } from '../progression-storage';
import {
  getConfiguredDevUsername,
  getConfiguredGithubUsername,
} from '../trainer-card-panel';
import {
  listPartnerCandidates,
  resolvePartnerIdentity,
} from '../trainer-partner';
import {
  readDevCache,
  readGithubCache,
  readTrainerProfile,
} from '../trainer-storage';
import { PartyMemberPayload, TrainerSnapshotPayload } from './device-protocol';

/** The physical card only has room for a handful of party rows - see
 * `pokedev-desk/src/network/trainer_snapshot.h`'s own `kMaxPartySlots`,
 * which this must stay in sync with by hand (same reasoning as every other
 * hand-mirrored protocol constant in this file's sibling, device-protocol.ts). */
const MAX_DEVICE_PARTY_SLOTS = 6;

/** Returns `undefined` when no GitHub username is configured yet - the
 * caller encodes that as a `state_snapshot` with no `trainer` field, same
 * convention `buildPartnerSnapshotPayload` uses for "nothing spawned yet". */
export function buildTrainerSnapshotPayload(
  context: vscode.ExtensionContext,
): TrainerSnapshotPayload | undefined {
  const githubUsername = getConfiguredGithubUsername();
  if (githubUsername.length === 0) {
    return undefined;
  }

  const now = Date.now();
  const profile = readTrainerProfile(context, now, githubUsername);
  const githubCached = readGithubCache(context);
  const github =
    githubCached && githubCached.username === githubUsername.toLowerCase()
      ? githubCached.data
      : undefined;

  const devUsername = getConfiguredDevUsername();
  const devCached = devUsername.length > 0 ? readDevCache(context) : undefined;
  const badgeCount =
    devCached && devCached.username === devUsername.toLowerCase()
      ? devCached.badges.length
      : 0;

  const trainerClassId = computeTrainerClass(github?.topLanguages);
  const partnerId = resolvePartnerIdentity(context)?.id;

  const party: PartyMemberPayload[] = listPartnerCandidates(context)
    .slice(0, MAX_DEVICE_PARTY_SLOTS)
    .map((entry) => {
      const progress = readPokemonProgress(
        context,
        entry.nickname,
        entry.species,
        now,
      );
      return {
        id: entry.id,
        species: entry.species,
        nickname: entry.nickname,
        shiny: entry.shiny,
        level: progress.level,
        isPartner: entry.id.length > 0 && entry.id === partnerId,
      };
    });

  return {
    name: github?.displayName || githubUsername,
    handle: github?.login || githubUsername,
    trainerClass: TRAINER_CLASS_FALLBACK_LABELS[trainerClassId],
    job: stripEmoji(github?.bio ?? ''),
    location: github?.location ?? '',
    // `null` means "use my GitHub avatar photo instead" - not something a
    // pixel-art device screen can render, so it's left to the device to
    // fall back to a default pixel sprite rather than sending a URL here.
    trainerSpriteId: profile.trainerSpriteId ?? '',
    level: profile.trainerLevel,
    xp: profile.trainerXp,
    xpToNext:
      profile.trainerLevel >= MAX_TRAINER_LEVEL
        ? 0
        : getXpForNextTrainerLevel(profile.trainerLevel),
    badgeCount,
    party,
  };
}
