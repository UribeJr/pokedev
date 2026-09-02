/**
 * The two compact PokeDev views inside the built-in Explorer.
 *
 * Both are `WebviewViewProvider`s rather than `TreeDataProvider`s because both
 * need sprites, XP bars and the retro card styling — none of which a tree can
 * express.
 *
 * Neither reads storage directly and neither knows the other exists. They
 * subscribe to `pokedevState`, ask it for a view model, and route every action
 * back through the existing services. Adding a third view means adding a file,
 * not editing these.
 *
 * Both share one bundle (`media/explorer-bundle.js`) and one stylesheet, so
 * the compact styling lives in one place instead of two.
 */
import * as vscode from 'vscode';
import {
  ExplorerHostboundMessage,
  ExplorerWebviewboundMessage,
  POKEMON_EXPLORER_VIEW_TYPE,
  TRAINER_EXPLORER_VIEW_TYPE,
} from '../trainer/explorer-types';
import { showStatusMessage } from './progression-service';
import { pickPartnerPokemon } from './partner-picker';
import { pokedevState } from './pokedev-state';
import {
  isExpShareEnabled,
  setExpShareEnabled,
  setPartnerNickname,
} from './trainer-partner';
import {
  promptForGithubUsername,
  setConfiguredGithubUsername,
  TrainerCardPanel,
} from './trainer-card-panel';
import { getNonce } from './webview-util';

/**
 * How long to coalesce state pushes.
 *
 * XP events arrive in bursts — a batch and a commit land together — and each
 * push rebuilds the view's DOM. Two seconds is short enough to feel live while
 * collapsing a burst into one render.
 */
const PUSH_THROTTLE_MS = 2000;

/**
 * Shared plumbing for both Explorer views.
 *
 * Subclasses supply only a view type, the bootstrap call, and how to build
 * their own payload; everything else — HTML shell, CSP, throttling, lifecycle,
 * subscription — is identical and lives here once.
 */
abstract class PokedevExplorerViewProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  protected _view?: vscode.WebviewView;
  private readonly _disposables: vscode.Disposable[] = [];
  private _pushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(protected readonly _context: vscode.ExtensionContext) {
    this._disposables.push(pokedevState.onDidChange(() => this.schedulePush()));
  }

  /** The bootstrap function exported by the shared bundle. */
  protected abstract get bootstrap(): string;
  protected abstract buildMessage(
    webview: vscode.Webview,
  ): ExplorerWebviewboundMessage;

  public resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = {
      enableScripts: true,
      // Only this extension's media directory is reachable. No node_modules,
      // no workspace files.
      localResourceRoots: [
        vscode.Uri.joinPath(this._context.extensionUri, 'media'),
      ],
    };
    view.webview.html = this._html(view.webview);

    view.webview.onDidReceiveMessage(
      (raw: unknown) => {
        void this._handleMessage(raw);
      },
      null,
      this._disposables,
    );

    // VS Code discards the DOM when a view is collapsed and rebuilds it on
    // expand. The bundle re-announces itself on load, so state is restored
    // from the services rather than from any cache of our own.
    view.onDidChangeVisibility(
      () => {
        if (view.visible) {
          this.push();
        }
      },
      null,
      this._disposables,
    );

    view.onDidDispose(
      () => {
        this._view = undefined;
      },
      null,
      this._disposables,
    );
  }

  /** Sends current state now, if the view exists and is visible. */
  public push(): void {
    const view = this._view;
    if (!view || !view.visible) {
      // A hidden view would drop the message; it re-asks on becoming visible.
      return;
    }
    void view.webview.postMessage(this.buildMessage(view.webview));
  }

  public schedulePush(): void {
    if (this._pushTimer !== undefined) {
      return;
    }
    this._pushTimer = setTimeout(() => {
      this._pushTimer = undefined;
      this.push();
    }, PUSH_THROTTLE_MS);
  }

  public dispose(): void {
    if (this._pushTimer !== undefined) {
      clearTimeout(this._pushTimer);
      this._pushTimer = undefined;
    }
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables.length = 0;
  }

  private async _handleMessage(raw: unknown): Promise<void> {
    const message = raw as ExplorerHostboundMessage | undefined;
    if (!message || typeof message.command !== 'string') {
      return;
    }

    switch (message.command) {
      case 'explorer/ready':
        this.push();
        return;

      case 'explorer/openFullCard':
        // Reuses the existing command, so the full card keeps its single
        // creation path and stays exactly as polished as it was.
        await vscode.commands.executeCommand('pokedev.openTrainerCard');
        return;

      case 'explorer/refresh':
        await vscode.commands.executeCommand('pokedev.refresh-github-profile');
        return;

      case 'explorer/changePartner':
        if (await pickPartnerPokemon(this._context)) {
          pokedevState.notify('partner');
        }
        return;

      case 'explorer/connect': {
        const username = await promptForGithubUsername();
        if (username === undefined) {
          return;
        }
        await setConfiguredGithubUsername(username);
        TrainerCardPanel.currentPanel?.refresh().then(undefined, () => {
          // A failed refresh already surfaces on the card itself.
        });
        pokedevState.notify('github');
        return;
      }

      case 'explorer/selectPartner': {
        if (typeof message.nickname !== 'string' || !message.nickname) {
          return;
        }
        // Straight through the same setter the picker uses; there is exactly
        // one partner state in the extension.
        await setPartnerNickname(this._context, message.nickname);
        pokedevState.notify('partner');
        return;
      }

      case 'explorer/toggleExpShare': {
        const next = !isExpShareEnabled();
        await setExpShareEnabled(next);
        // Mirrors the `pokedev.toggle-dev-record` command: a transient
        // status-bar note, not a toast or a modal notification, for a
        // preference change nobody needs to acknowledge.
        showStatusMessage(
          next
            ? vscode.l10n.t('EXP Share turned on!')
            : vscode.l10n.t('EXP Share turned off!'),
        );
        pokedevState.notify('progression');
        return;
      }
    }
  }

  /**
   * A static shell: an empty root plus the shared bundle.
   *
   * No value is ever interpolated into this HTML — the webview builds its DOM
   * from the view model with `textContent`, so a GitHub display name cannot
   * inject markup. The CSP has no `connect-src`, so the platform (not
   * convention) enforces that these views never reach the network.
   */
  private _html(webview: vscode.Webview): string {
    const media = (file: string) =>
      webview.asWebviewUri(
        vscode.Uri.joinPath(this._context.extensionUri, 'media', file),
      );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; img-src ${webview.cspSource} https://avatars.githubusercontent.com https://*.githubusercontent.com; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${media('reset.css')}" rel="stylesheet" nonce="${nonce}">
    <link href="${media('pokedev-tokens.css')}" rel="stylesheet" nonce="${nonce}">
    <link href="${media('explorer.css')}" rel="stylesheet" nonce="${nonce}">
    <style nonce="${nonce}">
    @font-face {
        font-family: 'silkscreen';
        src: url('${media('Silkscreen-Regular.ttf')}') format('truetype');
        font-display: swap;
    }
    </style>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${media('explorer-bundle.js')}"></script>
    <script nonce="${nonce}">${this.bootstrap}</script>
</body>
</html>`;
  }
}

/** The compact trainer HUD: identity, level, XP, coding time, partner. */
export class TrainerExplorerViewProvider extends PokedevExplorerViewProvider {
  public static readonly viewType = TRAINER_EXPLORER_VIEW_TYPE;

  protected get bootstrap(): string {
    return 'pokedevExplorer.trainerView();';
  }
  protected buildMessage(webview: vscode.Webview): ExplorerWebviewboundMessage {
    return {
      command: 'explorer/trainerState',
      payload: pokedevState.buildTrainerView(this._context, webview),
    };
  }
}

/** The team list, with partner selection. */
export class PokemonExplorerViewProvider extends PokedevExplorerViewProvider {
  public static readonly viewType = POKEMON_EXPLORER_VIEW_TYPE;

  protected get bootstrap(): string {
    return 'pokedevExplorer.pokemonView();';
  }
  protected buildMessage(webview: vscode.Webview): ExplorerWebviewboundMessage {
    return {
      command: 'explorer/pokemonState',
      payload: pokedevState.buildPokemonView(this._context, webview),
    };
  }
}
