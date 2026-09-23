# Rendering GEN II FM from a local pokecrystal build

This is the **development-time render/export** step for PokéGear RADIO's
"GEN II FM" station. It produces real Pokémon Crystal audio and is meant to
be run locally, on your own machine, against your own pokecrystal checkout.
**Nothing this script produces is committed to this repository or shipped
with the packaged extension** - see `../../docs/RADIO_ATTRIBUTION.md` for
why, and read it before you run this.

Without this step, `media/radio/gen2fm/*.ogg` contains small, originally
authored placeholder tones (see `generate_placeholder_audio.py`) so the
RADIO tab has something to play out of the box. This step replaces those
placeholders with the real songs, rendered from the actual game engine.

## Why this approach (and not a runtime synthesizer)

pokecrystal's songs are Game Boy channel-command macros (`note`, `rest`,
`tempo`, `vibrato`, `drum_note`, `channel`, ... - see
[`docs/music_commands.md`](https://github.com/pret/pokecrystal/blob/master/docs/music_commands.md)
in that repo), not audio files. Reimplementing a Game Boy APU well enough to
play them faithfully inside a VS Code webview would be a large, fragile
undertaking. Instead, this pipeline reuses pokecrystal's own real,
already-correct audio engine (`home/audio.asm`'s `InitSound`/`PlayMusic`/
`UpdateSound`) by building the actual game and letting
[PyBoy](https://github.com/Baekalfen/PyBoy) (an accurate, open-source GBC
emulator) play it, then records the real APU output to a file. PokéGear
RADIO only ever plays back a plain audio file - see the module doc comment
in `src/pokegear/pokegear-radio-player.ts`.

## Prerequisites

- [rgbds](https://rgbds.gbdev.io/) **1.0.3** exactly (pokecrystal pins this
  version - see its own `INSTALL.md`). `brew install rgbds` on macOS.
- Python 3 with `pip install pyboy` (also pulls in `numpy`).
- `ffmpeg` on `PATH`.
- Your own local clone of <https://github.com/pret/pokecrystal> (a separate
  checkout, outside this repository - see the attribution doc for why it is
  never vendored in).

pokecrystal needs **no original ROM/baserom** to build - it is a complete
disassembly, confirmed against its own `INSTALL.md` and `Makefile`.

## Steps

1. Clone pokecrystal and build once normally, to confirm your toolchain
   works:

   ```sh
   git clone https://github.com/pret/pokecrystal.git
   cd pokecrystal
   make pokecrystal.gbc
   ```

2. Copy this project's tiny render harness into that checkout, and apply
   the two-line patch that hooks it in after the game's own boot sequence:

   ```sh
   cp /path/to/pokedev/tools/radio/pokedev_soundtest.asm home/pokedev_soundtest.asm
   git apply /path/to/pokedev/tools/radio/pokedev-soundtest.patch
   ```

   The patch only adds an `IF DEF(_POKEDEV_SOUNDTEST)` branch in
   `home.asm` and `home/init.asm` - with the flag unset, pokecrystal builds
   completely unmodified. See `pokedev_soundtest.asm`'s own header comment
   for exactly what it does: it boots exactly like the real game (so the
   real `InitSound` runs), then instead of jumping into the title screen it
   calls the real `PlayMusic` once per curated track, holding each for 2700
   frames (~45s - long enough for a full loop) before moving to the next.

3. Rebuild with the flag set. **Do this as one `make` invocation** with the
   full flag set (`?=`/`+=` in pokecrystal's `Makefile` do not apply once
   `RGBASMFLAGS` is set from the command line):

   ```sh
   rm -f audio.o home.o main.o pokecrystal.gbc pokecrystal.sym pokecrystal.map
   make RGBASMFLAGS="-Weverything -Wtruncation=1 -Q8 -P includes.asm -D _POKEDEV_SOUNDTEST=1" pokecrystal.gbc
   ```

4. Render:

   ```sh
   python3 /path/to/pokedev/tools/radio/render_from_pokecrystal.py --rom pokecrystal.gbc
   ```

   This boots the ROM headlessly, captures the actual audio buffer for the
   full playlist in one pass (~10-15s of wall-clock time, unrelated to the
   ~10.5 minutes of in-game audio it captures - PyBoy runs uncapped), slices
   it back into one `.ogg` per track using the exact frame boundaries the
   harness plays them at, and writes them into `media/radio/gen2fm/`,
   overwriting the placeholders.

5. **Before committing anything**, read `docs/RADIO_ATTRIBUTION.md` and
   decide for yourself, independently, whether you have the right to keep
   and/or distribute the resulting files. This project's default is: keep
   them local, do not commit them, restore the placeholders (re-run
   `generate_placeholder_audio.py`) before pushing.

## Keeping the harness/catalog in sync

If you change `src/common/radio-tracks.ts`'s curated track list, update
`pokedev_soundtest.asm`'s `PokedevSoundTestPlaylist` (same order) and
`render_from_pokecrystal.py`'s `TRACK_ORDER` (same order) to match - the
slicer has no way to tell tracks apart other than position.

## Validation performed while building this pipeline

This exact patch/build/render sequence was run end-to-end once (rgbds
1.0.3, PyBoy, ffmpeg) to confirm it produces real, correctly-ordered,
non-silent, full-length (45.07s) audio for all 14 curated tracks - see this
milestone's own final report for the numbers. That output was verified and
then discarded, never copied into this repository.
