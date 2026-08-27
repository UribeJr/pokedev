import * as vscode from 'vscode';
import { parseGithubCache } from '../trainer/github-parse';
import { normalizeTrainerProfile } from '../trainer/trainer-profile';
import {
  GithubProfileCache,
  GithubProfileView,
  TrainerProfile,
} from '../trainer/trainer-types';

/**
 * Persistence for Trainer Card state, following the extension's existing
 * pattern of keeping everything in `ExtensionContext.globalState`.
 *
 * Note what is deliberately absent: `globalState.setKeysForSync`. That method
 * REPLACES the whole sync list, and `storeCollectionAsMemento` in extension.ts
 * already calls it with the three Pokémon collection keys. Adding trainer keys
 * here would silently drop the Pokémon collection out of Settings Sync — a
 * regression that would only surface on a user's second machine.
 */

/** Game-side progression. */
export const TRAINER_PROFILE_KEY = 'vscode-pokemon.trainer.profile';

/** Temporarily cached public GitHub data, with its fetch timestamp. */
export const TRAINER_GITHUB_CACHE_KEY = 'vscode-pokemon.trainer.github-cache';

/**
 * Reads the trainer profile, repairing anything unusable.
 *
 * Always returns a profile: a missing or corrupt record yields fresh defaults
 * rather than an error, because the card must render regardless.
 */
export function readTrainerProfile(
  context: vscode.ExtensionContext,
  now: number,
  githubUsername?: string,
): TrainerProfile {
  const raw = context.globalState.get<unknown>(TRAINER_PROFILE_KEY);
  return normalizeTrainerProfile(raw, now, githubUsername);
}

export async function writeTrainerProfile(
  context: vscode.ExtensionContext,
  profile: TrainerProfile,
): Promise<void> {
  await context.globalState.update(TRAINER_PROFILE_KEY, profile);
}

/**
 * Ensures a profile exists and its username matches configuration, writing
 * only when something actually changed.
 */
export async function syncTrainerProfile(
  context: vscode.ExtensionContext,
  now: number,
  githubUsername: string,
): Promise<TrainerProfile> {
  const stored = context.globalState.get<unknown>(TRAINER_PROFILE_KEY);
  const profile = normalizeTrainerProfile(stored, now, githubUsername);
  const unchanged =
    stored !== undefined && JSON.stringify(stored) === JSON.stringify(profile);
  if (!unchanged) {
    await writeTrainerProfile(context, profile);
  }
  return profile;
}

export function readGithubCache(
  context: vscode.ExtensionContext,
): GithubProfileCache | undefined {
  return parseGithubCache(
    context.globalState.get<unknown>(TRAINER_GITHUB_CACHE_KEY),
  );
}

/**
 * Caches GitHub data. Only the fields the card displays are stored — see
 * `GithubProfileView` — so no unnecessary personal data is kept on disk.
 */
export async function writeGithubCache(
  context: vscode.ExtensionContext,
  username: string,
  data: GithubProfileView,
  now: number,
): Promise<GithubProfileCache> {
  const cache: GithubProfileCache = {
    version: 1,
    username: username.trim().toLowerCase(),
    fetchedAt: now,
    data,
  };
  await context.globalState.update(TRAINER_GITHUB_CACHE_KEY, cache);
  return cache;
}

export async function clearGithubCache(
  context: vscode.ExtensionContext,
): Promise<void> {
  await context.globalState.update(TRAINER_GITHUB_CACHE_KEY, undefined);
}
