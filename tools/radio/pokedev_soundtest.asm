; --- PokeDev Radio render-pipeline harness (NOT part of upstream pokecrystal) ---
;
; Copy this file into a pokecrystal checkout at home/pokedev_soundtest.asm,
; then apply pokedev-soundtest.patch (see render-from-pokecrystal.md) and
; build with `-D _POKEDEV_SOUNDTEST=1`.
;
; Boots exactly like the real game - `Reset` -> `Init` runs the stock
; hardware/WRAM/sound init unmodified - then, instead of jumping into
; `GameInit` (the title screen/intro), plays each song in
; PokedevSoundTestPlaylist back to back using the game's own real
; InitSound/PlayMusic audio engine (home/audio.asm). `UpdateSound` is
; already called every VBlank by the stock `VBlankHandlers` table
; (home/vblank.asm) regardless of game mode, so no extra driving code is
; needed here - this harness only sequences PlayMusic calls and waits.
;
; This file, and the two-line patch in pokedev-soundtest.patch, are
; PokeDev's own build-time tooling - they are not derived from, and do not
; reproduce, any pokecrystal or Pokémon Crystal source, art, or audio data.
PokedevSoundTest::
	ld hl, PokedevSoundTestPlaylist
.next
	ld a, [hli]
	ld e, a
	ld a, [hli]
	ld d, a
	ld a, d
	or e
	jr z, .done
	call PlayMusic
	ld bc, 2700 ; ~45s per track at ~59.7 fps - long enough for one full loop
.wait
	call DelayFrame
	dec bc
	ld a, b
	or c
	jr nz, .wait
	jr .next
.done
	halt
	nop
	jr .done

; One entry per curated GEN II FM track (src/common/radio-tracks.ts) - keep
; this list in sync with that catalog. `render_from_pokecrystal.py` slices
; the single captured recording back into per-track files using this exact
; order and the 2700-frame (45s) duration above.
PokedevSoundTestPlaylist:
	dw MUSIC_BICYCLE
	dw MUSIC_SURF
	dw MUSIC_POKEMON_CENTER
	dw MUSIC_GAME_CORNER
	dw MUSIC_UNION_CAVE
	dw MUSIC_CHERRYGROVE_CITY
	dw MUSIC_VIOLET_CITY
	dw MUSIC_AZALEA_TOWN
	dw MUSIC_GOLDENROD_CITY
	dw MUSIC_ECRUTEAK_CITY
	dw MUSIC_ROUTE_29
	dw MUSIC_ROUTE_30
	dw MUSIC_ROUTE_36
	dw MUSIC_NATIONAL_PARK
	dw 0 ; sentinel
