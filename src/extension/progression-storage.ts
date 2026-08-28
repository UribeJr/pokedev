/**
 * Persistence for progression state.
 *
 * All reads normalize, so a record written by an older release - or one that
 * never existed - loads as a safe default rather than throwing. No user is
 * ever asked to reset the extension.
 *
 * Deliberately does NOT call `globalState.setKeysForSync`: that method
 * replaces the entire sync list, and the Pokemon collection already owns it.
 */
import * as vscode from 'vscode';
import {
  PROGRESSION_COMMITS_KEY,
  PROGRESSION_LOG_KEY,
  PROGRESSION_POKEMON_KEY,
} from '../common/storage-keys';
import {
  createDefaultPokemonProgress,
  normalizePokemonProgress,
} from '../progression/pokemon-progression';
import {
  PokemonProgress,
  ProgressionEvent,
} from '../progression/progression-types';
import { rememberCommitIn } from '../progression/activity-rules';
import { normalizeLog } from '../progression/xp-ledger';

/** Progression for every Pokemon that has ever earned XP, keyed by nickname. */
export type PokemonProgressMap = Record<string, PokemonProgress>;

export function readPokemonProgressMap(
  context: vscode.ExtensionContext,
): PokemonProgressMap {
  const raw = context.globalState.get<unknown>(PROGRESSION_POKEMON_KEY, {});
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }
  return raw as PokemonProgressMap;
}

/**
 * Progression for one Pokemon, defaulting it if this is the first time.
 *
 * This is the migration path for every Pokemon saved before progression
 * existed: they simply have no entry, and get a fresh one at the default
 * starting level on first read.
 */
export function readPokemonProgress(
  context: vscode.ExtensionContext,
  nickname: string,
  species: string,
  now: number,
): PokemonProgress {
  const map = readPokemonProgressMap(context);
  const stored = map[nickname];
  if (stored === undefined) {
    return createDefaultPokemonProgress(species, now);
  }
  return normalizePokemonProgress(stored, species, now);
}

export async function writePokemonProgress(
  context: vscode.ExtensionContext,
  nickname: string,
  progress: PokemonProgress,
): Promise<void> {
  const map = readPokemonProgressMap(context);
  map[nickname] = progress;
  await context.globalState.update(PROGRESSION_POKEMON_KEY, map);
}

/* -------------------------------- log ---------------------------------- */

export function readProgressionLog(
  context: vscode.ExtensionContext,
): ProgressionEvent[] {
  return normalizeLog(
    context.globalState.get<unknown>(PROGRESSION_LOG_KEY, []),
  );
}

export async function writeProgressionLog(
  context: vscode.ExtensionContext,
  log: readonly ProgressionEvent[],
): Promise<void> {
  await context.globalState.update(PROGRESSION_LOG_KEY, log);
}

/* ------------------------------ commits -------------------------------- */

/**
 * Commit hashes already rewarded in THIS workspace.
 *
 * Workspace-scoped because a commit belongs to a repository, not to a user:
 * the same person working in two checkouts should be paid for each repo's
 * commits, and cloning a repo elsewhere should not silently owe them nothing.
 */
export function readRewardedCommits(
  context: vscode.ExtensionContext,
): string[] {
  const raw = context.workspaceState.get<unknown>(PROGRESSION_COMMITS_KEY, []);
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((entry): entry is string => typeof entry === 'string');
}

export async function rememberCommit(
  context: vscode.ExtensionContext,
  sha: string,
): Promise<void> {
  const existing = readRewardedCommits(context);
  if (existing.indexOf(sha) !== -1) {
    return;
  }
  // Newest first, oldest dropped: re-awarding a commit from hundreds ago would
  // require deliberately resetting HEAD back to it.
  await context.workspaceState.update(
    PROGRESSION_COMMITS_KEY,
    rememberCommitIn(existing, sha),
  );
}
