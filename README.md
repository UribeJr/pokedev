<div align='center'>

# VS Code Pokémon

![icon](https://github.com/jakobhoeg/vscode-pokemon/raw/main/icon.png)
</div>

<p align="center">
    Puts cute Pokémon in your code editor to boost productivity ✨
    <br>
    <br>
    <a href="https://github.com/jakobhoeg/vscode-pokemon/issues/new?assignees=&labels=feature&template=bug_report.md&title=">Report a Bug</a>
    ·
    <a href="https://github.com/jakobhoeg/vscode-pokemon/issues/new?assignees=&labels=feature&template=feature_request.md&title=">Request feature</a>
</p>

<div align="center">

![Visual Studio Marketplace Version](https://vsmarketplacebadges.dev/version-short/jakobhoeg.vscode-pokemon.png)
![Visual Studio Marketplace Installs](https://vsmarketplacebadges.dev/installs-short/jakobhoeg.vscode-pokemon.png)
![Visual Studio Marketplace Downloads](https://vsmarketplacebadges.dev/downloads-short/jakobhoeg.vscode-pokemon.png)

</div>

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/jakobhoeg/vscode-pokemon/raw/main/vscode-pokemon.gif">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/jakobhoeg/vscode-pokemon/raw/main/vscode-pokemon-light.gif">
  <img alt="Shows gif in dark or light mode" src="https://github.com/jakobhoeg/vscode-pokemon/raw/main/vscode-pokemon-light.gif">
</picture>
</div>

<div align="center">

Seen used by engineers at [Microsoft](https://code.visualstudio.com/updates/v1_101#_chat-ux-improvements)!

</div>

## 💖 Support

If you enjoy this project, please consider supporting me.
Manually creating the `.gif` files for each sprite takes a lot of time and effort.
Your sponsorship helps me dedicate more energy to improve and expand the project.

[![GitHub Sponsor](https://img.shields.io/badge/Sponsor-❤-blue?style=flat&logo=github)](https://github.com/sponsors/jakobhoeg)

## Installation

Install this extension from the [VS Code marketplace](https://marketplace.visualstudio.com/items?itemName=jakobhoeg.vscode-pokemon) or the [Open VSX Registry](https://open-vsx.org/extension/jakobhoeg/vscode-pokemon).

![Default view](https://github.com/jakobhoeg/vscode-pokemon/raw/main/install.png)

OR

With VS Code open, search for `vscode-pokemon` in the extension panel (`Ctrl+Shift+X` on Windows/Linux or `Cmd(⌘)+Shift+X` on MacOS) and click install.

OR

With VS Code open, launch VS Code Quick Open (`Ctrl+P` on Windows/Linux or `Cmd(⌘)+P` on MacOS), paste the following command, and press enter.

`ext install jakobhoeg.vscode-pokemon`

## Using VS Code Pokémon

After installing, open the command palette with `Ctrl+Shift+P` on Windows/Linux or `Cmd(⌘)+Shift+P` on MacOS.

Run the "Start Pokemon coding session" command (`vscode-pokemon.start`) to see a Bulbasaur in VS Code:

![Default view](https://github.com/jakobhoeg/vscode-pokemon/raw/main/usage.png)

Enjoy interacting with your favourite Pokémon!

## Keyboard Shortcuts

VS Code Pokémon comes with default keyboard shortcuts to make managing your Pokémon quick and easy:

![Keybindings](https://github.com/jakobhoeg/vscode-pokemon/raw/main/keybindings.png)

### Configuring Keyboard Shortcuts

You can customize these shortcuts to match your preferences:

1. Open the command palette (`Ctrl+Shift+P` on Windows/Linux or `Cmd(⌘)+Shift+P` on MacOS)
2. Run the **`Pokemon Coding: Configure keybindings`** command
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
  "vscode-pokemon.defaultPokemon": [
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
- **`shiny`** (optional): Determines if the Pokémon is shiny, if not set will use `vscode-pokemon.shinyOdds` setting.
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
2. Run the **`Pokemon Coding: Change Pokemon language`** command
3. Select your preferred language from the list

#### Using Settings

You can also configure the language directly in your `settings.json`:

```json
{
  "vscode-pokemon.pokemonLanguage": "fr-FR"
}
```

Available options:
- **`auto`** (default): Automatically uses VS Code's language setting
- **`en-US`**: English (US) names
- **`fr-FR`**: French names (e.g., "Bulbizarre", "Salamèche", "Dracaufeu")
- **`de-DE`**: German names (e.g., "Bisasam", "Glumanda", "Glurak")
- **`ja-JP`**: Japanese names (e.g., "フシギダネ", "ヒトカゲ", "リザードン")

**Note:** The language setting applies to all Pokémon names throughout the extension, including in the spawn selection menu, roll-call, and export features. Translations are available for all Pokémon from Generations 1, 2, 3, and 4.

## GitHub Trainer Card

A retro Trainer Card for your editor. It pairs your public GitHub profile with a
Pokémon-style trainer profile that persists across sessions — the foundation for
trainer XP, badges, a Pokédex and coding streaks in later versions.

### Opening it

1. Open the command palette (`Ctrl+Shift+P` on Windows/Linux or `Cmd(⌘)+Shift+P` on macOS)
2. Run **`Pokemon Coding: Open Trainer Card`**

There is also a Trainer Card button in the title bar of the **VS Code Pokémon**
view in the Explorer.

### Connecting your GitHub username

The first time you open the card it asks for a GitHub username. Type it in and
press **Connect** — the extension checks the account exists and remembers it.

You can also set it directly in `settings.json`:

```json
{
  "vscode-pokemon.githubUsername": "octocat"
}
```

or run **`Pokemon Coding: Configure GitHub Trainer`**. To point the card at a
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
Poké Ball slots), `Shinies`, `Coding Time`, and your **Partner Pokémon** — the
first Pokémon in your current collection, with its animated sprite. If you have
no Pokémon out, the slot reads `NO PARTNER SELECTED`.

Trainer level and XP start at 1 and 0. They are deliberately **not** derived from
GitHub: GitHub is your trainer's identity, and the trainer profile tracks what
you do in the editor. Catching, XP and badges arrive in a later version, so
those counters stay at zero for now.

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
**`Pokemon Coding: Refresh GitHub Profile`** command, to fetch immediately.

If GitHub can't be reached, the card keeps showing your saved data with a notice
rather than going blank.

### Privacy

- No authentication, no OAuth, no tokens — only public GitHub data is read.
- The only setting stored is your username; cached profile data lives in the
  extension's local storage and is **not** included in Settings Sync.
- All GitHub requests are made by the extension, never by the card itself — the
  card's content security policy has no network access at all.
- No telemetry, no third-party services.

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
- All sprites are property of their original creators
- This repository is a fan project and is not affiliated with Nintendo, The Pokémon Company, or Game Freak

This repository is inspired by and based on [vscode-pets](https://github.com/tonybaloney/vscode-pets) by [tonybaloney](https://github.com/tonybaloney).
