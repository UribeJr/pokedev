#!/usr/bin/env python3
"""Renders the curated GEN II FM track list from a REAL pokecrystal build.

This is the "development-time render/export" step described in
docs/RADIO_ATTRIBUTION.md and render-from-pokecrystal.md: it plays each
curated song using pokecrystal's own, real audio engine (via the
pokedev_soundtest.asm harness) inside a headless Game Boy Color emulator
(PyBoy), captures the actual APU output, and writes one .ogg per track into
media/radio/gen2fm/ - overwriting the small placeholder tones there.

This script does NOT download, embed, or otherwise ship any Pokémon Crystal
asset. It only drives a ROM the caller built themselves (see
render-from-pokecrystal.md) from the public pret/pokecrystal source, using a
GBC checkout you provide via --rom. The resulting .ogg files are REAL
copyrighted Nintendo/Creatures/GAME FREAK compositions - review
docs/RADIO_ATTRIBUTION.md before committing or distributing them anywhere.

Usage:
    pip install pyboy
    python3 tools/radio/render_from_pokecrystal.py --rom /path/to/pokecrystal.gbc

Requires: Python 3, `pyboy` (pip), and `ffmpeg` on PATH.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import wave
from pathlib import Path

SAMPLE_RATE = 44100
FRAMES_PER_TRACK = 2700  # must match pokedev_soundtest.asm's per-track wait
BOOT_FRAMES = 90  # ~1.5s: rough allowance for Reset/Init before the first
# PlayMusic call - see render_from_pokecrystal's module doc comment on why
# only the very first track's leading silence is sensitive to this value.

# Must match pokedev_soundtest.asm's PokedevSoundTestPlaylist order exactly,
# and src/common/radio-tracks.ts's `id`/`assetPath` values.
TRACK_ORDER = [
    "bicycle",
    "surf",
    "pokemon-center",
    "game-corner",
    "union-cave",
    "cherrygrove-city",
    "violet-city",
    "azalea-town",
    "goldenrod-city",
    "ecruteak-city",
    "route-29",
    "route-30",
    "route-36",
    "national-park",
]

OUT_DIR = Path(__file__).resolve().parents[2] / "media" / "radio" / "gen2fm"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--rom",
        required=True,
        help="Path to a pokecrystal .gbc built with -D _POKEDEV_SOUNDTEST=1 "
        "(see render-from-pokecrystal.md)",
    )
    parser.add_argument(
        "--out-dir",
        default=str(OUT_DIR),
        help="Where to write the rendered .ogg files (default: %(default)s)",
    )
    args = parser.parse_args()

    try:
        from pyboy import PyBoy
    except ImportError:
        print("pyboy is required: pip install pyboy", file=sys.stderr)
        return 1

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("ffmpeg is required and was not found on PATH", file=sys.stderr)
        return 1

    total_frames = BOOT_FRAMES + FRAMES_PER_TRACK * len(TRACK_ORDER)
    print(f"Booting {args.rom} and capturing {total_frames} frames "
          f"(~{total_frames / 59.73:.0f}s)...")

    pyboy = PyBoy(args.rom, window="null", sound_emulated=True,
                  sound_sample_rate=SAMPLE_RATE)
    pyboy.set_emulation_speed(0)

    chunks = []
    for i in range(total_frames):
        pyboy.tick()
        chunks.append(pyboy.sound.ndarray.copy())
        if i % (FRAMES_PER_TRACK // 4) == 0:
            print(f"  ... frame {i}/{total_frames}", end="\r")
    pyboy.stop(save=False)
    print()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for index, track_id in enumerate(TRACK_ORDER):
        start = BOOT_FRAMES + index * FRAMES_PER_TRACK
        end = start + FRAMES_PER_TRACK
        segment = chunks[start:end]
        if not segment:
            print(f"warning: no audio captured for {track_id}", file=sys.stderr)
            continue

        import numpy as np  # pyboy already depends on numpy

        audio = np.concatenate(segment, axis=0)  # (N, 2) int8
        audio16 = (audio.astype(np.int16) * 256)

        wav_path = out_dir / f"{track_id}.wav"
        ogg_path = out_dir / f"{track_id}.ogg"
        with wave.open(str(wav_path), "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SAMPLE_RATE)
            w.writeframes(audio16.tobytes())

        subprocess.run(
            [ffmpeg, "-y", "-loglevel", "error", "-i", str(wav_path),
             "-c:a", "libopus", "-b:a", "96k", str(ogg_path)],
            check=True,
        )
        wav_path.unlink()
        print(f"wrote {ogg_path}")

    print(
        "\nDone. These files are real Pokémon Crystal audio - see "
        "docs/RADIO_ATTRIBUTION.md before committing or distributing them."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
