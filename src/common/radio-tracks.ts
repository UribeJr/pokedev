/**
 * Catalog of PokéGear RADIO tracks for the "GEN II FM" station.
 *
 * Pure data, no `vscode` import: bundled into BOTH the extension host and
 * the PokeGear webview's client bundle, mirroring `items.ts`/`pokeballs.ts`'s
 * exact split. `src/extension/radio-service.ts` is this catalog's equivalent
 * of `pokeball-service.ts`, resolving `assetPath` into a webview URI.
 *
 * SOURCE / PROVENANCE
 * --------------------
 * Every `sourceConstant`/`sourcePath` below names the REAL song id and REAL
 * `.asm` source file from the public disassembly at
 * https://github.com/pret/pokecrystal (audio/music/*.asm, driven by
 * audio/music_pointers.asm and constants/music_constants.asm). These were
 * confirmed by inspecting a clone of that repository directly - nothing here
 * is guessed, and no source path was assumed without checking. Where two or
 * more in-game locations share one song (verified against
 * `data/maps/maps.asm`'s per-map `MUSIC_*` assignment), this catalog lists
 * ONE track under its real in-game title rather than duplicating the same
 * song under invented per-location names:
 *   - "Route 30" (`MUSIC_ROUTE_30`) is also the theme for Route 31 and
 *     Route 32.
 *   - "Route 36" (`MUSIC_ROUTE_36`) is also the theme for Route 37.
 *   - "Union Cave" (`MUSIC_UNION_CAVE`) is also the theme used for Ilex
 *     Forest - Ilex Forest has no music of its own in pokecrystal.
 *
 * COPYRIGHT - NO BUNDLED ORIGINAL AUDIO
 * ---------------------------------------
 * The pret/pokecrystal disassembly is public source, but the underlying
 * musical compositions remain Nintendo/Creatures/GAME FREAK's copyrighted
 * work. This extension does NOT bundle rendered recordings of the original
 * compositions. Every `assetPath` below resolves (see `radio-service.ts`,
 * `media/radio/gen2fm/`) to either:
 *   (a) a short, originally-authored placeholder tone (safe to ship, not a
 *       reproduction of any Nintendo composition), or
 *   (b) audio a developer rendered LOCALLY from their own pokecrystal
 *       checkout via `tools/radio/render-from-pokecrystal.md`'s pipeline,
 *       which is never committed to this repository or distributed with the
 *       packaged extension.
 * See `docs/RADIO_ATTRIBUTION.md` for the full explanation.
 *
 * V1 SCOPE
 * --------
 * One curated, background-friendly station ("GEN II FM"): town/route/travel/
 * indoor themes only. No battle, trainer, Rocket, or victory tracks - see
 * this milestone's own instruction to keep V1 relaxing/ambient. A battle
 * station is a natural, separate follow-up (see `category` below is already
 * shaped to support one without a catalog rework).
 */

export type RadioTrackId = string;

export type RadioTrackCategory =
  | 'town'
  | 'route'
  | 'indoor'
  | 'travel'
  | 'special';

export interface RadioTrackDefinition {
  /** Stable identifier, kebab-case from the real in-game title. Persisted
   * (`pokedev.pokeGear.radio.lastTrackId`) - never derive identity from
   * array position. */
  id: RadioTrackId;
  /** Real in-game title (or the closest real title when a track covers more
   * than one location - see the module doc comment). */
  title: string;
  /** The real `MUSIC_*` constant from pokecrystal's
   * `constants/music_constants.asm`. */
  sourceConstant: string;
  /** The real `.asm` source file, relative to a pokecrystal checkout root. */
  sourcePath: string;
  /** Relative to `media/radio/gen2fm/` - see `radio-service.ts`. */
  assetPath: string;
  category: RadioTrackCategory;
  /** Set only when a track is also the real theme for other locations that
   * do not get their own catalog entry - see the module doc comment. */
  alsoUsedFor?: readonly string[];
}

export const RADIO_STATION_ID = 'gen2fm';
export const RADIO_STATION_NAME = 'GEN II FM';

export const RADIO_TRACK_DEFINITIONS: readonly RadioTrackDefinition[] = [
  {
    id: 'bicycle',
    title: 'Bicycle',
    sourceConstant: 'MUSIC_BICYCLE',
    sourcePath: 'audio/music/bicycle.asm',
    assetPath: 'bicycle.ogg',
    category: 'travel',
  },
  {
    id: 'surf',
    title: 'Surf',
    sourceConstant: 'MUSIC_SURF',
    sourcePath: 'audio/music/surf.asm',
    assetPath: 'surf.ogg',
    category: 'travel',
  },
  {
    id: 'pokemon-center',
    title: 'Pokémon Center',
    sourceConstant: 'MUSIC_POKEMON_CENTER',
    sourcePath: 'audio/music/pokemoncenter.asm',
    assetPath: 'pokemon-center.ogg',
    category: 'indoor',
  },
  {
    id: 'game-corner',
    title: 'Game Corner',
    sourceConstant: 'MUSIC_GAME_CORNER',
    sourcePath: 'audio/music/gamecorner.asm',
    assetPath: 'game-corner.ogg',
    category: 'indoor',
  },
  {
    id: 'union-cave',
    title: 'Union Cave',
    sourceConstant: 'MUSIC_UNION_CAVE',
    sourcePath: 'audio/music/unioncave.asm',
    assetPath: 'union-cave.ogg',
    category: 'indoor',
    alsoUsedFor: ['Ilex Forest'],
  },
  {
    id: 'cherrygrove-city',
    title: 'Cherrygrove City',
    sourceConstant: 'MUSIC_CHERRYGROVE_CITY',
    sourcePath: 'audio/music/cherrygrovecity.asm',
    assetPath: 'cherrygrove-city.ogg',
    category: 'town',
  },
  {
    id: 'violet-city',
    title: 'Violet City',
    sourceConstant: 'MUSIC_VIOLET_CITY',
    sourcePath: 'audio/music/violetcity.asm',
    assetPath: 'violet-city.ogg',
    category: 'town',
  },
  {
    id: 'azalea-town',
    title: 'Azalea Town',
    sourceConstant: 'MUSIC_AZALEA_TOWN',
    sourcePath: 'audio/music/azaleatown.asm',
    assetPath: 'azalea-town.ogg',
    category: 'town',
  },
  {
    id: 'goldenrod-city',
    title: 'Goldenrod City',
    sourceConstant: 'MUSIC_GOLDENROD_CITY',
    sourcePath: 'audio/music/goldenrodcity.asm',
    assetPath: 'goldenrod-city.ogg',
    category: 'town',
  },
  {
    id: 'ecruteak-city',
    title: 'Ecruteak City',
    sourceConstant: 'MUSIC_ECRUTEAK_CITY',
    sourcePath: 'audio/music/ecruteakcity.asm',
    assetPath: 'ecruteak-city.ogg',
    category: 'town',
  },
  {
    id: 'route-29',
    title: 'Route 29',
    sourceConstant: 'MUSIC_ROUTE_29',
    sourcePath: 'audio/music/route29.asm',
    assetPath: 'route-29.ogg',
    category: 'route',
  },
  {
    id: 'route-30',
    title: 'Route 30',
    sourceConstant: 'MUSIC_ROUTE_30',
    sourcePath: 'audio/music/route30.asm',
    assetPath: 'route-30.ogg',
    category: 'route',
    alsoUsedFor: ['Route 31', 'Route 32'],
  },
  {
    id: 'route-36',
    title: 'Route 36',
    sourceConstant: 'MUSIC_ROUTE_36',
    sourcePath: 'audio/music/route36.asm',
    assetPath: 'route-36.ogg',
    category: 'route',
    alsoUsedFor: ['Route 37'],
  },
  {
    id: 'national-park',
    title: 'National Park',
    sourceConstant: 'MUSIC_NATIONAL_PARK',
    sourcePath: 'audio/music/nationalpark.asm',
    assetPath: 'national-park.ogg',
    category: 'special',
  },
] as const;

const RADIO_TRACKS_BY_ID: Readonly<Record<string, RadioTrackDefinition>> =
  (() => {
    const map: Record<string, RadioTrackDefinition> = {};
    for (const track of RADIO_TRACK_DEFINITIONS) {
      map[track.id] = track;
    }
    return map;
  })();

export function isValidRadioTrackId(
  id: string | undefined,
): id is RadioTrackId {
  if (!id) {
    return false;
  }
  return RADIO_TRACKS_BY_ID[id] !== undefined;
}

export function getRadioTrackDefinition(
  id: string | undefined,
): RadioTrackDefinition | undefined {
  if (!id) {
    return undefined;
  }
  return RADIO_TRACKS_BY_ID[id];
}
