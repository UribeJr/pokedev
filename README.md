<div align='center'>

# PokéDev

![icon](https://github.com/UribeJr/pokedev/raw/main/icon.png)
</div>

<p align="center">
    Pokémon that live in your editor, earn experience as you code, level up and evolve ✨
    <br>
    <br>
    <a href="https://github.com/UribeJr/pokedev/issues/new?assignees=&labels=feature&template=bug_report.md&title=">Report a Bug</a>
    ·
    <a href="https://github.com/UribeJr/pokedev/issues/new?assignees=&labels=feature&template=feature_request.md&title=">Request feature</a>
</p>

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/UribeJr/pokedev/raw/main/pokedev.gif">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/UribeJr/pokedev/raw/main/pokedev-light.gif">
  <img alt="Shows gif in dark or light mode" src="https://github.com/UribeJr/pokedev/raw/main/pokedev-light.gif">
</picture>
</div>

<div align="center">

A fork of [vscode-pokemon](https://github.com/jakobhoeg/vscode-pokemon) by
[jakobhoeg](https://github.com/jakobhoeg), extended with a GitHub Trainer Card
and a full progression system.

</div>

## 💖 Support

If you enjoy this project, please consider supporting me.
Manually creating the `.gif` files for each sprite takes a lot of time and effort.
Your sponsorship helps me dedicate more energy to improve and expand the project.

PokéDev builds on [jakobhoeg](https://github.com/jakobhoeg)'s work. If you find
it useful, consider sponsoring the original author:

[![GitHub Sponsor](https://img.shields.io/badge/Sponsor%20jakobhoeg-❤-blue?style=flat&logo=github)](https://github.com/sponsors/jakobhoeg)

## Installation

PokéDev is not published to any marketplace — it installs from a `.vsix` file.

Download the latest `.vsix` from
[Releases](https://github.com/UribeJr/pokedev/releases), then either:

```bash
code --install-extension pokedev-6.0.0.vsix
```

(use `cursor --install-extension` for Cursor), **or** open the Extensions panel
(`Ctrl+Shift+X` / `Cmd(⌘)+Shift+X`), click the `···` menu, and choose
**Install from VSIX…**

### Building it yourself

```bash
npm install && npm run compile && npx @vscode/vsce package
```

## Using PokéDev

After installing, open the command palette with `Ctrl+Shift+P` on Windows/Linux or `Cmd(⌘)+Shift+P` on MacOS.

Run the "Start Pokemon coding session" command (`pokedev.start`) to see a Bulbasaur in VS Code:

![Default view](https://github.com/UribeJr/pokedev/raw/main/usage.png)

Enjoy interacting with your favourite Pokémon!

## Keyboard Shortcuts

VS Code Pokémon comes with default keyboard shortcuts to make managing your Pokémon quick and easy:

![Keybindings](https://github.com/UribeJr/pokedev/raw/main/keybindings.png)

### Configuring Keyboard Shortcuts

You can customize these shortcuts to match your preferences:

1. Open the command palette (`Ctrl+Shift+P` on Windows/Linux or `Cmd(⌘)+Shift+P` on MacOS)
2. Run the **`PokéDev: Configure keybindings`** command
3. Select the command you want to customize
4. VS Code will open the Keyboard Shortcuts editor filtered to that command
5. Click the pencil icon next to the command and press your desired key combination

## Changing settings

Open the setting panel with Ctrl+, on Windows/Linux or Cmd(⌘)+, on MacOS. In the search bar, enter “vscode-pokemon" to see all available options.

Set the size and position of the extension.

### Default Pokémon

You can configure specific Pokémon to automatically appear when you first start using the extension. This is useful for setting up your preferred team without having to manually spawn them when you open new windows.

To configure default Pokémon, add the following to your `settings.json`:

```json
{
  "pokedev.defaultPokemon": [
    {
      "type": "pikachu",
      "name": "Sparky"
    },
    {
      "type": "charizard",
      "name": "Flame"
    },
    {
      "type": "articuno"
    },
    {
      "type": "mewtwo",
      "shiny": true
    },
    {
      "type": "random"
    },
    {
      "type": "random",
      "pool": ["pikachu", "eevee", "gengar", "snorlax"]
    }
  ]
}
```

- **`type`** (required): The Pokémon species (e.g., `"pikachu"`, `"charizard"`, `"mewtwo"`), or `"random"` to spawn a random species
- **`name`** (optional): A custom name for your Pokémon. If not provided, a random name will be assigned
- **`shiny`** (optional): Determines if the Pokémon is shiny, if not set will use `pokedev.shinyOdds` setting.
- **`pool`** (optional): Only used when `type` is `"random"`. Restricts the random selection to this list of species. Invalid entries are dropped with a warning; if none are valid, selection falls back to any Pokémon.

**Note:** The extension automatically saves your current Pokémon between sessions. The `defaultPokemon` setting is only used when:
- You start the extension for the first time
- You open a new windows/repository
- You have removed all Pokémon (no saved session exists)

A `"random"` entry is resolved to a specific species the first time it's applied, then saved like any other Pokémon — reopening the window won't re-roll it, only removing all Pokémon will.

To reset to your default Pokémon, use the "Remove all pokemon" command and restart VS Code.

### Pokémon Language

You can customize the language used for Pokémon names. The extension supports official Pokémon languages: English (US), French, German, and Japanese.

#### Using the Command

1. Open the command palette (`Ctrl+Shift+P` on Windows/Linux or `Cmd(⌘)+Shift+P` on MacOS)
2. Run the **`PokéDev: Change Pokemon language`** command
3. Select your preferred language from the list

#### Using Settings

You can also configure the language directly in your `settings.json`:

```json
{
  "pokedev.pokemonLanguage": "fr-FR"
}
```

Available options:
- **`auto`** (default): Automatically uses VS Code's language setting
- **`en-US`**: English (US) names
- **`fr-FR`**: French names (e.g., "Bulbizarre", "Salamèche", "Dracaufeu")
- **`de-DE`**: German names (e.g., "Bisasam", "Glumanda", "Glurak")
- **`ja-JP`**: Japanese names (e.g., "フシギダネ", "ヒトカゲ", "リザードン")

**Note:** The language setting applies to all Pokémon names throughout the extension, including in the spawn selection menu, roll-call, and export features. Translations are available for all Pokémon from Generations 1, 2, 3, and 4.

## In the Explorer sidebar

PokéDev adds two compact sections to your normal Explorer, alongside your files,
Outline and Timeline:

- **PokéDev Trainer** — your avatar, name, Trainer level, a live XP bar, coding
  time and your current partner, with small actions for `Open Full Card`,
  `Refresh` and `Change Partner`.
- **Pokémon** — everything in your collection with each one's level, the
  current partner clearly marked. Click any other Pokémon to make it your
  partner; the change takes effect everywhere immediately, and experience starts
  going to the new one.

Both are ordinary collapsible Explorer sections — collapse them, reorder them,
or hide them like any other view. They are additional surfaces: the full Trainer
Card and the Pokémon walking along the bottom of your editor are unchanged.

## GitHub Trainer Card

A retro Trainer Card for your editor. It pairs your public GitHub profile with a
Pokémon-style trainer profile that persists across sessions, and shows your live
Trainer level, XP and coding time (see [Progression](#progression)).

### Opening it

1. Open the command palette (`Ctrl+Shift+P` on Windows/Linux or `Cmd(⌘)+Shift+P` on macOS)
2. Run **`PokéDev: Open Trainer Card`**

There is also a Trainer Card button in the title bar of the **PokéDev**
view in the Explorer.

### Connecting your GitHub username

The first time you open the card it asks for a GitHub username. Type it in and
press **Connect** — the extension checks the account exists and remembers it.

You can also set it directly in `settings.json`:

```json
{
  "pokedev.githubUsername": "octocat"
}
```

or run **`PokéDev: Configure GitHub Trainer`**. To point the card at a
different account later, use **Change GitHub Username** on the card itself.

### What it shows

The card is laid out like an in-game Trainer Card: an identity header, then a
`DEV RECORD` block for your GitHub stats and a `TRAINER RECORD` block for your
game stats, with a `TRAINER XP` gauge along the bottom.

**Identity** — your avatar in a portrait frame, display name, `@username`, a
`TRAINER LV.` plate, and a **Trainer Class** derived from your most-used
languages (Frontend, Research, Systems, Full-Stack, or plain Pokémon Trainer
when there isn't enough to go on). Your bio and location appear underneath.

**`DEV RECORD`** — public repositories, total stars, followers, and the year you
joined, plus `SPECIALTIES`: your top three languages with a relative bar and the
number of repositories behind each.

**`TRAINER RECORD`** — `Pokédex` caught count, `Badges` (0 / 8, shown as eight
Poké Ball slots), `Shinies`, `Coding Time`, and your **Partner Pokémon**, with
its animated sprite, its level and a small XP bar. If you have no Pokémon out,
the slot reads `NO PARTNER SELECTED`.

### Choosing your partner

The partner is the Pokémon that earns experience and the one that evolves, so
it is worth picking deliberately. Use **Change Partner** on the card itself, or
run **`PokéDev: Choose Partner Pokemon`**. The picker lists everything in
your collection with its current level.

Until you choose, the partner is the first Pokémon in your collection — the
behaviour that existed before choosing was possible, so nothing changes for
existing users. If the Pokémon you chose is later released, the partner falls
back to the first entry again.

Switching partners neither transfers nor destroys progress. Each Pokémon's
level and XP are stored against it individually, so the new partner picks up
from its own level and the previous one stays exactly where it was, ready to
resume if you switch back.

### Hiding the DEV RECORD

If you would rather keep the card to your in-editor progression — or simply not
put your public GitHub stats on screen while sharing it — set
`pokedev.trainerCard.showDevRecord` to `false`. The section disappears
and the card takes the change immediately, without needing to be reopened.
GitHub data is still fetched and cached either way; only the display changes.

Trainer level and XP are deliberately **not** derived from GitHub: GitHub is your
trainer's identity, and the trainer profile tracks what you do in the editor.
`Pokédex`, `Shinies` and `Badges` are not wired up yet and stay at zero.

Stars and languages are worth one caveat: they are calculated from up to your
100 most recently pushed non-fork repositories, and GitHub reports a single
primary language per repository — so the language list is "repositories whose
main language is X", not a byte-level breakdown. The `SPECIALTIES` bars are
sized relative to your leading language rather than as percentages, precisely
because repositories with no detected language are left out and a percentage
would not add up.

### Refreshing

Results are cached for 45 minutes, so reopening the card doesn't re-query
GitHub. Use **Refresh GitHub Profile** on the card, or the
**`PokéDev: Refresh GitHub Profile`** command, to fetch immediately.

If GitHub can't be reached, the card keeps showing your saved data with a notice
rather than going blank.

### Privacy

- No authentication, no OAuth, no tokens — only public GitHub data is read.
- The only setting stored is your username; cached profile data lives in the
  extension's local storage and is **not** included in Settings Sync.
- All GitHub requests are made by the extension, never by the card itself — the
  card's content security policy has no network access at all.
- No telemetry, no third-party services.


## Progression

Coding earns experience on two tracks that persist across sessions: your
**Trainer**, and your **Partner Pokémon**.

> **New here?** [**docs/PROGRESSION.md**](docs/PROGRESSION.md) explains the whole
> system in plain language — what earns XP, what deliberately doesn't, how levels
> and evolution work, and how it handles AI-agent work. The rest of this section
> is the reference version.

### How XP is earned

| Activity | Trainer | Partner |
| --- | --- | --- |
| A batch of saved work | +2 to +10 | +4 to +20 |
| Every 10 minutes of active coding | +5 | +8 |
| A Git commit | +25 | +40 |
| A build or test task that exits successfully | +10 | +15 |

The system is meant to reward work, not button-mashing, so each source is
guarded:

- **Saved work is paid in batches, not per file.** Saves landing within five
  seconds of each other collapse into a single award, and only one batch is paid
  every 45 seconds. A file only enters a batch if its contents genuinely
  changed, so re-saving an unchanged buffer earns nothing no matter how long you
  wait. Generated and vendored paths (`node_modules`, `out`, `dist`, `.git`,
  lockfiles, minified and map files) are ignored, as are files outside your
  workspace.

  Batching matters most when an AI agent is doing the writing: a forty-file
  refactor arrives as forty saves at once, and paying per file would make XP
  measure how much surface a change happened to cover rather than that a piece
  of work got done. Breadth still counts for something — a batch scales from +2
  to +10 — but with a hard ceiling, so a large change and an enormous one are
  worth the same.
- **Coding time** only accrues while the window is focused *and* the editor has
  seen activity recently, so an editor left open overnight earns nothing. This
  is what fills the `Coding Time` field. What counts as activity depends on
  `pokedev.progression.mode` — see [Working style](#working-style).
- **Commits** are the most valuable single event, because a commit is a
  milestone someone deliberately recorded — which stays true whether you or an
  agent wrote the diff. Each commit hash is counted once and remembered per
  workspace, so reopening the folder never pays for the same commit twice.
- **Tasks** are judged on their real exit code via VS Code's task API — no
  terminal output is ever read or scraped.
- A global throttle caps XP events per minute and trainer XP per hour. Both sit
  far above what real work produces — a hard session of either kind lands around
  240 trainer XP per hour — so they exist only as a backstop against a
  misbehaving event loop, not as a balance lever.

These weights are deliberately tuned so that agent-driven and hand-written
sessions earn at close to the same rate; neither style is the "right" way to
use the extension.

### Levels

Trainer levels use a steady curve — 100 XP for level 2, then 150, 225, 325,
rising by a flat 25 more each level. Early levels arrive quickly and later ones
stretch out, without the requirement ever becoming unreachable.

Pokémon use their own curve, `level × (level + 10)`. Pokémon that predate this
feature start at **Lv. 5**. This is not one of the official growth-rate
formulas; per-species growth rates are a later milestone.

Level-ups appear briefly in the status bar rather than as notifications.

### Evolution

When your partner reaches its evolution level you are asked:

> What? Bella is ready to evolve!  `Evolve`  `Not now`

Choosing **Not now** changes nothing and simply defers the question to the next
level-up; you can also evolve at any time with **`PokéDev: Evolve
Partner`**.

Evolving preserves your Pokémon's **nickname, shininess, level, XP and
history** — only its species and sprite change. A shiny stays shiny; if an
evolved form had no shiny sprite the evolution is refused rather than quietly
turning your shiny into an ordinary one.

Generation 1–4 straightforward level-up evolutions are supported (165 lines,
including gender and regional forms such as Nidoran, Shellos and Hippopotas).
Evolutions needing conditions this version does not model — stones, trades,
friendship, time of day, held items, known moves, and special cases like Wurmple
and Tyrogue — are deliberately left out rather than approximated. Generation 5
is excluded because most of its species have no sprites in this repository yet.

### Working style

VS Code reports an edit made by an AI agent and a keystroke made by you as the
same event, so it cannot tell them apart on its own. `pokedev.progression.mode`
decides which signals to trust for **Coding Time**:

| Mode | What counts as activity | Idle window |
| --- | --- | --- |
| `auto` *(default)* | Your input **and** agent edits — you earn either way | 5 min |
| `manual` | Only your own keyboard and mouse input | 5 min |
| `agentic` | Any edit, with room for long unattended runs | 15 min |

Use `manual` if you want coding time to reflect only work you did yourself:
watching an agent build something will accrue nothing. Use `agentic` if you
routinely leave long agent runs going and don't want the pauses between edits
(reasoning, tool calls, a build) cutting the session short.

This governs the idle clock **only**. Work batches and Git commits pay the same
in every mode — a commit is a commit whoever wrote the diff — and the weights
themselves are tuned so hand-written and agent-driven sessions earn at close to
the same rate. Saving a file always counts as activity in every mode, since it
is a deliberate act.

### Settings and debugging

`pokedev.progression.enabled` (default `true`) turns the whole system off.

Progression is slow to test by design, so two debug commands can grant XP
directly. They are hidden unless you set
`pokedev.enableDebugCommands` to `true`:

- **`PokéDev Debug: Add 100 Trainer XP`**
- **`PokéDev Debug: Add 100 Partner XP`**

### Where it is stored

Trainer progression, Pokémon progression and the recent-activity log live in the
extension's global storage, alongside your Pokémon collection. Rewarded commit
hashes are stored per workspace, since a commit belongs to a repository. None of
it is sent anywhere, and none of it joins Settings Sync.

Pokémon progression is keyed by nickname, which is how this extension already
identifies individual Pokémon — that is also why it survives an evolution
untouched. Two Pokémon sharing a nickname share progression; only your partner
earns XP, so at most one of them is ever writing.

## Features

Extracting and creating .gif files involves quite a bit of tedious manual work, but I’ll aim to add Gen 5 when possible.

## Credits

### Sprite Sources
- Pokemon Sprites: © The Pokémon Company / Nintendo / Game Freak
- The sprites are used for non-commercial, fan project purposes only
- Original sprite artwork belongs to the respective copyright holders
- The Trainer Card's layout and Poké Ball motif are fan-made homages to the
  in-game Trainer Card, drawn with CSS and the sprite assets already in this
  repository; all underlying designs and trademarks belong to their owners

### Fonts
- Silkscreen by Jason Kottke, licensed under the SIL Open Font License 1.1
  (see [media/Silkscreen-LICENSE.txt](media/Silkscreen-LICENSE.txt))

### Acknowledgments

PokéDev is a fork of [vscode-pokemon](https://github.com/jakobhoeg/vscode-pokemon)
by [jakobhoeg](https://github.com/jakobhoeg), which is itself inspired by and
based on [vscode-pets](https://github.com/tonybaloney/vscode-pets) by
[tonybaloney](https://github.com/tonybaloney). The original code is released
under CC0; this fork keeps that dedication and adds the GitHub Trainer Card and
the progression system.

- All sprites are property of their original creators
- This repository is a fan project and is **not affiliated with, endorsed by, or
  sponsored by** Nintendo, The Pokémon Company, or Game Freak
- Pokémon and all related names and artwork are trademarks of Nintendo /
  Creatures Inc. / GAME FREAK inc. They are used here for non-commercial,
  personal, fan-project purposes only
