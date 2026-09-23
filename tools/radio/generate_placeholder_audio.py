#!/usr/bin/env python3
"""Generates short, ORIGINAL placeholder tones for every GEN II FM track.

These are NOT recordings or renders of any Pokémon Crystal composition -
they are small synthesized square-wave "test tone" cues (a simple rising
three-note blip, pitched slightly differently per track so tracks are
distinguishable in a spot-check), safe to commit and ship. They exist so
PokéGear RADIO has something to actually play out of the box, before anyone
runs the real render pipeline described in
`tools/radio/render-from-pokecrystal.md`.

Usage:
    python3 tools/radio/generate_placeholder_audio.py

Requires: Python 3 standard library only, plus `ffmpeg` on PATH to encode
the final .ogg (falls back to leaving a .wav next to the target name if
ffmpeg is not available).
"""
from __future__ import annotations

import math
import shutil
import struct
import subprocess
import sys
import wave
from pathlib import Path

SAMPLE_RATE = 22050
AMPLITUDE = 0.18  # keep placeholders quiet - they are a UI cue, not music
NOTE_SECONDS = 0.22
GAP_SECONDS = 0.03
PHRASE_GAP_SECONDS = 0.7
# A single 3-note phrase is under a second - looping it a handful of times
# gives PokéGear RADIO something to actually sit on and be paused/seeked/
# etc. against, instead of racing through every track in a couple of
# seconds. A too-short clip hits `ended` almost immediately and - with
# Repeat/Shuffle off - auto-advances instantly, track after track, which
# sounds like rapid beeping and looks like the UI flashing; that is exactly
# the bug this duration exists to avoid, not a cosmetic choice.
TARGET_SECONDS = 14.0

# id -> a small base frequency (Hz), just enough to make tracks
# distinguishable from each other in a spot check. Not derived from any
# copyrighted composition.
TRACKS: dict[str, float] = {
    "bicycle": 392.0,
    "surf": 349.2,
    "pokemon-center": 440.0,
    "game-corner": 415.3,
    "union-cave": 293.7,
    "cherrygrove-city": 466.2,
    "violet-city": 349.2,
    "azalea-town": 392.0,
    "goldenrod-city": 440.0,
    "ecruteak-city": 329.6,
    "route-29": 523.3,
    "route-30": 493.9,
    "route-36": 466.2,
    "national-park": 523.3,
}

OUT_DIR = Path(__file__).resolve().parents[2] / "media" / "radio" / "gen2fm"


def square_wave(freq: float, seconds: float) -> list[int]:
    n = int(SAMPLE_RATE * seconds)
    period = SAMPLE_RATE / freq
    out = []
    for i in range(n):
        phase = (i % period) / period
        # A tiny sine-blended edge instead of a hard square, so the
        # placeholder is a soft "blip" rather than a harsh buzz.
        value = 1.0 if phase < 0.5 else -1.0
        envelope = min(1.0, i / 200.0, (n - i) / 200.0) if n > 400 else 1.0
        out.append(int(AMPLITUDE * envelope * value * 32767))
    return out


def silence(seconds: float) -> list[int]:
    return [0] * int(SAMPLE_RATE * seconds)


def render_phrase(base_freq: float) -> list[int]:
    # A simple rising three-note cue: base, major third above, fifth above.
    notes = [base_freq, base_freq * 5 / 4, base_freq * 3 / 2]
    samples: list[int] = []
    for note in notes:
        samples += square_wave(note, NOTE_SECONDS)
        samples += silence(GAP_SECONDS)
    return samples


def render_track(base_freq: float) -> list[int]:
    phrase = render_phrase(base_freq)
    phrase_seconds = len(phrase) / SAMPLE_RATE + PHRASE_GAP_SECONDS
    repeats = max(1, round(TARGET_SECONDS / phrase_seconds))
    samples: list[int] = []
    for _ in range(repeats):
        samples += phrase
        samples += silence(PHRASE_GAP_SECONDS)
    return samples


def write_wav(path: Path, samples: list[int]) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(struct.pack(f"<{len(samples)}h", *samples))


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ffmpeg = shutil.which("ffmpeg")
    for track_id, freq in TRACKS.items():
        samples = render_track(freq)
        wav_path = OUT_DIR / f"{track_id}.wav"
        ogg_path = OUT_DIR / f"{track_id}.ogg"
        write_wav(wav_path, samples)
        if ffmpeg:
            subprocess.run(
                [
                    ffmpeg,
                    "-y",
                    "-loglevel",
                    "error",
                    "-i",
                    str(wav_path),
                    "-c:a",
                    "libopus",
                    "-b:a",
                    "48k",
                    str(ogg_path),
                ],
                check=True,
            )
            wav_path.unlink()
            print(f"wrote {ogg_path.relative_to(OUT_DIR.parents[2])}")
        else:
            print(
                f"ffmpeg not found - left {wav_path.name}; "
                "rename/convert manually or install ffmpeg and re-run",
                file=sys.stderr,
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
