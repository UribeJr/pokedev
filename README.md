<div align='center'>

# PokéDev

![icon](https://github.com/UribeJr/pokedev/raw/main/icon.png)

![Version](https://img.shields.io/badge/version-6.2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.73.0-007ACC?logo=visualstudiocode&logoColor=white)

</div>

<p align="center">
    Pokémon that live in your editor, earn experience as you code, level up and evolve ✨
    <br>
    <br>
    <a href="https://github.com/UribeJr/pokedev/issues/new?assignees=&labels=feature&template=bug_report.md&title=">Report a Bug</a>
    ·
    <a href="https://github.com/UribeJr/pokedev/issues/new?assignees=&labels=feature&template=feature_request.md&title=">Request a Feature</a>
</p>

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/UribeJr/pokedev/raw/main/pokedev.gif">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/UribeJr/pokedev/raw/main/pokedev-light.gif">
  <img alt="Shows gif in dark or light mode" src="https://github.com/UribeJr/pokedev/raw/main/pokedev-light.gif">
</picture>
</div>

<br>

PokéDev turns your editor into a living Pokémon world. Pick a partner, watch it
roam a real Game Boy-style overworld, and earn XP for the coding you were
already doing — saving, committing, running builds and tests. Level up, evolve,
grow Friendship with your partner, check a retro GitHub Trainer Card, clear
three Daily Challenges, and track it all from a PokéGear panel that never
leaves your sidebar.

## ✨ Features at a glance

- 🗺️ **World & Roaming** — a full 2D overworld with selectable environments and Game Boy Color display borders, or classic floor-style roaming
- 🪪 **GitHub Trainer Card** — a retro trainer profile built from your public GitHub data, in a PokéDev or Pokémon Crystal skin
- 📟 **PokéGear** — one panel, four tabs: Status, Activity, Badges, Party
- ✅ **Daily Challenges** — three fresh challenges every day, driven by real coding activity
- 🏅 **Dev Badges** — your DEV Community badges, pulled into your Trainer Card and PokéGear
- ⚙️ **Dev Actions** — successful builds, tests, lint and typecheck runs earn XP too
- 📈 **Progression** — Trainer and Partner XP, levels, Generation 1–4 evolution, and a Friendship system that unlocks its own evolutions
- 🧩 **Explorer sidebar views** — Trainer summary, Party and Daily Challenges without leaving your file tree

## Installation

PokéDev is not published to any marketplace — it installs from a `.vsix` file.

**1. Download** the latest `.vsix` from
[Releases](https://github.com/UribeJr/pokedev/releases).

**2. Install** it in your editor:

### VS Code

Via the terminal:

```bash
code --install-extension pokedev-6.2.0.vsix
```

Or via the UI: open the Extensions panel (`Ctrl+Shift+X` / `Cmd(⌘)+Shift+X`),
click the `···` menu in the top corner, and choose **Install from VSIX…**,
then select the downloaded file.

### Cursor

Via the terminal:

```bash
cursor --install-extension pokedev-6.2.0.vsix
```

Or via the UI: open the Extensions panel (`Ctrl+Shift+X` / `Cmd(⌘)+Shift+X`),
click the `···` menu in the top corner, and choose **Install from VSIX…**,
then select the downloaded file.

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

PokéDev comes with default keyboard shortcuts to make managing your Pokémon quick and easy:

![Keybindings](https://github.com/UribeJr/pokedev/raw/main/keybindings.png)

### Configuring Keyboard Shortcuts

You can customize these shortcuts to match your preferences:

1. Open the command palette (`Ctrl+Shift+P` on Windows/Linux or `Cmd(⌘)+Shift+P` on MacOS)
2. Run the **`PokéDev: Configure keybindings`** command
3. Select the command you want to customize
4. VS Code will open the Keyboard Shortcuts editor filtered to that command
5. Click the pencil icon next to the command and press your desired key combination

## Changing settings

Open the setting panel with Ctrl+, on Windows/Linux or Cmd(⌘)+, on MacOS. In the search bar, enter "pokedev" to see all available options.

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

## World & Roaming

PokéDev's world has three independent things you can mix and match: how your
Pokémon move, what's behind them, and what frames the screen.

- **Roaming style** (`pokedev.roamingStyle`, command `PokéDev: Change Roaming Style`)
  — **Overworld** (default): Pokémon wander throughout the full 2D playable
  screen. **Classic**: the original floor-style left/right pet movement.
- **Environments** (`pokedev.environment`, command `PokéDev: Change Environment`)
  — a background scene behind your Pokémon: **Johto Route**, **Ilex Forest**,
  **Cave**, or **None** for the classic look.
- **Display borders** (`pokedev.displaySkin`, command `PokéDev: Change Display Border`)
  — an optional retro Game Boy Color bezel around the playable area:
  **GBC Classic**, **GBC Minimal**, **GBC Power**, **GBC No Light**, or **None**.

<img src="docs/screenshots/world-overworld.png" alt="World & Roaming — Overworld style with the Johto Route environment and a GBC display border (screenshot coming soon)" width="600">

## In the Explorer sidebar

PokéDev adds compact sections to your normal Explorer, alongside your files,
Outline and Timeline:

- **PokéDev Trainer** — your avatar, name, Trainer level, a live XP bar, coding
  time and your current partner, with small actions for `Open Full Card`,
  `Refresh` and `Change Partner`.
- **Daily Challenges** — today's three challenges and their progress, without
  opening PokéGear.
- **Party** — everything in your collection with each one's level, the
  current partner clearly marked. Click any other Pokémon to make it your
  partner; the change takes effect everywhere immediately, and experience starts
  going to the new one.

Both are ordinary collapsible Explorer sections — collapse them, reorder them,
or hide them like any other view. They are additional surfaces: the full Trainer
Card, PokéGear, and the Pokémon walking around your editor are unchanged.

<img src="docs/screenshots/explorer-sidebar.png" alt="Explorer sidebar — PokéDev Trainer, Daily Challenges and Party sections (screenshot coming soon)" width="450">

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

**`TRAINER RECORD`** — `Pokédex` caught count, DEV Badges earned, `Shinies`,
`Coding Time`, and your **Partner Pokémon**, with its animated sprite, its level,
Friendship, and a small XP bar. If you have no Pokémon out, the slot reads
`NO PARTNER SELECTED`.

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
level, XP and Friendship are stored against it individually, so the new
partner picks up from its own level and the previous one stays exactly where
it was, ready to resume if you switch back.

### Card styles

Choose between two visual styles with `pokedev.trainerCard.style` or the
**`PokéDev: Change Trainer Card Style`** command — the underlying trainer data
is identical either way:

- **PokéDev** (default) — the original PokéDev Trainer Card design.
- **Crystal** — a Pokémon Crystal-styled card: the game's window framing, GBC
  palette, and pixel UI language.

<img src="docs/screenshots/trainer-card-crystal.png" alt="GitHub Trainer Card — Crystal style (screenshot coming soon)" width="500">

### Hiding the DEV RECORD

If you would rather keep the card to your in-editor progression — or simply not
put your public GitHub stats on screen while sharing it — set
`pokedev.trainerCard.showDevRecord` to `false`. The section disappears
and the card takes the change immediately, without needing to be reopened.
GitHub data is still fetched and cached either way; only the display changes.

Trainer level and XP are deliberately **not** derived from GitHub: GitHub is your
trainer's identity, and the trainer profile tracks what you do in the editor.
`Pokédex` and `Shinies` are not wired up yet and stay at zero.

Stars and languages are worth one caveat: they are calculated from up to your
100 most recently pushed repositories that GitHub does not itself flag as a
fork, and GitHub reports a single primary language per repository — so the
language list is "repositories whose main language is X", not a byte-level
breakdown. The `SPECIALTIES` bars are sized relative to your leading language
rather than as percentages, precisely because repositories with no detected
language are left out and a percentage would not add up.

### Refreshing

Results are cached for 45 minutes, so reopening the card doesn't re-query
GitHub. Use **Refresh GitHub Profile** on the card, or the
**`PokéDev: Refresh GitHub Profile`** command, to fetch immediately.

If GitHub can't be reached, the card keeps showing your saved data with a notice
rather than going blank.

### Privacy

- No authentication, no OAuth, no tokens — only public GitHub and DEV Community data is read.
- The only settings stored are your GitHub and DEV usernames; cached profile data lives in the
  extension's local storage and is **not** included in Settings Sync.
- All external requests are made by the extension, never by the card or panel itself — their
  content security policy has no network access at all.
- No telemetry, no third-party services.

## PokéGear

A dedicated panel that gathers your Trainer's whole picture into four tabs,
cycled with the tab bar at the top. Open it with **`PokéDev: Open PokéGear`**.
PokéGear always renders in the Crystal (GBC) skin, regardless of your Trainer
Card style setting.

- **Status** — trainer name, level and XP bar, coding time, your partner's
  summary with its Friendship heart meter, today's Daily Challenge count, and
  how many Dev Badges you've earned.
- **Activity** — today's commit count and Dev Actions, your daily progress, and
  a recent-activity feed built from the same progression log that powers XP —
  high-frequency "ambient" events are filtered out so it stays readable.
- **Badges** — a grid of your DEV Community badges with a detail view on click,
  or a hint to connect your DEV profile from the Trainer Card if you haven't yet.
- **Party** — your party Pokémon with level and Friendship, a detail panel per
  Pokémon, and a **Make Partner** button.

<img src="docs/screenshots/pokegear-status.png" alt="PokéGear — Status tab (screenshot coming soon)" width="500">
<img src="docs/screenshots/pokegear-activity.png" alt="PokéGear — Activity tab (screenshot coming soon)" width="500">

## Daily Challenges

Three fresh challenges appear every day — regenerated once per calendar day,
picked deterministically so everyone sees a fair, varied rotation rather than
pure randomness. They're driven entirely by progression events you're already
generating: saves, coding minutes, commits, and successful builds/tests/lint/
typecheck runs. Nothing new is tracked just for challenges.

Challenge families include things like Warm Up, File Hopper, Deep Work, Ship
It, Partner Training, Level Up, Team Training, Underdog, Momentum, Green
Light, Build Master, Test Trainer, Clean Check, and Ship Shape — each with its
own escalating tiers. Completing one grants Trainer XP and a Friendship bump
for your current partner, with a small toast to mark it.

Check today's challenges from the Explorer's **Daily Challenges** section, or
PokéGear's **Status**/**Activity** tabs.

<img src="docs/screenshots/daily-challenges.png" alt="Daily Challenges — Explorer sidebar view (screenshot coming soon)" width="450">

## Dev Badges

If you have a [DEV Community](https://dev.to) profile, PokéDev can pull your
public badges into your Trainer Card and PokéGear's **Badges** tab.

1. Run **`PokéDev: Connect DEV Profile`** and enter your DEV username (or set
   `pokedev.devUsername` directly)
2. Your public profile is read — no authentication, no API key — and results
   are cached for 12 hours
3. Use **`PokéDev: Refresh DEV Badges`** to fetch immediately, or
   **`PokéDev: Disconnect DEV Profile`** to stop showing them

<img src="docs/screenshots/dev-badges.png" alt="PokéGear — Badges tab with connected DEV Community badges (screenshot coming soon)" width="500">

## Dev Actions

Successful VS Code tasks — builds, test runs, linting, type-checking — earn
Trainer and partner XP too, on top of saves and commits. Detection is based
only on a task's real, declared exit status via VS Code's own task API; no
terminal output is ever read or scraped. Dev Actions also count toward Daily
Challenges and give your partner a small Friendship bump. Turn them off with
`pokedev.devActions.enabled`.

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

Evolving preserves your Pokémon's **nickname, shininess, level, XP, Friendship
and history** — only its species and sprite change. A shiny stays shiny; if an
evolved form had no shiny sprite the evolution is refused rather than quietly
turning your shiny into an ordinary one.

Generation 1–4 straightforward level-up evolutions are supported (165 lines,
including gender and regional forms such as Nidoran, Shellos and Hippopotas),
alongside Friendship-based evolutions once your partner reaches a high enough
Friendship (see below). Evolutions needing conditions this version does not
model — stones, trades, time of day, held items, known moves, and special
cases like Wurmple and Tyrogue — are deliberately left out rather than
approximated. Generation 5 is excluded because most of its species have no
sprites in this repository yet.

### Friendship

Separate from XP and never decreasing, Friendship (0–255) tracks your bond
with your current partner across five tiers — Wary, Friendly, Close, Very
Close, and Best Friend — shown as hearts on the Trainer Card and PokéGear.

It grows from the coding you're already doing: a small amount on every XP
event your partner earns (more for a Dev Action), a bump on level-up, a bump
for completing a Daily Challenge, and a trickle from sustained coding time
with the same partner. At Best Friend, Friendship-based evolutions become
eligible alongside the usual level-up ones.

If `pokedev.progression.expShareEnabled` is on, non-partner party members earn
a share of the partner's XP too — useful for keeping a bench Pokémon leveling
without making it your active partner.

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

Progression is slow to test by design, so a few debug commands can grant XP or
Friendship directly. They are hidden unless you set
`pokedev.enableDebugCommands` to `true`:

- **`PokéDev Debug: Add 100 Trainer XP`**
- **`PokéDev Debug: Add 100 Partner XP`**
- **`PokéDev Debug: Grant 5 Partner EXP`**
- **`PokéDev Debug: Add 50 Friendship to Partner`**

### Where it is stored

Trainer progression, Pokémon progression, Friendship, and the recent-activity
log live in the extension's global storage, alongside your Pokémon collection.
Rewarded commit hashes are stored per workspace, since a commit belongs to a
repository. None of it is sent anywhere, and none of it joins Settings Sync.

Pokémon progression is keyed by nickname, which is how this extension already
identifies individual Pokémon — that is also why it survives an evolution
untouched. Two Pokémon sharing a nickname share progression; only your partner
earns XP, so at most one of them is ever writing.

## 📸 Adding Screenshots

A few sections above use placeholder images (they'll render as a broken-image
icon with descriptive alt text until filled in). To complete them, capture
each one below at a reasonable size, save it to `docs/screenshots/` under the
exact filename shown, and it will appear automatically:

| File | What to capture |
| --- | --- |
| `docs/screenshots/world-overworld.png` | The main PokéDev world view with `pokedev.roamingStyle` set to `overworld`, an environment picked (e.g. Johto Route via `PokéDev: Change Environment`), and a display border on (e.g. GBC Classic via `PokéDev: Change Display Border`) |
| `docs/screenshots/explorer-sidebar.png` | The Explorer sidebar with the PokéDev Trainer, Daily Challenges, and Party sections expanded |
| `docs/screenshots/trainer-card-crystal.png` | `PokéDev: Open Trainer Card` with `pokedev.trainerCard.style` set to `crystal` |
| `docs/screenshots/pokegear-status.png` | `PokéDev: Open PokéGear`, on the **Status** tab |
| `docs/screenshots/pokegear-activity.png` | PokéGear, on the **Activity** tab, ideally with a few real events in the feed |
| `docs/screenshots/daily-challenges.png` | The Explorer's **Daily Challenges** section with today's challenges visible |
| `docs/screenshots/dev-badges.png` | PokéGear's **Badges** tab with a DEV Community profile connected (`PokéDev: Connect DEV Profile`) |

## Credits

### Sprite Sources
- Pokemon Sprites: © The Pokémon Company / Nintendo / Game Freak
- The sprites are used for non-commercial, fan project purposes only
- Original sprite artwork belongs to the respective copyright holders
- The Trainer Card's layout and Poké Ball motif are fan-made homages to the
  in-game Trainer Card, drawn with CSS and the sprite assets already in this
  repository; all underlying designs and trademarks belong to their owners

### Trainer Sprites
- Trainer Sprites (the selectable Gen I-IV Trainer Card portraits): sprites
  from Pokémon Red/Blue/Green, Gold/Silver/Crystal, Ruby/Sapphire/Emerald/
  FireRed/LeafGreen, and Diamond/Pearl/Platinum/HeartGold/SoulSilver
- © Nintendo / Creatures Inc. / GAME FREAK inc., used for non-commercial,
  fan project purposes only
- Curated from [jonbarrow/trainercards.studio](https://github.com/jonbarrow/trainercards.studio),
  which credits [Bulbagarden Archives](https://archives.bulbagarden.net/wiki/Category:Trainer_sprites)
  and [pokengine.org](https://pokengine.org) as the original sources
  (see that project's [ATTRIBUTIONS.md](https://github.com/jonbarrow/trainercards.studio/blob/master/content/ATTRIBUTIONS.md))
- Only a small, curated selection is bundled here (one or two sprites per
  source game) — not that project's full multi-thousand-sprite archive

### GBC Display Borders
- The selectable Game Boy Color display borders are overlay art from
  [mugwomp93/muOS_Customization](https://github.com/mugwomp93/muOS_Customization)'s
  "Perfect GBC Overlays" pack, which itself credits u/1playerinsertcoin's
  original work shared on Reddit
- Two of the borders additionally render Nintendo's "GAME BOY COLOR"
  wordmark styling as pixel content, used here as a non-commercial fan-project
  display skin

### Crystal Environments & Trainer Card
- The selectable world environments and the Trainer Card's Crystal style are
  built from tile and window-frame art in
  [pret/pokecrystal](https://github.com/pret/pokecrystal), a reverse-engineered
  disassembly of Pokémon Crystal
- The underlying pixel art is Nintendo/Game Freak's, used here for
  non-commercial fan-project purposes only

### Fonts
- Silkscreen by Jason Kottke, licensed under the SIL Open Font License 1.1
  (see [media/Silkscreen-LICENSE.txt](media/Silkscreen-LICENSE.txt))

### Notices
- All sprites and game-derived pixel art are property of their original
  creators
- This repository is a fan project and is **not affiliated with, endorsed by, or
  sponsored by** Nintendo, The Pokémon Company, Game Freak, or DEV Community
- Pokémon and all related names and artwork are trademarks of Nintendo /
  Creatures Inc. / GAME FREAK inc. They are used here for non-commercial,
  personal, fan-project purposes only
