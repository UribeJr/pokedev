/**
 * The webview's own record of which roaming strategy is currently active.
 *
 * A single module-level flag, set once at bootstrap and again on every
 * `set-roaming-style` message (see `applyRoamingStyle` in `panel/main.ts`) -
 * the same pattern `display-skins`/`environments` already use for their own
 * live-switchable cosmetic state. Read by `states.ts` (which strategy
 * `resolveState` substitutes for `walkRight`/`walkLeft`/`runRight`/
 * `runLeft`) and `base-pokemon-type.ts` (whether `positionBottom` also
 * depth-sorts).
 */
import {
  DEFAULT_ROAMING_STYLE,
  RoamingStyle,
} from '../../common/roaming-style';

let current: RoamingStyle = DEFAULT_ROAMING_STYLE;

export function setRoamingStyle(style: RoamingStyle): void {
  current = style;
}

export function getRoamingStyle(): RoamingStyle {
  return current;
}

export function isOverworldRoaming(): boolean {
  return current === 'overworld';
}
