/**
 * The configured Crystal palette preference and its resolution against the
 * live VS Code/Cursor appearance - a tiny leaf module, deliberately separate
 * from `trainer-card-panel.ts`/`pokegear-panel.ts` for the exact same
 * circular-import reason `trainer-card-style-config.ts` documents: both of
 * those already import `pokedev-state.ts`, and the compact Explorer HUD's
 * view model (built there) needs this same getter too.
 */
import * as vscode from 'vscode';
import {
  CrystalPalette,
  DEFAULT_CRYSTAL_PALETTE,
  isValidCrystalPalette,
  resolveCrystalPalette,
  ResolvedCrystalPalette,
} from '../common/crystal-palette';

const CONFIG_SECTION = 'pokedev';
const CRYSTAL_PALETTE_SETTING = 'crystalPalette';

/** The user's chosen Crystal palette preference (`pokedev.crystalPalette`) -
 * `'auto'`/`'day'`/`'night'`, NOT yet resolved. See `getResolvedCrystalPalette`
 * for the value CSS actually keys on. */
export function getConfiguredCrystalPalette(): CrystalPalette {
  const id = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<string>(CRYSTAL_PALETTE_SETTING, DEFAULT_CRYSTAL_PALETTE);
  return isValidCrystalPalette(id) ? id : DEFAULT_CRYSTAL_PALETTE;
}

/**
 * Whether VS Code/Cursor's CURRENT color theme is dark - the one live signal
 * `'auto'` follows. `ColorThemeKind.HighContrast` counts as dark (a
 * high-contrast-dark theme should not suddenly show a bright cream card);
 * `HighContrastLight` counts as light for the same reason in reverse.
 */
export function isIdeThemeDark(): boolean {
  const kind = vscode.window.activeColorTheme.kind;
  return (
    kind === vscode.ColorThemeKind.Dark ||
    kind === vscode.ColorThemeKind.HighContrast
  );
}

/** The single resolved palette (`'day'`/`'night'`) every Crystal-capable
 * surface renders - see `resolveCrystalPalette`'s own doc comment for why
 * this is the one place `'auto'` is ever decided. */
export function getResolvedCrystalPalette(): ResolvedCrystalPalette {
  return resolveCrystalPalette(getConfiguredCrystalPalette(), isIdeThemeDark());
}
