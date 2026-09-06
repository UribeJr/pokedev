/**
 * Catalog of selectable roaming-world environments (a background scene
 * behind the Pokémon), independent of the "display border" skin system in
 * `display-skins.ts`.
 *
 * Pure data, no `vscode` import: bundled into BOTH the extension host
 * (`src/extension/extension.ts`, to build the QuickPick and resolve webview
 * URIs) and the world webview's client bundle (`src/panel/main.ts`, to pick
 * the background image), mirroring `display-skins.ts`'s exact split.
 *
 * `variants` is reserved for a future time-of-day/weather palette swap (see
 * the module doc on `PokedevEnvironment`) - nothing reads it yet, and no
 * runtime switching exists in this milestone.
 *
 * ---------------------------------------------------------------------------
 * ASSET PROVENANCE / LICENSING - READ BEFORE TOUCHING `imageFile`
 * ---------------------------------------------------------------------------
 * See the header comment in `scripts/build-crystal-environments.py` for
 * exactly which pret/pokecrystal source files each scene is composed from,
 * and the licensing caveat that applies to all of them: pret/pokecrystal is
 * a reverse-engineered
 * disassembly of Pokémon Crystal, and its checked-in graphics are Nintendo/
 * Game Freak's copyrighted pixel art in a different form, not code the
 * project's own (permissive) license can re-license on the artists' behalf.
 * `media/environments/*.png` is therefore gitignored, exactly like
 * `media/borders/*.png` (see `display-skins.ts`'s own provenance note) -
 * local-only, for development/testing, never committed or published from
 * here until that is explicitly cleared.
 */

export interface PokedevEnvironmentVariants {
  morning?: string;
  day?: string;
  night?: string;
}

export interface PokedevEnvironment {
  id: string;
  label: string;
  description: string;
  /** Path relative to the `media/` directory. Undefined for the `none`
   * environment, which renders no background image at all. */
  imageFile?: string;
  /** Short human-readable note on where the source art came from. */
  sourceAttribution?: string;
  /**
   * Reserved for a future palette-variant system (morning/day/night). Not
   * read anywhere yet - see the module doc above.
   */
  variants?: PokedevEnvironmentVariants;
}

export const DEFAULT_ENVIRONMENT_ID = 'none';

export const ENVIRONMENTS: readonly PokedevEnvironment[] = [
  {
    id: 'none',
    label: 'None',
    description: 'The classic PokéDev world, no background scene.',
  },
  {
    id: 'johto-route',
    label: 'Johto Route',
    description: 'A grassy overworld route with a dirt path.',
    imageFile: 'environments/johto-route.png',
    sourceAttribution: 'pret/pokecrystal overworld tileset (see build script)',
  },
  {
    id: 'ilex-forest',
    label: 'Ilex Forest',
    description: 'A dense forest clearing.',
    imageFile: 'environments/ilex-forest.png',
    sourceAttribution: 'pret/pokecrystal forest tileset (see build script)',
  },
  {
    id: 'cave',
    label: 'Cave',
    description: 'A rocky cave interior.',
    imageFile: 'environments/cave.png',
    sourceAttribution: 'pret/pokecrystal cave tileset (see build script)',
  },
];

export function isValidEnvironmentId(id: string | undefined): boolean {
  if (!id) {
    return false;
  }
  return ENVIRONMENTS.some((environment) => environment.id === id);
}

/** Falls back to the `none` environment for an unknown/missing id, never
 * throws. */
export function getEnvironmentById(id: string | undefined): PokedevEnvironment {
  const found = ENVIRONMENTS.find((environment) => environment.id === id);
  if (found) {
    return found;
  }
  // ENVIRONMENTS[0] is 'none' by construction; asserted in tests.
  return ENVIRONMENTS[0];
}
