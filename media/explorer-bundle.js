/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/progression/friendship-rules.ts":
/*!*********************************************!*\
  !*** ./src/progression/friendship-rules.ts ***!
  \*********************************************/
/***/ ((__unused_webpack_module, exports) => {


/**
 * The entire balance and decision surface of the Friendship system.
 *
 * Mirrors the split `xp-rules.ts`/`reaction-rules.ts` already use: every
 * tunable (the range, gain amounts, tier boundaries, the evolution threshold)
 * lives here so tuning never means hunting through the host service, and
 * every decision is a pure function over plain numbers so it can be unit
 * tested without `vscode` or a DOM.
 *
 * Friendship is deliberately NOT XP: it tracks how much the user has worked
 * alongside THIS Pokemon while it was the partner, not how much experience it
 * has earned. Nothing here ever decreases a value - there is no loss
 * mechanic in V1 (see the module doc on `PokemonProgress.friendship`).
 *
 * Pure: no `vscode`, no DOM.
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.addFriendship = exports.friendshipXpEventAmount = exports.getFriendshipHearts = exports.getFriendshipTier = exports.clampFriendship = exports.FRIENDSHIP_TIER_ORDER = exports.FRIENDSHIP_CODING_CHUNK_MS = exports.FRIENDSHIP_GAIN_CODING_CHUNK = exports.FRIENDSHIP_GAIN_DAILY_COMPLETE = exports.FRIENDSHIP_GAIN_LEVEL_UP = exports.FRIENDSHIP_GAIN_DEV_ACTION = exports.FRIENDSHIP_GAIN_XP_EVENT = exports.FRIENDSHIP_EVOLUTION_THRESHOLD = exports.DEFAULT_POKEMON_FRIENDSHIP = exports.MAX_FRIENDSHIP = exports.MIN_FRIENDSHIP = void 0;
exports.MIN_FRIENDSHIP = 0;
exports.MAX_FRIENDSHIP = 255;
/**
 * Where a Pokemon already in the collection starts.
 *
 * Existing Pokemon predate Friendship entirely - the same reasoning
 * `DEFAULT_POKEMON_LEVEL` uses for level. Zero would say the user has never
 * worked with a Pokemon they may have had for weeks; the low-but-not-zero
 * "Friendly" starting point is a fairer default, and still leaves the whole
 * climb to Best Friend ahead of them.
 */
exports.DEFAULT_POKEMON_FRIENDSHIP = 70;
/** Friendship at or above this makes a `friendship`/`friendship-time`
 * evolution rule eligible. Centralized so nothing ever hardcodes `220`. */
exports.FRIENDSHIP_EVOLUTION_THRESHOLD = 220;
/* ------------------------------- gain amounts ------------------------------ */
/** The partner receives an accepted, qualifying Pokemon XP award. */
exports.FRIENDSHIP_GAIN_XP_EVENT = 1;
/** The partner receives an accepted Dev Action award specifically - replaces
 * `FRIENDSHIP_GAIN_XP_EVENT` for that event rather than stacking with it. */
exports.FRIENDSHIP_GAIN_DEV_ACTION = 2;
/** The partner levels up. Stacks on top of whichever of the two gains above
 * the same XP grant already earned. */
exports.FRIENDSHIP_GAIN_LEVEL_UP = 3;
/** A Daily Challenge completes while this Pokemon is the partner. */
exports.FRIENDSHIP_GAIN_DAILY_COMPLETE = 5;
/** Every `FRIENDSHIP_CODING_CHUNK_MS` of qualifying coding time spent with the
 * same Pokemon as partner throughout. */
exports.FRIENDSHIP_GAIN_CODING_CHUNK = 3;
/** How much qualifying, same-partner coding time earns one
 * `FRIENDSHIP_GAIN_CODING_CHUNK`. Mirrors `CODING_CHUNK_MS`'s naming in
 * `xp-rules.ts`, but is a separate, longer window: Friendship's time bonus is
 * deliberately slower than the XP payout cadence. */
exports.FRIENDSHIP_CODING_CHUNK_MS = 30 * 60 * 1000;
/** Ascending order, boundaries inclusive on the low end. */
exports.FRIENDSHIP_TIER_ORDER = [
    'wary',
    'friendly',
    'close',
    'very-close',
    'best-friend',
];
/** 0-49 Wary, 50-99 Friendly, 100-149 Close, 150-219 Very Close, 220-255 Best
 * Friend - one heart per band, five at Best Friend. */
const FRIENDSHIP_TIER_BANDS = [
    { id: 'wary', min: 0, hearts: 1 },
    { id: 'friendly', min: 50, hearts: 2 },
    { id: 'close', min: 100, hearts: 3 },
    { id: 'very-close', min: 150, hearts: 4 },
    { id: 'best-friend', min: 220, hearts: 5 },
];
function bandFor(value) {
    const clamped = clampFriendship(value);
    let band = FRIENDSHIP_TIER_BANDS[0];
    for (const candidate of FRIENDSHIP_TIER_BANDS) {
        if (clamped >= candidate.min) {
            band = candidate;
        }
    }
    return band;
}
function clampFriendship(value) {
    if (!isFinite(value)) {
        return exports.MIN_FRIENDSHIP;
    }
    return Math.min(Math.max(Math.floor(value), exports.MIN_FRIENDSHIP), exports.MAX_FRIENDSHIP);
}
exports.clampFriendship = clampFriendship;
function getFriendshipTier(value) {
    return bandFor(value).id;
}
exports.getFriendshipTier = getFriendshipTier;
/** 1-5, for the compact heart meter. */
function getFriendshipHearts(value) {
    return bandFor(value).hearts;
}
exports.getFriendshipHearts = getFriendshipHearts;
/**
 * How much a single accepted Partner XP event is worth in Friendship.
 *
 * A Dev Action (build/test/typecheck/lint) REPLACES the generic "qualifying
 * XP" amount rather than stacking with it - it is still exactly one XP
 * event, just a more specific one. A debug XP grant earns none at all: it is
 * test tooling, not real activity, and Friendship has its own dedicated
 * debug command (`pokedev.debug-add-friendship`) for exercising it directly.
 *
 * Takes the bare event type string rather than importing
 * `ProgressionEventType` from `progression-types.ts`, so this stays usable
 * from a test with no other dependency - the switch is exhaustive over the
 * real type at every call site via `ProgressionEvent['type']`.
 */
function friendshipXpEventAmount(eventType) {
    switch (eventType) {
        case 'debug-grant':
            return 0;
        case 'build-success':
        case 'test-success':
        case 'typecheck-success':
        case 'lint-success':
            return exports.FRIENDSHIP_GAIN_DEV_ACTION;
        default:
            return exports.FRIENDSHIP_GAIN_XP_EVENT;
    }
}
exports.friendshipXpEventAmount = friendshipXpEventAmount;
/**
 * Grants Friendship, clamped to the valid range. Pure: returns a plain
 * result, never mutates anything.
 *
 * A non-finite, negative or zero amount is a no-op rather than an error -
 * same reasoning as `addPokemonXp`: producers of this call are incidental
 * (timers, progression grants) and must never be able to throw.
 */
function addFriendship(current, amount) {
    const before = clampFriendship(current);
    const tierBefore = getFriendshipTier(before);
    if (!isFinite(amount) || amount <= 0) {
        return { value: before, tierBefore, tierAfter: tierBefore, tierUp: false };
    }
    const after = clampFriendship(before + Math.floor(amount));
    const tierAfter = getFriendshipTier(after);
    return {
        value: after,
        tierBefore,
        tierAfter,
        tierUp: exports.FRIENDSHIP_TIER_ORDER.indexOf(tierAfter) >
            exports.FRIENDSHIP_TIER_ORDER.indexOf(tierBefore),
    };
}
exports.addFriendship = addFriendship;


/***/ }),

/***/ "./src/trainer/pokemon-display-name.ts":
/*!*********************************************!*\
  !*** ./src/trainer/pokemon-display-name.ts ***!
  \*********************************************/
/***/ ((__unused_webpack_module, exports) => {


/**
 * Whether a Pokemon's nickname is worth showing.
 *
 * Pure: no `vscode`, no DOM. Shared by every surface that lists individual
 * Pokemon by name - the Trainer Card's PARTY grid and PARTNER panel, and the
 * Explorer team list - so the rule can only ever say one thing.
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.resolveDisplayName = exports.hasDistinctNickname = void 0;
/**
 * Spawning defaults a Pokemon's name to its species, so most collections
 * yield `nickname === species`. Showing both then would render, for example,
 * CATERPIE "Caterpie" for no reason - only worth showing when the nickname
 * actually says something the species does not.
 */
function hasDistinctNickname(nickname, species) {
    const trimmed = nickname.trim();
    return (trimmed.length > 0 && trimmed.toLowerCase() !== species.trim().toLowerCase());
}
exports.hasDistinctNickname = hasDistinctNickname;
/** The name to actually display: the nickname when distinct, else the species. */
function resolveDisplayName(nickname, species) {
    return hasDistinctNickname(nickname, species) ? nickname : species;
}
exports.resolveDisplayName = resolveDisplayName;


/***/ }),

/***/ "./src/trainer/trainer-types.ts":
/*!**************************************!*\
  !*** ./src/trainer/trainer-types.ts ***!
  \**************************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PARTY_SLOTS = exports.DEV_BADGE_SLOTS = exports.TRAINER_CARD_VIEW_TYPE = void 0;
/** Webview panel view type, also used as the serializer key. */
exports.TRAINER_CARD_VIEW_TYPE = 'pokedevTrainerCard';
/**
 * Denominator for the compact Explorer HUD's "BADGES n / 8" row. Mirrors the
 * eight-gym-badge convention; Dev Badges are PokéDev's equivalent. The full
 * Trainer Card's BADGES section shows every earned badge with no such cap or
 * count — see `renderBadges` in `panel/trainer-card/main.ts`.
 */
exports.DEV_BADGE_SLOTS = 8;
/** Party slots on the Trainer Card, in classic Pokémon-party fashion. */
exports.PARTY_SLOTS = 6;


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
var exports = __webpack_exports__;
/*!************************************!*\
  !*** ./src/panel/explorer/main.ts ***!
  \************************************/

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.dailyChallengesView = exports.pokemonView = exports.trainerView = void 0;
const pokemon_display_name_1 = __webpack_require__(/*! ../../trainer/pokemon-display-name */ "./src/trainer/pokemon-display-name.ts");
const trainer_types_1 = __webpack_require__(/*! ../../trainer/trainer-types */ "./src/trainer/trainer-types.ts");
const friendship_rules_1 = __webpack_require__(/*! ../../progression/friendship-rules */ "./src/progression/friendship-rules.ts");
let vscodeApi;
function post(message) {
    if (!vscodeApi) {
        vscodeApi = acquireVsCodeApi();
    }
    vscodeApi.postMessage(message);
}
/* ------------------------------ dom helpers ----------------------------- */
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}
function appendAll(parent, children) {
    for (const child of children) {
        parent.appendChild(child);
    }
    return parent;
}
function root() {
    const node = document.getElementById('root');
    if (!node) {
        throw new Error('Explorer view root missing');
    }
    return node;
}
/** Milliseconds -> "4h 35m". Matches the full card's formatting. */
function formatDuration(ms) {
    const safe = typeof ms === 'number' && isFinite(ms) && ms > 0 ? ms : 0;
    const totalMinutes = Math.floor(safe / 60000);
    return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}
function padStart(value, length, pad) {
    let out = value;
    while (out.length < length) {
        out = pad + out;
    }
    return out;
}
/**
 * A labelled progress bar.
 *
 * Shared by the trainer and every Pokemon row so the XP language is identical
 * across all three PokeDev surfaces. Carries the full progressbar ARIA
 * contract, since a bare div conveys nothing to a screen reader.
 */
function xpBar(current, needed, ariaLabel, className) {
    const pct = needed > 0
        ? Math.max(0, Math.min(100, Math.round((current / needed) * 100)))
        : 100;
    const fill = el('div', `${className}-fill`);
    fill.style.width = `${pct}%`;
    const track = el('div', `${className}-track`);
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', String(needed));
    track.setAttribute('aria-valuenow', String(current));
    track.setAttribute('aria-label', ariaLabel);
    track.appendChild(fill);
    return track;
}
/**
 * A compact 5-heart Friendship meter: filled hearts for the current tier,
 * hollow for the rest. Plain text glyphs (not emoji artwork) styled via CSS,
 * matching the rest of the pixel-styled sidebar - never the raw 0-255 number,
 * which stays internal (see `progression/friendship-rules.ts`).
 */
function heartMeter(friendship, tierLabels, className) {
    const hearts = (0, friendship_rules_1.getFriendshipHearts)(friendship);
    const tier = (0, friendship_rules_1.getFriendshipTier)(friendship);
    let glyphs = '';
    for (let i = 0; i < 5; i++) {
        glyphs += i < hearts ? '♥' : '♡';
    }
    const meter = el('span', className, glyphs);
    meter.title = tierLabels[tier];
    meter.setAttribute('aria-label', tierLabels[tier]);
    return meter;
}
/**
 * A sprite that degrades to a faded Poke Ball if the gif is missing.
 *
 * A stale species key or a colour with no artwork would otherwise leave a
 * broken-image icon in the sidebar.
 */
function sprite(uri, className) {
    if (!uri) {
        return el('div', `${className} pd-sprite-missing`);
    }
    const img = el('img', className);
    img.setAttribute('src', uri);
    img.setAttribute('alt', '');
    img.addEventListener('error', () => {
        const fallback = el('div', `${className} pd-sprite-missing`);
        img.replaceWith(fallback);
    });
    return img;
}
/** A small utility control, styled as a game-menu button rather than a CTA. */
function actionButton(label, onClick, title) {
    const button = el('button', 'pd-action', label);
    button.type = 'button';
    button.title = title ?? label;
    button.setAttribute('aria-label', title ?? label);
    button.addEventListener('click', onClick);
    return button;
}
/* ------------------------------ trainer view ---------------------------- */
function renderTrainer(model) {
    const labels = model.labels;
    const host = root();
    host.textContent = '';
    const card = el('div', 'pd-card');
    if (!model.connected) {
        // Nothing useful to show without an account, so ask once rather than
        // rendering an identity block full of blanks.
        card.appendChild(el('p', 'pd-empty', labels.connectPrompt));
        card.appendChild(appendAll(el('div', 'pd-actions'), [
            actionButton(labels.connectButton, () => post({ command: 'explorer/connect' })),
            actionButton(labels.openFullCardButton, () => post({ command: 'explorer/openFullCard' })),
        ]));
        host.appendChild(card);
        return;
    }
    /* Identity: avatar beside name, username and level. Stacks at narrow width
       via CSS, not via a second layout here. */
    const identity = el('div', 'pd-identity');
    const portrait = el('div', 'pd-portrait');
    if (model.trainerSpriteUri) {
        const sprite = el('img', 'pd-avatar pd-avatar-sprite');
        sprite.setAttribute('src', model.trainerSpriteUri);
        sprite.setAttribute('alt', '');
        sprite.addEventListener('error', () => {
            sprite.replaceWith(el('div', 'pd-avatar pd-avatar-empty'));
        });
        portrait.appendChild(sprite);
    }
    else if (model.avatarUrl) {
        const avatar = el('img', 'pd-avatar');
        avatar.setAttribute('src', model.avatarUrl);
        avatar.setAttribute('alt', '');
        avatar.addEventListener('error', () => {
            avatar.replaceWith(el('div', 'pd-avatar pd-avatar-empty'));
        });
        portrait.appendChild(avatar);
    }
    else {
        portrait.appendChild(el('div', 'pd-avatar pd-avatar-empty'));
    }
    identity.appendChild(portrait);
    const who = el('div', 'pd-who');
    who.appendChild(el('span', 'pd-name', model.displayName));
    if (model.login) {
        who.appendChild(el('span', 'pd-login', `@${model.login}`));
    }
    who.appendChild(el('span', 'pd-level', `${labels.trainerWord} ${labels.levelLabel} ${padStart(String(model.trainerLevel), 2, '0')}`));
    identity.appendChild(who);
    card.appendChild(identity);
    /* Trainer XP. */
    const xpHead = el('div', 'pd-row-head');
    xpHead.appendChild(el('span', 'pd-label', labels.xpLabel));
    xpHead.appendChild(el('span', 'pd-value', model.xpForNextLevel > 0
        ? `${model.trainerXp} / ${model.xpForNextLevel}`
        : String(model.trainerXp)));
    card.appendChild(xpHead);
    card.appendChild(xpBar(model.trainerXp, model.xpForNextLevel, labels.xpLabel, 'pd-xp'));
    /* Coding time. */
    const timeRow = el('div', 'pd-row-head pd-row-spaced');
    timeRow.appendChild(el('span', 'pd-label', labels.codingTimeLabel));
    timeRow.appendChild(el('span', 'pd-value', formatDuration(model.totalCodingTimeMs)));
    card.appendChild(timeRow);
    /* Dev Badges: the same canonical badge count the full Trainer Card shows. */
    const badgesRow = el('div', 'pd-row-head pd-row-spaced');
    badgesRow.appendChild(el('span', 'pd-label', labels.devBadgesLabel));
    badgesRow.appendChild(el('span', 'pd-value', `${model.devBadgesEarned} / ${trainer_types_1.DEV_BADGE_SLOTS}`));
    card.appendChild(badgesRow);
    /* Partner summary. */
    card.appendChild(el('span', 'pd-label pd-label-section', labels.partnerLabel));
    if (model.partner) {
        const p = model.partner;
        const row = el('div', 'pd-partner');
        row.appendChild(sprite(p.spriteUri, 'pd-partner-sprite'));
        const meta = el('div', 'pd-partner-meta');
        const nameLine = el('div', 'pd-partner-name');
        nameLine.appendChild(el('span', 'pd-partner-species', p.species));
        if (p.shiny) {
            const star = el('span', 'pd-shiny', '★');
            star.title = labels.shinyLabel;
            nameLine.appendChild(star);
        }
        meta.appendChild(nameLine);
        meta.appendChild(el('span', 'pd-partner-level', `${labels.levelLabel} ${padStart(String(p.level), 2, '0')}`));
        if (p.xpForNextLevel > 0) {
            meta.appendChild(xpBar(p.currentXp, p.xpForNextLevel, labels.xpLabel, 'pd-mini'));
        }
        row.appendChild(meta);
        card.appendChild(row);
    }
    else {
        card.appendChild(el('p', 'pd-empty', labels.noPartnerLabel));
    }
    card.appendChild(appendAll(el('div', 'pd-actions'), [
        actionButton(labels.openFullCardButton, () => post({ command: 'explorer/openFullCard' })),
        actionButton('↻', () => post({ command: 'explorer/refresh' }), labels.refreshButton),
        actionButton(labels.changePartnerButton, () => post({ command: 'explorer/changePartner' })),
    ]));
    host.appendChild(card);
}
/* ------------------------------ pokemon view ---------------------------- */
function renderPokemon(model) {
    const labels = model.labels;
    const host = root();
    host.textContent = '';
    host.appendChild(renderExpShareToggle(model.expShareEnabled, labels));
    if (model.pokemon.length === 0) {
        host.appendChild(el('p', 'pd-empty', labels.noPokemonLabel));
        return;
    }
    const list = el('ul', 'pd-list');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', labels.partnerLabel);
    for (const entry of model.pokemon) {
        list.appendChild(renderPokemonRow(entry, labels));
    }
    host.appendChild(list);
}
/**
 * A compact, game-style toggle: "EXP SHARE   ON" / "EXP SHARE   OFF".
 *
 * Deliberately not a modern switch control - it would clash with the retro
 * card styling everywhere else in this sidebar. `pd-toggle-on`/`-off` give it
 * a visually distinct state without relying on colour alone.
 */
function renderExpShareToggle(enabled, labels) {
    const row = el('div', 'pd-exp-share');
    row.appendChild(el('span', 'pd-label', labels.expShareLabel));
    const stateLabel = enabled ? labels.expShareOnLabel : labels.expShareOffLabel;
    const button = el('button', enabled ? 'pd-toggle pd-toggle-on' : 'pd-toggle pd-toggle-off', stateLabel);
    button.type = 'button';
    button.title = labels.expShareTooltip;
    button.setAttribute('aria-label', `${labels.expShareLabel}: ${stateLabel}. ${labels.expShareTooltip}`);
    button.setAttribute('aria-pressed', String(enabled));
    button.addEventListener('click', () => post({ command: 'explorer/toggleExpShare' }));
    row.appendChild(button);
    return row;
}
function renderPokemonRow(entry, labels) {
    const item = el('li', entry.isPartner ? 'pd-item pd-item-partner' : 'pd-item');
    // A real button so keyboard and screen-reader users get selection for free.
    const button = el('button', 'pd-item-button');
    button.type = 'button';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(entry.isPartner));
    button.title = entry.isPartner ? labels.partnerBadge : labels.makePartnerHint;
    button.appendChild(sprite(entry.spriteUri, 'pd-item-sprite'));
    const meta = el('div', 'pd-item-meta');
    const nameLine = el('div', 'pd-item-name');
    // Spawning defaults a Pokemon's name to its species, so only show the
    // nickname when it says something the species does not.
    const named = (0, pokemon_display_name_1.hasDistinctNickname)(entry.nickname, entry.species);
    nameLine.appendChild(el('span', 'pd-item-species', named ? entry.nickname : entry.species));
    if (entry.shiny) {
        const star = el('span', 'pd-shiny', '★');
        star.title = labels.shinyLabel;
        nameLine.appendChild(star);
    }
    meta.appendChild(nameLine);
    const detail = el('div', 'pd-item-detail');
    detail.appendChild(el('span', 'pd-item-level', `${labels.levelLabel} ${padStart(String(entry.level), 2, '0')}`));
    if (named) {
        // The species is secondary once a nickname is shown; CSS hides it first
        // when the sidebar gets narrow.
        detail.appendChild(el('span', 'pd-item-sub', entry.species));
    }
    detail.appendChild(heartMeter(entry.friendship, labels.friendshipTierLabels, 'pd-hearts'));
    meta.appendChild(detail);
    if (entry.xpForNextLevel > 0) {
        meta.appendChild(xpBar(entry.currentXp, entry.xpForNextLevel, labels.xpLabel, 'pd-mini'));
    }
    button.appendChild(meta);
    if (entry.isPartner) {
        button.appendChild(el('span', 'pd-badge', labels.partnerBadge));
    }
    if (!entry.isPartner) {
        button.addEventListener('click', () => {
            post({
                command: 'explorer/selectPartner',
                nickname: entry.nickname,
            });
        });
    }
    else {
        button.disabled = true;
    }
    item.appendChild(button);
    return item;
}
/* --------------------------- daily challenges ---------------------------- */
function renderDailyChallenges(model) {
    const labels = model.labels;
    const host = root();
    host.textContent = '';
    if (model.status === 'loading') {
        host.appendChild(el('p', 'pd-empty', labels.loadingLabel));
        return;
    }
    if (model.status === 'error' || model.challenges.length === 0) {
        host.appendChild(el('p', 'pd-empty', labels.errorLabel));
        return;
    }
    const head = el('div', 'pd-row-head');
    head.appendChild(el('span', 'pd-label', labels.todayLabel));
    head.appendChild(el('span', 'pd-value', `${model.completedCount} / ${model.totalCount}`));
    host.appendChild(head);
    const list = el('ul', 'pd-challenge-list');
    for (const challenge of model.challenges) {
        list.appendChild(renderChallengeRow(challenge, labels));
    }
    host.appendChild(list);
    host.appendChild(el('p', 'pd-challenge-footer', labels.resetLabel));
}
function renderChallengeRow(challenge, labels) {
    const item = el('li', challenge.completed ? 'pd-challenge pd-challenge-complete' : 'pd-challenge');
    const titleRow = el('div', 'pd-challenge-row');
    const title = challenge.completed
        ? `✓ ${challenge.title.toUpperCase()}`
        : challenge.title.toUpperCase();
    titleRow.appendChild(el('span', 'pd-challenge-title', title));
    titleRow.appendChild(el('span', 'pd-challenge-count', `${challenge.progress} / ${challenge.target}`));
    item.appendChild(titleRow);
    item.appendChild(el('div', 'pd-challenge-desc', challenge.description));
    if (challenge.completed) {
        item.appendChild(el('div', 'pd-challenge-reward', `${labels.completeLabel} · +${challenge.rewardTrainerXp} ${labels.xpLabel}`));
    }
    else {
        item.appendChild(xpBar(challenge.progress, challenge.target, `${challenge.title}: ${challenge.progress} / ${challenge.target}`, 'pd-mini'));
        item.appendChild(el('div', 'pd-challenge-reward', `+${challenge.rewardTrainerXp} ${labels.xpLabel}`));
    }
    return item;
}
/* --------------------------------- wiring -------------------------------- */
/**
 * Wires one view.
 *
 * `explorer/ready` is what restores state after VS Code discards a collapsed
 * view's DOM: the bundle re-runs on expand and asks for the truth again,
 * rather than either side caching it.
 */
function start(expected, render) {
    window.addEventListener('message', (event) => {
        const message = event.data;
        if (!message || message.command !== expected || !message.payload) {
            return;
        }
        render(message.payload);
    });
    post({ command: 'explorer/ready' });
}
function trainerView() {
    start('explorer/trainerState', renderTrainer);
}
exports.trainerView = trainerView;
function pokemonView() {
    start('explorer/pokemonState', renderPokemon);
}
exports.pokemonView = pokemonView;
function dailyChallengesView() {
    start('explorer/dailyChallengesState', renderDailyChallenges);
}
exports.dailyChallengesView = dailyChallengesView;

})();

self.pokedevExplorer = __webpack_exports__;
/******/ })()
;