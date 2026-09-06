// This script runs inside the Trainer Card webview.
//
// Two rules hold throughout:
//
//  1. The whole DOM is built here with createElement/textContent. Nothing is
//     ever assigned through innerHTML or insertAdjacentHTML. GitHub display
//     names, bios and locations are third-party strings arriving in a
//     privileged webview, so they are only ever written as text.
//  2. This code never talks to GitHub. It asks the extension host and renders
//     whatever view model comes back. The card's CSP has no `connect-src`, so
//     that boundary is enforced by the platform, not by convention.
import { DevBadge } from '../../trainer/dev-badge-parse';
import { ExplorerPokemonEntry } from '../../trainer/explorer-types';
import { resolveDisplayName } from '../../trainer/pokemon-display-name';
import {
  FriendshipTierId,
  getFriendshipHearts,
  getFriendshipTier,
} from '../../progression/friendship-rules';
import {
  TrainerGeneration,
  TRAINER_GENERATIONS,
} from '../../trainer/trainer-sprite-catalog';
import {
  DevBadgesView,
  PARTY_SLOTS,
  TrainerCardLabels,
  TrainerCardViewModel,
  TrainerHostboundMessage,
  TrainerSpriteOption,
} from '../../trainer/trainer-types';
import { cardClassName, stripEmoji } from './card-presentation';

interface TrainerVscodeApi {
  postMessage(message: TrainerHostboundMessage): void;
}

/**
 * Reached through globalThis rather than a `declare global` block, because
 * src/panel/main.ts already declares `acquireVsCodeApi` globally with its own
 * message type and both files land in the same TypeScript program.
 */
function acquireApi(): TrainerVscodeApi | undefined {
  const scope = globalThis as unknown as {
    acquireVsCodeApi?: () => TrainerVscodeApi;
  };
  return typeof scope.acquireVsCodeApi === 'function'
    ? scope.acquireVsCodeApi()
    : undefined;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

let api: TrainerVscodeApi | undefined;
let root: HTMLElement | undefined;

/**
 * The last view model received from the host.
 *
 * Needed so a purely client-side interaction - opening the sprite picker,
 * switching its generation tab, previewing a tile - can re-render
 * immediately without waiting for (or triggering) a host round trip. Every
 * `render()` call rebuilds the whole DOM from scratch, so this is the only
 * thing that survives between renders.
 */
let lastModel: TrainerCardViewModel | undefined;

/* --------------------------- sprite picker state -------------------------- */
//
// Client-side only: the host never needs to know the picker is open, which
// tab is active, or which tile is being previewed - only the final decision
// (`trainer/selectTrainerSprite` / `trainer/useGithubAvatar`) is ever posted.

let spritePickerOpen = false;
let spritePickerGeneration: TrainerGeneration = 1;
/** The tile treated as "selected" while the picker is open, before it is confirmed. */
let spritePickerPreviewId: string | undefined;

function rerender(): void {
  if (lastModel) {
    render(lastModel);
  }
}

function openSpritePicker(model: TrainerCardViewModel): void {
  const currentId = model.profile.trainerSpriteId ?? undefined;
  const current = model.trainerSpriteCatalog.find((s) => s.id === currentId);
  spritePickerGeneration = current?.generation ?? 1;
  spritePickerPreviewId = currentId;
  spritePickerOpen = true;
  rerender();
}

function closeSpritePicker(): void {
  spritePickerOpen = false;
  rerender();
}

function post(message: TrainerHostboundMessage): void {
  if (api) {
    api.postMessage(message);
  }
}

/* ------------------------------ DOM helpers ----------------------------- */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function appendAll(parent: HTMLElement, children: HTMLElement[]): HTMLElement {
  for (const child of children) {
    parent.appendChild(child);
  }
  return parent;
}

function pokeball(className: string): HTMLElement {
  // The ball art is media/pokeball_sprite_sheet.png frame 0, positioned by CSS.
  return el('span', className);
}

/* ------------------------------- formatting ----------------------------- */

/** 17200 -> "17.2k". Keeps the card readable at small widths. */
function formatCount(value: number | null, unknown: string): string {
  if (value === null || typeof value !== 'number' || !isFinite(value)) {
    return unknown;
  }
  const n = Math.max(Math.floor(value), 0);
  if (n < 1000) {
    return String(n);
  }
  if (n < 1_000_000) {
    return trimZero((n / 1000).toFixed(1)) + 'k';
  }
  return trimZero((n / 1_000_000).toFixed(1)) + 'M';
}

function trimZero(value: string): string {
  return value.indexOf('.0') === value.length - 2
    ? value.slice(0, value.length - 2)
    : value;
}

/** Left-pads with zeroes. String.padStart is not in this build's lib set. */
function padStart(value: string, length: number, pad: string): string {
  let out = value;
  while (out.length < length) {
    out = pad + out;
  }
  return out;
}

/**
 * A compact 5-heart Friendship meter: filled hearts for the current tier,
 * hollow for the rest. Plain text glyphs (not emoji artwork), matching
 * `heartMeter` in `panel/explorer/main.ts` - duplicated rather than shared
 * because each compact surface is its own separate webpack bundle (see
 * `xpBar` above, likewise defined twice); only the pure tier math
 * (`friendship-rules.ts`) is actually shared.
 */
function heartMeter(
  friendship: number,
  tierLabels: Record<FriendshipTierId, string>,
  className: string,
): HTMLElement {
  const hearts = getFriendshipHearts(friendship);
  const tier = getFriendshipTier(friendship);
  let glyphs = '';
  for (let i = 0; i < 5; i++) {
    glyphs += i < hearts ? '♥' : '♡';
  }
  const meter = el('span', className, glyphs);
  meter.title = tierLabels[tier];
  meter.setAttribute('aria-label', tierLabels[tier]);
  return meter;
}

/** ISO timestamp -> "Jan 2011". */
function formatJoined(iso: string, unknown: string): string {
  if (!iso) {
    return unknown;
  }
  const date = new Date(iso);
  const time = date.getTime();
  if (isNaN(time)) {
    return unknown;
  }
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** ISO timestamp -> "2011". The compact record grid shows the year only. */
function formatYear(iso: string, unknown: string): string {
  if (!iso) {
    return unknown;
  }
  const time = new Date(iso).getTime();
  if (isNaN(time)) {
    return unknown;
  }
  return String(new Date(iso).getFullYear());
}

/** Milliseconds -> "0h 0m". */
function formatDuration(ms: number): string {
  const safe = typeof ms === 'number' && isFinite(ms) && ms > 0 ? ms : 0;
  const totalMinutes = Math.floor(safe / 60000);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

/* -------------------------------- sections ------------------------------- */

/** Section heading, e.g. DEV RECORD. */
function sectionTitle(text: string): HTMLElement {
  return el('h2', 'tc-section-title', text);
}

/** Sub-heading inside a section, e.g. SPECIALTIES. */
function sectionSubtitle(text: string): HTMLElement {
  return el('h3', 'tc-section-subtitle', text);
}

/** One cell in a record grid: strong value over a small uppercase label. */
function recordCell(label: string, value: string, title?: string): HTMLElement {
  const cell = appendAll(el('div', 'tc-record-cell'), [
    el('span', 'tc-record-value', value),
    el('span', 'tc-record-label', label),
  ]);
  if (title) {
    cell.title = title;
  }
  return cell;
}

/**
 * One SPECIALTIES row.
 *
 * The bar is normalised to the LEADING language's repo count, never to the
 * repository total. GitHub reports a single primary language per repository
 * and repos with no detected language are dropped upstream, so a share of all
 * repos would silently fail to sum to 100%. A relative bar makes no
 * percentage claim at all — it only says "this one, versus the biggest one".
 */
function specialtyRow(
  language: string,
  count: number,
  max: number,
): HTMLElement {
  // Floor at 6% so a single-repo language is still a visible sliver.
  const pct = max > 0 ? Math.max(6, Math.round((count / max) * 100)) : 0;
  const fill = el('div', 'tc-spec-fill');
  fill.style.width = `${pct}%`;
  const track = el('div', 'tc-spec-track');
  track.appendChild(fill);
  return appendAll(el('div', 'tc-spec'), [
    el('span', 'tc-spec-name', language),
    track,
    el('span', 'tc-spec-count', String(count)),
  ]);
}

/** The card header strip, shared by every state. */
function renderHead(labels: TrainerCardLabels, idText?: string): HTMLElement {
  const head = el('div', 'tc-card-head');
  head.appendChild(pokeball('tc-ball'));
  head.appendChild(el('span', 'tc-brand', labels.brandLabel));
  head.appendChild(el('h1', 'tc-title', labels.cardTitle));
  if (idText !== undefined) {
    head.appendChild(el('span', 'tc-idno', idText));
  }
  return head;
}

/* ---------------------------- card composition --------------------------- */

/**
 * A LABEL / value row, shared by the Crystal skin's JOB/FROM metadata
 * (`renderHero`) and reusing the exact same `.tc-identity-stat-*` classes
 * the TRAINER/CODING TIME stats row already uses - one consistent
 * "label left, value right" convention across the whole identity column,
 * rather than a second row style invented just for this.
 */
function metaRow(label: string, value: string): HTMLElement {
  return appendAll(el('div', 'tc-identity-stat-row'), [
    el('span', 'tc-identity-stat-label', label),
    el('span', 'tc-identity-stat-value', value),
  ]);
}

/**
 * The left identity column: portrait, trainer identity, and a slim stat
 * row for Trainer Level (always) plus Coding Time (only when the
 * `showCodingTime` setting is on - Coding Time itself keeps accruing
 * internally either way, see `ProgressionService.addCodingTime`/`flush`).
 *
 * The stats block is pinned to the bottom of this column via `margin-top:
 * auto` on a flex parent - see `.tc-hero` - so it reads as part of the
 * identity area rather than a separate dashboard card, matching the
 * landscape card's left-column composition.
 */
function renderHero(model: TrainerCardViewModel): HTMLElement {
  const labels = model.labels;
  const github = model.github;
  const hero = el('div', 'tc-hero');

  // A real button, not a div: the portrait doubles as a large, obvious way to
  // open the Trainer Sprite picker (mirroring the footer's "Choose Trainer"
  // action - same handler, same command - just a second, more discoverable
  // entry point now that it is the card's biggest piece of artwork).
  const portrait = el('button', 'tc-portrait');
  portrait.type = 'button';
  portrait.setAttribute('aria-label', labels.chooseTrainerButton);
  portrait.title = labels.chooseTrainerButton;
  portrait.addEventListener('click', () => {
    openSpritePicker(model);
  });

  // The frame's ::before/::after are the corner brackets, so the placeholder
  // glyph needs a real element of its own rather than a third pseudo-element.
  const markEmpty = () => {
    portrait.classList.add('tc-portrait-empty');
    portrait.appendChild(el('span', 'tc-portrait-glyph', '?'));
  };
  // A chosen Trainer Sprite always wins over the GitHub avatar - GitHub still
  // supplies name/handle/class/bio/location below either way.
  //
  // The two modes get different FRAME treatments, not just different images:
  // a Trainer Sprite is character art and gets `tc-portrait-sprite` - a large,
  // flexible frame that grows to fill whatever vertical space the identity
  // column actually has free (see `.tc-hero`/`.tc-portrait-sprite`) - while
  // the GitHub avatar keeps the original small, fixed portrait frame. Blowing
  // a profile photo up to the same size would look like a stretched photo,
  // not character art.
  if (model.trainerSpriteUri) {
    portrait.classList.add('tc-portrait-sprite');
    const sprite = el('img', 'tc-avatar tc-avatar-sprite');
    sprite.setAttribute('src', model.trainerSpriteUri);
    sprite.setAttribute('alt', '');
    sprite.addEventListener('error', () => {
      sprite.remove();
      markEmpty();
    });
    portrait.appendChild(sprite);
  } else if (github && github.avatarUrl) {
    const avatar = el('img', 'tc-avatar');
    avatar.setAttribute('src', github.avatarUrl);
    avatar.setAttribute('alt', '');
    avatar.setAttribute('referrerpolicy', 'no-referrer');
    avatar.addEventListener('error', () => {
      avatar.remove();
      markEmpty();
    });
    portrait.appendChild(avatar);
  } else {
    markEmpty();
  }
  hero.appendChild(portrait);

  const identity = el('div', 'tc-identity');
  // GitHub's `name` is frequently empty; the login is the honest fallback.
  const shownName = github
    ? github.displayName || github.login
    : labels.unknownValue;
  identity.appendChild(el('div', 'tc-trainer-name', shownName));
  if (github) {
    identity.appendChild(el('div', 'tc-handle', `@${github.login}`));
  }
  identity.appendChild(el('div', 'tc-class-chip', labels.trainerClass));
  if (model.style === 'crystal') {
    // Crystal restates bio/location as Trainer-Card-style JOB/FROM fields
    // (emoji stripped - see `stripEmoji`'s own doc comment) rather than free
    // text, so a modern GitHub bio never breaks the Gen II illusion. Never
    // touches `github.bio`/`github.location` themselves - only what gets
    // printed here.
    const metaRows: HTMLElement[] = [];
    const job = github ? stripEmoji(github.bio) : '';
    const from = github ? stripEmoji(github.location) : '';
    if (job) {
      metaRows.push(metaRow(labels.jobLabel, job));
    }
    if (from) {
      metaRows.push(metaRow(labels.fromLabel, from));
    }
    if (metaRows.length > 0) {
      identity.appendChild(appendAll(el('div', 'tc-meta-rows'), metaRows));
    }
  } else {
    if (github && github.bio) {
      identity.appendChild(el('p', 'tc-bio', github.bio));
    }
    if (github && github.location) {
      identity.appendChild(el('p', 'tc-location', github.location));
    }
  }
  hero.appendChild(identity);

  const stats = el('div', 'tc-identity-stats');
  const level = padStart(String(model.profile.trainerLevel), 2, '0');
  stats.appendChild(
    appendAll(el('div', 'tc-identity-stat-row'), [
      el('span', 'tc-identity-stat-label', labels.trainerWord),
      el('span', 'tc-identity-stat-value', `${labels.levelLabel} ${level}`),
    ]),
  );
  if (model.showCodingTime) {
    stats.appendChild(
      appendAll(el('div', 'tc-identity-stat-row'), [
        el('span', 'tc-identity-stat-label', labels.codingTimeLabel),
        el(
          'span',
          'tc-identity-stat-value',
          formatDuration(model.profile.totalCodingTimeMs),
        ),
      ]),
    );
  }
  hero.appendChild(stats);

  return hero;
}

/** DEV RECORD content: the GitHub-derived stats plus SPECIALTIES. */
function renderDevRecordContent(model: TrainerCardViewModel): HTMLElement {
  const labels = model.labels;
  const github = model.github;
  const unknown = labels.unknownValue;

  const section = el('section', 'tc-section');
  section.appendChild(sectionTitle(labels.devRecordLabel));

  const grid = el('div', 'tc-record-grid tc-record-grid-4');
  grid.appendChild(
    recordCell(
      labels.reposLabel,
      github ? formatCount(github.publicRepos, unknown) : unknown,
    ),
  );
  grid.appendChild(
    recordCell(
      labels.starsLabel,
      github ? formatCount(github.totalStars, unknown) : unknown,
    ),
  );
  grid.appendChild(
    recordCell(
      labels.followersLabel,
      github ? formatCount(github.followers, unknown) : unknown,
    ),
  );
  grid.appendChild(
    recordCell(
      labels.sinceLabel,
      github ? formatYear(github.joinedAt, unknown) : unknown,
      // The full month/year stays reachable as a tooltip.
      github ? formatJoined(github.joinedAt, unknown) : undefined,
    ),
  );
  section.appendChild(grid);

  if (github && github.topLanguages.length > 0) {
    const specialties = el('div', 'tc-specialties');
    specialties.appendChild(sectionSubtitle(labels.specialtiesLabel));
    const rows = el('div', 'tc-spec-list');
    rows.title = labels.languageDerivationNotice;
    const top = github.topLanguages.slice(0, 3);
    const max = top[0].repoCount;
    for (const entry of top) {
      rows.appendChild(specialtyRow(entry.language, entry.repoCount, max));
    }
    specialties.appendChild(rows);
    section.appendChild(specialties);
  }

  return section;
}

/**
 * DEV RECORD: a secondary panel below the physical Trainer Card, shown only
 * while `showCodingTime`'s sibling setting `showDevRecord` is on.
 *
 * Deliberately NOT part of `.tc-card` - the landscape card stays a fixed,
 * compact shape whether this is open or closed; toggling it only reveals or
 * hides this separate block underneath, never resizing the card itself.
 */
function renderDevRecordPanel(model: TrainerCardViewModel): HTMLElement {
  const panel = el('div', 'tc-devrecord-panel');
  panel.appendChild(renderDevRecordContent(model));
  return panel;
}

/**
 * PARTY: the current team, up to `PARTY_SLOTS`, in a classic grid.
 *
 * The compact overview companion to the larger PARTNER panel below - the
 * exact same instances (`TrainerCardViewModel.party`, built from the same
 * collection enumeration the Explorer Pokemon view uses). Clicking an
 * occupied, non-partner slot posts 'trainer/selectPartner', which goes
 * straight to the same `setPartnerNickname` setter every other partner
 * switch in the extension uses - there is no second partner state.
 */
function renderPartySlot(
  entry: ExplorerPokemonEntry,
  labels: TrainerCardLabels,
): HTMLElement {
  const button = el(
    'button',
    entry.isPartner ? 'tc-party-slot tc-party-slot-partner' : 'tc-party-slot',
  );
  button.type = 'button';
  button.setAttribute('aria-pressed', String(entry.isPartner));

  const sprite = el('img', 'tc-party-sprite');
  sprite.setAttribute('src', entry.spriteUri);
  sprite.setAttribute('alt', '');
  sprite.addEventListener('error', () => sprite.remove());
  button.appendChild(sprite);

  const displayName = resolveDisplayName(entry.nickname, entry.species);

  const nameLine = el('span', 'tc-party-name');
  nameLine.appendChild(document.createTextNode(displayName));
  if (entry.shiny) {
    const star = el('span', 'tc-party-shiny', '★');
    star.title = labels.shinyLabel;
    nameLine.appendChild(star);
  }
  button.appendChild(nameLine);

  button.appendChild(
    el(
      'span',
      'tc-party-level',
      `${labels.levelLabel} ${padStart(String(entry.level), 2, '0')}`,
    ),
  );

  if (entry.isPartner) {
    button.appendChild(
      el('span', 'tc-party-partner-badge', labels.partnerLabel),
    );
    // Already the partner: nothing for a click to do.
    button.disabled = true;
    button.setAttribute(
      'aria-label',
      `${displayName} — ${labels.partnerLabel}`,
    );
  } else {
    button.title = labels.makePartnerHint;
    button.setAttribute(
      'aria-label',
      `${labels.makePartnerHint}: ${displayName}`,
    );
    button.addEventListener('click', () => {
      post({ command: 'trainer/selectPartner', nickname: entry.nickname });
    });
  }

  return button;
}

function renderEmptyPartySlot(label: string): HTMLElement {
  const slot = el('div', 'tc-party-slot tc-party-slot-empty');
  slot.appendChild(el('span', 'tc-party-empty-label', label));
  return slot;
}

function renderParty(model: TrainerCardViewModel): HTMLElement {
  const labels = model.labels;

  const section = el('section', 'tc-section tc-section-party');
  section.appendChild(sectionTitle(labels.partySectionLabel));

  const grid = el('div', 'tc-party-grid');
  for (let i = 0; i < PARTY_SLOTS; i++) {
    const entry = model.party[i];
    grid.appendChild(
      entry
        ? renderPartySlot(entry, labels)
        : renderEmptyPartySlot(labels.emptyPartySlotLabel),
    );
  }
  section.appendChild(grid);

  return section;
}

/**
 * PARTNER: a compact detail block attached to the Trainer XP footer.
 *
 * The highlighted PARTY slot already communicates WHO the partner is; this
 * box exists so Partner progression (level, XP) stays visible somewhere on
 * the card without a second full-size panel duplicating the party grid's
 * job. Same `model.partner` data as the old standalone panel - only the
 * presentation shrank, per the "reduce duplicate UI, not delete data" brief.
 *
 * There is deliberately no HP or move/stat line — the Pokemon domain model
 * has no such concept anywhere in this extension, so inventing one here
 * would be fiction. Species/nickname, shininess and level/XP are all that
 * actually exist.
 */
function renderPartnerBox(model: TrainerCardViewModel): HTMLElement {
  const labels = model.labels;
  const partner = model.partner;

  const box = el('div', 'tc-partner-box');
  box.appendChild(sectionTitle(labels.partnerLabel));

  if (!partner) {
    box.appendChild(el('p', 'tc-partner-empty', labels.noPartnerLabel));
    return box;
  }

  const row = el('div', 'tc-partner-box-row');

  const frame = el('div', 'tc-partner-frame');
  const sprite = el('img', 'tc-partner-sprite');
  sprite.setAttribute('src', partner.spriteUri);
  sprite.setAttribute('alt', '');
  sprite.addEventListener('error', () => {
    sprite.remove();
    frame.appendChild(pokeball('tc-partner-ball tc-ball-faded'));
  });
  frame.appendChild(sprite);
  row.appendChild(frame);

  const meta = el('div', 'tc-partner-meta');

  const naming = el('div', 'tc-partner-name');
  naming.appendChild(
    el(
      'span',
      'tc-partner-species',
      resolveDisplayName(partner.nickname, partner.species),
    ),
  );
  if (partner.shiny) {
    const star = el('span', 'tc-partner-shiny', '★');
    star.title = labels.shinyLabel;
    naming.appendChild(star);
  }
  meta.appendChild(naming);

  meta.appendChild(
    el(
      'span',
      'tc-partner-level',
      `${labels.partnerLevelLabel} ${padStart(String(partner.level), 2, '0')}`,
    ),
  );

  meta.appendChild(
    heartMeter(
      partner.friendship,
      labels.friendshipTierLabels,
      'tc-partner-hearts',
    ),
  );

  // A capped partner has no next level to fill toward, so the bar would be
  // permanently full and meaningless; the level line says it all.
  if (partner.xpForNextLevel > 0) {
    const needed = partner.xpForNextLevel;
    const pct = Math.max(
      0,
      Math.min(100, Math.round((partner.currentXp / needed) * 100)),
    );

    const fill = el('div', 'tc-partner-xp-fill');
    fill.style.width = `${pct}%`;

    const track = el('div', 'tc-partner-xp-track');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', String(needed));
    track.setAttribute('aria-valuenow', String(partner.currentXp));
    track.setAttribute('aria-label', labels.partnerXpLabel);
    track.appendChild(fill);

    meta.appendChild(
      appendAll(el('div', 'tc-partner-xp'), [
        track,
        el('span', 'tc-partner-xp-value', `${partner.currentXp}/${needed}`),
      ]),
    );
  }

  row.appendChild(meta);
  box.appendChild(row);
  return box;
}

/** TRAINER XP progress panel. */
function renderXpPanel(model: TrainerCardViewModel): HTMLElement {
  const labels = model.labels;
  const profile = model.profile;

  const panel = el('div', 'tc-xp-panel');
  panel.appendChild(
    appendAll(el('div', 'tc-xp-head'), [
      sectionTitle(labels.xpLabel),
      el(
        'span',
        'tc-xp-value',
        `${profile.trainerXp} / ${model.xpForNextLevel}`,
      ),
    ]),
  );

  const needed = model.xpForNextLevel > 0 ? model.xpForNextLevel : 1;
  const pct = Math.max(
    0,
    Math.min(100, Math.round((profile.trainerXp / needed) * 100)),
  );
  const fill = el('div', 'tc-xp-fill');
  fill.style.width = `${pct}%`;
  const track = el('div', 'tc-xp-track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', String(model.xpForNextLevel));
  track.setAttribute('aria-valuenow', String(profile.trainerXp));
  track.setAttribute('aria-label', labels.xpLabel);
  track.appendChild(fill);
  panel.appendChild(track);

  return panel;
}

/**
 * BADGES: the earned Dev Badge artwork, shown large - the visual focus of
 * this section rather than a count or a locked-slot grid. There is no fixed
 * number of slots and nothing pads out to 8; every badge DEV actually reports
 * gets a tile, wrapping cleanly at any card width.
 *
 * This is the ONE badge UI on the card — Dev Badges are PokéDev's canonical
 * badge system, and there is no separate "Trainer Badges" progression or
 * standalone duplicate section elsewhere.
 */

function staleDevBadgesText(
  dev: DevBadgesView,
  labels: TrainerCardLabels,
): string {
  return dev.error
    ? `${labels.devBadgesStaleNotice} ${dev.error.message}`
    : labels.devBadgesStaleNotice;
}

function renderBadgeTile(badge: DevBadge, unknown: string): HTMLElement {
  const tile = el('div', 'tc-badge-tile');
  tile.tabIndex = 0;
  tile.setAttribute('role', 'img');

  const name = badge.name || unknown;
  const accessibleLabel = badge.description
    ? `${name}. ${badge.description}`
    : name;
  tile.setAttribute('aria-label', accessibleLabel);
  // Native title tooltip: badge name, plus description when DEV's page had
  // one. Set as a plain attribute, never markup — badge text is third-party.
  tile.title = badge.description ? `${name}\n${badge.description}` : name;

  // Not `image-rendering: pixelated` - unlike this extension's own Pokemon
  // sprites, DEV badge art is an arbitrary third-party raster icon, so smooth
  // scaling is what keeps it looking sharp rather than blocky.
  const img = el('img', 'tc-badge-tile-img');
  img.setAttribute('src', badge.imageUrl);
  img.setAttribute('alt', '');
  img.setAttribute('loading', 'lazy');
  img.addEventListener('error', () => {
    img.remove();
    tile.classList.add('tc-badge-tile-broken');
  });
  tile.appendChild(img);

  return tile;
}

function renderDevBadgesConnectPrompt(labels: TrainerCardLabels): HTMLElement {
  const wrap = el('div', 'tc-devbadges-connect');
  const button = el('button', 'tc-devbadges-link');
  button.type = 'button';
  button.textContent = labels.connectDevButton;
  button.title = labels.connectDevHint;
  button.addEventListener('click', () => {
    post({ command: 'trainer/connectDev' });
  });
  wrap.appendChild(button);
  return wrap;
}

/** Only reached when there is no cached fallback to show instead. */
function renderDevBadgesError(
  dev: DevBadgesView,
  labels: TrainerCardLabels,
): HTMLElement {
  const wrap = el('div', 'tc-devbadges-connect');
  wrap.appendChild(
    el(
      'p',
      'tc-devbadges-hint',
      dev.error ? dev.error.message : labels.unknownValue,
    ),
  );
  if (dev.error && dev.error.retryable) {
    const retry = el('button', 'tc-devbadges-link');
    retry.type = 'button';
    retry.textContent = labels.retryButton;
    retry.addEventListener('click', () => {
      retry.disabled = true;
      post({ command: 'trainer/refreshDev' });
    });
    wrap.appendChild(retry);
  }
  return wrap;
}

function renderDevBadgesActions(labels: TrainerCardLabels): HTMLElement {
  const actions = el('div', 'tc-devbadges-actions');

  const refresh = el('button', 'tc-devbadges-link');
  refresh.type = 'button';
  refresh.textContent = `↻ ${labels.refreshDevBadgesShort}`;
  refresh.setAttribute('aria-label', labels.refreshDevBadgesButton);
  refresh.title = labels.refreshDevBadgesButton;
  refresh.addEventListener('click', () => {
    refresh.disabled = true;
    post({ command: 'trainer/refreshDev' });
  });
  actions.appendChild(refresh);

  const disconnect = el('button', 'tc-devbadges-link');
  disconnect.type = 'button';
  disconnect.textContent = labels.disconnectDevButton;
  disconnect.addEventListener('click', () => {
    disconnect.disabled = true;
    post({ command: 'trainer/disconnectDev' });
  });
  actions.appendChild(disconnect);

  return actions;
}

function renderBadgesGrid(
  dev: DevBadgesView,
  labels: TrainerCardLabels,
): HTMLElement {
  if (dev.badges.length === 0) {
    return el('p', 'tc-devbadges-empty', labels.noDevBadgesLabel);
  }
  const grid = el('div', 'tc-badges-grid');
  for (const badge of dev.badges) {
    grid.appendChild(renderBadgeTile(badge, labels.unknownDevBadgeLabel));
  }
  return grid;
}

function renderBadgesLoading(): HTMLElement {
  const grid = el('div', 'tc-badges-grid');
  for (let i = 0; i < 4; i++) {
    grid.appendChild(el('div', 'tc-shimmer tc-badge-tile'));
  }
  return grid;
}

/** BADGES: heading plus the earned artwork - see doc comment above. */
function renderBadges(model: TrainerCardViewModel): HTMLElement {
  const labels = model.labels;
  const dev = model.devBadges;

  const section = el('section', 'tc-section tc-section-badges');
  section.appendChild(sectionTitle(labels.badgesSectionLabel));

  if (dev.stale) {
    section.appendChild(
      el('p', 'tc-notice tc-notice-warn', staleDevBadgesText(dev, labels)),
    );
  }

  switch (dev.status) {
    case 'disconnected':
      section.appendChild(renderDevBadgesConnectPrompt(labels));
      break;
    case 'loading':
      section.appendChild(renderBadgesLoading());
      break;
    case 'error':
      section.appendChild(renderDevBadgesError(dev, labels));
      break;
    default:
      section.appendChild(renderBadgesGrid(dev, labels));
      // Crystal moves these OUTSIDE the physical card instead (see `render`
      // below) - application controls (Refresh/Disconnect) printed onto a
      // Trainer Card break the illusion; PokeDev keeps them here, unchanged.
      if (dev.status === 'connected' && model.style !== 'crystal') {
        section.appendChild(renderDevBadgesActions(labels));
      }
      break;
  }

  return section;
}

/* ---------------------------- trainer sprite picker ----------------------- */

/**
 * CHOOSE TRAINER: a lightweight modal overlay for picking a Trainer Sprite,
 * grouped by Generation I-IV tabs (see `TRAINER_GENERATIONS`, the single
 * place that mapping is defined).
 *
 * Clicking a tile only previews it (`spritePickerPreviewId`); "Use This
 * Trainer" is what actually posts `trainer/selectTrainerSprite`. Nothing
 * here mutates persisted state until that confirm.
 */
function renderPickerTabs(): HTMLElement {
  const tabs = el('div', 'tc-picker-tabs');
  tabs.setAttribute('role', 'tablist');
  for (const info of TRAINER_GENERATIONS) {
    const tab = el('button', 'tc-picker-tab', info.label);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    const active = info.generation === spritePickerGeneration;
    tab.setAttribute('aria-selected', String(active));
    tab.addEventListener('click', () => {
      if (spritePickerGeneration === info.generation) {
        return;
      }
      spritePickerGeneration = info.generation;
      rerender();
    });
    tabs.appendChild(tab);
  }
  return tabs;
}

function renderPickerTile(
  option: TrainerSpriteOption,
  labels: TrainerCardLabels,
): HTMLElement {
  const selected = option.id === spritePickerPreviewId;
  const tile = el(
    'button',
    selected ? 'tc-picker-tile tc-picker-tile-selected' : 'tc-picker-tile',
  );
  tile.type = 'button';
  tile.setAttribute('aria-pressed', String(selected));
  tile.setAttribute('aria-label', `${option.name} (${option.game})`);

  const sprite = el('img', 'tc-picker-tile-sprite');
  sprite.setAttribute('src', option.spriteUri);
  sprite.setAttribute('alt', '');
  tile.appendChild(sprite);

  tile.appendChild(el('span', 'tc-picker-tile-name', option.name));
  tile.appendChild(el('span', 'tc-picker-tile-game', option.game));

  if (selected) {
    tile.appendChild(
      el('span', 'tc-picker-tile-badge', labels.selectedTrainerLabel),
    );
  }

  tile.addEventListener('click', () => {
    spritePickerPreviewId = option.id;
    rerender();
  });

  return tile;
}

function renderPickerGrid(
  model: TrainerCardViewModel,
  labels: TrainerCardLabels,
): HTMLElement {
  const options = model.trainerSpriteCatalog.filter(
    (option) => option.generation === spritePickerGeneration,
  );
  if (options.length === 0) {
    const empty = el('p', 'tc-picker-empty', labels.unknownValue);
    return empty;
  }
  const grid = el('div', 'tc-picker-grid');
  grid.setAttribute('role', 'tabpanel');
  for (const option of options) {
    grid.appendChild(renderPickerTile(option, labels));
  }
  return grid;
}

function renderPickerActions(
  model: TrainerCardViewModel,
  labels: TrainerCardLabels,
): HTMLElement {
  const actions = el('div', 'tc-picker-actions');

  // Only worth offering when a sprite is actually selected right now -
  // otherwise there is nothing to reset.
  if (model.profile.trainerSpriteId) {
    const useGithub = el('button', 'tc-devbadges-link tc-picker-actions-hint');
    useGithub.type = 'button';
    useGithub.textContent = labels.useGithubAvatarButton;
    useGithub.addEventListener('click', () => {
      post({ command: 'trainer/useGithubAvatar' });
      closeSpritePicker();
    });
    actions.appendChild(useGithub);
  }

  const cancel = el('button', 'tc-button');
  cancel.type = 'button';
  cancel.textContent = labels.cancelButton;
  cancel.addEventListener('click', () => {
    closeSpritePicker();
  });
  actions.appendChild(cancel);

  const confirm = el('button', 'tc-button tc-button-primary');
  confirm.type = 'button';
  confirm.textContent = labels.useThisTrainerButton;
  confirm.disabled = !spritePickerPreviewId;
  confirm.addEventListener('click', () => {
    if (!spritePickerPreviewId) {
      return;
    }
    post({
      command: 'trainer/selectTrainerSprite',
      spriteId: spritePickerPreviewId,
    });
    closeSpritePicker();
  });
  actions.appendChild(confirm);

  return actions;
}

function renderTrainerSpritePicker(model: TrainerCardViewModel): HTMLElement {
  const labels = model.labels;

  const backdrop = el('div', 'tc-picker-backdrop');
  // Clicking the dimmed backdrop cancels, same as the explicit Cancel button;
  // a click inside the panel itself must not bubble up and trigger this.
  backdrop.addEventListener('click', () => {
    closeSpritePicker();
  });

  const panel = el('div', 'tc-picker-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', labels.trainerSpriteSelectorHeading);
  panel.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  const head = el('div', 'tc-picker-head');
  head.appendChild(
    el('h2', 'tc-picker-heading', labels.trainerSpriteSelectorHeading),
  );
  const close = el('button', 'tc-picker-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', labels.cancelButton);
  close.title = labels.cancelButton;
  close.addEventListener('click', () => {
    closeSpritePicker();
  });
  head.appendChild(close);
  panel.appendChild(head);

  panel.appendChild(renderPickerTabs());
  panel.appendChild(renderPickerGrid(model, labels));
  panel.appendChild(renderPickerActions(model, labels));

  backdrop.appendChild(panel);
  setTimeout(() => close.focus(), 0);
  return backdrop;
}

/* --------------------------------- states -------------------------------- */

/**
 * The physical landscape card: a compact CSS Grid of four regions -
 * identity (left, spanning both rows), BADGES and PARTY (right column,
 * stacked), and a footer row spanning both columns with TRAINER XP and the
 * compact PARTNER box. See `.tc-card-body` for the grid-template-areas this
 * relies on.
 *
 * DEV RECORD is deliberately NOT part of this grid - see
 * `renderDevRecordPanel`, rendered as a separate element below the physical
 * card so toggling it never resizes or distorts the compact card itself.
 */
function renderCard(model: TrainerCardViewModel): HTMLElement {
  const labels = model.labels;
  const github = model.github;
  const card = el('div', cardClassName(model, `tc-tier-${model.tier}`));

  const idText = `${labels.idLabel} ${padStart(
    github ? String(github.id) : '0',
    6,
    '0',
  )}`;
  card.appendChild(renderHead(labels, idText));

  const body = el('div', 'tc-card-body');
  body.appendChild(renderHero(model));
  body.appendChild(renderBadges(model));
  body.appendChild(renderParty(model));

  const footerRow = el('div', 'tc-footer-row');
  footerRow.appendChild(renderXpPanel(model));
  footerRow.appendChild(renderPartnerBox(model));
  body.appendChild(footerRow);

  card.appendChild(body);

  const notices: HTMLElement[] = [];
  if (model.stale) {
    notices.push(el('p', 'tc-notice tc-notice-warn', staleText(model, labels)));
  }
  if (github && github.sampleTruncated) {
    notices.push(el('p', 'tc-notice', labels.truncatedNotice));
  }
  if (notices.length > 0) {
    card.appendChild(appendAll(el('div', 'tc-notices'), notices));
  }

  return card;
}

function renderOnboarding(model: TrainerCardViewModel): HTMLElement {
  const labels = model.labels;
  const card = el('div', cardClassName(model, 'tc-card-compact'));
  card.appendChild(renderHead(labels));

  const body = el('div', 'tc-card-body');
  const onboard = el('div', 'tc-onboard');
  onboard.appendChild(pokeball('tc-onboard-ball'));
  onboard.appendChild(
    el('h2', 'tc-onboard-heading', labels.createTrainerHeading),
  );
  onboard.appendChild(el('p', 'tc-onboard-hint', labels.connectHint));

  const form = el('form', 'tc-onboard-form');
  const fieldLabel = el('label', 'tc-input-label', labels.usernamePlaceholder);
  fieldLabel.setAttribute('for', 'tc-username');
  const input = el('input', 'tc-input');
  input.id = 'tc-username';
  input.type = 'text';
  input.placeholder = labels.usernamePlaceholder;
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'none');
  input.setAttribute('aria-label', labels.usernamePlaceholder);
  input.maxLength = 39;

  const submit = el('button', 'tc-button tc-button-primary');
  submit.type = 'submit';
  submit.textContent = labels.createTrainerButton;

  const hint = el('p', 'tc-inline-error');
  if (model.error) {
    hint.textContent = model.error.message;
  }

  form.appendChild(fieldLabel);
  form.appendChild(input);
  form.appendChild(submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const username = input.value.trim();
    if (username.length === 0) {
      hint.textContent = labels.invalidUsernameHint;
      input.focus();
      return;
    }
    hint.textContent = '';
    submit.disabled = true;
    post({ command: 'trainer/connect', username });
  });

  onboard.appendChild(form);
  onboard.appendChild(hint);
  body.appendChild(onboard);
  card.appendChild(body);

  setTimeout(() => input.focus(), 0);
  return card;
}

function renderLoading(model: TrainerCardViewModel): HTMLElement {
  const labels = model.labels;
  const card = el('div', cardClassName(model, 'tc-skeleton'));
  card.setAttribute('aria-busy', 'true');
  card.appendChild(renderHead(labels));

  const body = el('div', 'tc-card-body');
  body.appendChild(el('span', 'tc-sr-only', labels.loadingLabel));

  const status = el('div', 'tc-status');
  status.appendChild(el('span', 'tc-status-dots', labels.loadingHeading));
  body.appendChild(status);

  const hero = el('div', 'tc-hero');
  hero.appendChild(el('div', 'tc-portrait tc-shimmer'));
  const lines = el('div', 'tc-identity');
  for (let i = 0; i < 4; i++) {
    lines.appendChild(el('div', 'tc-shimmer tc-shimmer-line'));
  }
  hero.appendChild(lines);
  body.appendChild(hero);

  body.appendChild(el('div', 'tc-rule'));
  const grid = el('div', 'tc-record-grid tc-record-grid-4');
  for (let i = 0; i < 4; i++) {
    grid.appendChild(el('div', 'tc-shimmer tc-shimmer-box'));
  }
  body.appendChild(grid);

  card.appendChild(body);
  return card;
}

function renderError(model: TrainerCardViewModel): HTMLElement {
  const labels = model.labels;
  const card = el('div', cardClassName(model, 'tc-card-compact'));
  card.appendChild(renderHead(labels));

  const body = el('div', 'tc-card-body');
  const status = el('div', 'tc-status tc-status-error');
  status.appendChild(pokeball('tc-onboard-ball tc-ball-faded'));
  status.appendChild(el('h2', 'tc-status-heading', labels.errorHeading));
  status.appendChild(
    el(
      'p',
      'tc-status-message',
      model.error ? model.error.message : labels.unknownValue,
    ),
  );

  if (model.error && model.error.retryable) {
    const retry = el('button', 'tc-button tc-button-primary');
    retry.type = 'button';
    retry.textContent = labels.retryButton;
    retry.addEventListener('click', () => {
      retry.disabled = true;
      post({ command: 'trainer/refresh' });
    });
    status.appendChild(retry);
  }

  body.appendChild(status);
  card.appendChild(body);
  return card;
}

function staleText(model: TrainerCardViewModel, labels: TrainerCardLabels) {
  return model.error
    ? `${labels.staleNotice} ${model.error.message}`
    : labels.staleNotice;
}

/**
 * Utility actions, deliberately visually demoted so they do not compete with
 * the card. The short text is what shows; the long, explicit form is the
 * accessible name.
 */
function renderFooter(model: TrainerCardViewModel): HTMLElement {
  const labels = model.labels;
  const footer = el('div', 'tc-footer');

  if (model.status !== 'onboarding') {
    const refresh = el('button', 'tc-button');
    refresh.type = 'button';
    refresh.textContent = `↻ ${labels.refreshShort}`;
    refresh.setAttribute('aria-label', labels.refreshButton);
    refresh.title = labels.refreshButton;
    refresh.disabled = model.status === 'loading';
    refresh.addEventListener('click', () => {
      refresh.disabled = true;
      post({ command: 'trainer/refresh' });
    });
    footer.appendChild(refresh);

    const change = el('button', 'tc-button');
    change.type = 'button';
    change.textContent = labels.changeTrainerShort;
    change.setAttribute('aria-label', labels.changeUsernameButton);
    change.title = labels.changeUsernameButton;
    change.addEventListener('click', () => {
      post({ command: 'trainer/changeUsername' });
    });
    footer.appendChild(change);

    // Only offered when the PARTY grid cannot already reach every Pokemon:
    // once every candidate fits in (and is clickable within) the party grid,
    // this button would do nothing the grid does not already do better.
    if (model.partner && model.totalPartnerCandidates > model.party.length) {
      const partner = el('button', 'tc-button');
      partner.type = 'button';
      partner.textContent = labels.changePartnerShort;
      partner.setAttribute('aria-label', labels.changePartnerButton);
      partner.title = labels.changePartnerButton;
      partner.addEventListener('click', () => {
        post({ command: 'trainer/changePartner' });
      });
      footer.appendChild(partner);
    }

    const chooseTrainer = el('button', 'tc-button');
    chooseTrainer.type = 'button';
    chooseTrainer.textContent = labels.chooseTrainerShort;
    chooseTrainer.setAttribute('aria-label', labels.chooseTrainerButton);
    chooseTrainer.title = labels.chooseTrainerButton;
    chooseTrainer.addEventListener('click', () => {
      openSpritePicker(model);
    });
    footer.appendChild(chooseTrainer);

    // Labelled for what clicking it does, not for the current state.
    const devRecord = el('button', 'tc-button');
    devRecord.type = 'button';
    const devRecordLabel = model.showDevRecord
      ? labels.hideDevRecordButton
      : labels.showDevRecordButton;
    devRecord.textContent = devRecordLabel;
    devRecord.setAttribute('aria-label', devRecordLabel);
    devRecord.setAttribute('aria-pressed', String(!model.showDevRecord));
    devRecord.title = devRecordLabel;
    devRecord.addEventListener('click', () => {
      post({ command: 'trainer/toggleDevRecord' });
    });
    footer.appendChild(devRecord);
  }

  const close = el('button', 'tc-button');
  close.type = 'button';
  close.textContent = labels.closeButton;
  close.addEventListener('click', () => {
    post({ command: 'trainer/close' });
  });
  footer.appendChild(close);

  return footer;
}

/* --------------------------------- wiring -------------------------------- */

function render(model: TrainerCardViewModel): void {
  if (!root) {
    return;
  }
  root.textContent = '';
  const shell = el('div', 'tc-shell');
  switch (model.status) {
    case 'onboarding':
      shell.appendChild(renderOnboarding(model));
      break;
    case 'loading':
      shell.appendChild(renderLoading(model));
      break;
    case 'error':
      shell.appendChild(renderError(model));
      break;
    default:
      shell.appendChild(renderCard(model));
      // Crystal-only: application controls (Refresh/Disconnect DEV), not
      // Trainer Card data - printed as a subtle utility row directly below
      // the physical card rather than inside it. See the matching gate in
      // `renderBadges` above. Same "connected" gate that function uses.
      if (model.style === 'crystal' && model.devBadges.status === 'connected') {
        shell.appendChild(renderDevBadgesActions(model.labels));
      }
      // Hidden by preference, not by absence of data - the GitHub block is
      // still fetched and cached, it just is not drawn. Kept OUTSIDE the
      // physical card so opening it never resizes the compact landscape
      // card itself - see `renderDevRecordPanel`.
      if (model.showDevRecord) {
        shell.appendChild(renderDevRecordPanel(model));
      }
      break;
  }
  shell.appendChild(renderFooter(model));
  root.appendChild(shell);

  // Same gate as the footer's "Choose Trainer" button: unreachable only from
  // onboarding, where there is no trainer profile to attach a sprite to yet.
  if (spritePickerOpen && model.status !== 'onboarding') {
    root.appendChild(renderTrainerSpritePicker(model));
  }
}

export function trainerCardApp(): void {
  api = acquireApi();
  const mount = document.getElementById('trainer-root');
  root = mount === null ? undefined : mount;

  window.addEventListener('message', (event: MessageEvent) => {
    const message = event.data;
    if (!message || message.command !== 'trainer/state') {
      return;
    }
    lastModel = message.payload as TrainerCardViewModel;
    render(lastModel);
  });

  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape' && spritePickerOpen) {
      closeSpritePicker();
    }
  });

  post({ command: 'trainer/ready' });
}
