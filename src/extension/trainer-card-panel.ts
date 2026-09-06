import * as vscode from 'vscode';
import {
  DEV_USERNAME_PATTERN,
  isValidDevUsername,
} from '../trainer/dev-badge-parse';
import {
  GITHUB_USERNAME_PATTERN,
  isValidGithubUsername,
} from '../trainer/github-parse';
import { computeTrainerClass } from '../trainer/trainer-class';
import {
  DEFAULT_TRAINER_CARD_STYLE,
  isValidTrainerCardStyle,
  TrainerCardStyle,
} from '../common/trainer-card-style';
import {
  getTrainerCardTier,
  getXpForNextTrainerLevel,
  withTrainerSprite,
} from '../trainer/trainer-profile';
import {
  DevBadgesView,
  PARTY_SLOTS,
  TRAINER_CARD_VIEW_TYPE,
  TrainerCardLabels,
  TrainerCardStatus,
  TrainerCardViewModel,
  TrainerClassId,
  TrainerError,
  TrainerHostboundMessage,
  TrainerProfile,
  TrainerWebviewboundMessage,
} from '../trainer/trainer-types';
import { DevBadgeResolution, resolveDevBadges } from './dev-badge-service';
import { buildFriendshipTierLabels } from './friendship-labels';
import { resolveGithubProfile } from './trainer-github-service';
import {
  listPartnerCandidates,
  resolvePartnerPokemon,
  setPartnerNickname,
} from './trainer-partner';
import {
  buildTrainerSpriteCatalog,
  resolveTrainerSpriteUri,
} from './trainer-sprite-service';
import {
  clearDevCache,
  readTrainerProfile,
  syncTrainerProfile,
  writeTrainerProfile,
} from './trainer-storage';
import { getNonce } from './webview-util';
import { pickPartnerPokemon } from './partner-picker';
import { pokedevState } from './pokedev-state';

const GITHUB_USERNAME_SETTING = 'githubUsername';
const DEV_USERNAME_SETTING = 'devUsername';
const CONFIG_SECTION = 'pokedev';

/**
 * How long to coalesce progression pushes.
 *
 * Long enough that a burst of saves becomes one re-render - the webview
 * rebuilds its whole DOM per message - short enough that the card still feels
 * live while the user is watching it.
 */
const PROGRESSION_PUSH_THROTTLE_MS = 2000;

const DEV_RECORD_SETTING = 'trainerCard.showDevRecord';
const CODING_TIME_SETTING = 'trainerCard.showCodingTime';

/** Whether the card shows the GitHub-derived DEV RECORD block. */
export function isDevRecordVisible(): boolean {
  return vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<boolean>(DEV_RECORD_SETTING, true);
}

/**
 * Flips DEV RECORD visibility and persists it.
 *
 * Written globally rather than per workspace: whether you want your GitHub
 * stats on screen is a preference about you, not about a project.
 */
async function toggleDevRecordVisible(): Promise<void> {
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update(
      DEV_RECORD_SETTING,
      !isDevRecordVisible(),
      vscode.ConfigurationTarget.Global,
    );
}

/**
 * Whether the Trainer Record shows Coding Time.
 *
 * Off by default (see `pokedev.trainerCard.showCodingTime` in package.json):
 * Coding Time keeps accruing either way through
 * `ProgressionService.addCodingTime`/`flush` - this setting only governs
 * whether the card renders it.
 */
export function isCodingTimeVisible(): boolean {
  return vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<boolean>(CODING_TIME_SETTING, false);
}

const TRAINER_CARD_STYLE_SETTING = 'trainerCard.style';

/**
 * The user's chosen Trainer Card visual skin (`pokedev.trainerCard.style`).
 * Presentation only - see `src/common/trainer-card-style.ts` for the
 * catalog and `.tc-skin-*` in `media/trainer-card.css` for what each skin
 * actually changes.
 */
export function getConfiguredTrainerCardStyle(): TrainerCardStyle {
  const styleId = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<string>(TRAINER_CARD_STYLE_SETTING, DEFAULT_TRAINER_CARD_STYLE);
  return isValidTrainerCardStyle(styleId)
    ? styleId
    : DEFAULT_TRAINER_CARD_STYLE;
}

/** Only GitHub's avatar CDN is allowed as an image source. */
const AVATAR_HOSTS =
  'https://avatars.githubusercontent.com https://*.githubusercontent.com';

/**
 * DEV badge art is served from DEV's own media proxy, on a rotating set of
 * numbered subdomains (media0.dev.to, media1.dev.to, ...). A wildcard is the
 * only practical way to allow that without hard-coding a subdomain count that
 * DEV could change; it still restricts img loads to DEV's own domain rather
 * than opening img-src to the web.
 */
const DEV_BADGE_HOSTS = 'https://*.dev.to';

export function getConfiguredGithubUsername(): string {
  const value = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<string>(GITHUB_USERNAME_SETTING, '');
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The setting is declared with `"scope": "application"`, so it can only live in
 * user settings — Global is always the correct target and there is no
 * workspace override to reconcile.
 */
export async function setConfiguredGithubUsername(
  username: string,
): Promise<void> {
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update(
      GITHUB_USERNAME_SETTING,
      username,
      vscode.ConfigurationTarget.Global,
    );
}

/**
 * Prompts for a GitHub username. Returns undefined when cancelled.
 */
export async function promptForGithubUsername(): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: vscode.l10n.t('Connect your GitHub profile'),
    prompt: vscode.l10n.t(
      'Only public profile data is read. No authentication is used.',
    ),
    placeHolder: vscode.l10n.t('GitHub username'),
    value: getConfiguredGithubUsername(),
    ignoreFocusOut: true,
    validateInput: (input) => {
      const trimmed = input.trim();
      if (trimmed.length === 0) {
        return undefined;
      }
      return GITHUB_USERNAME_PATTERN.test(trimmed)
        ? undefined
        : vscode.l10n.t('That is not a valid GitHub username.');
    },
  });
  return value === undefined ? undefined : value.trim();
}

export function getConfiguredDevUsername(): string {
  const value = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<string>(DEV_USERNAME_SETTING, '');
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The setting is declared with `"scope": "application"`, mirroring
 * `pokedev.githubUsername` — see `setConfiguredGithubUsername`.
 */
export async function setConfiguredDevUsername(
  username: string,
): Promise<void> {
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update(DEV_USERNAME_SETTING, username, vscode.ConfigurationTarget.Global);
}

/**
 * Prompts for a DEV username. Returns undefined when cancelled.
 *
 * An empty submission is accepted as valid input (mirroring
 * `promptForGithubUsername`) and is treated as a disconnect by the caller.
 */
export async function promptForDevUsername(): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: vscode.l10n.t('Connect your DEV Community profile'),
    prompt: vscode.l10n.t(
      'Only your public DEV badges are read. No authentication is used.',
    ),
    placeHolder: vscode.l10n.t('DEV username'),
    value: getConfiguredDevUsername(),
    ignoreFocusOut: true,
    validateInput: (input) => {
      const trimmed = input.trim();
      if (trimmed.length === 0) {
        return undefined;
      }
      return DEV_USERNAME_PATTERN.test(trimmed)
        ? undefined
        : vscode.l10n.t('That is not a valid DEV username.');
    },
  });
  return value === undefined ? undefined : value.trim();
}

function getTrainerWebviewOptions(
  extensionUri: vscode.Uri,
): vscode.WebviewOptions & vscode.WebviewPanelOptions {
  return {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
  };
}

function localizeTrainerClass(id: TrainerClassId): string {
  switch (id) {
    case 'frontend':
      return vscode.l10n.t('Frontend Trainer');
    case 'research':
      return vscode.l10n.t('Research Trainer');
    case 'systems':
      return vscode.l10n.t('Systems Trainer');
    case 'fullstack':
      return vscode.l10n.t('Full-Stack Trainer');
    default:
      return vscode.l10n.t('Pokémon Trainer');
  }
}

/**
 * Every string the card renders. The webview has no access to `vscode.l10n`,
 * so labels are localized here and shipped inside the view model.
 */
function buildLabels(trainerClassId: TrainerClassId): TrainerCardLabels {
  return {
    brandLabel: vscode.l10n.t('PokéDev'),
    cardTitle: vscode.l10n.t('Trainer Card'),
    idLabel: vscode.l10n.t('ID No.'),
    trainerWord: vscode.l10n.t('Trainer'),
    levelLabel: vscode.l10n.t('Lv.'),
    partnerLevelLabel: vscode.l10n.t('Lv.'),
    partnerXpLabel: vscode.l10n.t('Partner XP'),
    changePartnerButton: vscode.l10n.t('Choose partner Pokemon'),
    changePartnerShort: vscode.l10n.t('Change Partner'),
    hideDevRecordButton: vscode.l10n.t('Hide Dev Record'),
    showDevRecordButton: vscode.l10n.t('Show Dev Record'),
    chooseTrainerButton: vscode.l10n.t('Choose Trainer Sprite'),
    chooseTrainerShort: vscode.l10n.t('Choose Trainer'),
    trainerSpriteSelectorHeading: vscode.l10n.t('Choose Trainer'),
    useThisTrainerButton: vscode.l10n.t('Use This Trainer'),
    cancelButton: vscode.l10n.t('Cancel'),
    useGithubAvatarButton: vscode.l10n.t('Use GitHub Avatar'),
    selectedTrainerLabel: vscode.l10n.t('Selected'),
    devRecordLabel: vscode.l10n.t('Dev Record'),
    reposLabel: vscode.l10n.t('Repos'),
    followersLabel: vscode.l10n.t('Followers'),
    followingLabel: vscode.l10n.t('Following'),
    starsLabel: vscode.l10n.t('Stars'),
    sinceLabel: vscode.l10n.t('Since'),
    specialtiesLabel: vscode.l10n.t('Specialties'),
    codingTimeLabel: vscode.l10n.t('Coding time'),
    xpLabel: vscode.l10n.t('Trainer XP'),
    partySectionLabel: vscode.l10n.t('Party'),
    emptyPartySlotLabel: vscode.l10n.t('Empty'),
    makePartnerHint: vscode.l10n.t('Make this your partner'),
    partnerLabel: vscode.l10n.t('Partner'),
    noPartnerLabel: vscode.l10n.t('No partner selected'),
    trainerClass: localizeTrainerClass(trainerClassId),
    jobLabel: vscode.l10n.t('Job'),
    fromLabel: vscode.l10n.t('From'),
    createTrainerHeading: vscode.l10n.t('Create trainer profile'),
    connectHint: vscode.l10n.t(
      'Your Trainer Card shows your public GitHub profile. No authentication is used and nothing is sent anywhere except GitHub.',
    ),
    usernamePlaceholder: vscode.l10n.t('GitHub username'),
    createTrainerButton: vscode.l10n.t('Create Trainer'),
    refreshShort: vscode.l10n.t('Refresh'),
    refreshButton: vscode.l10n.t('Refresh GitHub Profile'),
    changeTrainerShort: vscode.l10n.t('Change Trainer'),
    changeUsernameButton: vscode.l10n.t('Change GitHub Username'),
    closeButton: vscode.l10n.t('Close'),
    retryButton: vscode.l10n.t('Retry'),
    loadingHeading: vscode.l10n.t('Loading trainer data'),
    loadingLabel: vscode.l10n.t('Loading your Trainer Card…'),
    errorHeading: vscode.l10n.t('Trainer data unavailable'),
    invalidUsernameHint: vscode.l10n.t('Enter a GitHub username.'),
    staleNotice: vscode.l10n.t('Showing saved data — could not refresh.'),
    truncatedNotice: vscode.l10n.t(
      'Stars and languages are derived from your 100 most recently pushed repositories.',
    ),
    languageDerivationNotice: vscode.l10n.t(
      "Counted from each repository's primary language as reported by GitHub, excluding forks.",
    ),
    unknownValue: '—',

    badgesSectionLabel: vscode.l10n.t('Badges'),
    connectDevHint: vscode.l10n.t(
      'Connect your DEV profile to display earned badges.',
    ),
    connectDevButton: vscode.l10n.t('Connect DEV'),
    refreshDevBadgesShort: vscode.l10n.t('Refresh'),
    refreshDevBadgesButton: vscode.l10n.t('Refresh DEV Badges'),
    disconnectDevButton: vscode.l10n.t('Disconnect DEV'),
    unknownDevBadgeLabel: vscode.l10n.t('Dev badge'),
    noDevBadgesLabel: vscode.l10n.t('No public DEV badges found.'),
    devBadgesStaleNotice: vscode.l10n.t('Using cached DEV badges.'),
    shinyLabel: vscode.l10n.t('Shiny'),
    friendshipTierLabels: buildFriendshipTierLabels(),
  };
}

/**
 * The Trainer Card webview panel.
 *
 * Intentionally does not extend `PokemonWebviewContainer`: that base class is
 * entirely about Pokémon colour/type/size/theme state, none of which applies
 * here.
 *
 * `retainContextWhenHidden` is deliberately not set and `onDidChangeViewState`
 * is deliberately not wired. VS Code discards the webview DOM when the tab is
 * hidden and reloads the HTML on reveal; the bundle re-runs, posts
 * `trainer/ready`, and gets answered from cache. First open, tab reveal, and
 * window restore therefore all share one code path.
 */
export class TrainerCardPanel {
  public static currentPanel: TrainerCardPanel | undefined;
  public static readonly viewType = TRAINER_CARD_VIEW_TYPE;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];
  private _disposed = false;

  /**
   * The inputs behind the view model currently on screen.
   *
   * `_buildViewModel` takes the GitHub block purely from its `extras`, and
   * resolves the partner only when the status is 'connected'. A progression
   * push that did not restore these would therefore blank out both the DEV
   * RECORD section and the partner - so every send records what it sent, and
   * `notifyProgressionChanged` replays it with fresh progression.
   */
  private _lastStatus: TrainerCardStatus = 'loading';
  private _lastExtras: {
    github?: TrainerCardViewModel['github'];
    error?: TrainerError;
    stale?: boolean;
    fetchedAt?: number;
  } = {};

  /**
   * DEV badges are resolved independently of GitHub's status above (see
   * `_buildViewModel`), so they get their own "what produced the last render"
   * slot rather than living inside `_lastExtras`.
   */
  private _lastDevBadges: DevBadgesView = {
    status: 'disconnected',
    username: '',
    badges: [],
  };

  /** Coalesces bursts of XP events into one re-render. */
  private _pushTimer: ReturnType<typeof setTimeout> | undefined;

  public static createOrShow(context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (TrainerCardPanel.currentPanel) {
      TrainerCardPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      TrainerCardPanel.viewType,
      vscode.l10n.t('Trainer Card'),
      column ?? vscode.ViewColumn.One,
      getTrainerWebviewOptions(context.extensionUri),
    );

    TrainerCardPanel.currentPanel = new TrainerCardPanel(panel, context);
  }

  public static revive(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
  ): void {
    panel.webview.options = getTrainerWebviewOptions(context.extensionUri);
    TrainerCardPanel.currentPanel = new TrainerCardPanel(panel, context);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
  ) {
    this._panel = panel;
    this._context = context;

    this._panel.iconPath = {
      dark: vscode.Uri.joinPath(
        context.extensionUri,
        'media',
        'icon',
        'dark-trainer.svg',
      ),
      light: vscode.Uri.joinPath(
        context.extensionUri,
        'media',
        'icon',
        'light-trainer.svg',
      ),
    };

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    // Subscribe rather than being pushed to: progression, partner switches and
    // GitHub refreshes all arrive through the same hub the Explorer views use.
    this._disposables.push(
      pokedevState.onDidChange(() => this.notifyProgressionChanged()),
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (message: unknown) => {
        void this._handleMessage(message);
      },
      null,
      this._disposables,
    );
  }

  public dispose(): void {
    this._disposed = true;
    if (this._pushTimer !== undefined) {
      clearTimeout(this._pushTimer);
      this._pushTimer = undefined;
    }
    TrainerCardPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /** Re-fetches from GitHub, bypassing the cache. */
  public async refresh(): Promise<void> {
    await this._load({ forceRefresh: true });
  }

  /** Re-fetches DEV badges, bypassing the cache. Public for the command palette entry. */
  public async refreshDevBadges(): Promise<void> {
    await this._refreshDev();
  }

  /**
   * Clears the configured DEV username and cached badges. Public for the
   * command palette entry — routed through here rather than done directly in
   * extension.ts so the panel's in-memory `_lastDevBadges` (which storage
   * alone cannot update) clears too.
   */
  public async disconnectDev(): Promise<void> {
    await this._disconnectDev();
  }

  /**
   * Re-renders the card with current progression, without touching GitHub.
   *
   * Throttled: the webview rebuilds its entire DOM on every message, and a
   * burst of saves would otherwise mean a burst of full re-renders. Note that
   * a push while the tab is hidden is simply lost - the panel deliberately
   * does not set `retainContextWhenHidden` - which is harmless, because
   * revealing it makes the bundle re-request state from scratch.
   */
  public notifyProgressionChanged(): void {
    if (this._disposed || this._pushTimer !== undefined) {
      return;
    }
    this._pushTimer = setTimeout(() => {
      this._pushTimer = undefined;
      if (this._disposed) {
        return;
      }
      this._post({
        command: 'trainer/state',
        payload: this._buildViewModel(this._lastStatus, this._lastExtras),
      });
    }, PROGRESSION_PUSH_THROTTLE_MS);
  }

  private _post(message: TrainerWebviewboundMessage): void {
    if (this._disposed) {
      return;
    }
    void this._panel.webview.postMessage(message);
  }

  private async _handleMessage(raw: unknown): Promise<void> {
    const message = raw as TrainerHostboundMessage | undefined;
    if (!message || typeof message.command !== 'string') {
      return;
    }

    switch (message.command) {
      case 'trainer/ready':
        await this._load({ forceRefresh: false });
        return;

      case 'trainer/refresh':
        await this._load({ forceRefresh: true });
        return;

      case 'trainer/connect': {
        const username =
          typeof message.username === 'string' ? message.username.trim() : '';
        await this._connect(username);
        return;
      }

      case 'trainer/changeUsername': {
        const next = await promptForGithubUsername();
        if (next === undefined) {
          return;
        }
        await this._connect(next);
        return;
      }

      case 'trainer/changePartner': {
        if (await pickPartnerPokemon(this._context)) {
          this.notifyProgressionChanged();
        }
        return;
      }

      case 'trainer/selectPartner': {
        const nickname =
          typeof message.nickname === 'string' ? message.nickname : '';
        if (nickname.length === 0) {
          return;
        }
        // Goes straight to the same setter/notify pair `pickPartnerPokemon`
        // and the Explorer's own 'explorer/selectPartner' use - the card
        // already knows which nickname was clicked, so there is no picker to
        // show.
        await setPartnerNickname(this._context, nickname);
        pokedevState.notify('partner');
        return;
      }

      case 'trainer/toggleDevRecord':
        await toggleDevRecordVisible();
        // The configuration listener in extension.ts also refreshes on this
        // setting, but pushing here means the card updates even if that
        // listener is ever narrowed.
        this.notifyProgressionChanged();
        return;

      case 'trainer/selectTrainerSprite': {
        const spriteId =
          typeof message.spriteId === 'string' ? message.spriteId : '';
        if (spriteId.length === 0) {
          return;
        }
        await this._setTrainerSprite(spriteId);
        return;
      }

      case 'trainer/useGithubAvatar':
        await this._setTrainerSprite(null);
        return;

      case 'trainer/close':
        this.dispose();
        return;

      case 'trainer/connectDev': {
        const next = await promptForDevUsername();
        if (next === undefined) {
          return;
        }
        await this._connectDev(next);
        return;
      }

      case 'trainer/refreshDev':
        await this._refreshDev();
        return;

      case 'trainer/disconnectDev':
        await this._disconnectDev();
        return;
    }
  }

  private async _connect(username: string): Promise<void> {
    if (!isValidGithubUsername(username)) {
      this._post({
        command: 'trainer/state',
        payload: this._buildViewModel('onboarding', {
          error: {
            kind: 'invalid-username',
            message: vscode.l10n.t('That is not a valid GitHub username.'),
            retryable: false,
          },
        }),
      });
      return;
    }

    this._post({
      command: 'trainer/state',
      payload: this._buildViewModel('loading'),
    });

    const resolution = await resolveGithubProfile(this._context, username, {
      forceRefresh: true,
    });

    // A username that GitHub does not recognise is a typo, not a broken
    // connection: keep the user on the form instead of persisting it.
    if (
      resolution.error &&
      !resolution.data &&
      (resolution.error.kind === 'not-found' ||
        resolution.error.kind === 'invalid-username')
    ) {
      this._post({
        command: 'trainer/state',
        payload: this._buildViewModel('onboarding', {
          error: resolution.error,
        }),
      });
      return;
    }

    await setConfiguredGithubUsername(username);
    await this._emit(username, resolution);
  }

  private async _load(options: { forceRefresh: boolean }): Promise<void> {
    const username = getConfiguredGithubUsername();
    if (username.length === 0) {
      this._post({
        command: 'trainer/state',
        payload: this._buildViewModel('onboarding'),
      });
      return;
    }

    this._post({
      command: 'trainer/state',
      payload: this._buildViewModel('loading'),
    });

    const resolution = await resolveGithubProfile(this._context, username, {
      forceRefresh: options.forceRefresh,
    });
    await this._emit(username, resolution);
  }

  private async _emit(
    username: string,
    resolution: Awaited<ReturnType<typeof resolveGithubProfile>>,
  ): Promise<void> {
    if (this._disposed) {
      return;
    }

    const profile = await syncTrainerProfile(
      this._context,
      Date.now(),
      username,
    );

    const status: TrainerCardStatus = resolution.data ? 'connected' : 'error';

    // DEV badges live in the full card body, which only renders for
    // 'connected'. Cache-preferring (forceRefresh: false), so opening the
    // card does not re-fetch DEV every time - see resolveDevBadges/DEV_CACHE_TTL_MS.
    const devBadges =
      status === 'connected'
        ? await this._resolveDevBadgesView(false)
        : undefined;
    if (this._disposed) {
      return;
    }

    this._post({
      command: 'trainer/state',
      payload: this._buildViewModel(status, {
        profile,
        github: resolution.data,
        error: resolution.error,
        stale: resolution.stale,
        fetchedAt: resolution.fetchedAt,
        devBadges,
      }),
    });
  }

  /** Resolves the DEV badges view for whatever username is currently configured. */
  private async _resolveDevBadgesView(
    forceRefresh: boolean,
  ): Promise<DevBadgesView> {
    const username = getConfiguredDevUsername();
    if (username.length === 0) {
      return { status: 'disconnected', username: '', badges: [] };
    }
    const resolution = await resolveDevBadges(this._context, username, {
      forceRefresh,
    });
    return this._toDevBadgesView(username, resolution);
  }

  private _toDevBadgesView(
    username: string,
    resolution: DevBadgeResolution,
  ): DevBadgesView {
    if (resolution.badges) {
      return {
        status: 'connected',
        username,
        badges: resolution.badges,
        error: resolution.error,
        stale: resolution.stale,
        fetchedAt: resolution.fetchedAt,
      };
    }
    return { status: 'error', username, badges: [], error: resolution.error };
  }

  /** Pushes a DEV-badges-only update, reusing whatever GitHub state was last rendered. */
  private _pushDevBadges(devBadges: DevBadgesView): void {
    if (this._disposed) {
      return;
    }
    this._post({
      command: 'trainer/state',
      payload: this._buildViewModel(this._lastStatus, {
        ...this._lastExtras,
        devBadges,
      }),
    });
  }

  private async _connectDev(username: string): Promise<void> {
    if (username.length === 0) {
      // An empty submission clears the field rather than erroring — treat it
      // the same as the explicit Disconnect action.
      await this._disconnectDev();
      return;
    }
    if (!isValidDevUsername(username)) {
      this._pushDevBadges({
        status: 'error',
        username,
        badges: [],
        error: {
          kind: 'invalid-username',
          message: vscode.l10n.t('That is not a valid DEV username.'),
          retryable: false,
        },
      });
      return;
    }

    this._pushDevBadges({ status: 'loading', username, badges: [] });

    const resolution = await resolveDevBadges(this._context, username, {
      forceRefresh: true,
    });
    if (this._disposed) {
      return;
    }

    // A username DEV does not recognise is a typo, not a broken connection:
    // do not persist it, mirroring `_connect`'s handling of GitHub 404s.
    if (
      resolution.error &&
      !resolution.badges &&
      (resolution.error.kind === 'not-found' ||
        resolution.error.kind === 'invalid-username')
    ) {
      this._pushDevBadges({
        status: 'error',
        username,
        badges: [],
        error: resolution.error,
      });
      return;
    }

    await setConfiguredDevUsername(username);
    this._pushDevBadges(this._toDevBadgesView(username, resolution));
  }

  /** Re-fetches DEV badges, bypassing the cache. */
  private async _refreshDev(): Promise<void> {
    const username = getConfiguredDevUsername();
    if (username.length === 0) {
      return;
    }
    this._pushDevBadges({ status: 'loading', username, badges: [] });
    const resolution = await resolveDevBadges(this._context, username, {
      forceRefresh: true,
    });
    if (this._disposed) {
      return;
    }
    this._pushDevBadges(this._toDevBadgesView(username, resolution));
  }

  private async _disconnectDev(): Promise<void> {
    await setConfiguredDevUsername('');
    await clearDevCache(this._context);
    this._pushDevBadges({ status: 'disconnected', username: '', badges: [] });
  }

  /**
   * Persists the chosen Trainer Sprite (or `null` to fall back to the
   * GitHub avatar) and notifies every surface - the full card and the
   * Explorer Trainer HUD both read the same `profile.trainerSpriteId`, so
   * one canonical selection is all that ever needs writing.
   */
  private async _setTrainerSprite(spriteId: string | null): Promise<void> {
    const now = Date.now();
    const profile = readTrainerProfile(
      this._context,
      now,
      getConfiguredGithubUsername(),
    );
    await writeTrainerProfile(
      this._context,
      withTrainerSprite(profile, spriteId),
    );
    pokedevState.notify('github');
  }

  private _buildViewModel(
    status: TrainerCardStatus,
    extras: {
      profile?: TrainerProfile;
      github?: TrainerCardViewModel['github'];
      error?: TrainerError;
      stale?: boolean;
      fetchedAt?: number;
      devBadges?: DevBadgesView;
    } = {},
  ): TrainerCardViewModel {
    const now = Date.now();
    const profile =
      extras.profile ??
      readTrainerProfile(this._context, now, getConfiguredGithubUsername());

    if (extras.devBadges) {
      this._lastDevBadges = extras.devBadges;
    }

    // Remember what produced this render so a later progression-only push can
    // reproduce everything except the numbers that changed.
    this._lastStatus = status;
    this._lastExtras = {
      github: extras.github,
      error: extras.error,
      stale: extras.stale,
      fetchedAt: extras.fetchedAt,
    };
    const trainerClassId = computeTrainerClass(
      extras.github ? extras.github.topLanguages : undefined,
    );

    return {
      status,
      labels: buildLabels(trainerClassId),
      profile,
      tier: getTrainerCardTier(profile.trainerLevel),
      style: getConfiguredTrainerCardStyle(),
      xpForNextLevel: getXpForNextTrainerLevel(profile.trainerLevel),
      showDevRecord: isDevRecordVisible(),
      showCodingTime: isCodingTimeVisible(),
      party:
        status === 'connected'
          ? pokedevState
              .buildPartyEntries(this._context, this._panel.webview)
              .slice(0, PARTY_SLOTS)
          : [],
      totalPartnerCandidates:
        status === 'connected'
          ? listPartnerCandidates(this._context).length
          : 0,
      trainerSpriteUri: resolveTrainerSpriteUri(
        this._panel.webview,
        this._context.extensionUri,
        profile.trainerSpriteId,
      ),
      trainerSpriteCatalog: buildTrainerSpriteCatalog(
        this._panel.webview,
        this._context.extensionUri,
      ),
      github: extras.github,
      partner:
        status === 'connected'
          ? resolvePartnerPokemon(
              this._context,
              this._panel.webview,
              this._context.extensionUri,
            )
          : undefined,
      error: extras.error,
      stale: extras.stale,
      fetchedAt: extras.fetchedAt,
      devBadges: this._lastDevBadges,
    };
  }

  /**
   * A static shell: an empty container plus the bundle. No dynamic value is
   * ever interpolated into this HTML — the webview builds the card from the
   * view model using textContent, so third-party GitHub strings cannot inject
   * markup.
   *
   * The CSP is tighter than the Pokémon panel's: `default-src 'none'` with no
   * `connect-src` means the webview cannot reach api.github.com at all, and
   * img-src is limited to GitHub's avatar CDN rather than all of https:.
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    const media = (name: string) =>
      webview.asWebviewUri(
        vscode.Uri.joinPath(this._context.extensionUri, 'media', name),
      );

    const scriptUri = media('trainer-card-bundle.js');
    const resetUri = media('reset.css');
    const tokensUri = media('pokedev-tokens.css');
    const cardUri = media('trainer-card.css');
    const fontUri = media('Silkscreen-Regular.ttf');
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; img-src ${webview.cspSource} ${AVATAR_HOSTS} ${DEV_BADGE_HOSTS}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${resetUri}" rel="stylesheet" nonce="${nonce}">
    <link href="${tokensUri}" rel="stylesheet" nonce="${nonce}">
    <link href="${cardUri}" rel="stylesheet" nonce="${nonce}">
    <style nonce="${nonce}">
    @font-face {
        font-family: 'silkscreen';
        src: url('${fontUri}') format('truetype');
        font-display: swap;
    }
    </style>
    <title>Trainer Card</title>
</head>
<body>
    <div id="trainer-root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
    <script nonce="${nonce}">
        trainerCardApp.trainerCardApp();
    </script>
</body>
</html>`;
  }
}
