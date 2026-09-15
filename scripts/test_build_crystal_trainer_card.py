#!/usr/bin/env python3
"""
Tests for `build-crystal-trainer-card.py`'s asset extraction pipeline.

Uses small SYNTHETIC source fixtures built in-memory, not a real pokecrystal
clone - these tests must be able to run with no network access and no local
pokecrystal checkout, and must never depend on (or ship) real extracted game
assets as fixtures. Mirrors `test_build_crystal_environments.py`'s own
fixture-based approach and its `RegressionTests` real-clone-gated pattern.

Run with: python3 -m unittest scripts.test_build_crystal_trainer_card
      or: python3 scripts/test_build_crystal_trainer_card.py
Requires Pillow (same dependency as the script under test).
"""
import importlib.util
import os
import sys
import tempfile
import unittest

from PIL import Image

_SCRIPT_PATH = os.path.join(
    os.path.dirname(__file__), "build-crystal-trainer-card.py"
)
_spec = importlib.util.spec_from_file_location(
    "build_crystal_trainer_card", _SCRIPT_PATH
)
bctc = importlib.util.module_from_spec(_spec)
sys.modules["build_crystal_trainer_card"] = bctc
_spec.loader.exec_module(bctc)


def make_fixture_frame(root: str) -> None:
    """A synthetic 3x2-tile `gfx/frames/1.png`: solid black corners (0,0) and
    (2,0)/(0,1)/(2,1), solid white everywhere else - lets a test assert
    exactly which quadrant ends up where in the output sheet without needing
    the real spiral artwork."""
    os.makedirs(os.path.join(root, "gfx", "frames"), exist_ok=True)
    img = Image.new("L", (24, 16), 255)
    px = img.load()
    # Mark each of the four corner tiles with a distinct fully-black pixel
    # at a fixed offset, and leave the rest of that tile white, so cropping
    # can be verified precisely.
    corner_tiles = {"top_left": (0, 0), "top_right": (2, 0), "bottom_left": (0, 1), "bottom_right": (2, 1)}
    for _, (col, row) in corner_tiles.items():
        px[col * 8 + 1, row * 8 + 1] = 0
    img.save(os.path.join(root, "gfx", "frames", "1.png"))


def make_fixture_corner_fold(root: str) -> None:
    """A synthetic 8x8 `card_right_corner.png` using one real GBC gray level
    (170) so the ink/alpha ramp can be checked precisely."""
    os.makedirs(os.path.join(root, "gfx", "trainer_card"), exist_ok=True)
    img = Image.new("L", (8, 8), 170)
    img.save(os.path.join(root, "gfx", "trainer_card", "card_right_corner.png"))


class RecolorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def test_white_becomes_fully_transparent(self):
        path = os.path.join(self.root, "white.png")
        Image.new("L", (4, 4), 255).save(path)
        out = bctc.recolor_to_ink_on_transparent(path)
        self.assertEqual(out.mode, "RGBA")
        for pixel in out.getdata():
            self.assertEqual(pixel[3], 0, "white source pixel should be alpha 0")

    def test_black_becomes_fully_opaque_ink(self):
        path = os.path.join(self.root, "black.png")
        Image.new("L", (4, 4), 0).save(path)
        out = bctc.recolor_to_ink_on_transparent(path)
        for pixel in out.getdata():
            self.assertEqual(pixel[:3], bctc.INK_COLOR)
            self.assertEqual(pixel[3], 255)

    def test_partial_gray_becomes_partial_alpha_ink(self):
        # A mid-tone source pixel should land strictly between fully
        # transparent and fully opaque - soft shading reads as soft ink,
        # not an all-or-nothing silhouette.
        path = os.path.join(self.root, "gray.png")
        Image.new("L", (1, 1), 170).save(path)
        out = bctc.recolor_to_ink_on_transparent(path)
        pixel = list(out.getdata())[0]
        self.assertEqual(pixel[:3], bctc.INK_COLOR)
        self.assertTrue(0 < pixel[3] < 255, f"expected partial alpha, got {pixel[3]}")


class BuildCrystalFrameTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        self.out_dir = os.path.join(self.root, "out")
        os.makedirs(self.out_dir, exist_ok=True)
        make_fixture_frame(self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def test_output_is_a_2x2_tile_sheet(self):
        bctc.build_crystal_frame(self.root, self.out_dir)
        out_path = os.path.join(self.out_dir, "crystal-frame.png")
        self.assertTrue(os.path.isfile(out_path))
        img = Image.open(out_path)
        self.assertEqual(img.size, (16, 16))
        self.assertEqual(img.mode, "RGBA")

    def test_each_quadrant_comes_from_the_correct_source_corner(self):
        # Only the 4 CORNER tiles are used, not the repeating top/bottom
        # edge tiles (columns 1) - see build_crystal_frame's own docstring.
        bctc.build_crystal_frame(self.root, self.out_dir)
        img = Image.open(os.path.join(self.out_dir, "crystal-frame.png"))
        px = img.load()
        # Each fixture corner tile has its one marked pixel at local (1,1)
        # within its own 8x8 tile - verify it landed in the matching
        # quadrant of the 16x16 output sheet, with full opacity (was black).
        quadrant_offsets = {
            "top_left": (0, 0),
            "top_right": (8, 0),
            "bottom_left": (0, 8),
            "bottom_right": (8, 8),
        }
        for _, (ox, oy) in quadrant_offsets.items():
            pixel = px[ox + 1, oy + 1]
            self.assertEqual(pixel[3], 255, "expected the marked pixel to be opaque ink")

    def test_missing_source_file_raises_a_helpful_error(self):
        empty_root = tempfile.mkdtemp()
        with self.assertRaises(FileNotFoundError):
            bctc.build_crystal_frame(empty_root, self.out_dir)

    def test_unexpected_source_dimensions_are_rejected(self):
        wrong_root = tempfile.mkdtemp()
        os.makedirs(os.path.join(wrong_root, "gfx", "frames"), exist_ok=True)
        Image.new("L", (8, 8), 255).save(
            os.path.join(wrong_root, "gfx", "frames", "1.png")
        )
        with self.assertRaises(ValueError):
            bctc.build_crystal_frame(wrong_root, self.out_dir)


class BuildCardCornerFoldTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        self.out_dir = os.path.join(self.root, "out")
        os.makedirs(self.out_dir, exist_ok=True)
        make_fixture_corner_fold(self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def test_output_is_a_single_recolored_tile(self):
        bctc.build_card_corner_fold(self.root, self.out_dir)
        out_path = os.path.join(self.out_dir, "card-corner-fold.png")
        self.assertTrue(os.path.isfile(out_path))
        img = Image.open(out_path)
        self.assertEqual(img.size, (8, 8))
        self.assertEqual(img.mode, "RGBA")
        # The fixture is uniform gray level 170 - every pixel should recolor
        # identically (ink color, partial alpha).
        pixels = list(img.getdata())
        self.assertEqual(len(set(pixels)), 1)

    def test_missing_source_file_raises_a_helpful_error(self):
        empty_root = tempfile.mkdtemp()
        with self.assertRaises(FileNotFoundError):
            bctc.build_card_corner_fold(empty_root, self.out_dir)

    def test_unexpected_source_dimensions_are_rejected(self):
        wrong_root = tempfile.mkdtemp()
        os.makedirs(os.path.join(wrong_root, "gfx", "trainer_card"), exist_ok=True)
        Image.new("L", (16, 16), 255).save(
            os.path.join(wrong_root, "gfx", "trainer_card", "card_right_corner.png")
        )
        with self.assertRaises(ValueError):
            bctc.build_card_corner_fold(wrong_root, self.out_dir)


class RegressionTests(unittest.TestCase):
    """Against the real pokecrystal source - skipped when no local clone is
    available (e.g. CI with no network), since this repo does not vendor
    pokecrystal itself. Mirrors `test_build_crystal_environments.py`'s own
    `RegressionTests`."""

    @classmethod
    def setUpClass(cls):
        cls.source = os.environ.get("POKECRYSTAL_SOURCE")
        if not cls.source or not os.path.isdir(cls.source):
            raise unittest.SkipTest(
                "set POKECRYSTAL_SOURCE to a local pokecrystal clone to run this"
            )

    def test_both_assets_build_against_the_real_source(self):
        with tempfile.TemporaryDirectory() as out_dir:
            bctc.build_crystal_frame(self.source, out_dir)
            bctc.build_card_corner_fold(self.source, out_dir)
            self.assertTrue(
                os.path.isfile(os.path.join(out_dir, "crystal-frame.png"))
            )
            self.assertTrue(
                os.path.isfile(os.path.join(out_dir, "card-corner-fold.png"))
            )


if __name__ == "__main__":
    unittest.main()
