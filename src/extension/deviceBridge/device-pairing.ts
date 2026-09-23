/**
 * Per-install pairing token for the Device Bridge.
 *
 * The bridge binds to every LAN interface (it has to, to be reachable by
 * the ESP32), so anything on the local network could otherwise open a
 * connection to it. This token is the smallest reasonable gate for a
 * personal local device - not enterprise auth, just a shared secret the
 * user copies once into firmware config.
 */
import * as vscode from 'vscode';
import { randomUuid } from '../../common/uuid';

/** Never added to `setKeysForSync` - a per-machine secret must not sync
 * to other machines the way the Pokemon collection does. */
const PAIRING_TOKEN_KEY = 'pokedev.deviceBridge.pairingToken';

export async function getOrCreatePairingToken(
  context: vscode.ExtensionContext,
): Promise<string> {
  const existing = context.globalState.get<string>(PAIRING_TOKEN_KEY);
  if (existing) {
    return existing;
  }
  const token = randomUuid();
  await context.globalState.update(PAIRING_TOKEN_KEY, token);
  return token;
}

/** Registers `PokéDev: Show Device Pairing Token` - the only place the
 * token is ever surfaced to the user, and only on explicit request. */
export function registerShowPairingTokenCommand(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'pokedev.deviceBridge.showPairingToken',
    async () => {
      const token = await getOrCreatePairingToken(context);
      outputChannel.appendLine(`Device pairing token: ${token}`);
      outputChannel.show(true);
      await vscode.window.showInformationMessage(
        vscode.l10n.t(
          'PokéDev Desk pairing token written to the "PokéDev Device Bridge" output channel. Copy it into the device\'s network_config.h.',
        ),
      );
    },
  );
}
