/**
 * PokéDev Device Bridge protocol v1.
 *
 * A small, versioned JSON envelope for the local WebSocket connection to a
 * paired physical device (PokéDev Desk). There is no shared package between
 * a VS Code extension and a PlatformIO/Arduino firmware build, so this file
 * and the firmware's `pokedev-desk/src/network/protocol.h` are kept in sync
 * by hand - see `pokedev-desk/master_context.md` for the device-side mirror
 * of every message shape defined here.
 *
 * Two kinds of outbound message, deliberately kept separate:
 * - `state_snapshot` is TRUTH - the full current partner, sent whenever the
 *   device needs to be guaranteed correct (on connect, on reconnect, after
 *   any authoritative change, or on request).
 * - Everything else under `payload` for `xp_gained`/`level_up`/`evolution`/
 *   `friendship_changed`/`partner_changed` is a PRESENTATION fact - "this
 *   just happened" - for the device to animate. A snapshot always follows,
 *   so the device never has to reconstruct truth from a sequence of events.
 */

export const DEVICE_PROTOCOL_VERSION = 1;

export type DeviceMessageType =
  | 'hello'
  | 'hello_ack'
  | 'state_snapshot'
  | 'request_snapshot'
  | 'partner_changed'
  | 'xp_gained'
  | 'level_up'
  | 'evolution'
  | 'friendship_changed'
  | 'error'
  | 'command';

export interface DeviceEnvelope<T = unknown> {
  v: number;
  type: DeviceMessageType;
  payload?: T;
}

/** The one Pokemon a paired device ever needs to know about. Excludes
 * anything only meaningful to a webview (sprite URIs, localized names) -
 * see `partner-snapshot.ts` for why. */
export interface PartnerSnapshotPayload {
  /** Stable per-instance id - see `EXTRA_POKEMON_KEY_IDS`. */
  id: string;
  /** Lowercase `PokemonType` key, e.g. `"wartortle"` - the same string
   * desktop already uses as a `media/genN/<species>` folder name. */
  species: string;
  nickname: string;
  shiny: boolean;
  level: number;
  /** XP within the current level (not lifetime total) - the device displays
   * this directly and never re-derives a level from it. */
  xp: number;
  /** 0 at the level cap. */
  xpToNext: number;
  friendship: number;
  pokeball: string;
}

/** One entry in the Trainer Card's party list - a much thinner projection
 * than `ExplorerPokemonEntry` (no sprite/pokeball URIs, no XP - the device
 * only ever shows a species icon + level per slot, see
 * `pokedev-desk/src/network/trainer_snapshot.h`'s `PartyMemberPayload`). */
export interface PartyMemberPayload {
  id: string;
  species: string;
  nickname: string;
  shiny: boolean;
  level: number;
  /** True for whichever entry is also `state_snapshot.partner` - lets the
   * device highlight it in the party grid without a second id comparison. */
  isPartner: boolean;
}

/** Trainer Card summary for a paired device - see `trainer-snapshot.ts` for
 * how this is assembled and why each field is cache-only/read-only. */
export interface TrainerSnapshotPayload {
  /** GitHub display name, falling back to the configured username. */
  name: string;
  /** GitHub login, without the `@`. */
  handle: string;
  /** English label, e.g. `"Frontend Trainer"` - see
   * `TRAINER_CLASS_FALLBACK_LABELS`. Not localized for the device. */
  trainerClass: string;
  /** GitHub bio, emoji-stripped. Empty string when absent. */
  job: string;
  /** GitHub location. Empty string when absent. */
  location: string;
  /** One of `TRAINER_SPRITES`' ids (`trainer-sprite-catalog.ts`), e.g.
   * `"gen1-red"`. Empty string when the user has chosen their GitHub avatar
   * instead (`TrainerProfile.trainerSpriteId === null`) - the device has no
   * way to render an arbitrary photo, so it falls back to a default pixel
   * sprite rather than receiving a URL it can't use. */
  trainerSpriteId: string;
  level: number;
  /** XP within the current trainer level (not lifetime total) - same
   * convention as `PartnerSnapshotPayload.xp`. */
  xp: number;
  /** 0 at `MAX_TRAINER_LEVEL`. */
  xpToNext: number;
  /** Count of earned DEV Community badges - the device shows a count, not
   * icons (badge images are external/dynamic, not something to bake into
   * firmware at build time). */
  badgeCount: number;
  /** Up to 6 entries - see `MAX_DEVICE_PARTY_SLOTS` in `trainer-snapshot.ts`. */
  party: PartyMemberPayload[];
}

export interface StateSnapshotPayload {
  /** Absent when nothing is spawned yet (a fresh install with no Pokemon). */
  partner?: PartnerSnapshotPayload;
  /** Absent when no GitHub username is configured yet. */
  trainer?: TrainerSnapshotPayload;
}

export interface HelloPayload {
  token: string;
  device?: string;
  fw?: string;
}

export interface HelloAckPayload {
  ok: true;
  protocol: number;
}

export type ErrorCode =
  | 'unauthorized'
  | 'unsupported_protocol'
  | 'malformed'
  | 'unknown_command';

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
}

export interface PartnerChangedPayload {
  id: string;
  species: string;
}

export interface XpGainedPayload {
  id: string;
  amount: number;
  /** The `ProgressionEventType` that earned it (e.g. `"git-commit"`), for
   * a device that wants to vary its reaction by source. Free-form from the
   * device's point of view - new event types on the desktop side need no
   * protocol change. */
  source: string;
}

export interface LevelUpPayload {
  id: string;
  level: number;
}

export interface EvolutionPayload {
  id: string;
  from: string;
  to: string;
}

export interface FriendshipChangedPayload {
  id: string;
  delta: number;
}

/** Device -> server. Not applied yet in V1 - the desktop always validates
 * and decides the outcome; the device only ever requests, never asserts. */
export interface CommandPayload {
  command: string;
  id?: string;
}

export function encodeEnvelope<T>(
  type: DeviceMessageType,
  payload?: T,
): string {
  const envelope: DeviceEnvelope<T> =
    payload === undefined
      ? { v: DEVICE_PROTOCOL_VERSION, type }
      : { v: DEVICE_PROTOCOL_VERSION, type, payload };
  return JSON.stringify(envelope);
}

/** Returns `undefined` for anything that is not at least a well-formed
 * envelope - malformed JSON, a missing `type`, or a non-numeric `v`. Never
 * throws: a device on a flaky connection can send a truncated frame, and
 * that must degrade to a logged/ignored message, not a bridge crash. */
export function parseEnvelope(raw: string): DeviceEnvelope | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }
  const candidate = parsed as Partial<DeviceEnvelope>;
  if (typeof candidate.type !== 'string' || typeof candidate.v !== 'number') {
    return undefined;
  }
  return candidate as DeviceEnvelope;
}
