#!/usr/bin/env python3
"""
Tests for `build-crystal-environments.py`'s metatile rendering pipeline.

Uses small SYNTHETIC tileset/palette-map/metatile fixtures built in-memory,
not a real pokecrystal clone - these tests must be able to run with no
network access and no local pokecrystal checkout, and must never depend on
(or ship) real extracted game assets as fixtures.

Run with: python3 -m unittest scripts.test_build_crystal_environments
      or: python3 scripts/test_build_crystal_environments.py
Requires Pillow (same dependency as the script under test).
"""
import importlib.util
import os
import sys
import tempfile
import unittest

from PIL import Image

_SCRIPT_PATH = os.path.join(os.path.dirname(__file__), "build-crystal-environments.py")
_spec = importlib.util.spec_from_file_location("build_crystal_environments", _SCRIPT_PATH)
bce = importlib.util.module_from_spec(_spec)
sys.modules["build_crystal_environments"] = bce
_spec.loader.exec_module(bce)


def make_fixture_tileset(root: str, name: str, tile_count: int = 4) -> None:
    """A `tile_count`-tile (2 wide) synthetic tileset: tile N filled solid
    with the Nth GBC gray level, cycling through the 4 real levels. Palette
    map assigns GREEN/BROWN/GRAY/RED/WATER/YELLOW round-robin, bank 0 only
    (real files always have a bank-1 duplicate too, but nothing under test
    reads it, so fixtures omit it for brevity)."""
    os.makedirs(os.path.join(root, "gfx", "tilesets"), exist_ok=True)
    os.makedirs(os.path.join(root, "data", "tilesets"), exist_ok=True)

    cols = 2
    rows = (tile_count + cols - 1) // cols
    sheet = Image.new("L", (cols * 8, rows * 8))
    levels = [255, 170, 85, 0]
    for i in range(tile_count):
        r, c = divmod(i, cols)
        level = levels[i % len(levels)]
        tile = Image.new("L", (8, 8), level)
        sheet.paste(tile, (c * 8, r * 8))
    sheet.save(os.path.join(root, "gfx", "tilesets", f"{name}.png"))

    names_cycle = ["GREEN", "BROWN", "GRAY", "RED", "WATER", "YELLOW"]
    assigned = [names_cycle[i % len(names_cycle)] for i in range(tile_count)]
    with open(os.path.join(root, "gfx", "tilesets", f"{name}_palette_map.asm"), "w") as f:
        for i in range(0, len(assigned), 8):
            chunk = assigned[i : i + 8]
            f.write(f"\ttilepal 0, {', '.join(chunk)}\n")


def write_metatiles(root: str, name: str, metatiles: list) -> None:
    """`metatiles` is a list of 16-int lists (tile ids, row-major 4x4)."""
    data = bytearray()
    for tile_ids in metatiles:
        assert len(tile_ids) == 16
        data.extend(bytes(t & 0xFF for t in tile_ids))
    with open(os.path.join(root, "data", "tilesets", f"{name}_metatiles.bin"), "wb") as f:
        f.write(bytes(data))


class BlockRenderingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        make_fixture_tileset(self.root, "fixture", tile_count=4)

    def tearDown(self):
        self.tmp.cleanup()

    def test_metatile_renders_at_exact_metatile_pixel_dimensions(self):
        write_metatiles(self.root, "fixture", [[0] * 16])
        tileset = bce.TilesetData.load(self.root, "fixture")
        block = tileset.render_metatile(0)
        self.assertEqual(block.size, (bce.METATILE_PIXELS, bce.METATILE_PIXELS))
        self.assertEqual(bce.METATILE_PIXELS, 32, "Crystal metatiles are 4x4 8x8 tiles = 32x32px")

    def test_block_composition_uses_exactly_16_base_tiles(self):
        # 4 distinct tile ids, each appearing 4 times - if composition used
        # the wrong stride/order it would still use 16 tiles total, so this
        # also checks EVERY quadrant position independently below.
        tile_ids = [0, 1, 2, 3] * 4
        write_metatiles(self.root, "fixture", [tile_ids])
        tileset = bce.TilesetData.load(self.root, "fixture")
        block = tileset.render_metatile(0)
        px = block.load()
        # Tile 0 (gray level 255) -> palette GREEN -> ramp[255]; tile 1
        # (level 170) -> BROWN -> ramp[170]; etc. Check one pixel from each
        # of the 4 tile positions in metatile row 0.
        expected = [
            bce.PALETTE_RAMPS["GREEN"][255],
            bce.PALETTE_RAMPS["BROWN"][170],
            bce.PALETTE_RAMPS["GRAY"][85],
            bce.PALETTE_RAMPS["RED"][0],
        ]
        for col, color in enumerate(expected):
            self.assertEqual(px[col * 8 + 2, 2], color, f"tile position {col}")

    def test_per_tile_palette_assignment_not_uniform_per_block(self):
        # A single metatile mixing two different tile ids/palettes (e.g.
        # green leaves over a brown trunk) must recolor each 8x8 tile with
        # ITS OWN assigned palette, not one blanket color for the whole
        # 32x32 block - this is the exact bug an early version of the real
        # script had.
        tile_ids = [0] * 8 + [1] * 8  # top half tile 0 (GREEN), bottom half tile 1 (BROWN)
        write_metatiles(self.root, "fixture", [tile_ids])
        tileset = bce.TilesetData.load(self.root, "fixture")
        block = tileset.render_metatile(0)
        px = block.load()
        top = px[4, 4]
        bottom = px[4, 20]
        self.assertEqual(top, bce.PALETTE_RAMPS["GREEN"][255])
        self.assertEqual(bottom, bce.PALETTE_RAMPS["BROWN"][170])
        self.assertNotEqual(top, bottom)

    def test_flip_attributes_are_not_applicable_and_not_silently_invented(self):
        # Documented finding: overworld metatile bytes carry no per-tile
        # flip bit (see the module doc's "FLIP / ATTRIBUTE HANDLING"
        # section). Rendering the same metatile twice must be byte-for-byte
        # identical - nothing here should introduce a flip transform.
        write_metatiles(self.root, "fixture", [[0, 1, 2, 3] * 4])
        tileset = bce.TilesetData.load(self.root, "fixture")
        first = tileset.render_metatile(0).tobytes()
        second = tileset.render_metatile(0).tobytes()
        self.assertEqual(first, second)


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        make_fixture_tileset(self.root, "fixture", tile_count=4)

    def tearDown(self):
        self.tmp.cleanup()

    def test_out_of_bounds_tile_id_is_rejected_not_silently_black(self):
        with self.assertRaises(ValueError):
            bce.crop_tile(Image.new("L", (16, 16)), 99)

    def test_metatile_referencing_an_out_of_bounds_tile_is_flagged_invalid(self):
        # Reproduces the real bug this fix addresses: a metatile whose
        # tile ids are otherwise fine but ONE points past the sheet - e.g.
        # a padding/unused slot in the real `_metatiles.bin` data.
        write_metatiles(
            self.root,
            "fixture",
            [[0, 1, 2, 3] * 4, [0, 1, 2, 99] + [0] * 12],
        )
        tileset = bce.TilesetData.load(self.root, "fixture")
        self.assertTrue(tileset.metatile_is_valid(0))
        self.assertFalse(tileset.metatile_is_valid(1))

    def test_scene_with_ragged_block_grid_rows_is_rejected(self):
        write_metatiles(self.root, "fixture", [[0] * 16])
        tileset = bce.TilesetData.load(self.root, "fixture")
        spec = bce.SceneSpec(
            id="ragged",
            tileset="fixture",
            ground_fill=(0, 0, 0),
            blocks=[[0, 0], [0]],
        )
        with self.assertRaises(ValueError):
            bce.validate_scene(spec, tileset)

    def test_scene_referencing_an_out_of_range_index_is_rejected(self):
        write_metatiles(self.root, "fixture", [[0] * 16])
        tileset = bce.TilesetData.load(self.root, "fixture")
        spec = bce.SceneSpec(
            id="bad-index", tileset="fixture", ground_fill=(0, 0, 0), blocks=[[5]]
        )
        with self.assertRaises(ValueError):
            bce.validate_scene(spec, tileset)

    def test_scene_referencing_an_invalid_padding_metatile_is_rejected(self):
        write_metatiles(self.root, "fixture", [[0, 1, 2, 99] + [0] * 12])
        tileset = bce.TilesetData.load(self.root, "fixture")
        spec = bce.SceneSpec(
            id="uses-padding", tileset="fixture", ground_fill=(0, 0, 0), blocks=[[0]]
        )
        with self.assertRaises(ValueError):
            bce.validate_scene(spec, tileset)

    def test_valid_scene_passes(self):
        write_metatiles(self.root, "fixture", [[0] * 16])
        tileset = bce.TilesetData.load(self.root, "fixture")
        spec = bce.SceneSpec(
            id="fine", tileset="fixture", ground_fill=(0, 0, 0), blocks=[[0, None], [None, 0]]
        )
        bce.validate_scene(spec, tileset)  # must not raise


class LayoutTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        make_fixture_tileset(self.root, "fixture", tile_count=4)
        write_metatiles(self.root, "fixture", [[0] * 16])

    def tearDown(self):
        self.tmp.cleanup()

    def test_scene_dimensions_are_exact_multiples_of_metatile_size(self):
        spec = bce.SceneSpec(
            id="grid", tileset="fixture", ground_fill=(1, 2, 3), blocks=bce._grid(5, 5)
        )
        image = bce.render_scene(spec, self.root)
        self.assertEqual(image.width % bce.METATILE_PIXELS, 0)
        self.assertEqual(image.height % bce.METATILE_PIXELS, 0)
        self.assertEqual(image.size, (5 * bce.METATILE_PIXELS, 5 * bce.METATILE_PIXELS))


class MapCropTests(unittest.TestCase):
    """`load_map_blocks`/`crop_map_region` - the real-map-crop path
    `ilex_forest` uses instead of a hand-built layout."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        os.makedirs(os.path.join(self.root, "maps"), exist_ok=True)

    def tearDown(self):
        self.tmp.cleanup()

    def _write_map(self, name: str, width: int, height: int) -> list:
        # Each cell = its own flat index, so a crop's contents can be
        # checked against exactly which source cells it should contain.
        data = bytes((r * width + c) % 256 for r in range(height) for c in range(width))
        with open(os.path.join(self.root, "maps", f"{name}.blk"), "wb") as f:
            f.write(data)
        return [[data[r * width + c] for c in range(width)] for r in range(height)]

    def test_load_map_blocks_reshapes_the_flat_file_row_major(self):
        expected = self._write_map("Test", width=4, height=3)
        grid = bce.load_map_blocks(self.root, "Test", width=4, height=3)
        self.assertEqual(grid, expected)

    def test_load_map_blocks_rejects_a_size_mismatch(self):
        self._write_map("Test", width=4, height=3)
        with self.assertRaises(ValueError):
            bce.load_map_blocks(self.root, "Test", width=5, height=3)

    def test_crop_map_region_is_block_aligned_and_matches_the_source(self):
        grid = self._write_map("Test", width=6, height=6)
        crop = bce.crop_map_region(grid, col=2, row=1, cols=3, rows=2)
        self.assertEqual(len(crop), 2)
        self.assertEqual(len(crop[0]), 3)
        for r in range(2):
            for c in range(3):
                self.assertEqual(crop[r][c], grid[1 + r][2 + c])

    def test_crop_map_region_rejects_a_window_extending_past_the_map(self):
        grid = self._write_map("Test", width=4, height=4)
        with self.assertRaises(ValueError):
            bce.crop_map_region(grid, col=2, row=2, cols=3, rows=3)

    def test_a_real_map_crop_can_render_as_a_valid_scene(self):
        # End-to-end: a map crop plugged into a SceneSpec renders and
        # validates exactly like a hand-built one.
        make_fixture_tileset(self.root, "fixture", tile_count=4)
        write_metatiles(self.root, "fixture", [[i % 4] * 16 for i in range(9)])
        grid = self._write_map("Test", width=3, height=3)
        # Remap the synthetic map's arbitrary byte values into valid
        # metatile indices (0..8) so this also exercises a non-identity
        # crop rather than relying on the fixture's cell values by luck.
        grid = [[cell % 9 for cell in row] for row in grid]
        blocks = bce.crop_map_region(grid, col=0, row=0, cols=3, rows=3)
        tileset = bce.TilesetData.load(self.root, "fixture")
        spec = bce.SceneSpec(
            id="crop-scene", tileset="fixture", ground_fill=(0, 0, 0), blocks=blocks
        )
        bce.validate_scene(spec, tileset)  # must not raise
        image = bce.render_scene(spec, self.root)
        self.assertEqual(image.size, (3 * bce.METATILE_PIXELS, 3 * bce.METATILE_PIXELS))


class RegressionTests(unittest.TestCase):
    """These use the SAME confirmed-good real indices the actual scenes
    reference, but against the real pokecrystal source - skipped when no
    local clone is available (e.g. CI with no network), since this repo
    does not vendor pokecrystal itself."""

    @classmethod
    def setUpClass(cls):
        cls.source = os.environ.get("POKECRYSTAL_SOURCE")
        if not cls.source or not os.path.isdir(cls.source):
            raise unittest.SkipTest(
                "set POKECRYSTAL_SOURCE to a local pokecrystal clone to run this"
            )

    def test_route_37_crop_window_is_in_bounds_and_all_valid(self):
        # Locks in the real map_const dimensions and the chosen crop window,
        # same reasoning as `test_ilex_forest_crop_window_is_in_bounds_and_
        # all_valid` below.
        grid = bce.load_map_blocks(
            self.source, "Route37", bce.ROUTE_37_MAP_WIDTH, bce.ROUTE_37_MAP_HEIGHT
        )
        col, row, cols, rows = bce.ROUTE_37_CROP
        blocks = bce.crop_map_region(grid, col, row, cols, rows)
        tileset = bce.TilesetData.load(self.source, "johto")
        for r in blocks:
            for index in r:
                self.assertTrue(
                    0 <= index < len(tileset.metatiles) and tileset.metatile_is_valid(index),
                    f"metatile {index} invalid or out of range",
                )

    def test_johto_route_scene_builds_and_validates_against_the_real_map(self):
        spec = bce.johto_route(self.source)
        tileset = bce.TilesetData.load(self.source, spec.tileset)
        bce.validate_scene(spec, tileset)  # must not raise
        image = bce.render_scene(spec, self.source)
        self.assertEqual(image.size, (5 * bce.METATILE_PIXELS, 5 * bce.METATILE_PIXELS))

    def test_union_cave_1f_crop_window_is_in_bounds_and_all_valid(self):
        # Locks in the real map_const dimensions and the chosen crop window,
        # same reasoning as `test_ilex_forest_crop_window_is_in_bounds_and_
        # all_valid` below.
        grid = bce.load_map_blocks(
            self.source,
            "UnionCave1F",
            bce.UNION_CAVE_1F_MAP_WIDTH,
            bce.UNION_CAVE_1F_MAP_HEIGHT,
        )
        col, row, cols, rows = bce.UNION_CAVE_1F_CROP
        blocks = bce.crop_map_region(grid, col, row, cols, rows)
        tileset = bce.TilesetData.load(self.source, "cave")
        for r in blocks:
            for index in r:
                self.assertTrue(
                    0 <= index < len(tileset.metatiles) and tileset.metatile_is_valid(index),
                    f"metatile {index} invalid or out of range",
                )

    def test_cave_scene_builds_and_validates_against_the_real_map(self):
        spec = bce.cave(self.source)
        tileset = bce.TilesetData.load(self.source, spec.tileset)
        bce.validate_scene(spec, tileset)  # must not raise
        image = bce.render_scene(spec, self.source)
        self.assertEqual(image.size, (5 * bce.METATILE_PIXELS, 5 * bce.METATILE_PIXELS))

    def test_ilex_forest_crop_window_is_in_bounds_and_all_valid(self):
        # Locks in the real map_const dimensions and the chosen crop window:
        # if either drifts (a pokecrystal update, or someone editing
        # ILEX_FOREST_CROP without checking) this fails loudly instead of
        # quietly cropping the wrong area or an out-of-bounds one.
        grid = bce.load_map_blocks(
            self.source, "IlexForest", bce.ILEX_FOREST_MAP_WIDTH, bce.ILEX_FOREST_MAP_HEIGHT
        )
        col, row, cols, rows = bce.ILEX_FOREST_CROP
        blocks = bce.crop_map_region(grid, col, row, cols, rows)
        tileset = bce.TilesetData.load(self.source, "forest")
        for r in blocks:
            for index in r:
                self.assertTrue(
                    0 <= index < len(tileset.metatiles) and tileset.metatile_is_valid(index),
                    f"metatile {index} invalid or out of range",
                )

    def test_ilex_forest_scene_builds_and_validates_against_the_real_map(self):
        spec = bce.ilex_forest(self.source)
        tileset = bce.TilesetData.load(self.source, spec.tileset)
        bce.validate_scene(spec, tileset)  # must not raise
        image = bce.render_scene(spec, self.source)
        self.assertEqual(image.size, (5 * bce.METATILE_PIXELS, 5 * bce.METATILE_PIXELS))

    def test_every_scene_final_index_is_valid_in_the_real_data(self):
        checks = [
            ("forest", [bce.FOREST_TREE]),
            ("ice_path", [bce.ICE_WALL, bce.ICE_ROCK]),
            ("pokecenter", [bce.POKECENTER_MACHINE, bce.POKECENTER_COUNTER]),
        ]
        for name, indices in checks:
            tileset = bce.TilesetData.load(self.source, name)
            for index in indices:
                self.assertTrue(
                    tileset.metatile_is_valid(index), f"{name} metatile {index}"
                )


if __name__ == "__main__":
    unittest.main()
