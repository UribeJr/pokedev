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
import {
  TRAINER_BADGE_SLOTS,
  TrainerCardLabels,
  TrainerCardViewModel,
  TrainerHostboundMessage,
} from '../../trainer/trainer-types';

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

/** Portrait + trainer identity + level plate. */
function renderHero(model: TrainerCardViewModel): HTMLElement {
  const labels = model.labels;
  const github = model.github;
  const hero = el('div', 'tc-hero');

  const portrait = el('div', 'tc-portrait');
  // The frame's ::before/::after are the corner brackets, so the placeholder
  // glyph needs a real element of its own rather than a third pseudo-element.
  const markEmpty = () => {
    portrait.classList.add('tc-portrait-empty');
    portrait.appendChild(el('span', 'tc-portrait-glyph', '?'));
  };
  if (github && github.avatarUrl) {
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
  if (github && github.bio) {
    identity.appendChild(el('p', 'tc-bio', github.bio));
  }
  if (github && github.location) {
    identity.appendChild(el('p', 'tc-location', github.location));
  }
  hero.appendChild(identity);

  const level = padStart(String(model.profile.trainerLevel), 2, '0');
  hero.appendChild(
    appendAll(el('div', 'tc-level-plate'), [
      el('span', 'tc-level-word', labels.trainerWord),
      el('span', 'tc-level-value', `${labels.levelLabel} ${level}`),
    ]),
  );

  return hero;
}

/** DEV RECORD: the GitHub-derived stats plus SPECIALTIES. */
function renderDevRecord(model: TrainerCardViewModel): HTMLElement {
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

/** TRAINER RECORD: the game-side counters, all zero in V1. */
function renderTrainerRecord(model: TrainerCardViewModel): HTMLElement {
  const labels = model.labels;
  const profile = model.profile;

  const section = el('section', 'tc-section tc-section-trainer');
  section.appendChild(sectionTitle(labels.trainerRecordLabel));

  const earned = profile.badges.length;
  const grid = el('div', 'tc-record-grid tc-record-grid-3');
  grid.appendChild(
    recordCell(
      labels.pokedexLabel,
      String(profile.pokemonCaught),
      `${profile.pokemonCaught} ${labels.caughtSuffix}`,
    ),
  );
  grid.appendChild(
    recordCell(labels.badgesLabel, `${earned} / ${TRAINER_BADGE_SLOTS}`),
  );
  grid.appendChild(
    recordCell(labels.shiniesLabel, String(profile.shinyPokemonCaught)),
  );
  section.appendChild(grid);

  // Badge slots are decorative: the accessible value is the "N / 8" cell above.
  const slots = el('div', 'tc-badge-slots');
  slots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < TRAINER_BADGE_SLOTS; i++) {
    slots.appendChild(
      pokeball(i < earned ? 'tc-badge tc-badge-earned' : 'tc-badge'),
    );
  }
  section.appendChild(slots);

  section.appendChild(
    appendAll(el('div', 'tc-timerow'), [
      el('span', 'tc-record-label', labels.codingTimeLabel),
      el('span', 'tc-timerow-value', formatDuration(profile.totalCodingTimeMs)),
    ]),
  );

  return section;
}

/**
 * PARTNER: the first usable Pokemon in the persisted collection.
 *
 * There is deliberately no level, HP or stat line — the Pokemon domain model
 * has no such concept anywhere in this extension, so inventing one here would
 * be fiction. Species, nickname and shininess are all that actually exist.
 */
function renderPartner(model: TrainerCardViewModel): HTMLElement {
  const labels = model.labels;
  const partner = model.partner;

  const section = el('section', 'tc-section tc-section-partner');
  section.appendChild(sectionTitle(labels.partnerLabel));

  const frame = el('div', 'tc-partner-frame');
  if (partner) {
    const sprite = el('img', 'tc-partner-sprite');
    sprite.setAttribute('src', partner.spriteUri);
    sprite.setAttribute('alt', '');
    sprite.addEventListener('error', () => {
      sprite.remove();
      frame.appendChild(pokeball('tc-partner-ball tc-ball-faded'));
    });
    frame.appendChild(sprite);
  } else {
    frame.classList.add('tc-partner-frame-empty');
    frame.appendChild(pokeball('tc-partner-ball tc-ball-faded'));
  }
  section.appendChild(frame);

  if (partner) {
    const naming = el('div', 'tc-partner-name');
    naming.appendChild(el('span', 'tc-partner-species', partner.species));
    // Spawning defaults a Pokemon's name to its species, so most collections
    // yield nickname === species. Rendering both gives CACTURNE "Cacturne";
    // only show the nickname when it actually says something different.
    const nickname = partner.nickname.trim();
    if (
      nickname.length > 0 &&
      nickname.toLowerCase() !== partner.species.trim().toLowerCase()
    ) {
      naming.appendChild(el('span', 'tc-partner-nick', `“${nickname}”`));
    }
    if (partner.shiny) {
      naming.appendChild(el('span', 'tc-partner-shiny', '★'));
    }
    section.appendChild(naming);

    section.appendChild(
      el(
        'span',
        'tc-partner-level',
        `${labels.partnerLevelLabel} ${padStart(String(partner.level), 2, '0')}`,
      ),
    );

    // A capped partner has no next level to fill toward, so the bar would be
    // permanently full and meaningless; the level plate says it all.
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

      section.appendChild(
        appendAll(el('div', 'tc-partner-xp'), [
          track,
          el('span', 'tc-partner-xp-value', `${partner.currentXp}/${needed}`),
        ]),
      );
    }
  } else {
    section.appendChild(el('p', 'tc-partner-empty', labels.noPartnerLabel));
  }

  return section;
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

/* --------------------------------- states -------------------------------- */

function renderCard(model: TrainerCardViewModel): HTMLElement {
  const labels = model.labels;
  const github = model.github;
  const card = el('div', `tc-card tc-tier-${model.tier}`);

  const idText = `${labels.idLabel} ${padStart(
    github ? String(github.id) : '0',
    6,
    '0',
  )}`;
  card.appendChild(renderHead(labels, idText));

  const body = el('div', 'tc-card-body');
  body.appendChild(renderHero(model));
  body.appendChild(el('div', 'tc-rule'));
  // Hidden by preference, not by absence of data - the GitHub block is still
  // fetched and cached, it just is not drawn.
  if (model.showDevRecord) {
    body.appendChild(renderDevRecord(model));
  }
  body.appendChild(el('div', 'tc-rule'));

  const lower = el('div', 'tc-lower');
  lower.appendChild(renderTrainerRecord(model));
  lower.appendChild(renderPartner(model));
  body.appendChild(lower);

  body.appendChild(renderXpPanel(model));
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
  const card = el('div', 'tc-card tc-card-compact');
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
  const card = el('div', 'tc-card tc-skeleton');
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
  const card = el('div', 'tc-card tc-card-compact');
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

    // Only offered when there is actually a collection to choose from.
    if (model.partner) {
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
      break;
  }
  shell.appendChild(renderFooter(model));
  root.appendChild(shell);
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
    render(message.payload as TrainerCardViewModel);
  });

  post({ command: 'trainer/ready' });
}
