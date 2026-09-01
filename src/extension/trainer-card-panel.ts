import * as vscode from 'vscode';
import {
  GITHUB_USERNAME_PATTERN,
  isValidGithubUsername,
} from '../trainer/github-parse';
import { computeTrainerClass } from '../trainer/trainer-class';
import {
  getTrainerCardTier,
  getXpForNextTrainerLevel,
} from '../trainer/trainer-profile';
import {
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
import { resolveGithubProfile } from './trainer-github-service';
import { resolvePartnerPokemon } from './trainer-partner';
import { readTrainerProfile, syncTrainerProfile } from './trainer-storage';
import { getNonce } from './webview-util';
import { pickPartnerPokemon } from './partner-picker';
import { pokedevState } from './pokedev-state';

const GITHUB_USERNAME_SETTING = 'githubUsername';
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

/** Only GitHub's avatar CDN is allowed as an image source. */
const AVATAR_HOSTS =
  'https://avatars.githubusercontent.com https://*.githubusercontent.com';

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
    devRecordLabel: vscode.l10n.t('Dev Record'),
    reposLabel: vscode.l10n.t('Repos'),
    followersLabel: vscode.l10n.t('Followers'),
    followingLabel: vscode.l10n.t('Following'),
    starsLabel: vscode.l10n.t('Stars'),
    sinceLabel: vscode.l10n.t('Since'),
    specialtiesLabel: vscode.l10n.t('Specialties'),
    trainerRecordLabel: vscode.l10n.t('Trainer Record'),
    pokedexLabel: vscode.l10n.t('Pokédex'),
    caughtSuffix: vscode.l10n.t('caught'),
    shiniesLabel: vscode.l10n.t('Shinies'),
    badgesLabel: vscode.l10n.t('Badges'),
    codingTimeLabel: vscode.l10n.t('Coding time'),
    xpLabel: vscode.l10n.t('Trainer XP'),
    partnerLabel: vscode.l10n.t('Partner'),
    noPartnerLabel: vscode.l10n.t('No partner selected'),
    trainerClass: localizeTrainerClass(trainerClassId),
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

      case 'trainer/toggleDevRecord':
        await toggleDevRecordVisible();
        // The configuration listener in extension.ts also refreshes on this
        // setting, but pushing here means the card updates even if that
        // listener is ever narrowed.
        this.notifyProgressionChanged();
        return;

      case 'trainer/close':
        this.dispose();
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
    this._post({
      command: 'trainer/state',
      payload: this._buildViewModel(status, {
        profile,
        github: resolution.data,
        error: resolution.error,
        stale: resolution.stale,
        fetchedAt: resolution.fetchedAt,
      }),
    });
  }

  private _buildViewModel(
    status: TrainerCardStatus,
    extras: {
      profile?: TrainerProfile;
      github?: TrainerCardViewModel['github'];
      error?: TrainerError;
      stale?: boolean;
      fetchedAt?: number;
    } = {},
  ): TrainerCardViewModel {
    const now = Date.now();
    const profile =
      extras.profile ??
      readTrainerProfile(this._context, now, getConfiguredGithubUsername());

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
      xpForNextLevel: getXpForNextTrainerLevel(profile.trainerLevel),
      showDevRecord: isDevRecordVisible(),
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
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; img-src ${webview.cspSource} ${AVATAR_HOSTS}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
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
