/**
 * Pure, DOM-free helpers for the Trainer Card's PRESENTATION layer only -
 * never its data. Deliberately free of `document`/`HTMLElement` (unlike the
 * rest of `panel/trainer-card/`) so it can be unit tested directly, the same
 * convention `panel/roaming/*.ts` already follows.
 *
 * Shared by BOTH Trainer Card surfaces - the full landscape card
 * (`panel/trainer-card/main.ts`) AND the compact Explorer HUD
 * (`panel/explorer/main.ts`, a separate webpack bundle/entry point) - the
 * same way `progression/friendship-rules.ts` already gets bundled into both.
 * This is the "share presentation primitives, not layouts" seam: both
 * surfaces call `skinClassName` to apply the current skin, but each builds
 * its own DOM/layout around it.
 *
 * `TrainerCardStyle` is read in a handful of places across both bundles -
 * which class the physical card/HUD element carries (`cardClassName`/
 * `skinClassName`), whether GitHub bio/location render as free text or as
 * emoji-free JOB/FROM metadata rows on the full card (`stripEmoji`), and
 * where the DEV badge Refresh/Disconnect actions get mounted - but NEVER
 * changes what data is available: `profile`/`party`/`partner`/`devBadges`/
 * `github` are identical regardless of skin.
 */
import { TrainerCardStyle } from '../../common/trainer-card-style';

/**
 * The current skin as a single CSS class (`tc-skin-pokedev`/
 * `tc-skin-crystal`), the one thing both Trainer Card surfaces share -
 * everything each skin actually changes lives in CSS scoped under this
 * class (`.tc-skin-crystal` in media/trainer-card.css and media/
 * explorer.css, with shared colour tokens in media/pokedev-tokens.css),
 * never here.
 */
export function skinClassName(model: { style: TrainerCardStyle }): string {
  return `tc-skin-${model.style}`;
}

/**
 * The full landscape card's base class list: always `tc-card`, always the
 * current skin, plus whatever else this particular card state needs (tier,
 * compact, skeleton, ...). The compact Explorer HUD builds its own class
 * list around `skinClassName` directly instead (`pd-card`, not `tc-card` -
 * see `renderTrainer` in panel/explorer/main.ts), since it is a different
 * component with its own CSS, not a shrunken `.tc-card`.
 */
export function cardClassName(
  model: { style: TrainerCardStyle },
  extra?: string,
): string {
  return ['tc-card', skinClassName(model), extra]
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

/**
 * Strips emoji from arbitrary third-party text (a GitHub bio/location), FOR
 * THE CRYSTAL SKIN ONLY - never mutates the underlying `GithubProfileView`
 * data, only what gets printed onto the Crystal card's JOB/FROM metadata
 * rows (`renderHero` in main.ts). The PokeDev skin keeps showing the raw
 * string untouched.
 *
 * `\p{Extended_Pictographic}` covers the overwhelming majority of emoji
 * codepoints, but NOT skin-tone modifiers (U+1F3FB-U+1F3FF, a separate
 * Unicode property) - `\p{Emoji_Modifier}` catches those, so a modified
 * emoji (e.g. a skin-toned profession emoji) doesn't leave a stray modifier
 * character behind. `\u200d` (zero-width joiner) and `\ufe0f` (variation
 * selector-16) additionally strip the joiners/selectors that combine or
 * force-emoji-render adjacent codepoints in a multi-part sequence.
 * Whitespace left behind by a removed emoji is then collapsed so the result
 * never reads as double-spaced or leads with a stray space.
 */
// Alternation, not a `[...]` character class: a class containing the ZWJ/
// variation-selector codepoints alongside the pictographic ranges trips
// `no-misleading-character-class` (it assumes a class member combines with
// its neighbors) even though each alternative here is matched and stripped
// independently, one codepoint at a time, which is exactly the intent.
const EMOJI_PATTERN =
  /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u200d|\ufe0f/gu;

export function stripEmoji(text: string): string {
  return text.replace(EMOJI_PATTERN, '').replace(/\s+/g, ' ').trim();
}
