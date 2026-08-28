/**
 * Watches the editor and turns real work into progression events.
 *
 * The guiding rule is that XP should track effort, not keystrokes. Nothing
 * here awards anything per character typed or per save; each source has an
 * explicit reason to believe something was actually accomplished:
 *
 *   - a save only counts if the file's contents genuinely changed
 *   - coding time only accrues while the window is focused and recently used
 *   - a task only counts if it exited zero
 *
 * This class owns the listeners and the one interval; it never writes state.
 * Everything it observes becomes a `ProgressionEvent` handed to
 * `ProgressionService`, which is the only writer.
 */
import * as vscode from 'vscode';
import {
  countsAsActivity,
  hasDocumentChanged,
  idleTimeoutForMode,
  isIgnoredPath,
  normalizeProgressionMode,
  SaveRecord,
  shouldAccrueCodingTime,
  shouldAwardBatch,
} from '../progression/activity-rules';
import {
  ActivitySource,
  ProgressionMode,
} from '../progression/progression-types';
import {
  BATCH_WINDOW_MS,
  CODING_CHUNK_MS,
  CODING_TICK_MS,
  computeWorkBatchAward,
  TASK_COOLDOWN_MS,
} from '../progression/xp-rules';
import {
  createProgressionEvent,
  ProgressionService,
} from './progression-service';

export class ActivityTracker implements vscode.Disposable {
  private readonly _disposables: vscode.Disposable[] = [];

  /**
   * Timer handle typed structurally.
   *
   * This file compiles into the Node extension (`lib: es6` + @types/node,
   * where this is a `Timeout`) and into the web extension (`lib: WebWorker`,
   * where it is a `number`). `ReturnType` is the only spelling that is correct
   * in both.
   */
  private _ticker: ReturnType<typeof setInterval> | undefined;

  /** Last qualifying save per document, keyed by uri. */
  private readonly _lastSave = new Map<string, SaveRecord>();

  /**
   * Files changed since the pending batch opened, and the debounce timer.
   *
   * A batch stays open while saves keep arriving and closes once they stop, so
   * an agent writing thirty files produces one award rather than thirty.
   */
  private readonly _pendingBatch = new Set<string>();
  private _batchTimer: ReturnType<typeof setTimeout> | undefined;

  /** When the last batch was actually paid, for the global cooldown. */
  private _lastBatchAwardAt: number | undefined;

  /** Last rewarded run per task name. */
  private readonly _lastTask = new Map<string, number>();

  /** Epoch ms of the last meaningful editor interaction. */
  private _lastActivity = Date.now();

  /** Active coding banked toward the next chunk payout. */
  private _chunkProgressMs = 0;

  constructor(private readonly _service: ProgressionService) {}

  public start(): void {
    // Signals that the user is genuinely working. Each is tagged with what
    // produced it, because `progression.mode` decides which sources to trust:
    // VS Code reports an agent's edit and a human keystroke as the same
    // document-change event, so only the selection kind can tell them apart.
    //
    // Window focus is checked separately at tick time, so none of this can
    // accrue while the editor is hidden.
    this._disposables.push(
      vscode.workspace.onDidChangeTextDocument(() =>
        this._touch('document-change'),
      ),
      vscode.window.onDidChangeTextEditorSelection((event) => {
        // `Keyboard` and `Mouse` are the only kinds a person can produce;
        // programmatic edits arrive as `Command` or with no kind at all.
        const human =
          event.kind === vscode.TextEditorSelectionChangeKind.Keyboard ||
          event.kind === vscode.TextEditorSelectionChangeKind.Mouse;
        this._touch(human ? 'human-input' : 'document-change');
      }),
      vscode.window.onDidChangeActiveTextEditor(() =>
        this._touch('editor-switch'),
      ),
      vscode.window.onDidChangeWindowState((state) => {
        if (state.focused) {
          // Returning to the window is not itself work, but it does mean the
          // idle clock should restart from now rather than from whenever the
          // user last typed before leaving. This is a deliberate human act in
          // every mode, so it is not filtered.
          this._lastActivity = Date.now();
        }
      }),
    );

    this._disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        this._onSave(doc);
      }),
    );

    this._disposables.push(
      vscode.tasks.onDidEndTaskProcess((event) => {
        void this._onTaskEnd(event);
      }),
    );

    this._ticker = setInterval(() => {
      void this._onTick();
    }, CODING_TICK_MS);
  }

  public dispose(): void {
    if (this._ticker !== undefined) {
      clearInterval(this._ticker);
      this._ticker = undefined;
    }
    if (this._batchTimer !== undefined) {
      clearTimeout(this._batchTimer);
      this._batchTimer = undefined;
    }
    for (const disposable of this._disposables) {
      disposable.dispose();
    }
    this._disposables.length = 0;
  }

  /** Reads the configured working style. Cheap; VS Code caches settings. */
  private _mode(): ProgressionMode {
    return normalizeProgressionMode(
      vscode.workspace
        .getConfiguration('vscode-pokemon')
        .get<string>('progression.mode', 'auto'),
    );
  }

  private _touch(source: ActivitySource): void {
    if (!countsAsActivity(this._mode(), source)) {
      return;
    }
    this._lastActivity = Date.now();
  }

  /* ------------------------------ saving ------------------------------- */

  /**
   * Collects a changed file into the pending work batch.
   *
   * Nothing is paid here. Saves arrive in bursts - a formatter touching
   * several files, an agent writing a whole feature - and paying per file
   * would make XP track how much surface a change happened to cover rather
   * than that a piece of work got done. The batch closes and pays once saves
   * stop arriving.
   */
  private _onSave(doc: vscode.TextDocument): void {
    if (!this._isEligibleDocument(doc)) {
      return;
    }

    // A save is a deliberate act in any mode, so it always counts as activity.
    this._touch('human-input');

    const key = doc.uri.toString();
    const fingerprint = fingerprintOf(doc);
    if (!hasDocumentChanged(this._lastSave.get(key), fingerprint)) {
      return;
    }

    this._lastSave.set(key, { at: Date.now(), fingerprint });
    // A Set, so re-saving the same file inside one window still counts once.
    this._pendingBatch.add(vscode.workspace.asRelativePath(doc.uri));

    // Each new save pushes the deadline out, so a long burst stays one batch.
    if (this._batchTimer !== undefined) {
      clearTimeout(this._batchTimer);
    }
    this._batchTimer = setTimeout(() => {
      this._batchTimer = undefined;
      void this._flushBatch();
    }, BATCH_WINDOW_MS);
  }

  /** Closes the pending batch and pays for it, if the cooldown allows. */
  private async _flushBatch(): Promise<void> {
    if (this._pendingBatch.size === 0) {
      return;
    }
    const files = Array.from(this._pendingBatch);
    this._pendingBatch.clear();

    const now = Date.now();
    if (!shouldAwardBatch(this._lastBatchAwardAt, now)) {
      return;
    }
    this._lastBatchAwardAt = now;

    const award = computeWorkBatchAward(files.length);
    await this._service.applyEvent({
      type: 'work-batch',
      trainerXp: award.trainerXp,
      pokemonXp: award.pokemonXp,
      timestamp: now,
      metadata: {
        fileCount: files.length,
        // Enough to recognise the change in the log without storing a
        // potentially enormous file list.
        files: files.slice(0, 5),
      },
    });
  }

  private _isEligibleDocument(doc: vscode.TextDocument): boolean {
    if (doc.uri.scheme !== 'file' || doc.isUntitled) {
      return false;
    }
    // Outside any open folder: scratch files elsewhere on disk are not this
    // project's work.
    if (!vscode.workspace.getWorkspaceFolder(doc.uri)) {
      return false;
    }

    return !isIgnoredPath(doc.uri.path);
  }

  /* --------------------------- active coding --------------------------- */

  /**
   * One tick of the coding clock.
   *
   * Time only accrues when the window is focused AND there has been real
   * interaction recently, so leaving the editor open on a second monitor
   * overnight earns nothing. XP is paid in whole chunks; the remainder carries
   * forward rather than being discarded.
   */
  private async _onTick(): Promise<void> {
    if (!ProgressionService.isEnabled()) {
      return;
    }

    const now = Date.now();
    if (
      !shouldAccrueCodingTime(
        vscode.window.state.focused,
        this._lastActivity,
        now,
        idleTimeoutForMode(this._mode()),
      )
    ) {
      // Still flush: time banked before going idle should not wait for the
      // next active tick to reach disk.
      await this._service.flush();
      return;
    }

    this._service.addCodingTime(CODING_TICK_MS);
    this._chunkProgressMs += CODING_TICK_MS;

    while (this._chunkProgressMs >= CODING_CHUNK_MS) {
      this._chunkProgressMs -= CODING_CHUNK_MS;
      await this._service.applyEvent(
        createProgressionEvent('active-coding', now, {
          minutes: Math.round(CODING_CHUNK_MS / 60000),
        }),
      );
    }

    await this._service.flush();
  }

  /* ------------------------------- tasks ------------------------------- */

  /**
   * Awards a successful build or test run.
   *
   * Uses the task process's real exit code. There is deliberately no terminal
   * output parsing anywhere in this system: scanning for words like "success"
   * would be both trivially farmable and wrong for most toolchains.
   */
  private async _onTaskEnd(event: vscode.TaskProcessEndEvent): Promise<void> {
    if (event.exitCode !== 0) {
      return;
    }

    const group = event.execution.task.group;
    if (group !== vscode.TaskGroup.Build && group !== vscode.TaskGroup.Test) {
      return;
    }

    const name = event.execution.task.name;
    const now = Date.now();
    const previous = this._lastTask.get(name);
    if (previous !== undefined && now - previous < TASK_COOLDOWN_MS) {
      return;
    }
    this._lastTask.set(name, now);

    await this._service.applyEvent(
      createProgressionEvent('task-success', now, { task: name }),
    );
  }
}

/**
 * A cheap stand-in for "has this document's content changed".
 *
 * `version` alone is not enough: it advances on edits that were later undone,
 * so a type-then-undo-then-save loop would read as new work every time.
 * Hashing the text would be correct but means materialising the whole document
 * on every save.
 *
 * `offsetAt` of the final position gives the document's character count
 * without building a string, which - together with the line count and the
 * length of the last line - separates any realistic pair of edits. A same-size
 * edit that also preserves both line counts is possible in principle (swapping
 * two characters); the cost of missing it is one unawarded point of XP.
 */
function fingerprintOf(doc: vscode.TextDocument): string {
  const lastLine = doc.lineAt(Math.max(doc.lineCount - 1, 0));
  const length = doc.offsetAt(lastLine.range.end);
  return `${length}:${doc.lineCount}:${lastLine.text.length}`;
}
