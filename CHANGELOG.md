# Change Log

All notable changes to the PokeDev extension are documented in this file.

## [6.2.0]

- feat: Pokemon now visually react to real coding events — a meaningful save
  (`!`), a Git commit (`★` + a small burst of stars, and rarely a nearby
  Pokemon joining in), a reliably-failed Build/Test task (`?`), and a Pokemon
  levelling up (`✦` + a stronger celebration). Reactions target the current
  Partner, are brief (1.2-3s), never overlap on one Pokemon, and always
  return it to normal walking/idle behavior afterward
- feat: `pokedev.reactions.enabled` setting (default on) turns all of the
  above off if you'd rather keep the world quiet
- chore: reactions are driven by the same progression events already used
  for XP (meaningful save, unique commit) — no new "was this meaningful"
  logic, no XP awarded for reacting, and no idle/sleep/wake behavior of any
  kind

## [6.1.0]

- feat: two compact PokeDev views inside the standard Explorer sidebar —
  **PokeDev Trainer** (avatar, name, level, XP bar, coding time, partner) and
  **Pokemon** (your collection, with the partner marked). Both are ordinary
  collapsible Explorer sections; no separate Activity Bar container
- feat: selecting a Pokemon in the Explorer makes it your partner, routed
  through the same setter the QuickPick uses — there is still exactly one
  partner state
- feat: `PokeDev: Focus Trainer View` and `PokeDev: Focus Pokemon View`
- chore: a shared `pokedevState` hub now broadcasts progression, partner,
  collection and GitHub changes. Every surface subscribes, which removed the
  direct dependency `progression-service` had on the Trainer Card panel
- chore: palette and geometry extracted to `media/pokedev-tokens.css`, shared
  by the full card and the Explorer views so they cannot drift apart
- note: the full Trainer Card panel and the walking-sprite playground are
  unchanged; the Explorer views are additional surfaces

## [6.0.0]

- **PokeDev** — the project takes its own identity. Published as
  `uribejr.pokedev`
- breaking: every command and setting moved from the `vscode-pokemon.` prefix
  to `pokedev.`, and the command palette category is now `PokeDev`. Existing
  settings and custom keybindings need updating to the new ids
- note: saved data is untouched. Storage keys deliberately keep their original
  prefix, so collections, trainer profiles and progression carry over intact

## [Unreleased]

- feat: progression system — coding activity earns Trainer XP and partner
  Pokémon XP, both persisted across sessions. XP comes from batches of saved
  work, active coding time, Git commits and successful build/test tasks
- feat: saved work is awarded in batches rather than per file, so an
  agent-driven change spanning many files is worth about the same as the
  equivalent hand-written one; commits carry the most weight of any single
  event
- feat: level-based evolution for Generations 1–4 (165 lines), with an
  `Evolve` / `Not now` prompt and a `Pokemon Coding: Evolve Partner` command.
  Evolving preserves nickname, shininess, level, XP and history — only the
  species and sprite change
- feat: the Trainer Card's XP gauge and `Coding Time` are now live, and the
  `PARTNER` section shows the partner's level and a small XP bar
- feat: choose which Pokémon is your partner — a **Change Partner** button on
  the card and a `Pokemon Coding: Choose Partner Pokemon` command. Previously
  the partner was whichever Pokémon happened to be first in the collection.
  Switching partners preserves each Pokémon's own level and XP
- feat: `vscode-pokemon.trainerCard.showDevRecord` hides the GitHub `DEV RECORD`
  section of the Trainer Card
- feat: `vscode-pokemon.progression.mode` (`auto` / `manual` / `agentic`) —
  decides whether AI-agent edits count as activity for Coding Time, since VS
  Code reports an agent's edit and a human keystroke identically. Experience
  weights are shared across modes; only the idle clock changes
- feat: `vscode-pokemon.progression.enabled` and
  `vscode-pokemon.enableDebugCommands` settings, plus two debug XP commands
  hidden behind the latter
- chore: `TrainerProfile` gains `totalTrainerXp` as its source of truth
  (schema v2); older profiles and Pokémon saved before progression existed
  migrate on read with no reset required
- feat: GitHub Trainer Card (`Pokemon Coding: Open Trainer Card`) — a retro
  trainer profile combining your public GitHub data with a persistent, local
  trainer profile (level, XP, badges, Pokédex, coding time) and your partner
  Pokémon
- feat: `vscode-pokemon.githubUsername` setting, plus
  `Pokemon Coding: Configure GitHub Trainer` and
  `Pokemon Coding: Refresh GitHub Profile` commands
- feat: Trainer Card presented as a Game Boy/DS-era game screen — bevelled card
  frame, portrait with corner brackets, prominent Trainer Level plate, Trainer
  Class title, `DEV RECORD` / `TRAINER RECORD` sections, relative language bars,
  Poké Ball badge slots, a notched XP gauge, and demoted footer actions
- chore: add the `ts-node` and `source-map-support` dev dependencies the test
  runner already required, plus `typecheck` and `test:unit` scripts

## [5.0.1]

- chore: update readme with new badges

## [5.0.0]

- feat: generation 5 sprites (partial)

## [4.3.4]

- feat: add shiny configuration option to default Pokemon settings
- fix: prevent spawning empty Pokémon collection on session start

## [4.3.3]

- fix: improve session handling and normalize pokemon counter

## [4.3.2]

- fix: add back accidentally removed "remove-all" command

## [4.3.1]

- feat: add multi-language support
- fix: add missing Nidoqueen & Rotom sprites

## [4.2.0]

- feat: add shiny sprites & spawn rate for gen 1-4

## [4.1.1]

- fix: optimize remove Pokemon method

## [4.1.0]

- feat: added code-quality GitHub Action
- chore: formatted the whole codebase with Prettier
- chore: enforced ESlint rules on commit

## [4.0.1]

- feat: change Pokémon speed depending on size

## [4.0.0]

- feat: added gen 4 pokemon
- feat: add missing forms for Pichu, Heracross, and Wobbuffet

## [3.5.0]

- feat: Added Unown characters in Gen 2 
- fix: Corphish in pokemon-data.ts 
- fix: Swipe state bug making everything stand still and not work anymore
- fix: handle cancellation of Pokemon spawning when no name is entered

## [3.4.0]

- feat: Pokémon spawn animation via Pokéball 

## [3.3.0]

- feat: add default pokemon configurable through settings.json

## [3.2.2]

- fix: issue when adding pokemon
- fix: update keybindings to make "remove all" work

## [3.2.1]

- feat: add better search functionality
- feat: add hotkeys

## [3.1.1]

- chore: update readme

## [3.1.0]

- fix: stop randomly and change direction
- fix: make default size medium

## [3.0.1]

- fix: pixelate bubbles

## [3.0.0]

- feat: add generation 3 Pokémon

## [2.0.3]

- fix: add Celebi + fix Ho-Oh id

## [2.0.2]

- fix: use pixelate image rendering

## [2.0.1]

- fix: Entei typo

## [2.0.0]

- feat: add generation 2 Pokemon

## [1.1.0]

- feat: add functionality for adding a random Pokemon

## [1.0.2]

- fix: added missing Victreebel & Omastar

## [1.0.1]

- Bump version to reflex changes to readme

## [1.0.0]

- Added all 1st generation Pokémon.
