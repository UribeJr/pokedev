/**
 * Whether a Pokemon's nickname is worth showing.
 *
 * Pure: no `vscode`, no DOM. Shared by every surface that lists individual
 * Pokemon by name - the Trainer Card's PARTY grid and PARTNER panel, and the
 * Explorer team list - so the rule can only ever say one thing.
 */

/**
 * Spawning defaults a Pokemon's name to its species, so most collections
 * yield `nickname === species`. Showing both then would render, for example,
 * CATERPIE "Caterpie" for no reason - only worth showing when the nickname
 * actually says something the species does not.
 */
export function hasDistinctNickname(
  nickname: string,
  species: string,
): boolean {
  const trimmed = nickname.trim();
  return (
    trimmed.length > 0 && trimmed.toLowerCase() !== species.trim().toLowerCase()
  );
}

/** The name to actually display: the nickname when distinct, else the species. */
export function resolveDisplayName(nickname: string, species: string): string {
  return hasDistinctNickname(nickname, species) ? nickname : species;
}
