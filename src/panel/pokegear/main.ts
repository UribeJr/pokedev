/**
 * The PokeGear webview bundle.
 *
 * The entire DOM is built with createElement/textContent - `innerHTML` is
 * never used, matching every other PokeDev webview's own rule (GitHub/DEV
 * strings arrive in a privileged webview).
 *
 * PokeGear always renders with the Crystal skin (see `pokegear-types.ts`'s
 * own doc comment on why there is no `style` field to read) - `.tc-skin-
 * crystal` is applied unconditionally to the shell, and `media/pokegear.css`
 * reuses the exact same shared tokens/components `media/pokedev-tokens.css`
 * and `media/trainer-card.css`'s `.tc-skin-crystal` block already define,
 * rather than inventing a second Crystal palette.
 */
import {
  PokeGearActivityEntry,
  PokeGearHostboundMessage,
  PokeGearLabels,
  PokeGearTab,
  PokeGearViewModel,
  POKEGEAR_TABS,
} from '../../pokegear/pokegear-types';
import { ExplorerPokemonEntry } from '../../trainer/explorer-types';
import { hasDistinctNickname } from '../../trainer/pokemon-display-name';
import { getFriendshipHearts } from '../../progression/friendship-rules';

interface VscodeApi {
  postMessage(message: PokeGearHostboundMessage): void;
}

/** Reached through globalThis, same reasoning as
 * `panel/trainer-card/main.ts`'s own `acquireApi` - more than one PokeDev
 * webview bundle declares `acquireVsCodeApi` globally, and this file must
 * not assume it is the only one loaded in the same TypeScript program. */
function acquireApi(): VscodeApi | undefined {
  const scope = globalThis as unknown as {
    acquireVsCodeApi?: () => VscodeApi;
  };
  return typeof scope.acquireVsCodeApi === 'function'
    ? scope.acquireVsCodeApi()
    : undefined;
}

let api: VscodeApi | undefined;
let root: HTMLElement | undefined;
let lastModel: PokeGearViewModel | undefined;

/** Client-side only, like the Trainer Card's sprite-picker preview state -
 * never round-tripped to the host until the user actually acts on it. */
let selectedBadgeIndex: number | undefined;
let selectedPartyNickname: string | undefined;

function post(message: PokeGearHostboundMessage): void {
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

function appendAll<T extends HTMLElement>(parent: T, children: Node[]): T {
  for (const child of children) {
    parent.appendChild(child);
  }
  return parent;
}

function padStart(value: string, length: number, pad: string): string {
  let out = value;
  while (out.length < length) {
    out = pad + out;
  }
  return out;
}

/** Milliseconds -> "4h 35m", matching every other PokeDev surface's format. */
function formatDuration(ms: number): string {
  const safe = typeof ms === 'number' && isFinite(ms) && ms > 0 ? ms : 0;
  const totalMinutes = Math.floor(safe / 60000);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

/** Epoch ms -> "16:42", the local wall-clock time PokeGear's header and
 * ACTIVITY feed both show - never a date, since the feed is inherently
 * recent/same-session. */
function formatClock(ms: number): string {
  const date = new Date(ms);
  return `${padStart(String(date.getHours()), 2, '0')}:${padStart(
    String(date.getMinutes()),
    2,
    '0',
  )}`;
}

/**
 * A labelled segmented progress bar - the exact `.tc-xp-track`/`.tc-xp-fill`
 * markup shape `panel/trainer-card/main.ts`'s `renderXpPanel` uses, so the
 * Crystal CSS (flat fill + pixel-notch overlay) applies identically here
 * with no new component invented.
 */
function segmentedBar(
  current: number,
  max: number,
  ariaLabel: string,
): HTMLElement {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 100;
  const fill = el('div', 'tc-xp-fill');
  fill.style.width = `${pct}%`;
  const track = el('div', 'tc-xp-track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', String(max));
  track.setAttribute('aria-valuenow', String(current));
  track.setAttribute('aria-label', ariaLabel);
  track.appendChild(fill);
  return track;
}

/** A compact 5-heart Friendship meter - plain text glyphs, matching every
 * other PokeDev surface's `heartMeter` (never emoji artwork). */
function heartMeter(friendship: number, className: string): HTMLElement {
  const hearts = getFriendshipHearts(friendship);
  let glyphs = '';
  for (let i = 0; i < 5; i++) {
    glyphs += i < hearts ? '♥' : '♡';
  }
  return el('span', className, glyphs);
}

/* --------------------------------- shell --------------------------------- */

function sectionTitle(text: string): HTMLElement {
  return el('h2', 'tc-section-title', text);
}

function renderTabs(model: PokeGearViewModel): HTMLElement {
  const labels = model.labels;
  const tabLabel: Record<PokeGearTab, string> = {
    status: labels.tabStatus,
    activity: labels.tabActivity,
    badges: labels.tabBadges,
    party: labels.tabParty,
  };

  const tabs = el('div', 'pg-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', labels.panelTitle);

  POKEGEAR_TABS.forEach((tab, index) => {
    const isActive = tab === model.activeTab;
    const button = el(
      'button',
      isActive ? 'pg-tab pg-tab-active' : 'pg-tab',
      tabLabel[tab],
    );
    button.type = 'button';
    button.id = `pg-tab-${tab}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(isActive));
    button.setAttribute('aria-controls', `pg-panel-${tab}`);
    button.tabIndex = isActive ? 0 : -1;
    button.addEventListener('click', () => setActiveTab(tab));
    button.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const delta = event.key === 'ArrowRight' ? 1 : -1;
        const nextIndex =
          (index + delta + POKEGEAR_TABS.length) % POKEGEAR_TABS.length;
        const next = POKEGEAR_TABS[nextIndex];
        setActiveTab(next);
        document.getElementById(`pg-tab-${next}`)?.focus();
      }
    });
    tabs.appendChild(button);
  });

  return tabs;
}

function renderHeader(model: PokeGearViewModel): HTMLElement {
  const head = el('div', 'pg-head');
  head.appendChild(el('h1', 'pg-title', model.labels.panelTitle));
  head.appendChild(el('span', 'pg-clock', formatClock(Date.now())));
  return head;
}

function renderFooter(model: PokeGearViewModel): HTMLElement {
  const labels = model.labels;
  const footer = el('div', 'tc-footer');

  const openCard = el('button', 'tc-button', labels.openTrainerCardButton);
  openCard.type = 'button';
  openCard.addEventListener('click', () => {
    post({ command: 'pokegear/openTrainerCard' });
  });
  footer.appendChild(openCard);

  const close = el('button', 'tc-button', labels.closeButton);
  close.type = 'button';
  close.addEventListener('click', () => post({ command: 'pokegear/close' }));
  footer.appendChild(close);

  return footer;
}

/* -------------------------------- STATUS --------------------------------- */

function statRow(label: string, value: string): HTMLElement {
  return appendAll(el('div', 'tc-identity-stat-row'), [
    el('span', 'tc-identity-stat-label', label),
    el('span', 'tc-identity-stat-value', value),
  ]);
}

function renderStatusTab(model: PokeGearViewModel): HTMLElement {
  const labels = model.labels;
  const status = model.status;
  const tab = el('div', 'pg-tab-panel pg-status');

  if (!status.connected) {
    tab.appendChild(el('p', 'tc-devbadges-empty', labels.connectDevHint));
    return tab;
  }

  const trainerSection = el('section', 'tc-section pg-status-block');
  trainerSection.appendChild(sectionTitle(labels.trainerLabel));
  trainerSection.appendChild(el('div', 'pg-trainer-name', status.trainerName));
  trainerSection.appendChild(
    statRow(
      labels.trainerLabel,
      `${labels.levelLabel} ${padStart(String(status.trainerLevel), 2, '0')}`,
    ),
  );
  tab.appendChild(trainerSection);

  const xpSection = el('section', 'tc-section pg-status-block');
  xpSection.appendChild(sectionTitle(labels.xpLabel));
  xpSection.appendChild(
    el(
      'p',
      'tc-xp-value',
      status.xpForNextLevel > 0
        ? `${status.trainerXp} / ${status.xpForNextLevel}`
        : String(status.trainerXp),
    ),
  );
  xpSection.appendChild(
    segmentedBar(status.trainerXp, status.xpForNextLevel, labels.xpLabel),
  );
  tab.appendChild(xpSection);

  const codingSection = el('section', 'tc-section pg-status-block');
  codingSection.appendChild(sectionTitle(labels.codingTimeLabel));
  codingSection.appendChild(
    el('p', 'tc-xp-value', formatDuration(status.totalCodingTimeMs)),
  );
  tab.appendChild(codingSection);

  const partnerSection = el('section', 'tc-section pg-status-block');
  partnerSection.appendChild(sectionTitle(labels.partnerLabel));
  if (status.partner) {
    const p = status.partner;
    const row = el('div', 'pg-partner-row');
    row.appendChild(
      appendAll(el('div', 'pg-partner-meta'), [
        el('span', 'tc-party-name', p.nickname || p.species),
        el(
          'span',
          'tc-party-level',
          `${p.species} · ${labels.levelLabel} ${padStart(String(p.level), 2, '0')}`,
        ),
        heartMeter(p.friendship, 'tc-partner-hearts'),
      ]),
    );
    partnerSection.appendChild(row);
  } else {
    partnerSection.appendChild(
      el('p', 'tc-partner-empty', labels.noPartnerLabel),
    );
  }
  tab.appendChild(partnerSection);

  const dailySection = el('section', 'tc-section pg-status-block');
  dailySection.appendChild(sectionTitle(labels.dailyLabel));
  dailySection.appendChild(
    el(
      'p',
      'tc-xp-value',
      `${status.dailyCompletedCount} / ${status.dailyTotalCount}`,
    ),
  );
  tab.appendChild(dailySection);

  const badgesSection = el('section', 'tc-section pg-status-block');
  badgesSection.appendChild(sectionTitle(labels.badgesLabel));
  badgesSection.appendChild(
    el(
      'p',
      'tc-xp-value',
      `${status.devBadgesEarned} ${labels.badgesEarnedLabel}`,
    ),
  );
  tab.appendChild(badgesSection);

  return tab;
}

/* ------------------------------- ACTIVITY --------------------------------- */

/** Plain, localizable-later English labels for each semantic event type -
 * never the raw enum value on screen. */
function activityEntryLabel(entry: PokeGearActivityEntry): string {
  const meta = entry.metadata ?? {};
  switch (entry.type) {
    case 'git-commit':
      return 'Git commit';
    case 'build-success':
      return 'Build complete';
    case 'test-success':
      return 'Tests passed';
    case 'typecheck-success':
      return 'Typecheck passed';
    case 'lint-success':
      return 'Lint passed';
    case 'task-success':
      return 'Task complete';
    case 'debug-grant':
      return 'Debug grant';
    case 'daily-challenge-complete':
      return typeof meta.title === 'string'
        ? `Daily complete: ${meta.title}`
        : 'Daily complete';
    case 'pokemon-level-up': {
      const species = typeof meta.species === 'string' ? meta.species : '';
      const level = typeof meta.level === 'number' ? meta.level : undefined;
      return level !== undefined
        ? `${species || 'Partner'} reached Lv. ${level}`
        : `${species || 'Partner'} leveled up`;
    }
    case 'pokemon-evolved': {
      const from =
        typeof meta.fromSpecies === 'string' ? meta.fromSpecies : '?';
      const to = typeof meta.toSpecies === 'string' ? meta.toSpecies : '?';
      return `${from} evolved into ${to}`;
    }
    case 'work-batch':
    case 'active-coding':
      return 'Coding activity';
    default:
      return 'Activity';
  }
}

function renderActivityTab(model: PokeGearViewModel): HTMLElement {
  const labels = model.labels;
  const activity = model.activity;
  const tab = el('div', 'pg-tab-panel pg-activity');

  const today = el('section', 'tc-section pg-status-block');
  today.appendChild(sectionTitle(labels.todayLabel));
  const grid = el('div', 'tc-record-grid tc-record-grid-4');
  grid.appendChild(
    recordCell(labels.commitsLabel, String(activity.today.commits)),
  );
  grid.appendChild(
    recordCell(labels.devActionsLabel, String(activity.today.devActions)),
  );
  grid.appendChild(
    recordCell(
      labels.dailyLabel,
      `${activity.today.dailyCompletedCount} / ${activity.today.dailyTotalCount}`,
    ),
  );
  today.appendChild(grid);
  tab.appendChild(today);

  const feed = el('section', 'tc-section pg-status-block');
  feed.appendChild(sectionTitle(labels.recentActivityLabel));
  if (activity.recent.length === 0) {
    feed.appendChild(el('p', 'tc-devbadges-empty', labels.noActivityLabel));
  } else {
    const list = el('ul', 'pg-activity-list');
    for (const entry of activity.recent) {
      const row = el('li', 'pg-activity-row');
      row.appendChild(
        el('span', 'pg-activity-time', formatClock(entry.timestamp)),
      );
      row.appendChild(
        el('span', 'pg-activity-label', activityEntryLabel(entry)),
      );
      list.appendChild(row);
    }
    feed.appendChild(list);
  }
  tab.appendChild(feed);

  return tab;
}

function recordCell(label: string, value: string): HTMLElement {
  return appendAll(el('div', 'tc-record-cell'), [
    el('span', 'tc-record-value', value),
    el('span', 'tc-record-label', label),
  ]);
}

/* -------------------------------- BADGES ---------------------------------- */

function renderBadgesTab(model: PokeGearViewModel): HTMLElement {
  const labels = model.labels;
  const dev = model.badges.devBadges;
  const tab = el('div', 'pg-tab-panel pg-badges');

  const section = el('section', 'tc-section pg-status-block');
  section.appendChild(sectionTitle(labels.badgesLabel));

  if (dev.status === 'disconnected') {
    section.appendChild(el('p', 'tc-devbadges-empty', labels.connectDevHint));
    tab.appendChild(section);
    return tab;
  }

  if (dev.status === 'loading') {
    section.appendChild(el('p', 'tc-devbadges-empty', labels.unknownValue));
    tab.appendChild(section);
    return tab;
  }

  if (dev.badges.length === 0) {
    section.appendChild(el('p', 'tc-devbadges-empty', labels.noDevBadgesLabel));
    tab.appendChild(section);
    return tab;
  }

  const grid = el('div', 'tc-badges-grid');
  dev.badges.forEach((badge, index) => {
    const tile = el('button', 'tc-badge-tile pg-badge-tile');
    tile.type = 'button';
    const isSelected = selectedBadgeIndex === index;
    if (isSelected) {
      tile.classList.add('pg-badge-tile-selected');
    }
    tile.setAttribute('aria-pressed', String(isSelected));
    tile.title = badge.name;
    const img = el('img', 'tc-badge-tile-img');
    img.src = badge.imageUrl;
    img.alt = badge.name;
    tile.appendChild(img);
    tile.addEventListener('click', () => {
      selectedBadgeIndex = isSelected ? undefined : index;
      rerender();
    });
    grid.appendChild(tile);
  });
  section.appendChild(grid);
  tab.appendChild(section);

  if (selectedBadgeIndex !== undefined && dev.badges[selectedBadgeIndex]) {
    const badge = dev.badges[selectedBadgeIndex];
    const detail = el('section', 'tc-section pg-status-block pg-badge-detail');
    detail.appendChild(sectionTitle(badge.name));
    if (badge.description) {
      detail.appendChild(el('p', 'tc-devbadges-hint', badge.description));
    }
    detail.appendChild(el('p', 'tc-xp-value', labels.badgesEarnedLabel));
    tab.appendChild(detail);
  }

  return tab;
}

/* --------------------------------- PARTY ----------------------------------- */

function renderPartyRow(
  entry: ExplorerPokemonEntry,
  labels: PokeGearLabels,
): HTMLElement {
  const isSelected = selectedPartyNickname === entry.nickname;
  const row = el(
    'button',
    isSelected ? 'pg-party-row pg-party-row-selected' : 'pg-party-row',
  );
  row.type = 'button';
  if (entry.isPartner) {
    row.classList.add('pg-party-row-partner');
  }

  const marker = el('span', 'pg-party-marker', entry.isPartner ? '▶' : '');
  row.appendChild(marker);

  const sprite = el('img', 'tc-party-sprite');
  sprite.src = entry.spriteUri;
  sprite.alt = '';
  row.appendChild(sprite);

  const meta = el('div', 'pg-party-meta');
  const nameLine = el('span', 'tc-party-name', entry.species);
  if (hasDistinctNickname(entry.nickname, entry.species)) {
    nameLine.textContent = `${entry.nickname} · ${entry.species}`;
  }
  meta.appendChild(nameLine);
  meta.appendChild(
    appendAll(el('div', 'pg-party-sub'), [
      el(
        'span',
        'tc-party-level',
        `${labels.levelLabel} ${padStart(String(entry.level), 2, '0')}`,
      ),
      heartMeter(entry.friendship, 'tc-partner-hearts'),
    ]),
  );
  row.appendChild(meta);

  row.addEventListener('click', () => {
    selectedPartyNickname = isSelected ? undefined : entry.nickname;
    rerender();
  });

  return row;
}

function renderPartyTab(model: PokeGearViewModel): HTMLElement {
  const labels = model.labels;
  const party = model.party;
  const tab = el('div', 'pg-tab-panel pg-party');

  const section = el('section', 'tc-section pg-status-block');
  section.appendChild(sectionTitle(labels.tabParty));

  if (party.party.length === 0) {
    section.appendChild(el('p', 'tc-party-empty-label', labels.unknownValue));
    tab.appendChild(section);
    return tab;
  }

  const list = el('div', 'pg-party-list');
  for (const entry of party.party) {
    list.appendChild(renderPartyRow(entry, labels));
  }
  section.appendChild(list);
  tab.appendChild(section);

  const selected = party.party.find(
    (p) => p.nickname === selectedPartyNickname,
  );
  if (selected) {
    const detail = el('section', 'tc-section pg-status-block pg-party-detail');
    detail.appendChild(
      sectionTitle(
        hasDistinctNickname(selected.nickname, selected.species)
          ? `${selected.nickname} · ${selected.species}`
          : selected.species,
      ),
    );
    detail.appendChild(
      statRow(
        labels.trainerLabel,
        `${labels.levelLabel} ${padStart(String(selected.level), 2, '0')}`,
      ),
    );
    if (selected.xpForNextLevel > 0) {
      detail.appendChild(
        segmentedBar(
          selected.currentXp,
          selected.xpForNextLevel,
          labels.xpLabel,
        ),
      );
    }
    detail.appendChild(heartMeter(selected.friendship, 'tc-partner-hearts'));

    if (!selected.isPartner) {
      const makePartner = el('button', 'tc-button', labels.makePartnerButton);
      makePartner.type = 'button';
      makePartner.addEventListener('click', () => {
        post({
          command: 'pokegear/selectPartner',
          nickname: selected.nickname,
        });
      });
      detail.appendChild(makePartner);
    }
    tab.appendChild(detail);
  }

  return tab;
}

/* --------------------------------- wiring --------------------------------- */

function setActiveTab(tab: PokeGearTab): void {
  if (!lastModel || lastModel.activeTab === tab) {
    return;
  }
  lastModel = { ...lastModel, activeTab: tab };
  post({ command: 'pokegear/setActiveTab', tab });
  rerender();
}

function rerender(): void {
  if (lastModel) {
    render(lastModel);
  }
}

function render(model: PokeGearViewModel): void {
  if (!root) {
    return;
  }
  root.textContent = '';

  // `.tc-shell` (centering/max-width) wraps the physical `.tc-card` face
  // AND the footer as siblings - the same "application actions live outside
  // the card face" split the Crystal Trainer Card polish pass established
  // for its own Refresh/Disconnect row, applied here from the start rather
  // than retrofitted.
  const shell = el('div', 'tc-shell pg-shell');

  const card = el('div', 'tc-card tc-skin-crystal pg-card');
  card.appendChild(renderHeader(model));
  card.appendChild(renderTabs(model));

  const panels: Record<PokeGearTab, () => HTMLElement> = {
    status: () => renderStatusTab(model),
    activity: () => renderActivityTab(model),
    badges: () => renderBadgesTab(model),
    party: () => renderPartyTab(model),
  };

  const content = panels[model.activeTab]();
  content.id = `pg-panel-${model.activeTab}`;
  content.setAttribute('role', 'tabpanel');
  content.setAttribute('aria-labelledby', `pg-tab-${model.activeTab}`);
  card.appendChild(content);
  shell.appendChild(card);

  shell.appendChild(renderFooter(model));
  root.appendChild(shell);
}

export function pokeGearApp(): void {
  api = acquireApi();
  const mount = document.getElementById('pokegear-root');
  root = mount === null ? undefined : mount;

  window.addEventListener('message', (event: MessageEvent) => {
    const message = event.data;
    if (!message || message.command !== 'pokegear/state') {
      return;
    }
    const incoming = message.payload as PokeGearViewModel;
    // Preserve the client's own optimistic tab switch (see `setActiveTab`)
    // against a host push that has not caught up to it yet - the host's
    // OWN state still updates correctly regardless, since the message that
    // set it was already sent.
    lastModel =
      lastModel && lastModel.activeTab !== incoming.activeTab
        ? { ...incoming, activeTab: lastModel.activeTab }
        : incoming;
    render(lastModel);
  });

  post({ command: 'pokegear/ready' });
}
