/**
 * The Explorer webview bundle.
 *
 * One bundle serves both compact views; the host bootstraps whichever entry it
 * needs. They share the DOM helpers, the XP bar and the sprite handling, which
 * is the whole reason for keeping them together.
 *
 * The entire DOM is built with createElement/textContent. `innerHTML` is never
 * used anywhere in this file: GitHub display names are third-party strings
 * landing in a privileged webview, and the nicknames come from user input.
 */
import {
  DailyChallengeRowView,
  DailyChallengesLabels,
  DailyChallengesViewModel,
} from '../../challenges/daily-challenges-view-types';
import {
  ExplorerHostboundMessage,
  ExplorerLabels,
  ExplorerPokemonEntry,
  ExplorerPokemonViewModel,
  ExplorerTrainerViewModel,
} from '../../trainer/explorer-types';
import { hasDistinctNickname } from '../../trainer/pokemon-display-name';
import { DEV_BADGE_SLOTS } from '../../trainer/trainer-types';
import {
  FriendshipTierId,
  getFriendshipHearts,
  getFriendshipTier,
} from '../../progression/friendship-rules';

interface VscodeApi {
  postMessage(message: ExplorerHostboundMessage): void;
}
declare function acquireVsCodeApi(): VscodeApi;

let vscodeApi: VscodeApi | undefined;

function post(message: ExplorerHostboundMessage): void {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi();
  }
  vscodeApi.postMessage(message);
}

/* ------------------------------ dom helpers ----------------------------- */

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

function appendAll<T extends HTMLElement>(parent: T, children: Node[]): T {
  for (const child of children) {
    parent.appendChild(child);
  }
  return parent;
}

function root(): HTMLElement {
  const node = document.getElementById('root');
  if (!node) {
    throw new Error('Explorer view root missing');
  }
  return node;
}

/** Milliseconds -> "4h 35m". Matches the full card's formatting. */
function formatDuration(ms: number): string {
  const safe = typeof ms === 'number' && isFinite(ms) && ms > 0 ? ms : 0;
  const totalMinutes = Math.floor(safe / 60000);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

function padStart(value: string, length: number, pad: string): string {
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
function xpBar(
  current: number,
  needed: number,
  ariaLabel: string,
  className: string,
): HTMLElement {
  const pct =
    needed > 0
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

/**
 * A sprite that degrades to a faded Poke Ball if the gif is missing.
 *
 * A stale species key or a colour with no artwork would otherwise leave a
 * broken-image icon in the sidebar.
 */
function sprite(uri: string, className: string): HTMLElement {
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
function actionButton(
  label: string,
  onClick: () => void,
  title?: string,
): HTMLElement {
  const button = el('button', 'pd-action', label);
  button.type = 'button';
  button.title = title ?? label;
  button.setAttribute('aria-label', title ?? label);
  button.addEventListener('click', onClick);
  return button;
}

/* ------------------------------ trainer view ---------------------------- */

function renderTrainer(model: ExplorerTrainerViewModel): void {
  const labels = model.labels;
  const host = root();
  host.textContent = '';

  const card = el('div', 'pd-card');

  if (!model.connected) {
    // Nothing useful to show without an account, so ask once rather than
    // rendering an identity block full of blanks.
    card.appendChild(el('p', 'pd-empty', labels.connectPrompt));
    card.appendChild(
      appendAll(el('div', 'pd-actions'), [
        actionButton(labels.connectButton, () =>
          post({ command: 'explorer/connect' }),
        ),
        actionButton(labels.openFullCardButton, () =>
          post({ command: 'explorer/openFullCard' }),
        ),
      ]),
    );
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
  } else if (model.avatarUrl) {
    const avatar = el('img', 'pd-avatar');
    avatar.setAttribute('src', model.avatarUrl);
    avatar.setAttribute('alt', '');
    avatar.addEventListener('error', () => {
      avatar.replaceWith(el('div', 'pd-avatar pd-avatar-empty'));
    });
    portrait.appendChild(avatar);
  } else {
    portrait.appendChild(el('div', 'pd-avatar pd-avatar-empty'));
  }
  identity.appendChild(portrait);

  const who = el('div', 'pd-who');
  who.appendChild(el('span', 'pd-name', model.displayName));
  if (model.login) {
    who.appendChild(el('span', 'pd-login', `@${model.login}`));
  }
  who.appendChild(
    el(
      'span',
      'pd-level',
      `${labels.trainerWord} ${labels.levelLabel} ${padStart(
        String(model.trainerLevel),
        2,
        '0',
      )}`,
    ),
  );
  identity.appendChild(who);
  card.appendChild(identity);

  /* Trainer XP. */
  const xpHead = el('div', 'pd-row-head');
  xpHead.appendChild(el('span', 'pd-label', labels.xpLabel));
  xpHead.appendChild(
    el(
      'span',
      'pd-value',
      model.xpForNextLevel > 0
        ? `${model.trainerXp} / ${model.xpForNextLevel}`
        : String(model.trainerXp),
    ),
  );
  card.appendChild(xpHead);
  card.appendChild(
    xpBar(model.trainerXp, model.xpForNextLevel, labels.xpLabel, 'pd-xp'),
  );

  /* Coding time. */
  const timeRow = el('div', 'pd-row-head pd-row-spaced');
  timeRow.appendChild(el('span', 'pd-label', labels.codingTimeLabel));
  timeRow.appendChild(
    el('span', 'pd-value', formatDuration(model.totalCodingTimeMs)),
  );
  card.appendChild(timeRow);

  /* Dev Badges: the same canonical badge count the full Trainer Card shows. */
  const badgesRow = el('div', 'pd-row-head pd-row-spaced');
  badgesRow.appendChild(el('span', 'pd-label', labels.devBadgesLabel));
  badgesRow.appendChild(
    el('span', 'pd-value', `${model.devBadgesEarned} / ${DEV_BADGE_SLOTS}`),
  );
  card.appendChild(badgesRow);

  /* Partner summary. */
  card.appendChild(
    el('span', 'pd-label pd-label-section', labels.partnerLabel),
  );
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
    meta.appendChild(
      el(
        'span',
        'pd-partner-level',
        `${labels.levelLabel} ${padStart(String(p.level), 2, '0')}`,
      ),
    );
    if (p.xpForNextLevel > 0) {
      meta.appendChild(
        xpBar(p.currentXp, p.xpForNextLevel, labels.xpLabel, 'pd-mini'),
      );
    }
    row.appendChild(meta);
    card.appendChild(row);
  } else {
    card.appendChild(el('p', 'pd-empty', labels.noPartnerLabel));
  }

  card.appendChild(
    appendAll(el('div', 'pd-actions'), [
      actionButton(labels.openFullCardButton, () =>
        post({ command: 'explorer/openFullCard' }),
      ),
      actionButton(
        '↻',
        () => post({ command: 'explorer/refresh' }),
        labels.refreshButton,
      ),
      actionButton(labels.changePartnerButton, () =>
        post({ command: 'explorer/changePartner' }),
      ),
    ]),
  );

  host.appendChild(card);
}

/* ------------------------------ pokemon view ---------------------------- */

function renderPokemon(model: ExplorerPokemonViewModel): void {
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
function renderExpShareToggle(
  enabled: boolean,
  labels: ExplorerLabels,
): HTMLElement {
  const row = el('div', 'pd-exp-share');
  row.appendChild(el('span', 'pd-label', labels.expShareLabel));

  const stateLabel = enabled ? labels.expShareOnLabel : labels.expShareOffLabel;
  const button = el(
    'button',
    enabled ? 'pd-toggle pd-toggle-on' : 'pd-toggle pd-toggle-off',
    stateLabel,
  );
  button.type = 'button';
  button.title = labels.expShareTooltip;
  button.setAttribute(
    'aria-label',
    `${labels.expShareLabel}: ${stateLabel}. ${labels.expShareTooltip}`,
  );
  button.setAttribute('aria-pressed', String(enabled));
  button.addEventListener('click', () =>
    post({ command: 'explorer/toggleExpShare' }),
  );

  row.appendChild(button);
  return row;
}

function renderPokemonRow(
  entry: ExplorerPokemonEntry,
  labels: ExplorerLabels,
): HTMLElement {
  const item = el(
    'li',
    entry.isPartner ? 'pd-item pd-item-partner' : 'pd-item',
  );

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
  const named = hasDistinctNickname(entry.nickname, entry.species);
  nameLine.appendChild(
    el('span', 'pd-item-species', named ? entry.nickname : entry.species),
  );
  if (entry.shiny) {
    const star = el('span', 'pd-shiny', '★');
    star.title = labels.shinyLabel;
    nameLine.appendChild(star);
  }
  meta.appendChild(nameLine);

  const detail = el('div', 'pd-item-detail');
  detail.appendChild(
    el(
      'span',
      'pd-item-level',
      `${labels.levelLabel} ${padStart(String(entry.level), 2, '0')}`,
    ),
  );
  if (named) {
    // The species is secondary once a nickname is shown; CSS hides it first
    // when the sidebar gets narrow.
    detail.appendChild(el('span', 'pd-item-sub', entry.species));
  }
  detail.appendChild(
    heartMeter(entry.friendship, labels.friendshipTierLabels, 'pd-hearts'),
  );
  meta.appendChild(detail);

  if (entry.xpForNextLevel > 0) {
    meta.appendChild(
      xpBar(entry.currentXp, entry.xpForNextLevel, labels.xpLabel, 'pd-mini'),
    );
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
  } else {
    button.disabled = true;
  }

  item.appendChild(button);
  return item;
}

/* --------------------------- daily challenges ---------------------------- */

function renderDailyChallenges(model: DailyChallengesViewModel): void {
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
  head.appendChild(
    el('span', 'pd-value', `${model.completedCount} / ${model.totalCount}`),
  );
  host.appendChild(head);

  const list = el('ul', 'pd-challenge-list');
  for (const challenge of model.challenges) {
    list.appendChild(renderChallengeRow(challenge, labels));
  }
  host.appendChild(list);

  host.appendChild(el('p', 'pd-challenge-footer', labels.resetLabel));
}

function renderChallengeRow(
  challenge: DailyChallengeRowView,
  labels: DailyChallengesLabels,
): HTMLElement {
  const item = el(
    'li',
    challenge.completed ? 'pd-challenge pd-challenge-complete' : 'pd-challenge',
  );

  const titleRow = el('div', 'pd-challenge-row');
  const title = challenge.completed
    ? `✓ ${challenge.title.toUpperCase()}`
    : challenge.title.toUpperCase();
  titleRow.appendChild(el('span', 'pd-challenge-title', title));
  titleRow.appendChild(
    el(
      'span',
      'pd-challenge-count',
      `${challenge.progress} / ${challenge.target}`,
    ),
  );
  item.appendChild(titleRow);

  item.appendChild(el('div', 'pd-challenge-desc', challenge.description));

  if (challenge.completed) {
    item.appendChild(
      el(
        'div',
        'pd-challenge-reward',
        `${labels.completeLabel} · +${challenge.rewardTrainerXp} ${labels.xpLabel}`,
      ),
    );
  } else {
    item.appendChild(
      xpBar(
        challenge.progress,
        challenge.target,
        `${challenge.title}: ${challenge.progress} / ${challenge.target}`,
        'pd-mini',
      ),
    );
    item.appendChild(
      el(
        'div',
        'pd-challenge-reward',
        `+${challenge.rewardTrainerXp} ${labels.xpLabel}`,
      ),
    );
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
function start<T>(expected: string, render: (payload: T) => void): void {
  window.addEventListener('message', (event: MessageEvent): void => {
    const message = event.data as { command?: string; payload?: T } | undefined;
    if (!message || message.command !== expected || !message.payload) {
      return;
    }
    render(message.payload);
  });
  post({ command: 'explorer/ready' });
}

export function trainerView(): void {
  start<ExplorerTrainerViewModel>('explorer/trainerState', renderTrainer);
}

export function pokemonView(): void {
  start<ExplorerPokemonViewModel>('explorer/pokemonState', renderPokemon);
}

export function dailyChallengesView(): void {
  start<DailyChallengesViewModel>(
    'explorer/dailyChallengesState',
    renderDailyChallenges,
  );
}
