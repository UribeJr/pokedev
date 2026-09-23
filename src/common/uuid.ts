/**
 * A random v4-shaped UUID with no runtime dependency.
 *
 * Deliberately not Node's `crypto.randomUUID()`: this extension ships both
 * a desktop (`main`) and a web/webworker (`browser`) entry point built from
 * the same source (see `webpack.config.js`), and webpack 5 does not
 * polyfill Node core modules by default - importing `crypto` anywhere
 * reachable from `extension.ts` breaks the web bundle. `Math.random()` is
 * available identically in both hosts. Every caller here uses this for a
 * collision-resistant local instance id or a local-network pairing token,
 * not a security-critical secret, so non-cryptographic randomness is fine.
 */
export function randomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
