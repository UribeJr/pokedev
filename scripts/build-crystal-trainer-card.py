#!/usr/bin/env python3
"""
Development-time builder for PokéDev's "Crystal" Trainer Card skin assets.

WHAT THIS SCRIPT DOES
---------------------
Reads real, already-decoded plain grayscale tile art checked into a local
clone of the `pret/pokecrystal` Pokémon Crystal disassembly
(https://github.com/pret/pokecrystal) and produces two small transparent-
background PNGs used purely as CSS decoration for the Trainer Card's
"Crystal" skin (`media/trainer-card.css`, `.tc-skin-crystal`):

  - `crystal-frame.png`: the four corner tiles of Crystal's default text-box
    window frame ("Frame 1" of 9 selectable frame styles in the Options
    menu - see WHY THIS ASSET below), recolored to solid ink with a
    transparent field, laid out as a 2x2 sprite sheet (top-left, top-right /
    bottom-left, bottom-right) so the Trainer Card CSS can show one quadrant
    per physical corner via `background-position`.
  - `card-corner-fold.png`: the single 8x8 folded-corner accent tile used in
    the corner of the real in-game Trainer Card (`gfx/trainer_card/
    card_right_corner.png`), recolored the same way.

Does NOT decode `.2bpp`/`.1bpp`/ROM data at runtime and does not run inside
the VS Code extension - a one-time (or re-run-on-demand) development tool,
exactly like `scripts/build-crystal-environments.py`. `gfx/**/*.png` files
are pokecrystal's own BUILD INPUT (plain, already-decoded grayscale images
checked into git, not something extracted from a compiled ROM).

WHY THIS ASSET, NOT A LITERAL TRAINER-CARD-BORDER CROP
-------------------------------------------------------
`engine/menus/trainer_card.asm`'s `TrainerCard_InitBorder` draws the card's
own border using plain, undecorated single-line tiles ($23/$24/$1c - part of
the general menu font/UI tile bank, not a standalone graphic file), and its
trainer portrait/badge/leader-face art (`chris_card`/`kris_card`/`badges`/
`leaders`) either depicts a specific character likeness (Chris/Kris) or the
real Johto Gym Badges - neither appropriate here (PokéDev's own trainer
sprite and Dev Badges are the real content; see the milestone's own "Do NOT
replace Dev Badges with Johto Gym Badges" instruction). `gfx/frames/1.png`
(`Frame 1` in `gfx/font.asm`'s `Frames:` table, the frame players see by
default in the Options menu's dialogue-box frame-style picker, one of 9
selectable styles) is instead the single most recognizable piece of Gen II
window-border art - a real, generic, character-free Crystal UI asset -
adapted here as the Crystal skin's corner decoration rather than a pixel-
exact reproduction of the Trainer Card's own (plainer) border tiles.

WHY POST-PROCESS AT ALL
------------------------
Both source PNGs are `L` (grayscale) images using up to the 4 real GBC
brightness levels (0/85/170/255 - see `build-crystal-environments.py`'s own
`GRAY_LEVELS` for why exactly 4). Every non-white pixel is recolored to a
single solid "ink" color and every white pixel becomes fully transparent, so
these compose as decoration directly over the Crystal skin's own CSS
background - no matte/box to crop, no color to invent (this is not a scene
needing a GBC-style limited-palette RECOLOR the way environment tiles are;
it is a foreground-only line-art accent, so "ink over transparent" is the
whole treatment).

LICENSING - SAME PROVENANCE AS `build-crystal-environments.py`
-------------------------------------------------------------
pret/pokecrystal is a reverse-engineered disassembly of Pokémon Crystal; its
checked-in graphics are Nintendo/Game Freak's copyrighted pixel art in a
different form, not code the project's own (permissive) license can
re-license on the artists' behalf. Used here as non-commercial fan-project
Trainer Card decoration with attribution given (see the README's Credits
section). Output PNGs are gitignored - a generated build artifact, not an
originally-authored file, exactly like `media/environments/*.png` (see the
provenance note in `src/common/environments.ts`) - but they ARE bundled into
the packaged extension.

USAGE
-----
    python3 scripts/build-crystal-trainer-card.py --source /path/to/pokecrystal
Writes `media/trainer-card/crystal-frame.png` and
`media/trainer-card/card-corner-fold.png`.

Requires Pillow. No other dependency.
"""
from __future__ import annotations

import argparse
import os
import sys

try:
    from PIL import Image
except ImportError:
    print("This script requires Pillow: pip install pillow", file=sys.stderr)
    sys.exit(1)

TILE_SIZE = 8

# The single "ink" color every non-white source pixel becomes; white becomes
# fully transparent. Near-black rather than pure #000 so it sits slightly
# softer against the Crystal skin's off-white card face - see
# `media/pokedev-tokens.css`'s `.tc-skin-crystal` block for where this exact
# value is mirrored as `--tc-crystal-ink`.
INK_COLOR = (26, 26, 26)


def recolor_to_ink_on_transparent(source_path: str) -> Image.Image:
    """Every non-white pixel -> solid INK_COLOR; white -> alpha 0. Pillow's
    nearest-neighbor resize elsewhere preserves the hard pixel edges this
    produces; nothing here blurs or anti-aliases."""
    gray = Image.open(source_path).convert("L")
    out = Image.new("RGBA", gray.size, (0, 0, 0, 0))
    src = gray.load()
    dst = out.load()
    for y in range(gray.height):
        for x in range(gray.width):
            level = src[x, y]
            if level >= 255:
                continue  # stays fully transparent
            # Linear alpha ramp: darker source pixel -> more opaque ink, so
            # partially-shaded source pixels (e.g. the corner fold's
            # mid-tone shading) still read as soft ink rather than a hard
            # all-or-nothing silhouette.
            alpha = 255 - level
            dst[x, y] = (*INK_COLOR, alpha)
    return out


def crop_tile(sheet: Image.Image, col: int, row: int) -> Image.Image:
    x, y = col * TILE_SIZE, row * TILE_SIZE
    return sheet.crop((x, y, x + TILE_SIZE, y + TILE_SIZE))


def build_crystal_frame(source_dir: str, output_dir: str) -> None:
    """`gfx/frames/1.png` is a 3x2 tile sheet: (top-left, top edge, top-right)
    over (bottom-left, bottom edge, bottom-right) - see `gfx/font.asm`'s
    `Frames:` table and `constants/text_constants.asm`'s
    `TEXTBOX_FRAME_TILES EQU 6`. Only the four CORNER tiles are used (not the
    repeating top/bottom edge tiles): the Trainer Card's own straight edges
    are drawn in plain CSS `border`, so this asset supplies just the
    decorative corner flourish - see the module docstring's "WHY THIS ASSET"
    section for why frame 1 specifically, not the Trainer Card's own border
    tiles.
    """
    path = os.path.join(source_dir, "gfx", "frames", "1.png")
    if not os.path.isfile(path):
        raise FileNotFoundError(
            f"Frame graphic not found: {path}\n"
            "Pass --source pointing at a local pokecrystal clone."
        )
    recolored = recolor_to_ink_on_transparent(path)
    if recolored.size != (24, 16):
        raise ValueError(
            f"{path}: expected a 3x2 tile sheet (24x16px), got {recolored.size} "
            "- gfx/frames/1.png may have changed upstream"
        )

    top_left = crop_tile(recolored, 0, 0)
    top_right = crop_tile(recolored, 2, 0)
    bottom_left = crop_tile(recolored, 0, 1)
    bottom_right = crop_tile(recolored, 2, 1)

    sheet = Image.new("RGBA", (TILE_SIZE * 2, TILE_SIZE * 2), (0, 0, 0, 0))
    sheet.paste(top_left, (0, 0))
    sheet.paste(top_right, (TILE_SIZE, 0))
    sheet.paste(bottom_left, (0, TILE_SIZE))
    sheet.paste(bottom_right, (TILE_SIZE, TILE_SIZE))

    out_path = os.path.join(output_dir, "crystal-frame.png")
    sheet.save(out_path)
    print(f"wrote {out_path} ({sheet.size})")


def build_card_corner_fold(source_dir: str, output_dir: str) -> None:
    path = os.path.join(source_dir, "gfx", "trainer_card", "card_right_corner.png")
    if not os.path.isfile(path):
        raise FileNotFoundError(
            f"Card corner-fold graphic not found: {path}\n"
            "Pass --source pointing at a local pokecrystal clone."
        )
    recolored = recolor_to_ink_on_transparent(path)
    if recolored.size != (TILE_SIZE, TILE_SIZE):
        raise ValueError(
            f"{path}: expected a single 8x8 tile, got {recolored.size} - "
            "gfx/trainer_card/card_right_corner.png may have changed upstream"
        )
    out_path = os.path.join(output_dir, "card-corner-fold.png")
    recolored.save(out_path)
    print(f"wrote {out_path} ({recolored.size})")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source", default="../pokecrystal", help="Path to a local pokecrystal clone"
    )
    parser.add_argument(
        "--output",
        default="media/trainer-card",
        help="Output directory for the generated PNGs",
    )
    args = parser.parse_args()

    os.makedirs(args.output, exist_ok=True)
    build_crystal_frame(args.source, args.output)
    build_card_corner_fold(args.source, args.output)


if __name__ == "__main__":
    main()
