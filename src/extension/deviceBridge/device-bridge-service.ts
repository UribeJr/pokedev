/**
 * Owns the local WebSocket server that lets a paired physical device (e.g.
 * PokéDev Desk) observe the real PokéDev partner.
 *
 * Adapts existing state into the wire protocol and nothing more - it
 * contains no progression rules. Truth lives in `ProgressionService` and the
 * collection storage this reads from; this class only decides WHEN to push
 * a snapshot and HOW to shape one, via `buildPartnerSnapshotPayload`.
 *
 * Two triggers drive outbound traffic, matching "events are presentation,
 * snapshots are truth":
 * - `progressionService.onDidApplyProgression` - fine-grained: builds
 *   `xp_gained`/`level_up` for the partner's own share of an applied event,
 *   then always sends a fresh snapshot after. This already covers trainer
 *   XP/level changes too - `addTrainerXp` (trainer-profile.ts) is only ever
 *   called from `ProgressionService`, so a trainer level-up rides the same
 *   snapshot as any Pokemon XP gain, with no separate trigger needed.
 * - `pokedevState.onDidChange('partner' | 'collection' | 'github')` -
 *   coarse: a partner switch, a collection edit (including an evolution,
 *   which notifies `'collection'`), or a GitHub username/profile refresh
 *   has no `ProgressionOutcome` to build an event from, so this just
 *   re-sends the snapshot. `'progression'` is deliberately NOT subscribed
 *   here - `onDidApplyProgression` already covers every progression change
 *   with a snapshot of its own, and listening to both would send the same
 *   snapshot twice per event.
 *
 * The snapshot's `trainer` field (added 2026-09-22, see
 * `buildTrainerSnapshotPayload`) is entirely cache-only/read-only, same as
 * `partner` - this service still never fetches GitHub or DEV data itself.
 */
import * as vscode from 'vscode';
import { WebSocket, WebSocketServer } from 'ws';
import { PokedevChangeKind, pokedevState } from '../pokedev-state';
import { ProgressionOutcome, ProgressionService } from '../progression-service';
import { listPartnerCandidates } from '../trainer-partner';
import { getOrCreatePairingToken } from './device-pairing';
import { buildPartnerSnapshotPayload } from './partner-snapshot';
import { buildTrainerSnapshotPayload } from './trainer-snapshot';
import {
  DEVICE_PROTOCOL_VERSION,
  DeviceEnvelope,
  DeviceMessageType,
  encodeEnvelope,
  ErrorCode,
  HelloPayload,
  parseEnvelope,
} from './device-protocol';

/** Deliberately not 8765 (or any other common dev-server port) - a VS Code
 * user routinely already has webpack/Vite/a debug adapter bound to the
 * usual suspects (3000, 5173, 8080, 8000, 9229, ...). */
const DEFAULT_PORT = 17332;
/** How many ports above the configured one to try before giving up. */
const MAX_PORT_PROBES = 10;
/** One device at a time for V1, so a stray second connection cannot
 * silently take over the paired device's session. */
const MAX_CONNECTIONS = 1;
/** A physical device rebooting, losing Wi-Fi, or being reflashed drops the
 * TCP connection without ever sending a WebSocket close frame - the `ws`
 * library (and the OS below it) can take a very long time to notice that
 * on its own, which combined with MAX_CONNECTIONS=1 would otherwise block
 * every future connection until the extension itself reloads. This ping/
 * pong heartbeat reaps a connection that misses one full interval instead. */
const HEARTBEAT_INTERVAL_MS = 10000;

interface ConnectionState {
  authorized: boolean;
  /** Cleared on each heartbeat tick, set back on the next pong; a
   * connection that is still false when the next tick runs never answered
   * the previous ping and gets terminated. */
  isAlive: boolean;
}

export class DeviceBridgeService implements vscode.Disposable {
  private readonly _output: vscode.OutputChannel;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _connections = new Map<WebSocket, ConnectionState>();
  private _server: WebSocketServer | undefined;
  private _heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _progression: ProgressionService,
  ) {
    this._output = vscode.window.createOutputChannel('PokéDev Device Bridge');
    this._disposables.push(this._output);
  }

  public get outputChannel(): vscode.OutputChannel {
    return this._output;
  }

  public async start(): Promise<void> {
    const config = vscode.workspace.getConfiguration('pokedev');
    if (!config.get<boolean>('deviceBridge.enabled', true)) {
      this._output.appendLine(
        'Device bridge disabled (pokedev.deviceBridge.enabled is false).',
      );
      return;
    }

    const configuredPort = config.get<number>(
      'deviceBridge.port',
      DEFAULT_PORT,
    );
    const boundPort = await this._listen(configuredPort);
    if (boundPort === undefined) {
      this._output.appendLine(
        `PokéDev Desk bridge failed to bind any port starting at ${configuredPort}.`,
      );
      return;
    }
    this._output.appendLine(
      `PokéDev Desk bridge started on ws://0.0.0.0:${boundPort} (protocol v${DEVICE_PROTOCOL_VERSION}).`,
    );

    this._disposables.push(
      pokedevState.onDidChange((kind) => this._onStateChange(kind)),
    );
    this._disposables.push(
      this._progression.onDidApplyProgression((outcome) =>
        this._onProgression(outcome),
      ),
    );

    this._heartbeatTimer = setInterval(
      () => this._pingConnections(),
      HEARTBEAT_INTERVAL_MS,
    );
  }

  public dispose(): void {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = undefined;
    }
    for (const socket of this._connections.keys()) {
      socket.terminate();
    }
    this._connections.clear();
    this._server?.close();
    this._server = undefined;
    for (const disposable of this._disposables.splice(0)) {
      disposable.dispose();
    }
  }

  /** Pings every connection still marked alive from the last tick, and
   * terminates any that were NOT re-marked alive by a pong since then -
   * see HEARTBEAT_INTERVAL_MS's own comment for why this exists. */
  private _pingConnections(): void {
    for (const [socket, state] of this._connections) {
      if (!state.isAlive) {
        this._output.appendLine(
          'Reaping an unresponsive connection (missed heartbeat) - likely a device that rebooted or lost Wi-Fi without a clean disconnect.',
        );
        socket.terminate();
        continue;
      }
      state.isAlive = false;
      socket.ping();
    }
  }

  /** Binds `preferredPort`, probing upward on `EADDRINUSE` up to
   * `MAX_PORT_PROBES` times. Resolves the bound port, or `undefined` if
   * every attempt failed. */
  private _listen(preferredPort: number): Promise<number | undefined> {
    return new Promise((resolve) => {
      const tryPort = (port: number, attemptsLeft: number): void => {
        const server = new WebSocketServer({ host: '0.0.0.0', port });
        const onListening = () => {
          server.off('error', onError);
          this._server = server;
          server.on('connection', (socket) => this._onConnection(socket));
          server.on('error', (error: Error) =>
            this._output.appendLine(
              `Device bridge server error: ${error.message}`,
            ),
          );
          resolve(port);
        };
        const onError = (error: NodeJS.ErrnoException) => {
          server.off('listening', onListening);
          server.removeAllListeners();
          if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
            this._output.appendLine(`Port ${port} in use, trying ${port + 1}.`);
            tryPort(port + 1, attemptsLeft - 1);
          } else {
            this._output.appendLine(
              `Device bridge could not bind: ${error.message}`,
            );
            resolve(undefined);
          }
        };
        server.once('listening', onListening);
        server.once('error', onError);
      };
      tryPort(preferredPort, MAX_PORT_PROBES);
    });
  }

  private _onConnection(socket: WebSocket): void {
    if (this._connections.size >= MAX_CONNECTIONS) {
      this._output.appendLine(
        'Rejected a connection: bridge already at capacity.',
      );
      socket.close(4001, 'capacity');
      return;
    }

    this._output.appendLine('Device connected; awaiting hello.');
    this._connections.set(socket, { authorized: false, isAlive: true });

    socket.on('message', (data) => {
      void this._onMessage(socket, data.toString());
    });
    socket.on('pong', () => {
      const state = this._connections.get(socket);
      if (state) {
        state.isAlive = true;
      }
    });
    socket.on('close', () => {
      this._connections.delete(socket);
      this._output.appendLine('Device disconnected.');
    });
    socket.on('error', (error) => {
      this._output.appendLine(`Device socket error: ${error.message}`);
    });
  }

  private async _onMessage(socket: WebSocket, raw: string): Promise<void> {
    const state = this._connections.get(socket);
    if (!state) {
      return;
    }

    const envelope = parseEnvelope(raw);
    if (!envelope) {
      this._sendError(socket, 'malformed', 'could not parse message');
      return;
    }
    if (envelope.v !== DEVICE_PROTOCOL_VERSION) {
      this._sendError(
        socket,
        'unsupported_protocol',
        `bridge speaks protocol v${DEVICE_PROTOCOL_VERSION}`,
      );
      socket.close(4002, 'unsupported protocol');
      return;
    }

    if (!state.authorized) {
      await this._handleHello(socket, state, envelope);
      return;
    }

    switch (envelope.type) {
      case 'request_snapshot':
        this._sendSnapshot(socket);
        break;
      case 'command':
        // Future work: validate against ProgressionService and apply. The
        // device only ever requests a mutation, never asserts one; V1 does
        // not implement any command yet.
        this._sendError(
          socket,
          'unknown_command',
          'commands are not implemented yet',
        );
        break;
      default:
        // Ignore anything else rather than error, so a future device
        // speaking a superset of v1 is not disconnected for it.
        break;
    }
  }

  private async _handleHello(
    socket: WebSocket,
    state: ConnectionState,
    envelope: DeviceEnvelope,
  ): Promise<void> {
    if (envelope.type !== 'hello') {
      this._sendError(socket, 'unauthorized', 'expected hello');
      socket.close(4003, 'unauthorized');
      return;
    }
    const payload = envelope.payload as HelloPayload | undefined;
    const expectedToken = await getOrCreatePairingToken(this._context);
    if (!payload || payload.token !== expectedToken) {
      this._output.appendLine(
        'Rejected hello: invalid or missing pairing token.',
      );
      this._sendError(socket, 'unauthorized', 'invalid pairing token');
      socket.close(4003, 'unauthorized');
      return;
    }

    state.authorized = true;
    this._output.appendLine(
      `Device authorized (device=${payload.device ?? 'unknown'}, fw=${payload.fw ?? 'unknown'}).`,
    );
    this._send(socket, 'hello_ack', {
      ok: true,
      protocol: DEVICE_PROTOCOL_VERSION,
    });
    this._sendSnapshot(socket);
  }

  private _onStateChange(kind: PokedevChangeKind): void {
    if (kind !== 'partner' && kind !== 'collection' && kind !== 'github') {
      return;
    }
    if (kind === 'partner') {
      const payload = buildPartnerSnapshotPayload(this._context);
      if (payload) {
        this._broadcast('partner_changed', {
          id: payload.id,
          species: payload.species,
        });
      }
    }
    this._sendSnapshot();
  }

  private _onProgression(outcome: ProgressionOutcome): void {
    const candidates = listPartnerCandidates(this._context);
    for (const grant of outcome.pokemonGrants) {
      if (!grant.isPartner) {
        continue;
      }
      const id = candidates.find((c) => c.nickname === grant.nickname)?.id;
      if (!id) {
        continue;
      }
      if (grant.xpGranted > 0) {
        this._broadcast('xp_gained', {
          id,
          amount: grant.xpGranted,
          source: outcome.event.type,
        });
      }
      if (grant.levelUp?.levelledUp) {
        this._broadcast('level_up', { id, level: grant.levelUp.toLevel });
      }
    }
    this._sendSnapshot();
  }

  private _sendSnapshot(target?: WebSocket): void {
    const partner = buildPartnerSnapshotPayload(this._context);
    const trainer = buildTrainerSnapshotPayload(this._context);
    this._output.appendLine(
      partner
        ? `Sending snapshot: ${partner.species} Lv.${partner.level} (${partner.nickname}).`
        : 'Sending snapshot: no partner yet.',
    );
    if (target) {
      this._send(target, 'state_snapshot', { partner, trainer });
    } else {
      this._broadcast('state_snapshot', { partner, trainer });
    }
  }

  private _send<T>(
    socket: WebSocket,
    type: DeviceMessageType,
    payload?: T,
  ): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(encodeEnvelope(type, payload));
  }

  private _broadcast<T>(type: DeviceMessageType, payload?: T): void {
    const message = encodeEnvelope(type, payload);
    for (const [socket, state] of this._connections) {
      if (state.authorized && socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    }
  }

  private _sendError(
    socket: WebSocket,
    code: ErrorCode,
    message: string,
  ): void {
    this._send(socket, 'error', { code, message });
  }
}
