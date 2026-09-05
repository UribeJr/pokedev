/**
 * Catalog of selectable retro handheld display borders ("skins") for the
 * PokéDev world view.
 *
 * Pure data, no `vscode` import: this module is bundled into BOTH the
 * extension host (`src/extension/extension.ts`, to build the QuickPick and
 * resolve webview URIs) and the world webview's client bundle
 * (`src/panel/main.ts`, to size/position the screen opening and pick the
 * overlay image). Keeping it dependency-free lets both sides share one
 * source of truth for skin geometry instead of duplicating pixel offsets.
 *
 * `screen` is normalized (0..1) relative to `sourceWidth`/`sourceHeight`, so
 * geometry is independent of however large or small the skin is eventually
 * rendered inside the Explorer sidebar.
 *
 * ---------------------------------------------------------------------------
 * ASSET PROVENANCE - READ BEFORE TOUCHING `imageFile`
 * ---------------------------------------------------------------------------
 * The four `gbc-*` images under `media/borders/` are the ACTUAL overlay PNGs
 * from mugwomp93/muOS_Customization's "Perfect GBC Overlays" pack (the
 * "No_Grid" variants - see below), not redrawn artwork:
 *
 *   media/borders/gbc-classic.png  <- Perfect_GBC_533_nogrid_1playerinsertcoin_ver1.png
 *   media/borders/gbc-minimal.png  <- Perfect_GBC_533_nogrid_1playerinsertcoin_ver2.png
 *   media/borders/gbc-power.png    <- Perfect_GBC_533_nogrid_mugwomp93.png
 *   media/borders/gbc-no-light.png <- Perfect_GBC_533_nogrid_mugwomp93_nolight.png
 *
 * Source: https://github.com/mugwomp93/muOS_Customization,
 * `Perfect_GBC_for_muOS.zip` -> `Perfect/Perfect_GBC_533/No_Grid/`. The
 * "No_Grid" folder was used deliberately over the top-level (default) files:
 * the non-"No_Grid" versions bake a fine LCD dot-matrix texture across the
 * ENTIRE screen area (that repo's "grid" feature, simulating a real GBC's
 * subpixel grid), which would tint/texture the PokeDev world underneath.
 * "No_Grid" has a genuinely clean, fully-transparent (alpha=0) screen opening
 * with only the bezel/decorations opaque, which is what "the world should
 * simply live inside the transparent display area" requires.
 *
 * LICENSING - UNRESOLVED, LOCAL USE ONLY:
 * The repository declares no license (confirmed via the GitHub API - no
 * SPDX/license field), and its README only says the grids/overlays are
 * u/1playerinsertcoin's original work shared on Reddit, with mugwomp93
 * crediting them and contributing "minor fixes" plus the "_mugwomp93"
 * border designs. Nothing in the repo or its READMEs grants redistribution
 * rights for use in unrelated software (this VS Code extension is not an
 * emulator overlay pack). The `gbc-power`/`gbc-no-light` images additionally
 * render Nintendo's "GAME BOY COLOR" wordmark/logo styling as pixel content
 * - a trademark concern independent of the copyright one above; the
 * original authors could not have licensed that regardless of their own
 * terms. For BOTH reasons, these four PNGs must stay LOCAL to this
 * development checkout: `media/borders/*.png` is listed in `.gitignore`, so
 * they are never committed, packaged, or published from here. Do not remove
 * that ignore rule without an explicit redistribution decision from the
 * repo owner.
 */

export interface PokedevDisplaySkinScreen {
  /** Left edge of the playable opening, as a fraction of sourceWidth. */
  x: number;
  /** Top edge of the playable opening, as a fraction of sourceHeight. */
  y: number;
  /** Width of the playable opening, as a fraction of sourceWidth. */
  width: number;
  /** Height of the playable opening, as a fraction of sourceHeight. */
  height: number;
}

export interface PokedevDisplaySkin {
  id: string;
  label: string;
  description: string;
  /**
   * Path relative to the `media/` directory. Undefined for the `none` skin,
   * which renders no overlay at all.
   */
  imageFile?: string;
  sourceWidth: number;
  sourceHeight: number;
  screen: PokedevDisplaySkinScreen;
}

export const DEFAULT_DISPLAY_SKIN_ID = 'none';

/**
 * Screen geometry below was measured directly from each PNG's alpha channel
 * (the bounding box of fully-transparent, alpha=0 pixels), not guessed:
 *
 *   ver1/ver2 source (640x480): x=68 y=17 w=502 h=449
 *   mugwomp93 source (640x480): x=76 y=23 w=486 h=433
 */
export const DISPLAY_SKINS: readonly PokedevDisplaySkin[] = [
  {
    id: 'none',
    label: 'None',
    description: 'The classic PokéDev world, no border.',
    sourceWidth: 4,
    sourceHeight: 3,
    screen: { x: 0, y: 0, width: 1, height: 1 },
  },
  {
    id: 'gbc-classic',
    label: 'GBC Classic',
    description:
      '1playerinsertcoin’s Perfect GBC overlay (ver1): black side bars with a pink/blue corner accent stripe.',
    imageFile: 'borders/gbc-classic.png',
    sourceWidth: 640,
    sourceHeight: 480,
    screen: { x: 0.1063, y: 0.0354, width: 0.7844, height: 0.9354 },
  },
  {
    id: 'gbc-power',
    label: 'GBC Power',
    description:
      'mugwomp93’s border: a lit red POWER indicator and a vertical GAME BOY COLOR logo.',
    imageFile: 'borders/gbc-power.png',
    sourceWidth: 640,
    sourceHeight: 480,
    screen: { x: 0.1188, y: 0.0479, width: 0.7594, height: 0.9021 },
  },
  {
    id: 'gbc-minimal',
    label: 'GBC Minimal',
    description:
      '1playerinsertcoin’s Perfect GBC overlay (ver2): black side bars with a small corner dot cluster.',
    imageFile: 'borders/gbc-minimal.png',
    sourceWidth: 640,
    sourceHeight: 480,
    screen: { x: 0.1063, y: 0.0354, width: 0.7844, height: 0.9354 },
  },
  {
    id: 'gbc-no-light',
    label: 'GBC No Light',
    description:
      'mugwomp93’s border without the power indicator: just the vertical GAME BOY COLOR logo.',
    imageFile: 'borders/gbc-no-light.png',
    sourceWidth: 640,
    sourceHeight: 480,
    screen: { x: 0.1188, y: 0.0479, width: 0.7594, height: 0.9021 },
  },
];

export function isValidDisplaySkinId(id: string | undefined): boolean {
  if (!id) {
    return false;
  }
  return DISPLAY_SKINS.some((skin) => skin.id === id);
}

/** Falls back to the `none` skin for an unknown/missing id, never throws. */
export function getDisplaySkinById(id: string | undefined): PokedevDisplaySkin {
  const found = DISPLAY_SKINS.find((skin) => skin.id === id);
  if (found) {
    return found;
  }
  // DISPLAY_SKINS[0] is 'none' by construction; asserted below in tests.
  return DISPLAY_SKINS[0];
}
