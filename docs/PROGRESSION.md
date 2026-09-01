# The PokéDev Experience System

Your Pokémon don't just wander around your editor. They grow with you.

PokéDev watches how you actually work — files you change, time you spend, commits
you make — and turns it into experience on two tracks: **you**, the Trainer, and
your **partner Pokémon**, who levels up and eventually evolves.

Everything below is local. Nothing is uploaded anywhere.

---

## Two tracks

|             | What it is                                   | Where it lives                   |
| ----------- | -------------------------------------------- | -------------------------------- |
| **Trainer** | You. One level, one XP total, forever.       | Follows you across every project |
| **Partner** | The Pokémon you've chosen as your companion. | Stored per Pokémon               |

Every piece of work you do feeds both at once. The partner always earns a bit
more, so it visibly outpaces you — it's the thing you watch grow, while your
Trainer level is the slower measure of everything you've ever done.

Switching partners doesn't move XP around. Each Pokémon keeps its own level, so
a partner you set aside is frozen exactly where it was, ready to pick up again.

---

## How you earn

| What you did                | Trainer       | Partner       |
| --------------------------- | ------------- | ------------- |
| Saved a batch of work       | **+2 to +10** | **+4 to +20** |
| 10 minutes of active coding | **+5**        | **+8**        |
| Made a Git commit           | **+25**       | **+40**       |
| A build or test task passed | **+10**       | **+15**       |

**A commit is the big one.** It's the clearest signal that something actually got
finished, so it's worth more than anything else — about as much as ten minutes of
coding and a save put together.

### What "a batch of work" means

Saves aren't counted one file at a time. Everything you save within about five
seconds is grouped into one **batch**, and a batch pays once every 45 seconds.

Batches scale with how much they touched, but only up to a point:

| Files changed | Trainer | Partner |
| ------------- | ------- | ------- |
| 1             | +2      | +4      |
| 3             | +4      | +8      |
| 9 or more     | +10     | +20     |

A change spanning nine files and one spanning four hundred are worth the same.
That's deliberate: XP should track _that you got something done_, not how much
surface the change happened to cover.

### A worked example

You fix a typo on a product page and commit it:

```
work batch (1 file)    +2 trainer   +4 partner
git commit            +25 trainer  +40 partner
──────────────────────────────────────────────
                      +27 trainer  +44 partner
```

That's 27% of your first Trainer level, and more than half a level for a fresh
partner. Line count doesn't matter — a two-line fix and a two-hundred-line
rewrite of the same file pay identically.

---

## What _doesn't_ earn anything

This is the part that keeps the system honest.

- **Typing.** Not one point per keystroke. Ever.
- **Saving a file you didn't change.** Hammering `Cmd+S` on an untouched buffer
  earns nothing, no matter how long you wait.
- **Re-saving the same file over and over.** One batch per 45 seconds.
- **Generated and vendored files.** `node_modules`, `out`, `dist`, `.git`,
  lockfiles, minified bundles and source maps are all ignored — a build step
  can't inflate your XP.
- **Files outside your project.** Scratch files elsewhere on disk don't count.
- **The same commit twice.** Each commit is counted once, remembered per
  repository. Reopening the folder next week doesn't pay you again.
- **An editor left open overnight.** Time only accrues while the window is
  focused _and_ something has actually happened recently.

There's also a hard ceiling — 30 XP events per minute, and 600 Trainer XP per
hour — but you'll never see it. A hard day's work lands around 240 Trainer XP
per hour. Those limits exist so a runaway bug can't dump thousands of points,
not to throttle you.

---

## Levels

### Trainer

Levels start quick and stretch out gently. Each one costs a flat 25 XP more than
the gap before it:

| Level | XP needed |
| ----- | --------- |
| 1 → 2 | 100       |
| 2 → 3 | 150       |
| 3 → 4 | 225       |
| 4 → 5 | 325       |
| 5 → 6 | 450       |

Roughly: **Lv. 5 in a few hours, Lv. 10 in about a working week, Lv. 20 in a few
months.** The cap is 100.

### Pokémon

Pokémon use their own curve — `level × (level + 10)`. A Pokémon that's been with
you since before this system existed starts at **Lv. 5**.

| Level | XP for the next one |
| ----- | ------------------- |
| 5     | 75                  |
| 10    | 200                 |
| 16    | 416                 |
| 50    | 3,000               |

Getting a starter from Lv. 5 to its first evolution at Lv. 16 costs **2,310 XP** —
around a week of normal work. The cap is 100.

---

## Evolution

When your partner is ready, you get asked:

> **What? Bella is ready to evolve!** `Evolve` `Not now`

**Not now** changes nothing and simply asks again next time it levels. You can
also evolve on demand with **`PokéDev: Evolve Partner`**.

Evolving **keeps everything that makes your Pokémon yours** — its nickname, its
shininess, its level, its XP, its whole history. Only the species and the sprite
change. A shiny stays shiny; if an evolved form has no shiny sprite, PokéDev
refuses the evolution rather than quietly turning your shiny into an ordinary one.

**165 evolutions** are supported across Generations 1–4 — every starter line, and
the form-specific ones this project actually ships sprites for (Nidoran, Shellos,
Hippopotas, Combee, Gible).

Evolutions that need something PokéDev doesn't model yet — evolution stones,
trading, friendship, time of day, held items, learned moves, and oddities like
Wurmple and Tyrogue — are deliberately left out rather than guessed at.

---

## Working with an AI agent

Most editors can't tell the difference between you typing a line and an AI agent
writing one — they look identical from the outside. So PokéDev lets you say which
you mean:

| Mode                   | What counts as "you're working"                       | Idle cutoff |
| ---------------------- | ----------------------------------------------------- | ----------- |
| **`auto`** _(default)_ | Your typing **and** agent edits — you earn either way | 5 min       |
| **`manual`**           | Only your own keyboard and mouse                      | 5 min       |
| **`agentic`**          | Any edit, with room for long agent runs               | 15 min      |

Set it with `pokedev.progression.mode`.

Pick **`manual`** if you want your coding time to reflect only work you did with
your own hands — watching an agent build something will earn nothing. Pick
**`agentic`** if you leave long agent runs going and don't want the thinking
pauses between edits cutting your session short.

This only affects the **coding-time clock**. Batches and commits pay the same in
every mode — a commit is a commit, whoever wrote the diff. The numbers are tuned
so that a hand-written session and an agent-driven one earn within about 2% of
each other. Neither way of working is the "right" one.

---

## Your data

| What                             | Where                       |
| -------------------------------- | --------------------------- |
| Trainer level, XP, coding time   | Your editor's local storage |
| Each Pokémon's level and XP      | Your editor's local storage |
| Which commits already counted    | Per project                 |
| Recent activity (last 50 events) | Your editor's local storage |

No accounts, no servers, no telemetry, nothing leaves your machine. If you had
Pokémon before this system existed, they're carried over with a sensible starting
level — you never have to reset anything.

---

## Settings

| Setting                             | Default | What it does                               |
| ----------------------------------- | ------- | ------------------------------------------ |
| `pokedev.progression.enabled`       | `true`  | Turns the whole system off                 |
| `pokedev.progression.mode`          | `auto`  | `auto` / `manual` / `agentic` (above)      |
| `pokedev.trainerCard.showDevRecord` | `true`  | Show your GitHub stats on the Trainer Card |
| `pokedev.enableDebugCommands`       | `false` | Reveals the XP-granting debug commands     |

## Commands

| Command                                      | What it does                            |
| -------------------------------------------- | --------------------------------------- |
| `PokéDev: Open Trainer Card`                 | Your level, XP, coding time and partner |
| `PokéDev: Choose Partner Pokemon`            | Pick who earns XP and evolves           |
| `PokéDev: Evolve Partner`                    | Evolve now, if it's ready               |
| `PokéDev: Toggle Dev Record on Trainer Card` | Show/hide the GitHub section            |

### Trying it out quickly

Progression is slow on purpose, which makes it tedious to test. Set
`pokedev.enableDebugCommands` to `true` and two extra commands appear:

- `PokéDev Debug: Add 100 Trainer XP`
- `PokéDev Debug: Add 100 Partner XP`

For a fast look at evolution, spawn a **Caterpie** — it evolves at Lv. 7, which is
two clicks of the partner XP command. A starter like Bulbasaur needs 24.

These are hidden unless you switch that setting on, and they're meant for trying
things out rather than for playing.
