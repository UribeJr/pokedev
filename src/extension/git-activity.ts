/**
 * Commit detection via the built-in Git extension.
 *
 * Uses `vscode.git`'s exported API and its repository state change event -
 * there is no polling, no `git` process spawned, and no filesystem watching.
 * When the extension is unavailable (it is disabled, or we are running as a
 * web extension where it does not exist) this quietly does nothing rather than
 * degrading to something worse.
 *
 * The Git extension's API is not published as types, so the few shapes used
 * here are declared structurally rather than pulled in as a dependency.
 */
import * as vscode from 'vscode';
import {
  createProgressionEvent,
  ProgressionService,
} from './progression-service';
import { readRewardedCommits, rememberCommit } from './progression-storage';

/* The narrow slice of the Git extension API this file relies on. */

interface GitRepositoryState {
  // `HEAD` is the Git extension's own property name; renaming it would stop
  // matching its API.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  HEAD?: { commit?: string; name?: string };
  onDidChange: (listener: () => void) => vscode.Disposable;
}

interface GitRepository {
  rootUri: vscode.Uri;
  state: GitRepositoryState;
}

interface GitApi {
  repositories: GitRepository[];
  onDidOpenRepository: (
    listener: (repo: GitRepository) => void,
  ) => vscode.Disposable;
}

interface GitExtensionExports {
  getAPI(version: number): GitApi;
}

export class GitActivityTracker implements vscode.Disposable {
  private readonly _disposables: vscode.Disposable[] = [];

  /**
   * The last HEAD seen per repository.
   *
   * The state event fires for far more than commits - staging, branch
   * switches, index changes - so a commit is recognised as "HEAD moved to a
   * sha we have not paid for".
   */
  private readonly _lastHead = new Map<string, string>();

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _service: ProgressionService,
  ) {}

  public async start(): Promise<void> {
    const api = await this._resolveApi();
    if (!api) {
      return;
    }

    for (const repo of api.repositories) {
      this._watch(repo);
    }
    this._disposables.push(
      api.onDidOpenRepository((repo) => this._watch(repo)),
    );
  }

  public dispose(): void {
    for (const disposable of this._disposables) {
      disposable.dispose();
    }
    this._disposables.length = 0;
  }

  private async _resolveApi(): Promise<GitApi | undefined> {
    const extension =
      vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
    if (!extension) {
      return undefined;
    }
    try {
      const exports = extension.isActive
        ? extension.exports
        : await extension.activate();
      return exports.getAPI(1);
    } catch {
      // A Git extension that fails to activate must not take progression - or
      // the rest of this extension - down with it.
      return undefined;
    }
  }

  private _watch(repo: GitRepository): void {
    const key = repo.rootUri.toString();

    // Seed with the current HEAD so opening a workspace does not immediately
    // pay out for whatever commit happens to be checked out.
    const head = repo.state.HEAD?.commit;
    if (head) {
      this._lastHead.set(key, head);
    }

    this._disposables.push(
      repo.state.onDidChange(() => {
        void this._onStateChange(repo, key);
      }),
    );
  }

  private async _onStateChange(
    repo: GitRepository,
    key: string,
  ): Promise<void> {
    const head = repo.state.HEAD?.commit;
    if (!head || this._lastHead.get(key) === head) {
      return;
    }
    this._lastHead.set(key, head);

    // The persisted set is what makes this survive a reload: checking out an
    // old branch and coming back must not pay twice.
    if (readRewardedCommits(this._context).indexOf(head) !== -1) {
      return;
    }
    await rememberCommit(this._context, head);

    await this._service.applyEvent(
      createProgressionEvent('git-commit', Date.now(), {
        sha: head.slice(0, 7),
      }),
    );
  }
}
