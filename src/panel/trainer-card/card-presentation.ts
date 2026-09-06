/**
 * Pure, DOM-free helpers for the Trainer Card's PRESENTATION layer only -
 * never its data. Deliberately free of `document`/`HTMLElement` (unlike the
 * rest of `panel/trainer-card/`) so it can be unit tested directly, the same
 * convention `panel/roaming/*.ts` already follows.
 *
 * `TrainerCardViewModel.style` is read in a handful of places in
 * `panel/trainer-card/main.ts` - which class the physical card element
 * carries (`cardClassName`), whether GitHub bio/location render as free text
 * or as emoji-free JOB/FROM metadata rows (`stripEmoji`), and where the DEV
 * badge Refresh/Disconnect actions get mounted - but NEVER changes what data
 * is available: `profile`/`party`/`partner`/`devBadges`/`github` are
 * identical regardless of skin.
 */
import { TrainerCardViewModel } from '../../trainer/trainer-types';

/**
 * The physical card's base class list: always `tc-card`, always the current
 * skin (`tc-skin-pokedev`/`tc-skin-crystal` - presentation only, see
 * `src/common/trainer-card-style.ts`), plus whatever else this particular
 * card state needs (tier, compact, skeleton, ...).
 */
export function cardClassName(
  model: Pick<TrainerCardViewModel, 'style'>,
  extra?: string,
): string {
  return ['tc-card', `tc-skin-${model.style}`, extra]
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
