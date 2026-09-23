# PokéGear RADIO - source & copyright notes

PokéGear's RADIO tab plays a curated station, "GEN II FM," inspired by the
Pokémon Gold/Silver/Crystal PokéGear's own Radio screen.

## Source of the track list

Every track's title, `MUSIC_*` constant, and `.asm` source path in
`src/common/radio-tracks.ts` was confirmed by directly inspecting a clone of
the public disassembly at <https://github.com/pret/pokecrystal> - not
guessed or assumed. In particular:

- The song list comes from `audio/music/*.asm`, indexed by
  `constants/music_constants.asm` and `audio/music_pointers.asm`.
- Which real in-game location plays which song was confirmed against
  `data/maps/maps.asm`'s per-map `MUSIC_*` field, not assumed from a
  location's name. Two things fell out of that check that are easy to get
  wrong by guessing:
  - Route 31 and Route 32 do not have their own music - both play
    `MUSIC_ROUTE_30` (Route 30's theme). Likewise Route 37 plays
    `MUSIC_ROUTE_36`.
  - Ilex Forest has no theme of its own - it plays `MUSIC_UNION_CAVE`
    (Union Cave's theme).
  This catalog lists each of those as ONE track, under its real title, with
  an `alsoUsedFor` note - never as duplicate entries under invented names.
- The channel-command format (`note`/`rest`/`tempo`/`vibrato`/`drum_note`/
  `channel`/etc.) is documented in that repository's own
  `docs/music_commands.md`.

"GEN II FM" itself is an original PokéDev station concept inspired by the
PokéGear Radio's UI, not a recreation of an in-game radio station - the real
PokéGear Radio's channels (Oak's Pokémon Talk, Buena's Password, Lucky
Number Show, etc. - see `engine/pokegear/radio.asm`) are spoken shows, not a
background-music jukebox.

## Copyright status - read this before touching `media/radio/`

The pret/pokecrystal disassembly is public source, but the musical
**compositions** it encodes remain Nintendo/Creatures/GAME FREAK's
copyrighted work, independent of how the audio is produced (hand-transcribed
recording, or rendered from the disassembly's own source as this project's
pipeline does). Publishing or bundling that audio in another product is a
separate question from publishing disassembly source code, and this project
takes no position on it beyond: **don't, until someone with the authority to
decide that says otherwise.**

Concretely:

- **`media/radio/gen2fm/*.ogg`, as committed in this repository, contains
  NO Pokémon Crystal audio.** Every file there is a short, originally
  authored placeholder tone (see `tools/radio/generate_placeholder_audio.py`
  - a synthesized three-note square-wave "blip," not a reproduction of any
  Nintendo composition), so RADIO has something to play out of the box.
- **`tools/radio/render-from-pokecrystal.md`** documents a pipeline that
  renders the REAL songs locally, from a pokecrystal checkout you build
  yourself, using pokecrystal's own real audio engine inside a headless
  emulator (PyBoy) - see that file for the full explanation of why this
  approach was chosen over a runtime synthesizer. That pipeline was built
  and validated (see this milestone's final report), but its OUTPUT is
  never committed to this repository, never bundled into the packaged
  extension, and never distributed by this project in any form.
- Nothing in this codebase claims the rendered audio is freely
  redistributable. If you run the render pipeline locally for your own
  development/testing, that is a decision you are making about your own
  local copy - not something this project asserts is fine to then publish.
- `pokedev_soundtest.asm`/`pokedev-soundtest.patch` (the tiny render
  harness - a boot-sequence hook plus a `PlayMusic` call loop) are this
  project's own original tooling. They are not derived from, and do not
  reproduce, any pokecrystal or Pokémon Crystal source, art, sound, or data
  - only the two real, public function names they call (`PlayMusic`,
  `DelayFrame`) are pokecrystal's.

## If you are the one deciding whether to ship real audio

This is a business/legal call, not an engineering one - loop in whoever
owns that decision (see this organization's own guidance on third-party IP
and on customer-facing release review) before changing this section's
conclusion or committing real rendered audio anywhere in this repository's
history.
