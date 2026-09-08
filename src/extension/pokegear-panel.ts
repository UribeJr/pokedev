/**
 * PokeGear: a dedicated full editor panel that reads the SAME state as the
 * Trainer Card, the Explorer views, Daily Challenges and Dev Badges. No new
 * persistence beyond one cosmetic UI preference (the last-selected tab, see
 * `POKEGEAR_LAST_TAB_KEY`) and no new calculations - every number rendered
 * here is copied from an existing view-model builder in `pokedev-state.ts`
 * or derived read-only from the existing progression log
 * (`pokegear-activity.ts`).
 *
 * Structurally a near-mirror of `TrainerCardPanel`: singleton `currentPanel`,
 * `createOrShow`/`revive`, a webview built from the same `pokedev-tokens.css`
 * + a Crystal-only stylesheet, and the same `pokedevState.onDidChange`
 * subscription every other surface already uses for live updates - no
 * polling anywhere.
 */
import * as vscode from 'vscode';
import { isValidItemId } from '../common/items';
import { resolveDevBadgesView } from './dev-badge-service';
import { useEvolutionStoneOnPokemon } from './evolution-flow';
import { getConfiguredDevUsername } from './trainer-card-panel';
import { pokedevState } from './pokedev-state';
import { readProgressionLog } from './progression-storage';
import { buildPokeGearActivityView } from '../pokegear/pokegear-activity';
import {
  POKEGEAR_TABS,
  POKEGEAR_VIEW_TYPE,
  PokeGearHostboundMessage,
  PokeGearLabels,
  PokeGearTab,
  PokeGearViewModel,
} from '../pokegear/pokegear-types';
import { PARTY_SLOTS } from '../trainer/trainer-types';
import { listPartnerCandidates, setPartnerNickname } from './trainer-partner';
import { getNonce } from './webview-util';
import { POKEGEAR_LAST_TAB_KEY } from '../common/storage-keys';
import { TrainerCardPanel } from './trainer-card-panel';

/** Only DEV's own badge image CDN is allowed as an image source - see
 * `trainer-card-panel.ts`'s identical `DEV_BADGE_HOSTS` for why a wildcard
 * subdomain is the only practical allowance. */
const DEV_BADGE_HOSTS = 'https://*.dev.to';

function isPokeGearTab(value: unknown): value is PokeGearTab {
  return (
    typeof value === 'string' &&
    (POKEGEAR_TABS as readonly string[]).includes(value)
  );
}

function readLastTab(context: vscode.ExtensionContext): PokeGearTab {
  const stored = context.globalState.get<string>(POKEGEAR_LAST_TAB_KEY);
  return isPokeGearTab(stored) ? stored : 'status';
}

function buildPokeGearLabels(): PokeGearLabels {
  return {
    panelTitle: vscode.l10n.t('PokéGear'),
    tabStatus: vscode.l10n.t('Status'),
    tabActivity: vscode.l10n.t('Activity'),
    tabParty: vscode.l10n.t('Party'),
    tabBadges: vscode.l10n.t('Badges'),
    tabBag: vscode.l10n.t('Bag'),
    trainerLabel: vscode.l10n.t('Trainer'),
    levelLabel: vscode.l10n.t('Lv.'),
    xpLabel: vscode.l10n.t('Trainer XP'),
    codingTimeLabel: vscode.l10n.t('Coding Time'),
    partnerLabel: vscode.l10n.t('Partner'),
    noPartnerLabel: vscode.l10n.t('No partner selected'),
    dailyLabel: vscode.l10n.t('Daily Challenges'),
    badgesLabel: vscode.l10n.t('Badges'),
    badgesEarnedLabel: vscode.l10n.t('Earned'),
    todayLabel: vscode.l10n.t('Today'),
    commitsLabel: vscode.l10n.t('Commits'),
    devActionsLabel: vscode.l10n.t('Dev Actions'),
    recentActivityLabel: vscode.l10n.t('Recent Activity'),
    noActivityLabel: vscode.l10n.t('No recent activity yet.'),
    noDevBadgesLabel: vscode.l10n.t('No Dev Badges yet.'),
    connectDevHint: vscode.l10n.t(
      'Connect a DEV Community username on the Trainer Card to show badges here.',
    ),
    makePartnerButton: vscode.l10n.t('Make Partner'),
    openTrainerCardButton: vscode.l10n.t('Open Trainer Card'),
    closeButton: vscode.l10n.t('Close'),
    refreshButton: vscode.l10n.t('Refresh'),
    shinyLabel: vscode.l10n.t('Shiny'),
    unknownValue: vscode.l10n.t('—'),
    useButton: vscode.l10n.t('Use'),
    cancelButton: vscode.l10n.t('Cancel'),
    yesButton: vscode.l10n.t('Yes'),
    noButton: vscode.l10n.t('No'),
    useItemOnLabel: vscode.l10n.t('Use {0} on:'),
    confirmUseItemLabel: vscode.l10n.t('Use {0} on {1}?'),
    noEffectLabel: vscode.l10n.t("It won't have any effect."),
  };
}

function getPokeGearWebviewOptions(
  extensionUri: vscode.Uri,
): vscode.WebviewOptions & vscode.WebviewPanelOptions {
  return {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
  };
}

export class PokeGearPanel {
  public static currentPanel: PokeGearPanel | undefined;
  public static readonly viewType = POKEGEAR_VIEW_TYPE;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private readonly _disposables: vscode.Disposable[] = [];
  private _disposed = false;
  private _activeTab: PokeGearTab;

  public static createOrShow(context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (PokeGearPanel.currentPanel) {
      PokeGearPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      PokeGearPanel.viewType,
      vscode.l10n.t('PokéGear'),
      column ?? vscode.ViewColumn.One,
      getPokeGearWebviewOptions(context.extensionUri),
    );

    PokeGearPanel.currentPanel = new PokeGearPanel(panel, context);
  }

  public static revive(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
  ): void {
    panel.webview.options = getPokeGearWebviewOptions(context.extensionUri);
    PokeGearPanel.currentPanel = new PokeGearPanel(panel, context);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
  ) {
    this._panel = panel;
    this._context = context;
    this._activeTab = readLastTab(context);

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    // Same hub every other PokeDev surface subscribes to - progression,
    // partner switches, GitHub/DEV refreshes and Daily Challenge completions
    // all arrive through this one event, never polling.
    this._disposables.push(
      pokedevState.onDidChange(() => {
        void this._push();
      }),
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
    PokeGearPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /** Pushes a fresh view model, e.g. in response to `pokedevState.onDidChange`. */
  private async _push(): Promise<void> {
    if (this._disposed) {
      return;
    }
    const payload = await this._buildViewModel();
    if (this._disposed) {
      return;
    }
    void this._panel.webview.postMessage({
      command: 'pokegear/state',
      payload,
    });
  }

  private async _handleMessage(raw: unknown): Promise<void> {
    const message = raw as PokeGearHostboundMessage;
    if (!message || typeof message.command !== 'string') {
      return;
    }

    switch (message.command) {
      case 'pokegear/ready':
        await this._push();
        return;

      case 'pokegear/setActiveTab': {
        if (!isPokeGearTab(message.tab)) {
          return;
        }
        this._activeTab = message.tab;
        // Fire-and-forget: a cosmetic preference, not worth blocking the UI
        // switch on the write completing.
        void this._context.globalState.update(
          POKEGEAR_LAST_TAB_KEY,
          message.tab,
        );
        return;
      }

      case 'pokegear/openTrainerCard':
        TrainerCardPanel.createOrShow(this._context);
        return;

      case 'pokegear/refreshDevBadges':
        // forceRefresh: true, mirroring the Trainer Card's own Refresh
        // action - the one place PokeGear is allowed to actually re-fetch
        // rather than read cache, and only on explicit user request.
        await resolveDevBadgesView(this._context, getConfiguredDevUsername(), {
          forceRefresh: true,
        });
        await this._push();
        return;

      case 'pokegear/selectPartner': {
        const nickname =
          typeof message.nickname === 'string' ? message.nickname : '';
        if (nickname.length === 0) {
          return;
        }
        // The exact same setter/notify pair the Trainer Card's own PARTY
        // grid and the Explorer's partner selection already use - see
        // `trainer-card-panel.ts`'s `trainer/selectPartner` case.
        await setPartnerNickname(this._context, nickname);
        pokedevState.notify('partner');
        return;
      }

      case 'pokegear/useItem': {
        const itemId = typeof message.itemId === 'string' ? message.itemId : '';
        const nickname =
          typeof message.nickname === 'string' ? message.nickname : '';
        if (!isValidItemId(itemId) || nickname.length === 0) {
          return;
        }
        // `useEvolutionStoneOnPokemon` re-validates everything itself
        // (quantity, target, rule) rather than trusting the webview's last
        // rendered state - the collection or Bag can change between that
        // render and this click. Its own `pokedevState.notify('inventory')`
        // on success already triggers this panel's push; nothing further is
        // needed here for any outcome, including a no-op one.
        await useEvolutionStoneOnPokemon(this._context, itemId, nickname);
        return;
      }

      case 'pokegear/close':
        this._panel.dispose();
        return;

      default:
        return;
    }
  }

  private async _buildViewModel(): Promise<PokeGearViewModel> {
    const context = this._context;
    const webview = this._panel.webview;
    const now = Date.now();

    // Every one of these is an EXISTING builder already used by the Trainer
    // Card and/or the Explorer views - see the module doc comment.
    const trainerView = pokedevState.buildTrainerView(context, webview);
    const dailyView = pokedevState.buildDailyChallengesView(context);
    const party = pokedevState
      .buildPartyEntries(context, webview)
      .slice(0, PARTY_SLOTS);
    const totalPartnerCandidates = listPartnerCandidates(context).length;

    const devBadges = await resolveDevBadgesView(
      context,
      getConfiguredDevUsername(),
      { forceRefresh: false },
    );

    const activity = buildPokeGearActivityView(
      readProgressionLog(context),
      dailyView.completedCount,
      dailyView.totalCount,
      now,
    );

    return {
      activeTab: this._activeTab,
      labels: buildPokeGearLabels(),
      status: {
        connected: trainerView.connected,
        trainerName: trainerView.displayName,
        trainerLevel: trainerView.trainerLevel,
        trainerXp: trainerView.trainerXp,
        xpForNextLevel: trainerView.xpForNextLevel,
        totalCodingTimeMs: trainerView.totalCodingTimeMs,
        partner: trainerView.partner,
        dailyCompletedCount: dailyView.completedCount,
        dailyTotalCount: dailyView.totalCount,
        devBadgesEarned: trainerView.devBadgesEarned,
      },
      activity,
      badges: { devBadges },
      party: { party, totalPartnerCandidates },
      bag: pokedevState.buildBagView(context),
    };
  }

  /**
   * A static shell: an empty container plus the bundle, exactly like
   * `TrainerCardPanel`'s own `_getHtmlForWebview` - no dynamic value is ever
   * interpolated into this HTML, the webview builds everything from the
   * view model using textContent.
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    const media = (name: string) =>
      webview.asWebviewUri(
        vscode.Uri.joinPath(this._context.extensionUri, 'media', name),
      );

    const scriptUri = media('pokegear-bundle.js');
    const resetUri = media('reset.css');
    const tokensUri = media('pokedev-tokens.css');
    // Reused wholesale, not duplicated: `.tc-section`/`.tc-xp-track`/
    // `.tc-badges-grid`/`.tc-party-sprite`/etc are all defined once in the
    // Trainer Card's own stylesheet (including its `.tc-skin-crystal`
    // rules) - see the module doc comment on why PokeGear is Crystal-only.
    const cardUri = media('trainer-card.css');
    const gearUri = media('pokegear.css');
    const fontUri = media('Silkscreen-Regular.ttf');
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; img-src ${webview.cspSource} ${DEV_BADGE_HOSTS}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${resetUri}" rel="stylesheet" nonce="${nonce}">
    <link href="${tokensUri}" rel="stylesheet" nonce="${nonce}">
    <link href="${cardUri}" rel="stylesheet" nonce="${nonce}">
    <link href="${gearUri}" rel="stylesheet" nonce="${nonce}">
    <style nonce="${nonce}">
    @font-face {
        font-family: 'silkscreen';
        src: url('${fontUri}') format('truetype');
        font-display: swap;
    }
    </style>
    <title>PokéGear</title>
</head>
<body>
    <div id="pokegear-root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
    <script nonce="${nonce}">
        pokeGearApp.pokeGearApp();
    </script>
</body>
</html>`;
  }
}
