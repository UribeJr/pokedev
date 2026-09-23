/**
 * Whether this extension host can spawn a real local process, open a raw
 * socket, etc. True in every desktop install of VS Code/Cursor; false in a
 * web extension host (vscode.dev, github.dev), which runs this extension
 * inside a browser webworker - `process` there is the `process/browser`
 * shim `webpack.config.js` provides, which has no `versions.node`.
 *
 * Shared by every Node-only feature (originally written for the Shopify CLI
 * check in `shopify-cli.ts`; the Device Bridge's WebSocket server is the
 * same kind of desktop-only capability - a webworker cannot host a
 * listening socket at all, regardless of bundling).
 */
export function isNodeRuntime(): boolean {
  return typeof process !== 'undefined' && !!process.versions?.node;
}
