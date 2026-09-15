# Evolution Stones + Bag (V1)

Internal design doc for the Evolution Stones feature — written for a second
agent/engineer to review and modify. Covers what exists today, how it works,
where the code lives, and open questions worth revisiting.

---

## Summary

PokéDev now supports evolution-stone evolutions (Gen I–II canon) alongside
the existing level-up and Friendship evolution systems. A stone is a Bag
item; using one on an eligible Pokémon evolves that exact persistent
instance through the same canonical evolution pipeline everything else uses.

Stones are never faked with a level threshold — if a species needs a stone
in the real games, PokéDev requires that stone, and nothing else triggers
that evolution.

---

## The six stones and what they evolve

| Stone | Species → Result |
|---|---|
| Thunder Stone | Pikachu → Raichu, Eevee → Jolteon |
| Fire Stone | Growlithe → Arcanine, Vulpix → Ninetales, Eevee → Flareon |
| Water Stone | Poliwhirl → Poliwrath, Shellder → Cloyster, Staryu → Starmie, Eevee → Vaporeon |
| Leaf Stone | Gloom → Vileplume, Weepinbell → Victreebel |
| Moon Stone | Clefairy → Clefable, Jigglypuff → Wigglytuff |
| Sun Stone | Gloom → Bellossom, Sunkern → Sunflora |

15 rules total. Verified against actual Gen I–IV game data — this is the
complete, fixed set of species that evolve via these six stones; no
Generation III or IV species were added to this list in the real games
(Generation III/IV introduced *different* stones — Shiny/Dusk/Dawn Stone —
which are explicitly out of scope for V1; see **Deliberately excluded**
below).

Two branching cases worth knowing:
- **Gloom** has two stone rules (Leaf → Vileplume, Sun → Bellossom) — which
  stone you use decides the branch.
- **Eevee** has three stone rules on top of its two existing
  Friendship+time-of-day rules (Espeon by day, Umbreon by night) — five
  rules total on one species. See **Eevee ambiguity** below for how these
  coexist safely.

---

## Data model

### Item catalog — `src/common/items.ts`

Pure, shared between the extension host and every webview bundle (same
pattern as `display-skins.ts`/`environments.ts`/`roaming-style.ts`).

```ts
export type EvolutionStoneId =
  | 'fire-stone' | 'water-stone' | 'thunder-stone'
  | 'leaf-stone' | 'moon-stone' | 'sun-stone';

export interface PokedevItemDefinition {
  id: ItemId;
  name: string;              // "Thunder Stone"
  category: 'evolution-stone';
  description: string;       // shown in the Bag's detail pane
}
```

`category` is deliberately its own field (not assumed elsewhere) so a later
milestone can add other item categories without reshaping these entries.
**Only evolution stones exist today** — no held items, consumables, Poké
Balls, currency, or crafting.

### Inventory — `src/progression/inventory-rules.ts` (pure) + `src/extension/inventory-storage.ts` (glue)

```ts
export interface PokedevInventory {
  items: Readonly<Record<string, number>>;
}
```

Split the same way `friendship-rules.ts`/`progression-service.ts` and
`evolution-service.ts`/`evolution-flow.ts` are split: the pure module has no
`vscode` import and is unit-tested directly; the storage module is thin
glue around `context.globalState` (key: `pokedev.inventory`, not synced —
see `common/storage-keys.ts`).

Rules:
- Missing item → quantity 0. Unknown item id → dropped on read.
- Quantity clamps to `[0, ∞)`, floors fractional values, never goes negative.
- An existing save with no Bag reads back as `{ items: {} }` — this
  normalization on every read *is* the migration; there's no separate
  migration step and nothing is ever silently granted.
- `consumeItem`'s check-then-decrement is fully synchronous (`globalState.get`
  never awaits), so two overlapping calls can't double-consume — whichever
  runs first commits the lower quantity before the second's synchronous read
  happens.

---

## Evolution rule model — `src/progression/evolution-data.ts` + `evolution-service.ts`

`EvolutionCondition` already existed as a discriminated union (level,
friendship, friendship-time) built specifically to be extended this way. One
member was added:

```ts
export type EvolutionCondition =
  | { type: 'level'; level: number }
  | { type: 'friendship'; minFriendship: number }
  | { type: 'friendship-time'; minFriendship: number; time: TimeOfDay }
  | { type: 'item'; itemId: EvolutionStoneId };
```

### How eligibility resolves — the important part

`getAvailableEvolution(species, level, shiny, context)` takes an optional
`context.selectedItemId`. This puts the whole function into one of two
**mutually exclusive modes**:

- **`selectedItemId` set** (an explicit "use this stone" action): only the
  one rule whose `itemId` matches is ever considered. Every level/friendship/
  friendship-time rule the species also has is skipped entirely, unevaluated.
- **`selectedItemId` unset** (every automatic path — level-up checks,
  Friendship-grant checks, stale-save reconciliation): item rules are
  skipped entirely; level/friendship/friendship-time resolve exactly as
  before this feature existed.

This is a hard invariant, not a preference — see **Eevee ambiguity** below.

### Eevee ambiguity

Eevee has friendship-time rules (Espeon/Umbreon) *and* item rules
(Vaporeon/Jolteon/Flareon) on the same species. Without the two-mode split
above, a Trainer with both max Friendship *and* a stone in hand could get an
undefined/order-dependent result. With the split: using a stone always
resolves to that stone's target regardless of Friendship/time-of-day, and
the automatic Friendship-grant check never sees the item rules at all. Both
families are tested directly in `evolution-stones.test.ts`.

### What did NOT need to change

- `evolveCollectionEntry` (the actual species/color mutation) — condition-
  type-agnostic already.
- `isReconcilableEvolutionCondition` — already whitelists only `'level'`, so
  item conditions are excluded automatically; stale-save reconciliation
  never guesses at a stone evolution.
- `getEvolutionLevel` / `hasFriendshipEvolutionRule` — naturally ignore item
  rules since they filter by condition type already.

---

## The canonical evolution pipeline (unchanged) — `src/extension/evolution-flow.ts`

`evolvePokemonInstance(context, nickname, options?)` is still the *only*
function that ever writes a species change to the persistent collection.
The only change: it now accepts `options.selectedItemId` and threads it into
its internal `getAvailableEvolution` call. Every other evolution entry point
(the partner prompt, `Evolve Partner` command, stale-save reconciliation)
is completely untouched and still calls it with no options.

Preserved across a stone evolution, same as every other method: instance
identity (nickname), XP, level, Friendship, shininess (blocked rather than
silently defaulted if the target has no shiny sprite), Partner pointer,
Party position.

### The atomic "use stone" pipeline — `useEvolutionStoneOnPokemon`

New function, same file, because it needs the module-private `notifyPanel`
reference `evolvePokemonInstance`'s other callers already use — putting it
in a separate file would have required exporting that internal, or created
a require cycle with `pokedev-state.ts`.

```
1. quantity check (fail fast)
2. resolve target Pokemon by nickname (fail if gone)
3. re-validate the rule against that Pokemon specifically
4. consume exactly 1 stone — persisted BEFORE evolving
5. evolve via evolvePokemonInstance
6. on failure after consuming (step 5 fails): refund the stone
7. on success: update the world panel IF the evolved Pokemon was the
   partner, fire pokedevState.notify('inventory'), show the same
   "Congratulations!" native dialog every other evolution method shows
```

Step 4 happens before step 5 deliberately (mirrors
`daily-challenges-service.ts`'s "persist the flag before granting the
reward" ordering) — a crash between them can only under-deliver (stone
spent, no evolution — refunded on the next successful call path since
nothing was actually written), never double-consume.

---

## Bag UI — PokéGear's 5th tab

Files: `src/pokegear/pokegear-types.ts` (types), `src/extension/pokegear-panel.ts`
(host: view-model assembly + message handling), `src/panel/pokegear/main.ts`
(webview: rendering + client state), `media/pokegear.css` (two new rules,
everything else reused from the Party/Badges tabs' existing classes).

Tab order: `STATUS / ACTIVITY / BADGES / PARTY / BAG`.

### Why in-webview, not native dialogs

PokéGear's Party/Badges tabs already do all of their selection/detail/action
UI client-side (no VS Code native prompts anywhere in the panel). The Bag
flow follows that exact precedent — select item → detail pane → USE/CANCEL
→ eligible-target list → confirm YES/NO — entirely inside the panel, styled
with the same Crystal/Gen-II CSS classes (`.pg-party-row`, `.tc-button`,
`.tc-devbadges-hint`, etc.). Only the very last step (posting
`pokegear/useItem` to the host) leaves the webview.

### Where eligibility comes from

`pokedevState.buildBagView(context)` computes, for **every** item on
**every** state push, the full list of collection entries that item
currently has a rule for (via the same `getAvailableEvolution` call the
atomic pipeline re-checks before consuming). This lives in `pokedev-state.ts`
rather than `evolution-flow.ts` specifically to dodge a require cycle
(`evolution-flow.ts` already imports `pokedevState` to broadcast changes).

This is eager/precomputed rather than fetched on click — cheap for a
realistically-sized collection, and avoids a second request/response
message type. **Worth revisiting if collections get large** (see
Discussion below).

### Client-side state (`panel/pokegear/main.ts`)

```
selectedBagItemId       — which item's detail pane is open
bagUseFlowActive        — whether USE was clicked
bagConfirmNickname      — the target chosen, awaiting YES/NO
```

All reset to a clean list view immediately after posting `useItem`, since
the underlying data (quantities, eligible species) changes as a result.

### "No eligible target" case

If `eligibleTargets.length === 0` after clicking USE, the panel shows "It
won't have any effect." and a Cancel button — no host message is ever sent,
so nothing is consumed. This is a purely client-side render decision based
on data already in the pushed view model.

---

## Acquisition

### Debug (QA only)

`PokéDev Debug: Give Evolution Stone...` — a QuickPick over all six stones,
gated by `pokedev.enableDebugCommands` like every other debug command.
Unlimited, instant, bypasses everything else.

### Real: Trainer-level milestones — `src/extension/item-rewards.ts`

```ts
{ level: 5,  itemId: 'thunder-stone' }
{ level: 10, itemId: 'fire-stone' }
{ level: 15, itemId: 'water-stone' }
{ level: 20, itemId: 'leaf-stone' }
{ level: 25, itemId: 'moon-stone' }
{ level: 30, itemId: 'sun-stone' }
```

Each grants **exactly one** copy of its stone, **exactly once, ever** — not
a recurring unlock. `CLAIMED_ITEM_REWARDS_KEY` persists which reward ids
have already fired; `markItemRewardClaimed` writes that claim *before* the
item is granted (same ordering discipline as the stone-consumption pipeline
and Daily Challenges' own reward grant), so a crash can only under-deliver,
never double-grant.

Checked in two places:
- `ProgressionService._grantTrainerLevelStoneRewards`, called whenever
  Trainer level increases (both the normal activity-XP path and
  `grantFlatTrainerXp`)
- Once at extension activation, so a Trainer already above a milestone the
  moment this feature ships gets every unclaimed one exactly once — not
  retroactively backdated, not repeated on every subsequent activation

**This is the main thing worth reconsidering** — see Discussion below.

---

## What's deliberately excluded from V1

- Trade evolutions, held-item evolutions, location evolutions, known-move
  evolutions (all need condition types that don't exist yet)
- Politoed's trade-item route for Poliwhirl (only the Water Stone → Poliwrath
  branch exists)
- Leafeon/Glaceon (location-based in the actual Gen IV games; only later
  games/remakes added a stone route, out of Gen I–IV scope)
- Any Generation III/IV-introduced item (Shiny Stone, Dusk Stone, Dawn
  Stone) and the species that use them (Togekiss, Roserade, Murkrow→
  Honchkrow, Misdreavus→Mismagius, Snorunt→Froslass, female Kirlia→Gallade
  via Dawn Stone)
- Item tossing/selling/buying, a shop, currency, held items, general
  consumables (Potions, Rare Candy, berries, Poké Balls), inventory capacity,
  item crafting, random stone drops

---

## Discussion points for the next pass

These are the places most likely to change based on how the feature feels
in practice:

1. **Milestone rewards are one-shot per stone, forever.** Once you've used
   your one Thunder Stone from Lv. 5, there's no further *real* way to earn
   another — only the debug command. Worth deciding: a second wave of
   milestones at higher levels, a small chance from Daily Challenges, or
   something else entirely. `selectUnclaimedEarnedRewards` in
   `item-rewards.ts` is pure and already unit-tested in isolation, so
   extending the reward table is low-risk.
2. **Milestone level choice (5/10/15/20/25/30) was arbitrary**, chosen only
   to "spread across a normal session" per the Trainer XP curve. Not tuned
   against real playtesting.
3. **Bag eligibility is recomputed for every item on every state push.**
   Fine at small collection sizes; would need to become on-demand
   (`selectItem` round-trip) if collections get large enough for this to be
   a real cost — nothing in the message protocol prevents adding that later.
4. **Zero-quantity items are always shown** in the Bag list (matches the
   milestone spec's own example), rather than hidden. Easy to flip if that
   turns out to feel cluttered.
5. **The confirm step is a second click inside the eligible-target list
   flow** (select item → USE → pick target → YES/NO) — four clicks minimum
   to evolve something. Could be trimmed if that feels like too much
   friction for a single stone with only one eligible target.
6. **No stone "preview" from outside the Bag** — e.g., the Trainer Card or
   Explorer views don't currently surface "you have an unused stone"
   anywhere; PokéGear's Bag tab is the only place it's visible.
