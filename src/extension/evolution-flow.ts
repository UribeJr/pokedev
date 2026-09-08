/**
 * Evolution: the canonical persistent mutation, the partner prompt built on
 * top of it, and startup recovery for saves a past bug left stale.
 *
 * A PokeDev Pokemon has ONE stable persistent identity for its whole
 * lifecycle - this extension's `nickname` field (see the doc comment on
 * `PokemonProgress` in `progression-types.ts`). Evolution changes that same
 * instance's SPECIES; it never creates a second Pokemon and never changes
 * which entry a caller is talking about. `evolvePokemonInstance` is the one
 * function that performs that mutation - every other evolution entry point
 * in this file (the partner prompt, the `Evolve Partner` command, startup
 * reconciliation) calls it rather than touching the collection arrays
 * itself.
 *
 * An evolution touches three things that must agree, in this order:
 *
 *   1. the persisted collection arrays  (authoritative on the next reload,
 *      in every other workspace, and after Cursor restarts)
 *   2. the live panel                   (what the user is looking at now)
 *   3. the Trainer Card / Explorer      (via `pokedevState.notify`)
 *
 * Progression itself needs no separate migration: it is keyed by nickname,
 * and an evolution changes species but never the name.
 */
import * as vscode from 'vscode';
import { POKEMON_DATA } from '../common/pokemon-data';
import {
  EXTRA_POKEMON_KEY_COLORS,
  EXTRA_POKEMON_KEY_NAMES,
  EXTRA_POKEMON_KEY_TYPES,
} from '../common/storage-keys';
import { PokemonColor, PokemonType } from '../common/types';
import { getLocalizedPokemonName } from '../common/localize';
import { normalizeColor } from '../panel/pokemon-collection';
import {
  evolveCollectionEntry,
  getAvailableEvolution,
  PokemonCollectionArrays,
  reconcileEntryEvolutions,
} from '../progression/evolution-service';
import { getTimeOfDay } from '../progression/time-of-day';
import { recordEvolution } from '../trainer/trainer-profile';
import { TrainerProfile } from '../trainer/trainer-types';
import { PROGRESSION_PARTNER_KEY } from '../common/storage-keys';
import {
  appendProgressionLogEvent,
  readPokemonProgress,
  readPokemonProgressMap,
  writePokemonProgress,
} from './progression-storage';
import { pokedevState } from './pokedev-state';
import type { ProgressionService } from './progression-service';
import { readTrainerProfile, writeTrainerProfile } from './trainer-storage';
import {
  listPartnerCandidates,
  resolvePartnerIdentity,
  setPartnerNickname,
} from './trainer-partner';

/**
 * Posts the live species swap to the Pokemon panel.
 *
 * Injected by `extension.ts` rather than imported, because everything that can
 * reach the panel lives in `extension.ts` and importing it here would form a
 * require cycle over its top-level constants.
 */
export type EvolutionPanelNotifier = (payload: {
  name: string;
  type: PokemonType;
  color: PokemonColor;
  generation: string;
  originalSpriteSize: number;
}) => void;

let notifyPanel: EvolutionPanelNotifier | undefined;

export function setEvolutionPanelNotifier(
  notifier: EvolutionPanelNotifier,
): void {
  notifyPanel = notifier;
}

/* ------------------------------------------------------------------ *
 * The canonical mutation
 * ------------------------------------------------------------------ */

/** What a successful `evolvePokemonInstance` call actually did. */
export interface EvolutionOutcome {
  /**
   * The instance's identity AFTER this call. For a Pokemon with a real
   * custom name this is always the same string it was before - evolution
   * never touches a genuine nickname. For one without a custom name, this
   * can differ from whatever identity the caller passed in, because that
   * identity was only ever a stand-in for the OLD species - see
   * `effectiveIdentityOf`. Callers that need to keep referring to this same
   * Pokemon (a UI holding a "currently evolving" reference, say) should use
   * THIS value afterwards, not the one they called with.
   */
  nickname: string;
  /** Current collection array position - re-resolved fresh, never trusted
   * from an earlier lookup. Preserved by this call, but callers should not
   * assume it stays constant across LATER, unrelated collection edits. */
  index: number;
  fromSpecies: PokemonType;
  toSpecies: PokemonType;
  color: PokemonColor;
  level: number;
}

function readCollectionArrays(
  context: vscode.ExtensionContext,
): PokemonCollectionArrays | undefined {
  const rawTypes = context.globalState.get<unknown>(
    EXTRA_POKEMON_KEY_TYPES,
    [],
  );
  if (!Array.isArray(rawTypes)) {
    return undefined;
  }
  const rawColors = context.globalState.get<unknown>(
    EXTRA_POKEMON_KEY_COLORS,
    [],
  );
  const rawNames = context.globalState.get<unknown>(
    EXTRA_POKEMON_KEY_NAMES,
    [],
  );
  return {
    types: rawTypes as string[],
    colors: (Array.isArray(rawColors) ? rawColors : []) as string[],
    names: (Array.isArray(rawNames) ? rawNames : []) as string[],
  };
}

/**
 * The identity a collection entry effectively has RIGHT NOW - mirrors
 * `listPartnerCandidates`'s own fallback exactly (a stored name when there is
 * one, otherwise the entry's own species).
 *
 * This is the sharp edge that made the original bug worse than a simple
 * "species did not persist" problem: for a Pokemon with no real custom name,
 * this identity IS the species - so the moment evolution changes the species
 * (whether or not the display name is also rewritten to match, see
 * `evolveCollectionEntry`), the entry's effective identity changes too. If
 * nothing accounts for that, the progression record written under the OLD
 * identity is orphaned, and the NEXT read under the NEW identity finds
 * nothing and silently defaults to a fresh level-5 record - which is exactly
 * how a correctly-evolved Pokemon can come back looking like a brand new one.
 * `evolvePokemonInstance` and `reconcileStaleEvolutions` both check for this
 * and carry the record across when it happens.
 */
function effectiveIdentityOf(
  names: readonly string[],
  species: string,
  index: number,
): string {
  const name = names[index];
  return typeof name === 'string' && name.length > 0 ? name : species;
}

/**
 * If `oldKey` was the Partner, repoints the Partner pointer at `newKey`.
 *
 * Without this, an evolution that changes an un-nicknamed Pokemon's
 * effective identity (see `effectiveIdentityOf`) leaves the Partner pointer
 * referencing an identity nothing resolves to any more -
 * `resolvePartnerIdentity` then silently falls back to the first entry in
 * the collection, which is a Partner switch nobody asked for.
 */
async function repointPartnerIfNeeded(
  context: vscode.ExtensionContext,
  oldKey: string,
  newKey: string,
): Promise<void> {
  if (oldKey === newKey) {
    return;
  }
  const current = context.globalState.get<unknown>(PROGRESSION_PARTNER_KEY);
  if (current === oldKey) {
    await setPartnerNickname(context, newKey);
  }
}

/**
 * Evolves ONE persistent Pokemon instance, identified by its stable
 * `nickname`, to whatever its current level and species entitle it to.
 *
 * This is the ONLY function that ever writes a species change to the
 * persistent collection. Everything else that can trigger an evolution -
 * the partner prompt below, the `Evolve Partner` command, startup
 * reconciliation - calls this rather than touching
 * `EXTRA_POKEMON_KEY_TYPES`/`_COLORS`/`_NAMES` itself.
 *
 * Re-resolves the instance's CURRENT array position from a fresh read via
 * `listPartnerCandidates` on every call, rather than accepting an index from
 * the caller - so a stale index computed before some other edit to the
 * collection can never cause this to write into the wrong slot, or into a
 * slot that used to belong to a different Pokemon.
 *
 * Also re-validates the evolution itself (`getAvailableEvolution`) rather
 * than trusting that a caller already checked: time can pass between a
 * decision to evolve and this actually running (the partner prompt awaits a
 * user click), and the only two facts that could have changed in between -
 * level and species - are exactly the ones this reads fresh.
 *
 * Returns `undefined` (and writes nothing) when the nickname cannot be
 * found, or when evolution is not actually available - a shiny with no
 * shiny sprite on the target, a level that has not been reached, or (not
 * possible in the current data set, but checked for future item/friendship/
 * trade conditions) anything that is not a plain level-up.
 */
export async function evolvePokemonInstance(
  context: vscode.ExtensionContext,
  nickname: string,
): Promise<EvolutionOutcome | undefined> {
  const identity = listPartnerCandidates(context).find(
    (candidate) => candidate.nickname === nickname,
  );
  if (!identity) {
    return undefined;
  }

  const now = Date.now();
  const progress = readPokemonProgress(
    context,
    identity.nickname,
    identity.species,
    now,
  );
  const availability = getAvailableEvolution(
    identity.species,
    progress.level,
    identity.shiny,
    { friendship: progress.friendship, timeOfDay: getTimeOfDay() },
  );
  if (!availability.available || !availability.rule) {
    return undefined;
  }

  const target = availability.rule.to;
  const config = POKEMON_DATA[target];
  if (!config) {
    return undefined;
  }

  const collection = readCollectionArrays(context);
  if (!collection) {
    return undefined;
  }

  const nextColor = normalizeColor(
    identity.shiny ? PokemonColor.shiny : PokemonColor.default,
    target,
  );
  const mutated = evolveCollectionEntry(
    collection,
    identity.index,
    target,
    nextColor,
  );
  if (!mutated) {
    return undefined;
  }

  await context.globalState.update(EXTRA_POKEMON_KEY_TYPES, mutated.types);
  await context.globalState.update(EXTRA_POKEMON_KEY_COLORS, mutated.colors);
  await context.globalState.update(EXTRA_POKEMON_KEY_NAMES, mutated.names);

  // For a Pokemon with a real custom name this is always the same key as
  // `identity.nickname`. For one without, `identity.nickname` was only ever
  // a computed stand-in for its OLD species - now that the species has
  // changed, that stand-in has changed too, and the progression record must
  // move with it or it becomes unreachable. See `effectiveIdentityOf`.
  const newIdentity = effectiveIdentityOf(
    mutated.names,
    target,
    identity.index,
  );

  // Species on the progression record is advisory, but leaving it stale
  // would make the activity log lie. Everything else on the record - the
  // XP total, the level, the creation timestamp - is untouched, because
  // nothing here rewrites it: only this one field changes.
  await writePokemonProgress(context, newIdentity, {
    ...progress,
    species: target,
  });
  await repointPartnerIfNeeded(context, identity.nickname, newIdentity);

  await writeTrainerProfile(
    context,
    recordEvolution(readTrainerProfile(context, now)),
  );

  // The one broadcast every consumer already subscribes to: the Explorer
  // team list, the compact Trainer HUD's partner card, and the full Trainer
  // Card's PARTY/PARTNER sections all rebuild from storage on this same
  // event, so nothing here needs to know any of them exist.
  pokedevState.notify('collection');

  // Observational only - see `ProgressionEventType`'s own doc comment.
  // Grants no XP; PokeGear's ACTIVITY tab reads this same log.
  await appendProgressionLogEvent(context, {
    type: 'pokemon-evolved',
    trainerXp: 0,
    pokemonXp: 0,
    timestamp: now,
    metadata: {
      nickname: newIdentity,
      fromSpecies: identity.species,
      toSpecies: target,
    },
  });

  return {
    nickname: newIdentity,
    index: identity.index,
    fromSpecies: identity.species,
    toSpecies: target,
    color: nextColor,
    level: progress.level,
  };
}

/* ------------------------------------------------------------------ *
 * The partner prompt
 * ------------------------------------------------------------------ */

/**
 * Asks whether to evolve, then does it if the user agrees.
 *
 * Uses a real notification with actions rather than a status-bar note: this is
 * the one moment in the whole system that needs a decision.
 */
export async function promptToEvolvePartner(
  context: vscode.ExtensionContext,
  service: ProgressionService,
): Promise<void> {
  const partner = resolvePartnerIdentity(context);
  if (!partner) {
    return;
  }
  const progress = readPokemonProgress(
    context,
    partner.nickname,
    partner.species,
    Date.now(),
  );
  const availability = getAvailableEvolution(
    partner.species,
    progress.level,
    partner.shiny,
    { friendship: progress.friendship, timeOfDay: getTimeOfDay() },
  );
  if (!availability.available || !availability.rule) {
    return;
  }

  const displayName =
    partner.nickname || getLocalizedPokemonName(partner.species);
  const evolve = vscode.l10n.t('Evolve');
  const notNow = vscode.l10n.t('Not now');

  const choice = await vscode.window.showInformationMessage(
    vscode.l10n.t('What? {0} is ready to evolve!', displayName),
    evolve,
    notNow,
  );

  if (choice !== evolve) {
    // Remember the refusal against the CURRENT level only, so the offer comes
    // back on the next level-up rather than being suppressed forever.
    await writePokemonProgress(context, partner.nickname, {
      ...progress,
      declinedEvolutionAtLevel: progress.level,
    });
    return;
  }

  await applyEvolution(context, service);
}

/**
 * Performs the partner's evolution: the canonical mutation
 * (`evolvePokemonInstance`), then the world/UI feedback that only makes
 * sense for the Pokemon currently rendered as the partner.
 */
export async function applyEvolution(
  context: vscode.ExtensionContext,
  service: ProgressionService,
): Promise<boolean> {
  const partner = resolvePartnerIdentity(context);
  if (!partner) {
    return false;
  }

  const outcome = await evolvePokemonInstance(context, partner.nickname);
  if (!outcome) {
    return false;
  }

  const config = POKEMON_DATA[outcome.toSpecies];
  notifyPanel?.({
    // The currently-rendered walking sprite is still registered under its
    // PRE-evolution name (`partner.nickname`) - the panel never renames an
    // element, it only ever re-skins it in place (`evolveTo`) - so locating
    // it must use that, even though the persisted identity going forward is
    // `outcome.nickname`.
    name: partner.nickname,
    type: outcome.toSpecies,
    color: outcome.color,
    // The `gen`-prefixed form: the sprite root is `media/gen1/<type>/<color>`,
    // and a bare "1" would silently resolve to a missing directory.
    generation: `gen${config.generation}`,
    originalSpriteSize: config.originalSpriteSize || 32,
  });

  service.notifyCard();

  void vscode.window.showInformationMessage(
    vscode.l10n.t(
      'Congratulations! Your {0} evolved into {1}!',
      getLocalizedPokemonName(outcome.fromSpecies),
      getLocalizedPokemonName(outcome.toSpecies),
    ),
  );

  return true;
}

/**
 * The `Evolve Partner` command.
 *
 * Ignores a previous "Not now" entirely - asking for it explicitly is the
 * clearest possible statement of intent - and explains itself when there is
 * nothing to do.
 */
export async function evolvePartnerCommand(
  context: vscode.ExtensionContext,
  service: ProgressionService,
): Promise<void> {
  const partner = resolvePartnerIdentity(context);
  if (!partner) {
    void vscode.window.showInformationMessage(
      vscode.l10n.t('You have no partner Pokemon yet. Spawn one first!'),
    );
    return;
  }

  const progress = readPokemonProgress(
    context,
    partner.nickname,
    partner.species,
    Date.now(),
  );
  const availability = getAvailableEvolution(
    partner.species,
    progress.level,
    partner.shiny,
    { friendship: progress.friendship, timeOfDay: getTimeOfDay() },
  );
  const displayName =
    partner.nickname || getLocalizedPokemonName(partner.species);

  if (availability.available) {
    await applyEvolution(context, service);
    return;
  }

  switch (availability.reason) {
    case 'level-too-low':
      void vscode.window.showInformationMessage(
        vscode.l10n.t(
          '{0} needs to reach Lv. {1} to evolve. It is Lv. {2}.',
          displayName,
          availability.requiredLevel ?? 0,
          progress.level,
        ),
      );
      return;
    case 'shiny-unavailable':
      void vscode.window.showInformationMessage(
        vscode.l10n.t(
          '{0} cannot evolve yet: no shiny sprite exists for its evolved form.',
          displayName,
        ),
      );
      return;
    case 'friendship-too-low':
      void vscode.window.showInformationMessage(
        vscode.l10n.t(
          '{0} needs to grow closer to you before it can evolve.',
          displayName,
        ),
      );
      return;
    case 'wrong-time-of-day':
      void vscode.window.showInformationMessage(
        vscode.l10n.t(
          '{0} is close enough to evolve, but only during the {1}.',
          displayName,
          availability.requiredTimeOfDay === 'day'
            ? vscode.l10n.t('day')
            : vscode.l10n.t('night'),
        ),
      );
      return;
    default:
      void vscode.window.showInformationMessage(
        vscode.l10n.t('{0} has no known evolution yet.', displayName),
      );
  }
}

/* ------------------------------------------------------------------ *
 * Stale-save recovery
 * ------------------------------------------------------------------ */

export interface EvolutionReconciliationSummary {
  /** How many persistent Pokemon were repaired. */
  repairedCount: number;
  /** Total evolution steps applied across every repaired Pokemon - can
   * exceed `repairedCount` when a single stale save catches up on more than
   * one threshold at once. */
  evolutionHops: number;
}

function applyRecordEvolutionTimes(
  profile: TrainerProfile,
  times: number,
): TrainerProfile {
  let next = profile;
  for (let i = 0; i < times; i++) {
    next = recordEvolution(next);
  }
  return next;
}

/**
 * Repairs persistent Pokemon whose progression already proves an evolution
 * should have happened, but whose persisted species never actually changed -
 * the recovery path for saves written before this bug was fixed (or any
 * future bug with the same shape).
 *
 * Safe to run on EVERY activation:
 *
 *   - idempotent - a repaired Pokemon's species is now the evolved one, so
 *     the same check finds nothing to do on the very next call;
 *   - conservative - `reconcileEntryEvolutions` only ever walks plain
 *     level-up rules, never a standing decline, never past a missing shiny
 *     sprite; a Pokemon whose evolution needs an item, friendship, trade or
 *     any other condition this table does not encode yet is left completely
 *     alone;
 *   - a single batched write (or none at all, on an already-consistent
 *     save) rather than one write per repaired Pokemon.
 */
export async function reconcileStaleEvolutions(
  context: vscode.ExtensionContext,
): Promise<EvolutionReconciliationSummary> {
  const none: EvolutionReconciliationSummary = {
    repairedCount: 0,
    evolutionHops: 0,
  };

  const collection = readCollectionArrays(context);
  if (!collection || collection.types.length === 0) {
    return none;
  }

  let types = collection.types.slice();
  let colors = collection.colors.slice();
  let names = collection.names.slice();

  const now = Date.now();
  let repairedCount = 0;
  let evolutionHops = 0;
  let profile: TrainerProfile | undefined;

  for (let index = 0; index < types.length; index++) {
    const species = types[index];
    if (typeof species !== 'string' || !POKEMON_DATA[species as PokemonType]) {
      // Unknown or retired species - never guessed at, exactly like every
      // other reader of this collection (`listPartnerCandidates`).
      continue;
    }
    const nickname =
      typeof names[index] === 'string' && names[index].length > 0
        ? names[index]
        : species;
    const shiny = colors[index] === PokemonColor.shiny;
    const progress = readPokemonProgress(
      context,
      nickname,
      species as PokemonType,
      now,
    );

    const steps = reconcileEntryEvolutions({
      species: species as PokemonType,
      shiny,
      level: progress.level,
      declinedEvolutionAtLevel: progress.declinedEvolutionAtLevel,
    });
    if (steps.length === 0) {
      continue;
    }

    const finalSpecies = steps[steps.length - 1].toSpecies;
    const finalColor = normalizeColor(
      shiny ? PokemonColor.shiny : PokemonColor.default,
      finalSpecies,
    );
    const mutated = evolveCollectionEntry(
      { types, colors, names },
      index,
      finalSpecies,
      finalColor,
    );
    if (!mutated) {
      continue;
    }
    types = mutated.types;
    colors = mutated.colors;
    names = mutated.names;

    const newIdentity = effectiveIdentityOf(names, finalSpecies, index);
    await writePokemonProgress(context, newIdentity, {
      ...progress,
      species: finalSpecies,
    });
    await repointPartnerIfNeeded(context, nickname, newIdentity);

    profile = applyRecordEvolutionTimes(
      profile ?? readTrainerProfile(context, now),
      steps.length,
    );
    repairedCount += 1;
    evolutionHops += steps.length;
  }

  if (repairedCount === 0) {
    return none;
  }

  await context.globalState.update(EXTRA_POKEMON_KEY_TYPES, types);
  await context.globalState.update(EXTRA_POKEMON_KEY_COLORS, colors);
  await context.globalState.update(EXTRA_POKEMON_KEY_NAMES, names);
  if (profile) {
    await writeTrainerProfile(context, profile);
  }
  pokedevState.notify('collection');

  return { repairedCount, evolutionHops };
}

/* ------------------------------------------------------------------ *
 * Legacy corruption recovery
 * ------------------------------------------------------------------ */

export interface OrphanRelinkSummary {
  /** How many collection entries were reunited with a progression record
   * they had lost access to. */
  relinkedCount: number;
}

/**
 * Repairs the specific corruption an earlier version of evolution left
 * behind: a Pokemon with no real custom name evolved, its persisted SPECIES
 * changed correctly, but its progression record - written under an identity
 * that was only ever a stand-in for its OLD species - was never carried
 * across (see `effectiveIdentityOf`). The entry then read back with no
 * progression record at all and silently defaulted to a fresh level 5,
 * while its real history sat orphaned under the old key.
 *
 * Conservative on purpose, matching this project's rule that preserving data
 * beats guessing at it: for each collection entry with no progression record
 * under its CURRENT identity, this looks for progression records that are
 * both UNCLAIMED (no current collection entry resolves to that key) and
 * recorded against the SAME species this entry is now. Only when there is
 * EXACTLY ONE such candidate does it get adopted; zero or several candidates
 * (which this deliberately cannot tell apart - e.g. more than one separately
 * spawned Pokemon of the same evolved species, with no distinguishing
 * history) are left completely alone rather than risking attaching the wrong
 * history to the wrong Pokemon. Nothing is ever deleted: an orphan that is
 * not adopted stays exactly as it was, in case it turns out to matter later.
 *
 * Idempotent: an entry this has already relinked has a record under its
 * current identity by the next call, so it is never touched again.
 */
export async function relinkOrphanedProgression(
  context: vscode.ExtensionContext,
): Promise<OrphanRelinkSummary> {
  const none: OrphanRelinkSummary = { relinkedCount: 0 };

  const collection = readCollectionArrays(context);
  if (!collection || collection.types.length === 0) {
    return none;
  }

  interface Entry {
    index: number;
    species: string;
    identity: string;
  }
  const entries: Entry[] = [];
  const claimedKeys = new Set<string>();
  for (let index = 0; index < collection.types.length; index++) {
    const species = collection.types[index];
    if (typeof species !== 'string' || !POKEMON_DATA[species as PokemonType]) {
      continue;
    }
    const identity = effectiveIdentityOf(collection.names, species, index);
    entries.push({ index, species, identity });
    claimedKeys.add(identity);
  }
  if (entries.length === 0) {
    return none;
  }

  const progressMap = readPokemonProgressMap(context);
  let relinkedCount = 0;

  for (const entry of entries) {
    if (progressMap[entry.identity] !== undefined) {
      continue; // already has a record under its current identity
    }

    const candidates = Object.keys(progressMap).filter(
      (key) =>
        !claimedKeys.has(key) && progressMap[key]?.species === entry.species,
    );
    if (candidates.length !== 1) {
      // None, or too ambiguous to guess between - leave every candidate
      // exactly as it is.
      continue;
    }

    const orphanKey = candidates[0];
    const orphanRecord = progressMap[orphanKey];
    await writePokemonProgress(context, entry.identity, orphanRecord);
    await repointPartnerIfNeeded(context, orphanKey, entry.identity);
    // Claimed now, so a second orphan that happens to match the same
    // species later in this same pass cannot also be adopted by mistake.
    claimedKeys.add(orphanKey);
    relinkedCount += 1;
  }

  if (relinkedCount > 0) {
    pokedevState.notify('collection');
  }

  return { relinkedCount };
}
