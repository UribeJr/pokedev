#!/usr/bin/env python3
"""
Development-time builder for PokéDev's "Environment" scene PNGs.

WHAT THIS SCRIPT DOES
---------------------
Reads real tile artwork checked into a local clone of the `pret/pokecrystal`
Pokémon Crystal disassembly (https://github.com/pret/pokecrystal) and
composes small curated diorama scenes for PokéDev's roaming-world screen, by
rendering COMPLETE Crystal map blocks ("metatiles") rather than arbitrary
8x8 tile fragments. See "METATILE HIERARCHY" below for why that distinction
matters and what the first version of this script got wrong.

Does NOT decode `.2bpp`/`.lz`/ROM data at runtime, does not require RGBDS or
a ROM file, and does not run inside the VS Code extension - it is a one-time
(or re-run-on-demand) development tool. `gfx/tilesets/*.png` are pokecrystal's
own BUILD INPUT (plain, already-decoded grayscale images checked into git,
not something extracted from a compiled ROM - see pokecrystal's FAQ.md).

METATILE HIERARCHY - READ THIS BEFORE CHANGING TILE/BLOCK LOGIC
-----------------------------------------------------------------
Pokémon Crystal's overworld is NOT composed of standalone 8x8 tiles. Per
`constants/gfx_constants.asm` (`METATILE_WIDTH EQU 4`) and the metatile-copy
routine in `home/map.asm` (`LoadMetatiles`, "copy the 4x4 metatile"), a
Crystal metatile ("block") is a 4x4 arrangement of 8x8 tiles - 32x32 pixels -
and `data/tilesets/*_metatiles.bin` stores exactly 16 bytes per metatile
(one byte per tile position, row-major, confirmed by the file sizes: e.g.
`forest_metatiles.bin` is 640 bytes = 40 metatiles x 16 bytes). A tree,
boulder, or wall segment is drawn as ONE metatile (or a small cluster of
adjacent ones), never as an arbitrary tile crop.

The FIRST version of this script ignored this entirely: it hand-picked
individual 8x8 (or arbitrary NxM) tile crops by eye and either recolored
them uniformly or tiled them edge-to-edge, which is exactly why trees came
out as half-height fragments and cave walls came out as a repeating
chevron that never lines up - those crops were never a real, complete unit
the game itself ever draws as one thing. This version fixes that at the
root: every placed "object" is now a real metatile, decoded from the actual
`_metatiles.bin` data, so what gets placed is always the same complete 32x32
unit the game would render.

Per-tile coloring is also now driven by the real per-tile palette
assignment in `gfx/tilesets/*_palette_map.asm` (the `tilepal` macro assigns
one of 6 symbolic categories - GRAY, BROWN, RED, YELLOW, GREEN, WATER - to
each of the tileset's first 96 tile ids; the file's second `tilepal 1, ...`
block assigns palettes to the VRAM bank-1 tile ids $80.., which draw from
the source PNG's second half, rows 6-11 - a duplicate of rows 0-5 in some
tilesets but NOT johto's; see `sheet_index_for_tile`). A single metatile can legitimately
mix categories tile-by-tile (e.g. green leaves over a brown trunk), so
recoloring now happens per 8x8 tile using ITS OWN assigned category, not one
blanket color applied to the whole block as the first version did.

What is still NOT extracted byte-for-byte is the literal RGB behind each
category name: that is resolved by in-game engine logic
(`engine/tilesets/tileset_palettes.asm` and related, some of it time-of-day
dependent) rather than living in one static file for most of these
tilesets. `PALETTE_RAMPS` below is this script's own GBC-style
approximation of each category - built to look authentically
limited-palette-GBC, not extracted from ROM color RAM. See the provenance
note in `src/common/environments.ts` for why the OUTPUT stays gitignored
(a generated build artifact, not an originally-authored file) even though
it IS bundled into the packaged extension.

FLIP / ATTRIBUTE HANDLING
--------------------------
Checked for and found NOT APPLICABLE here: overworld metatile bytes are
plain tile-ID references with no per-tile flip bit (grepped
`engine/overworld` and `home` for XFLIP/YFLIP near tileset/metatile code -
the only hits are unrelated sprite-facing code in `map_objects.asm`).
Metatiles are rendered exactly as their 16 stored tile ids specify, with no
flip transform.

USAGE
-----
1. Clone pokecrystal somewhere on disk (no build required):
     git clone --depth 1 https://github.com/pret/pokecrystal.git /path/to/pokecrystal
2. (Optional but recommended before touching scene layouts) Render a debug
   atlas of every real metatile in one tileset, to look at before picking
   indices for a scene:
     python3 scripts/build-crystal-environments.py --source /path/to/pokecrystal --atlas-only
   Atlases land in `debug/<tileset>-metatiles.png` (gitignored, dev-only -
   never shipped in the extension).
3. Render the final scenes:
     python3 scripts/build-crystal-environments.py --source /path/to/pokecrystal
   The PNGs land in `media/environments/` (also gitignored - see
   `src/common/environments.ts` for why). Pass `--only <scene-id>` (e.g.
   `--only ilex-forest`, repeatable) to regenerate just one scene while
   iterating on it without touching the others.

COMPOSITION: HAND-BUILT LAYOUT VS. REAL MAP CROP
--------------------------------------------------
Two ways a scene's `blocks` grid gets filled, both producing the same
`BlockGrid` shape so `render_scene`/`validate_scene` don't care which was
used - both remain supported for any scene added in the future:

  - A hand-built arrangement of individually-verified metatile indices
    (see e.g. an earlier revision's `pokemon_center`/`ice_path` for the
    pattern, before PokéDev Environment V1 trimmed the catalog down to
    `johto_route`/`ilex_forest`/`cave` - see git history for those two).
  - `ilex_forest`, `cave`, and `johto_route` instead crop a real,
    block-aligned window straight out of an actual map's `.blk` layout
    data (`load_map_blocks`/`crop_map_region`), so their composition is
    literally "what the camera would see" at that spot in the real game,
    not an invented arrangement. This is deliberate: a symmetric ring (or
    striped band) of scenery reads as a SECOND border/divider sitting
    inside PokéDev's GBC bezel, which is exactly what a real map slice
    does not do - real maps mix their scenery irregularly. See each
    function's own docstring for the exact source map and crop
    coordinates used.

Requires Pillow (`pip install pillow`). No other dependency.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("This script requires Pillow: pip install pillow", file=sys.stderr)
    sys.exit(1)

TILE_SIZE = 8
METATILE_WIDTH = 4  # tiles per metatile side - constants/gfx_constants.asm
METATILE_PIXELS = TILE_SIZE * METATILE_WIDTH  # 32
TILES_PER_METATILE = METATILE_WIDTH * METATILE_WIDTH  # 16

RGB = Tuple[int, int, int]
GRAY_LEVELS = (255, 170, 85, 0)

# This script's own GBC-style approximation of each of pokecrystal's 6
# named palette categories - see the module doc's "METATILE HIERARCHY"
# section for why these are not extracted byte-for-byte RGB values.
PALETTE_RAMPS: Dict[str, Dict[int, RGB]] = {
    "GREEN": {255: (184, 240, 152), 170: (120, 200, 80), 85: (56, 120, 48), 0: (24, 48, 16)},
    "BROWN": {255: (240, 216, 168), 170: (192, 152, 88), 85: (120, 80, 48), 0: (48, 32, 16)},
    "GRAY": {255: (232, 232, 232), 170: (176, 176, 192), 85: (112, 112, 128), 0: (32, 32, 40)},
    "WATER": {255: (224, 248, 255), 170: (128, 200, 232), 85: (56, 128, 176), 0: (16, 48, 88)},
    "YELLOW": {255: (255, 248, 192), 170: (240, 216, 64), 85: (192, 152, 24), 0: (80, 56, 0)},
    "RED": {255: (255, 216, 216), 170: (240, 128, 128), 85: (192, 48, 48), 0: (64, 8, 8)},
}
DEFAULT_PALETTE = "GRAY"


# --------------------------------------------------------------------------
# Real pokecrystal data parsing
# --------------------------------------------------------------------------

def load_tileset_image(source_dir: str, tileset: str) -> Image.Image:
    path = os.path.join(source_dir, "gfx", "tilesets", f"{tileset}.png")
    if not os.path.isfile(path):
        raise FileNotFoundError(
            f"Tileset not found: {path}\n"
            "Pass --source pointing at a local pokecrystal clone "
            "(git clone --depth 1 https://github.com/pret/pokecrystal.git)."
        )
    return Image.open(path).convert("L")


_TILEPAL_RE = re.compile(r"^\s*tilepal\s+(\d+)\s*,\s*(.+?)\s*(?:;.*)?$")


def load_palette_names(source_dir: str, tileset: str) -> List[str]:
    """The per-tile palette category for tile ids 0..N-1, parsed from the
    real `tilepal` lines in `<tileset>_palette_map.asm` - bank 0 only (bank
    1 is a duplicate covering the tileset's mirrored second half; see the
    module doc). Length is always a multiple of 8."""
    path = os.path.join(source_dir, "gfx", "tilesets", f"{tileset}_palette_map.asm")
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Palette map not found: {path}")
    names: List[str] = []
    with open(path) as f:
        for line in f:
            m = _TILEPAL_RE.match(line)
            if not m:
                continue
            bank = int(m.group(1))
            if bank != 0:
                continue
            names.extend(part.strip() for part in m.group(2).split(","))
    if not names:
        raise ValueError(f"{path}: no bank-0 tilepal entries found")
    return names


def load_bank1_palette_names(source_dir: str, tileset: str) -> List[str]:
    """The `tilepal 1, ...` entries - palettes for metatile tile ids
    $80.. (see `VRAM_BANK1_FIRST_ID`). Empty if the file has none."""
    path = os.path.join(source_dir, "gfx", "tilesets", f"{tileset}_palette_map.asm")
    names: List[str] = []
    with open(path) as f:
        for line in f:
            m = _TILEPAL_RE.match(line)
            if m and int(m.group(1)) == 1:
                names.extend(part.strip() for part in m.group(2).split(","))
    return names


# Metatile tile ids $80 and up are VRAM bank 1 tiles, not sheet index $80+.
# `_LoadOverworldAttrmapPals` (engine/tilesets/map_palettes.asm) looks the
# id up in the palette map (whose `tilepal 1` entries carry the bank bit)
# and then clears bit 7 of the tilemap byte (`res B_OAM_BANK1 + 4, [hl]`),
# so id $80+n draws bank-1 tile n - and `LoadTilesetGFX` (home/map.asm)
# fills bank 1 (`vTiles5`) from the tileset's SECOND $60 tiles. So $80+n is
# sheet index $60+n. (Some tilesets' second half duplicates the first, so a
# naive id-as-index lookup can look right; johto's does not - its second
# half holds e.g. Ecruteak's Burned Tower art.)
VRAM_BANK1_FIRST_ID = 0x80
TILES_PER_VRAM_BANK = 0x60


def sheet_index_for_tile(tile_id: int) -> int:
    if tile_id >= VRAM_BANK1_FIRST_ID:
        return tile_id - VRAM_BANK1_FIRST_ID + TILES_PER_VRAM_BANK
    return tile_id


def palette_for_tile(names: List[str], tile_id: int) -> str:
    if not names:
        return DEFAULT_PALETTE
    return names[tile_id % len(names)]


def load_metatiles(source_dir: str, tileset: str) -> List[List[int]]:
    """Every metatile in `<tileset>_metatiles.bin`, each a flat list of 16
    tile ids in row-major 4x4 order (see the module doc's METATILE_WIDTH
    citation)."""
    path = os.path.join(source_dir, "data", "tilesets", f"{tileset}_metatiles.bin")
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Metatile data not found: {path}")
    with open(path, "rb") as f:
        data = f.read()
    if len(data) % TILES_PER_METATILE != 0:
        raise ValueError(
            f"{path}: size {len(data)} is not a multiple of "
            f"{TILES_PER_METATILE} (bytes per metatile)"
        )
    return [
        list(data[i : i + TILES_PER_METATILE])
        for i in range(0, len(data), TILES_PER_METATILE)
    ]


MapGrid = List[List[int]]


def load_map_blocks(source_dir: str, map_name: str, width: int, height: int) -> MapGrid:
    """A real map's block layout from `maps/<map_name>.blk` - each byte is a
    metatile index into that map's own tileset, row-major. `width`/`height`
    (in metatiles) come from `map_const` in `constants/map_constants.asm`
    (e.g. `map_const ILEX_FOREST, 15, 27`) - not stored in the `.blk` file
    itself, so they must be passed in and are checked against the file
    size here rather than assumed."""
    path = os.path.join(source_dir, "maps", f"{map_name}.blk")
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Map block data not found: {path}")
    with open(path, "rb") as f:
        data = f.read()
    if len(data) != width * height:
        raise ValueError(
            f"{path}: size {len(data)} does not match {width}x{height} "
            f"({width * height} expected) - check the map_const dimensions"
        )
    return [list(data[r * width : (r + 1) * width]) for r in range(height)]


def crop_map_region(grid: MapGrid, col: int, row: int, cols: int, rows: int) -> BlockGrid:
    """A block-ALIGNED sub-region of a real map's block grid, as a
    `BlockGrid` scene spec cells can use directly. Aligned by construction -
    `col`/`row` index whole metatiles, never a pixel offset - so a crop can
    never begin mid-block."""
    if row < 0 or col < 0 or row + rows > len(grid) or col + cols > len(grid[0]):
        raise ValueError(
            f"crop ({col},{row}) size {cols}x{rows} falls outside the "
            f"{len(grid[0])}x{len(grid)} map grid"
        )
    return [
        [grid[row + r][col + c] for c in range(cols)]
        for r in range(rows)
    ]


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------

def crop_tile(sheet: Image.Image, tile_id: int) -> Image.Image:
    """Crops one 8x8 tile. Raises rather than silently returning black for
    an out-of-bounds id - PIL's `Image.crop` does not error on a region
    past the image bounds, it just fills with black, which is exactly how
    an earlier version of this script produced a solid black band inside an
    otherwise-fine metatile (tile ids from a metatile slot that turned out
    to be unused padding in the real data, pointing past the sheet's last
    row) without any visible error. See METATILE_VALIDATION_NOTE."""
    cols = sheet.width // TILE_SIZE
    rows = sheet.height // TILE_SIZE
    if tile_id < 0 or tile_id >= cols * rows:
        raise ValueError(
            f"tile id {tile_id} is out of bounds for a {cols}x{rows}-tile sheet "
            f"({cols * rows} tiles, 0..{cols * rows - 1})"
        )
    x = (tile_id % cols) * TILE_SIZE
    y = (tile_id // cols) * TILE_SIZE
    return sheet.crop((x, y, x + TILE_SIZE, y + TILE_SIZE))


def recolor_tile(
    tile: Image.Image, palette_name: str, ramp: Optional[Dict[int, RGB]] = None
) -> Image.Image:
    if ramp is None:
        ramp = PALETTE_RAMPS.get(palette_name, PALETTE_RAMPS[DEFAULT_PALETTE])
    out = Image.new("RGB", tile.size)
    src = tile.load()
    dst = out.load()
    for yy in range(tile.height):
        for xx in range(tile.width):
            dst[xx, yy] = ramp.get(src[xx, yy], (255, 0, 255))
    return out


@dataclass
class TilesetData:
    name: str
    sheet: Image.Image
    palette_names: List[str]
    metatiles: List[List[int]]
    # Scene-specific ramps that replace a PALETTE_RAMPS category (see
    # `apply_roof`).
    palette_overrides: Dict[str, Dict[int, RGB]] = field(default_factory=dict)
    # `tilepal 1` palettes for bank-1 tile ids (see `sheet_index_for_tile`).
    bank1_palette_names: List[str] = field(default_factory=list)

    @staticmethod
    def load(source_dir: str, name: str) -> "TilesetData":
        return TilesetData(
            name=name,
            sheet=load_tileset_image(source_dir, name),
            palette_names=load_palette_names(source_dir, name),
            metatiles=load_metatiles(source_dir, name),
            bank1_palette_names=load_bank1_palette_names(source_dir, name),
        )

    def palette_for(self, tile_id: int) -> str:
        bank1_index = tile_id - VRAM_BANK1_FIRST_ID
        if 0 <= bank1_index < len(self.bank1_palette_names):
            return self.bank1_palette_names[bank1_index]
        return palette_for_tile(self.palette_names, tile_id)

    def render_metatile(self, index: int, darken: float = 1.0) -> Image.Image:
        if index < 0 or index >= len(self.metatiles):
            raise ValueError(
                f"{self.name}: metatile index {index} out of range "
                f"(0..{len(self.metatiles) - 1})"
            )
        tile_ids = self.metatiles[index]
        out = Image.new("RGB", (METATILE_PIXELS, METATILE_PIXELS))
        for pos, tile_id in enumerate(tile_ids):
            row, col = divmod(pos, METATILE_WIDTH)
            palette_name = self.palette_for(tile_id)
            try:
                cropped = crop_tile(self.sheet, sheet_index_for_tile(tile_id))
            except ValueError as exc:
                # Re-raised with metatile context: which block, not just
                # which tile id, so a scan across many metatiles (the atlas,
                # or scene validation) can name the actual broken block.
                raise ValueError(
                    f"{self.name}: metatile {index}, tile position {pos} - {exc}"
                ) from exc
            colored = recolor_tile(
                cropped, palette_name, self.palette_overrides.get(palette_name)
            )
            if darken != 1.0:
                colored = Image.eval(colored, lambda v: max(0, min(255, int(v * darken))))
            out.paste(colored, (col * TILE_SIZE, row * TILE_SIZE))
        return out

    def metatile_is_valid(self, index: int) -> bool:
        """Whether every tile id this metatile references actually exists in
        the tileset sheet. A `_metatiles.bin` can contain unused/padding
        slots whose tile ids point past the sheet's bounds - real data, but
        never meant to be drawn (see METATILE_VALIDATION_NOTE). Scene
        authoring should never reference one of these."""
        cols = self.sheet.width // TILE_SIZE
        rows = self.sheet.height // TILE_SIZE
        return all(
            0 <= sheet_index_for_tile(tid) < cols * rows for tid in self.metatiles[index]
        )


INVALID_METATILE_COLOR = (255, 0, 255)  # unmissable magenta, never a real palette output


def render_atlas(tileset: TilesetData, columns: int = 8) -> Image.Image:
    """Every real metatile in `tileset`, laid out in a numbered grid, for
    visual QA before any scene references a specific index.

    A metatile whose tile ids point outside the tileset sheet (an unused/
    padding slot in the real `_metatiles.bin` data - see
    `TilesetData.metatile_is_valid`) is rendered as a solid magenta square
    labeled "X" rather than left to crash or silently show a black
    fragment, so a scan across the whole atlas surfaces every such slot at
    once instead of failing on the first one encountered.
    """
    count = len(tileset.metatiles)
    rows = (count + columns - 1) // columns
    label_h = 10
    cell = METATILE_PIXELS + 4
    sheet = Image.new(
        "RGB", (columns * cell, rows * (cell + label_h)), (40, 40, 40)
    )
    draw = ImageDraw.Draw(sheet)
    for index in range(count):
        row, col = divmod(index, columns)
        x = col * cell + 2
        y = row * (cell + label_h) + label_h
        if tileset.metatile_is_valid(index):
            block = tileset.render_metatile(index)
            sheet.paste(block, (x, y))
        else:
            sheet.paste(
                Image.new("RGB", (METATILE_PIXELS, METATILE_PIXELS), INVALID_METATILE_COLOR),
                (x, y),
            )
            draw.text((x + 10, y + 10), "X", fill=(0, 0, 0))
        draw.text((x, y - label_h), f"{index:02d}", fill=(255, 255, 0))
    return sheet


# --------------------------------------------------------------------------
# Scene composition - references COMPLETE metatile indices only
# --------------------------------------------------------------------------

# A scene's `blocks` grid cell is either a metatile index (int) to render
# from `tileset`, or None to leave the ground fill showing through.
BlockGrid = List[List[Optional[int]]]


def gbc_rgb(r: int, g: int, b: int) -> RGB:
    """A 5-bit-per-channel GBC `RGB r,g,b` value (as written in pokecrystal's
    `.pal` files) expanded to 8-bit."""
    return tuple((v << 3) | (v >> 2) for v in (r, g, b))  # type: ignore[return-value]


# Per-town roof swap - `engine/tilesets/mapgroup_roofs.asm`
# (`LoadMapGroupRoof`): on entering a town, the game copies ROOF_LENGTH (9,
# `constants/tileset_constants.asm`) tiles from `gfx/tilesets/roofs/<roof>.png`
# over tile ids $0a..$12 of the loaded tileset (`vTiles2 tile $0a`), chosen by
# map group via `MapGroupRoofs` in `data/maps/roofs.asm`. Without this swap a
# town renders with the johto tileset's generic placeholder roof tiles.
ROOF_FIRST_TILE = 0x0A
ROOF_LENGTH = 9


@dataclass
class RoofSpec:
    # Basename in gfx/tilesets/roofs/, e.g. "violet"; None for a map group
    # whose `MapGroupRoofs` entry is -1 (no tile swap - the roof PALETTE
    # still applies to every TOWN/ROUTE map, per `engine/gfx/color.asm`).
    graphic: Optional[str]
    # The town's ROOF-category ramp. Colors 1 and 2 come from that map
    # group's `gfx/tilesets/roofs.pal` entry (copied into `PAL_BG_ROOF color
    # 1` by `engine/gfx/color.asm`); colors 0 and 3 stay the base day "roof"
    # row of `gfx/tilesets/bg_tiles.pal`.
    ramp: Dict[int, RGB]


def apply_roof(tileset: TilesetData, source_dir: str, roof: RoofSpec) -> None:
    tileset.palette_overrides["ROOF"] = roof.ramp
    if roof.graphic is None:
        return
    path = os.path.join(source_dir, "gfx", "tilesets", "roofs", f"{roof.graphic}.png")
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Roof graphic not found: {path}")
    roof_sheet = Image.open(path).convert("L")
    roof_cols = roof_sheet.width // TILE_SIZE
    if (roof_sheet.width // TILE_SIZE) * (roof_sheet.height // TILE_SIZE) != ROOF_LENGTH:
        raise ValueError(f"{path}: expected exactly {ROOF_LENGTH} tiles")
    sheet = tileset.sheet.copy()
    sheet_cols = sheet.width // TILE_SIZE
    for i in range(ROOF_LENGTH):
        sy, sx = divmod(i, roof_cols)
        tile = roof_sheet.crop(
            (sx * TILE_SIZE, sy * TILE_SIZE, (sx + 1) * TILE_SIZE, (sy + 1) * TILE_SIZE)
        )
        dy, dx = divmod(ROOF_FIRST_TILE + i, sheet_cols)
        sheet.paste(tile, (dx * TILE_SIZE, dy * TILE_SIZE))
    tileset.sheet = sheet


SPRITE_FRAME_PIXELS = 16  # overworld sprites: 16x16 frames stacked vertically


@dataclass
class SpriteSpec:
    """One overworld sprite frame from `gfx/sprites/<graphic>.png`, baked
    into the scene. OBJ color 0 (white in the grayscale source) is
    transparent on GBC, so only colors 1-3 are drawn, from `ramp` (a row of
    `gfx/overworld/npc_sprites.pal`)."""
    graphic: str
    frame: int
    x: int  # top-left, in scene pixels
    y: int
    ramp: Dict[int, RGB]


def render_sprite(canvas: Image.Image, source_dir: str, sprite: SpriteSpec) -> None:
    path = os.path.join(source_dir, "gfx", "sprites", f"{sprite.graphic}.png")
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Sprite not found: {path}")
    sheet = Image.open(path).convert("L")
    top = sprite.frame * SPRITE_FRAME_PIXELS
    if top + SPRITE_FRAME_PIXELS > sheet.height:
        raise ValueError(f"{path}: no frame {sprite.frame}")
    src = sheet.load()
    dst = canvas.load()
    for yy in range(SPRITE_FRAME_PIXELS):
        for xx in range(SPRITE_FRAME_PIXELS):
            level = src[xx, top + yy]
            if level == 255:
                continue
            px, py = sprite.x + xx, sprite.y + yy
            if 0 <= px < canvas.width and 0 <= py < canvas.height:
                dst[px, py] = sprite.ramp[level]


@dataclass
class SceneSpec:
    id: str
    tileset: str
    ground_fill: RGB
    blocks: BlockGrid
    darken: float = 1.0  # e.g. Ilex Forest's darker palette (see module doc)
    roof: Optional[RoofSpec] = None
    # Scene-specific replacements for PALETTE_RAMPS categories.
    palette_overrides: Dict[str, Dict[int, RGB]] = field(default_factory=dict)
    sprites: List[SpriteSpec] = field(default_factory=list)


def validate_scene(spec: SceneSpec, tileset: TilesetData) -> None:
    """Fails loudly rather than silently producing a broken image.

    Checks, in order: the block grid is rectangular and non-empty (so scene
    dimensions are always exactly COLS x ROWS whole metatiles - no partial-
    block cropping can even be expressed); every referenced index is an
    integer in range for this tileset; and every referenced index is a
    metatile whose tile ids are all actually inside the tileset sheet (see
    `TilesetData.metatile_is_valid` - this is what would have caught the
    ice_path metatile 13 bug: it parses fine as "a valid index" but two of
    its 16 tile ids point past the sheet's last row).
    """
    row_lengths = {len(row) for row in spec.blocks}
    if len(row_lengths) != 1:
        raise ValueError(f"{spec.id}: block grid rows have inconsistent lengths: {row_lengths}")
    cols = row_lengths.pop()
    if cols == 0 or len(spec.blocks) == 0:
        raise ValueError(f"{spec.id}: block grid must not be empty")

    max_index = len(tileset.metatiles) - 1
    for r, row in enumerate(spec.blocks):
        for c, index in enumerate(row):
            if index is None:
                continue
            if not isinstance(index, int) or index < 0 or index > max_index:
                raise ValueError(
                    f"{spec.id}: block[{r}][{c}] = {index!r} is not a valid "
                    f"metatile index for tileset '{tileset.name}' (0..{max_index})"
                )
            if not tileset.metatile_is_valid(index):
                raise ValueError(
                    f"{spec.id}: block[{r}][{c}] = {index} is an unused/padding "
                    f"metatile in '{tileset.name}' (references a tile id outside "
                    "the sheet) - pick a different, verified-complete index"
                )


def render_scene(spec: SceneSpec, source_dir: str) -> Image.Image:
    tileset = TilesetData.load(source_dir, spec.tileset)
    if spec.roof is not None:
        apply_roof(tileset, source_dir, spec.roof)
    tileset.palette_overrides.update(spec.palette_overrides)
    validate_scene(spec, tileset)

    rows = len(spec.blocks)
    cols = len(spec.blocks[0])
    canvas = Image.new(
        "RGB", (cols * METATILE_PIXELS, rows * METATILE_PIXELS), spec.ground_fill
    )

    for r, row in enumerate(spec.blocks):
        for c, index in enumerate(row):
            if index is None:
                continue
            block = tileset.render_metatile(index, darken=spec.darken)
            canvas.paste(block, (c * METATILE_PIXELS, r * METATILE_PIXELS))

    for sprite in spec.sprites:
        render_sprite(canvas, source_dir, sprite)

    return canvas


# --------------------------------------------------------------------------
# The scenes
#
# Every non-None entry below is a METATILE INDEX verified by eye against
# this tileset's debug atlas (`debug/<tileset>-metatiles.png`) - not a raw
# tile id, and not guessed. Canvas size is exactly COLS x ROWS metatiles
# (32px each), so nothing is ever partially cropped mid-block.
# --------------------------------------------------------------------------

def _grid(rows: int, cols: int, fill: Optional[int] = None) -> BlockGrid:
    return [[fill for _ in range(cols)] for _ in range(rows)]


# `map_const ROUTE_37, 10, 9` in constants/map_constants.asm; `map Route37,
# TILESET_JOHTO, ...` in data/maps/maps.asm confirms this map uses the same
# "johto" tileset the scene renders with (Route 33 alone among the
# candidates uses TILESET_JOHTO_MODERN instead, so it was ruled out).
ROUTE_37_MAP_WIDTH = 10
ROUTE_37_MAP_HEIGHT = 9

# A 5x5-metatile window (col 4, row 0) of the REAL Route 37 map, chosen the
# same way as `ilex_forest`/`cave`: rendered the whole map and several
# candidate windows across Route 29/30/37 and compared by eye. This one has
# two separate irregular tree clusters (not a solid wall) joined by a
# staggered/bent fence-ledge line, a flower patch tucked near the trees, and
# open grass with a bit of texture variation - no full-width path/ledge
# divider band and no repeated grid-aligned vegetation squares. Rejected
# candidates included Route 29/30 windows containing a large uniform
# alternate-grass-texture square (the same "obvious repeated square" look
# being fixed here) and a Route 37 window whose path formed a near
# full-width horizontal band.
ROUTE_37_CROP = (4, 0, 5, 5)


def johto_route(source_dir: str) -> SceneSpec:
    """A block-aligned 5x5 crop of the REAL Route 37 map (`maps/Route37.blk`),
    replacing the previous hand-built layout (tree rows across the top/
    bottom and one uninterrupted path row across the middle) that read as a
    tileset demo strip rather than a route. Same technique as `ilex_forest`/
    `cave`: every cell comes straight from real map data, so `ground_fill`
    below is never actually visible."""
    col, row, cols, rows = ROUTE_37_CROP
    map_grid = load_map_blocks(
        source_dir, "Route37", ROUTE_37_MAP_WIDTH, ROUTE_37_MAP_HEIGHT
    )
    blocks: BlockGrid = crop_map_region(map_grid, col, row, cols, rows)
    return SceneSpec(
        id="johto-route",
        tileset="johto",
        ground_fill=PALETTE_RAMPS["GREEN"][170],
        blocks=blocks,
    )


# `map_const ILEX_FOREST, 15, 27` in constants/map_constants.asm - the real
# map's width/height in metatiles, needed to reshape maps/IlexForest.blk's
# flat byte array (confirmed: 15*27 = 405 bytes, exactly the file's size).
ILEX_FOREST_MAP_WIDTH = 15
ILEX_FOREST_MAP_HEIGHT = 27

# A 5x5-metatile window (col 9, row 2) of the REAL map, chosen by rendering
# the entire map and comparing several candidate windows by eye for an
# irregular, non-symmetric mix of tree clusters, a flower patch, and open
# grass - never a hand-built ring. (col, row, cols, rows), all in metatiles.
ILEX_FOREST_CROP = (9, 2, 5, 5)


def ilex_forest(source_dir: str) -> SceneSpec:
    """A block-aligned 5x5 crop of the REAL Ilex Forest map (`maps/
    IlexForest.blk`), not a hand-built layout: this is what a camera placed
    over that exact spot in the actual game would show, at the same
    metatile resolution the game itself uses.

    Deliberately NOT a symmetric ring of trees around an empty rectangle
    (what the previous version of this scene was) - PokéDev's GBC display
    overlay already provides the visual frame, so the environment itself
    needs to read as a slice of wallpaper-like map, not a second border.
    Every one of the 25 cells is filled straight from the real map data, so
    `ground_fill` below is never actually visible - it exists only because
    `SceneSpec` requires one.
    """
    col, row, cols, rows = ILEX_FOREST_CROP
    map_grid = load_map_blocks(
        source_dir, "IlexForest", ILEX_FOREST_MAP_WIDTH, ILEX_FOREST_MAP_HEIGHT
    )
    blocks: BlockGrid = crop_map_region(map_grid, col, row, cols, rows)
    return SceneSpec(
        id="ilex-forest",
        tileset="forest",
        ground_fill=PALETTE_RAMPS["GREEN"][85],
        blocks=blocks,
        darken=0.7,
    )


# `map_const UNION_CAVE_1F, 10, 18` in constants/map_constants.asm; `map
# UnionCave1F, TILESET_CAVE, ...` in data/maps/maps.asm confirms this map
# uses the same "cave" tileset the scene renders with.
UNION_CAVE_1F_MAP_WIDTH = 10
UNION_CAVE_1F_MAP_HEIGHT = 18

# A 5x5-metatile window (col 4, row 7) of the REAL Union Cave 1F map,
# chosen the same way as `ilex_forest`'s crop: rendered the whole map and
# compared several candidate windows by eye. This one has an irregular
# wall corner top-left and top-right, two small boulder clusters, and an
# open, texture-varied floor across most of the window - no water tiles,
# no four-sided wall ring. Rejected candidates included a P-shaped/boxed
# corridor bend (reads as another enclosure) and windows containing the
# map's water pools (this scene is plain "Cave", not the water-themed
# "Ice Path" scene).
UNION_CAVE_1F_CROP = (4, 7, 5, 5)


def cave(source_dir: str) -> SceneSpec:
    """A block-aligned 5x5 crop of the REAL Union Cave 1F map (`maps/
    UnionCave1F.blk`), replacing the previous hand-built layout (a
    rectangular ring of CAVE_WALL around a large flat CAVE_ROCK-dotted
    center) that read as a boxed-in arena rather than a slice of an actual
    cave. Same technique as `ilex_forest`: every cell comes straight from
    real map data, so `ground_fill` below is never actually visible."""
    col, row, cols, rows = UNION_CAVE_1F_CROP
    map_grid = load_map_blocks(
        source_dir, "UnionCave1F", UNION_CAVE_1F_MAP_WIDTH, UNION_CAVE_1F_MAP_HEIGHT
    )
    blocks: BlockGrid = crop_map_region(map_grid, col, row, cols, rows)
    return SceneSpec(
        id="cave",
        tileset="cave",
        ground_fill=PALETTE_RAMPS["GRAY"][85],
        blocks=blocks,
    )


# `map_const ECRUTEAK_CITY, 20, 18` in constants/map_constants.asm (20*18 =
# 360 bytes, exactly maps/EcruteakCity.blk's size); `map EcruteakCity,
# TILESET_JOHTO, ...` in data/maps/maps.asm confirms it uses the same "johto"
# tileset as `johto_route`.
ECRUTEAK_CITY_MAP_WIDTH = 20
ECRUTEAK_CITY_MAP_HEIGHT = 18

# Ecruteak is map group 4: `db ROOF_VIOLET ; 4 (Ecruteak)` in
# data/maps/roofs.asm, and `; group 4 (Ecruteak)` morn/day in
# gfx/tilesets/roofs.pal is `RGB 31,19,00, 27,10,05` (its orange-red roofs).
# Colors 0/3 are the day "roof" row of gfx/tilesets/bg_tiles.pal
# (`RGB 27,31,27, ..., 07,07,07`).
ECRUTEAK_ROOF = RoofSpec(
    graphic="violet",
    ramp={
        255: gbc_rgb(27, 31, 27),
        170: gbc_rgb(31, 19, 0),
        85: gbc_rgb(27, 10, 5),
        0: gbc_rgb(7, 7, 7),
    },
)

# Ecruteak's identity is its two towers, which sit at opposite ends of the
# town's north edge (Burned Tower at cols 2-3, the tiered Tin Tower approach
# at cols 18-19), so no single 5x5 window holds both - a pond/Mart window
# was tried first and read as a generic town. This scene instead joins two
# REAL block-aligned crops side by side, each (col, row, cols, rows): the
# Burned Tower on its rocky rise including the rise's right cliff edge (col
# 4), which gives a natural visual break before the Tin Tower column. Every
# cell is still a real map block; only the one vertical seam is composed.
ECRUTEAK_CITY_CROPS = [(2, 0, 3, 5), (18, 0, 2, 5)]


def ecruteak_city(source_dir: str) -> SceneSpec:
    """Ecruteak City's Burned Tower and Tin Tower from the REAL map (`maps/
    EcruteakCity.blk`), joined horizontally (see ECRUTEAK_CITY_CROPS), drawn
    with the town's real Violet-style roof swap and orange-red roof palette
    (ECRUTEAK_ROOF). Every cell is real map data, so `ground_fill` below is
    never actually visible."""
    map_grid = load_map_blocks(
        source_dir, "EcruteakCity", ECRUTEAK_CITY_MAP_WIDTH, ECRUTEAK_CITY_MAP_HEIGHT
    )
    crops = [crop_map_region(map_grid, *crop) for crop in ECRUTEAK_CITY_CROPS]
    blocks: BlockGrid = [
        [cell for crop in crops for cell in crop[r]] for r in range(len(crops[0]))
    ]
    return SceneSpec(
        id="ecruteak-city",
        tileset="johto",
        ground_fill=PALETTE_RAMPS["GRAY"][255],
        blocks=blocks,
        roof=ECRUTEAK_ROOF,
    )


# `map_const SILVER_CAVE_ROOM_3, 10, 18` in constants/map_constants.asm;
# `map SilverCaveRoom3, TILESET_CAVE, ...` in data/maps/maps.asm. This is
# Mt. Silver's summit room - where Red waits.
SILVER_CAVE_ROOM_3_MAP_WIDTH = 10
SILVER_CAVE_ROOM_3_MAP_HEIGHT = 18

# A 5x5-metatile window (col 2, row 3) framing the summit plateau: the
# walled ledge Red stands on, the stairs the player climbs up to him, and
# the cliff walls either side.
MT_SILVER_CROP = (2, 3, 5, 5)

# Red's real spot: `object_event 9, 10, SPRITE_RED, ...` in
# maps/SilverCaveRoom3.asm - map coordinates in 16px steps.
RED_MAP_STEP = (9, 10)
MAP_STEP_PIXELS = 16

# `PAL_NPC_RED` - the day "red" row of gfx/overworld/npc_sprites.pal
# (`RGB 27,31,27, 31,19,10, 31,07,01, 00,00,00`). Color 0 is transparent.
NPC_RED_DAY_RAMP = {
    170: gbc_rgb(31, 19, 10),
    85: gbc_rgb(31, 7, 1),
    0: gbc_rgb(0, 0, 0),
}

# gfx/sprites/red.png frame 0 is the standing, facing-down pose. In-game Red
# stands facing away (`SPRITEMOVEDATA_STANDING_UP`) until spoken to; the
# facing-down frame is used here so he's recognizable as a background figure.
RED_FACING_DOWN_FRAME = 0


# Crystal's summit room is a plain brown cave (PALETTE_DAY); Mt. Silver's
# snow is from later games. This scene's own cold, snow-dusted take on the
# cave tileset's BROWN category - like PALETTE_RAMPS, an approximation, not
# ROM color data - so the rock reads as a frozen peak under the snow overlay.
MT_SILVER_SNOW_RAMPS: Dict[str, Dict[int, RGB]] = {
    "BROWN": {255: (240, 244, 255), 170: (184, 196, 220), 85: (104, 112, 144), 0: (32, 32, 56)},
}


def mt_silver(source_dir: str) -> SceneSpec:
    """A block-aligned 5x5 crop of the REAL Mt. Silver summit (`maps/
    SilverCaveRoom3.blk`), with Red's real overworld sprite baked in at his
    real map position. Falling snow is NOT baked in - it is an animated
    overlay the webview adds for environments with `weather: 'snow'` (see
    src/common/environments.ts)."""
    col, row, cols, rows = MT_SILVER_CROP
    map_grid = load_map_blocks(
        source_dir,
        "SilverCaveRoom3",
        SILVER_CAVE_ROOM_3_MAP_WIDTH,
        SILVER_CAVE_ROOM_3_MAP_HEIGHT,
    )
    blocks: BlockGrid = crop_map_region(map_grid, col, row, cols, rows)
    red_x = RED_MAP_STEP[0] * MAP_STEP_PIXELS - col * METATILE_PIXELS
    red_y = RED_MAP_STEP[1] * MAP_STEP_PIXELS - row * METATILE_PIXELS
    return SceneSpec(
        id="mt-silver",
        tileset="cave",
        ground_fill=PALETTE_RAMPS["GRAY"][85],
        blocks=blocks,
        palette_overrides=MT_SILVER_SNOW_RAMPS,
        sprites=[
            SpriteSpec(
                graphic="red",
                frame=RED_FACING_DOWN_FRAME,
                x=red_x,
                y=red_y,
                ramp=NPC_RED_DAY_RAMP,
            )
        ],
    )


# `map_const PALLET_TOWN, 10, 9` in constants/map_constants.asm; `map
# PalletTown, TILESET_KANTO, TOWN, ...` in data/maps/maps.asm.
PALLET_TOWN_MAP_WIDTH = 10
PALLET_TOWN_MAP_HEIGHT = 9

# Pallet Town is map group 13, whose `MapGroupRoofs` entry is -1 (no roof
# tile swap), but as a TOWN it still gets its roof palette: `; group 13
# (Pallet)` morn/day in gfx/tilesets/roofs.pal is `RGB 27,28,31, 17,19,22`.
PALLET_TOWN_ROOF = RoofSpec(
    graphic=None,
    ramp={
        255: gbc_rgb(27, 31, 27),
        170: gbc_rgb(27, 28, 31),
        85: gbc_rgb(17, 19, 22),
        0: gbc_rgb(7, 7, 7),
    },
)

# Nearly the whole town, 9x9 metatiles (col 0, row 0) - every column but
# the east bollard border - for the same reason as NEW_BARK_TOWN_CROP: a
# 5x5 window (this scene's first version) only fits the three buildings,
# while the town reads as Pallet with all of it together - Red's and Blue's
# houses, Oak's Lab, both flower beds, the signs, the pond and the Route 1
# gap in the north border. Dropping the east column rather than the west
# keeps the town centered. (col, row, cols, rows).
PALLET_TOWN_CROP = (0, 0, 9, 9)


def pallet_town(source_dir: str) -> SceneSpec:
    """A block-aligned 9x9 crop of the REAL Pallet Town map (`maps/
    PalletTown.blk`) - see PALLET_TOWN_CROP - with Pallet's real roof
    palette."""
    map_grid = load_map_blocks(
        source_dir, "PalletTown", PALLET_TOWN_MAP_WIDTH, PALLET_TOWN_MAP_HEIGHT
    )
    blocks: BlockGrid = crop_map_region(map_grid, *PALLET_TOWN_CROP)
    return SceneSpec(
        id="pallet-town",
        tileset="kanto",
        ground_fill=PALETTE_RAMPS["GRAY"][255],
        blocks=blocks,
        roof=PALLET_TOWN_ROOF,
    )


# `map_const NEW_BARK_TOWN, 10, 9` in constants/map_constants.asm; `map
# NewBarkTown, TILESET_JOHTO, TOWN, ...` in data/maps/maps.asm.
NEW_BARK_TOWN_MAP_WIDTH = 10
NEW_BARK_TOWN_MAP_HEIGHT = 9

# New Bark is map group 24: `db ROOF_NEW_BARK ; 24 (New Bark)` in
# data/maps/roofs.asm, and `; group 24 (New Bark)` morn/day in
# gfx/tilesets/roofs.pal is `RGB 20,31,14, 11,23,05` (its green roofs).
NEW_BARK_TOWN_ROOF = RoofSpec(
    graphic="new_bark",
    ramp={
        255: gbc_rgb(27, 31, 27),
        170: gbc_rgb(20, 31, 14),
        85: gbc_rgb(11, 23, 5),
        0: gbc_rgb(7, 7, 7),
    },
)

# Nearly the whole town, 9x9 metatiles (col 1, row 0) - every column but
# the west tree border. A 5x5 window (this scene's first version, and every
# other scene's size) only fits two buildings and read as "two buildings",
# not New Bark: the town's identity is the WHOLE small town together -
# Elm's Lab, the player's house, Elm's house, the neighbor's house, the
# signs, the water on the east edge and the surrounding trees. The scene
# image is stretched to fill the screen, so tiles draw at 5/9 the size of
# the 5x5 scenes'. (col, row, cols, rows).
NEW_BARK_TOWN_CROP = (1, 0, 9, 9)


def new_bark_town(source_dir: str) -> SceneSpec:
    """A block-aligned 9x9 crop of the REAL New Bark Town map (`maps/
    NewBarkTown.blk`) - see NEW_BARK_TOWN_CROP for why it's wider than the
    other scenes - with New Bark's real roof tiles and green roof palette."""
    map_grid = load_map_blocks(
        source_dir, "NewBarkTown", NEW_BARK_TOWN_MAP_WIDTH, NEW_BARK_TOWN_MAP_HEIGHT
    )
    blocks: BlockGrid = crop_map_region(map_grid, *NEW_BARK_TOWN_CROP)
    return SceneSpec(
        id="new-bark-town",
        tileset="johto",
        ground_fill=PALETTE_RAMPS["GRAY"][255],
        blocks=blocks,
        roof=NEW_BARK_TOWN_ROOF,
    )


# Metatile indices, each confirmed by directly rendering that ONE metatile
# in isolation and viewing it (via `--atlas-only`, then cropping/zooming the
# specific candidate) - not read off the composite atlas grid, which proved
# unreliable at a glance (an early pass misread indices this way twice: a
# "path" that was actually grass, and a "wall" that was actually grass too).
FOREST_TREE = 0  # complete bushy tree on grass

# PokéDev Environment V1 trims the catalog to exactly `johto_route`,
# `ilex_forest`, and `cave` (plus the image-less "none"); Ice Path and
# Pokémon Center were removed here after visual review - see git history
# for their scene functions (`ice_path`/`pokemon_center`) and metatile
# constants (`ICE_FLOOR`/`ICE_WALL`/`ICE_BOULDER_*`/`POKECENTER_MACHINE`/
# `POKECENTER_COUNTER`) if reviving either one. `SCENES`/`TILESETS_NEEDED`
# below are intentionally still plain lists, not hardcoded to "exactly
# three" - adding a new scene function later is just adding it to both.
SCENES = [
    johto_route,
    ilex_forest,
    cave,
    ecruteak_city,
    mt_silver,
    pallet_town,
    new_bark_town,
]
TILESETS_NEEDED = ["johto", "forest", "cave"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default="../pokecrystal", help="Path to a local pokecrystal clone")
    parser.add_argument("--output", default="media/environments", help="Output directory for final scene PNGs")
    parser.add_argument("--debug-dir", default="debug", help="Output directory for metatile atlases")
    parser.add_argument(
        "--atlas-only",
        action="store_true",
        help="Only render debug/<tileset>-metatiles.png atlases for visual QA; do not render final scenes",
    )
    parser.add_argument(
        "--only",
        action="append",
        choices=[b.__name__.replace("_", "-") for b in SCENES],
        help="Regenerate only this scene (repeatable). Default: all scenes.",
    )
    args = parser.parse_args()

    if args.atlas_only:
        os.makedirs(args.debug_dir, exist_ok=True)
        for name in TILESETS_NEEDED:
            tileset = TilesetData.load(args.source, name)
            atlas = render_atlas(tileset)
            out_path = os.path.join(args.debug_dir, f"{name}-metatiles.png")
            atlas.save(out_path)
            print(f"wrote {out_path} ({len(tileset.metatiles)} metatiles, {atlas.size})")
        return

    wanted = set(args.only) if args.only else None
    os.makedirs(args.output, exist_ok=True)
    for build in SCENES:
        scene_name = build.__name__.replace("_", "-")
        if wanted is not None and scene_name not in wanted:
            continue
        spec = build(args.source)
        image = render_scene(spec, args.source)
        out_path = os.path.join(args.output, f"{spec.id}.png")
        image.save(out_path)
        print(f"wrote {out_path} ({image.width}x{image.height})")


if __name__ == "__main__":
    main()
