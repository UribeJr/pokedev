/**
 * Resolves RADIO catalog entries into webview-safe audio URIs.
 *
 * The one place that joins `RadioTrackDefinition.assetPath` onto
 * `media/radio/gen2fm/` and calls `webview.asWebviewUri` - mirrors
 * `pokeball-service.ts` exactly.
 */
import * as vscode from 'vscode';
import {
  RADIO_STATION_ID,
  RADIO_STATION_NAME,
  RADIO_TRACK_DEFINITIONS,
} from '../common/radio-tracks';

function radioTrackAudioUri(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  assetPath: string,
): string {
  return webview
    .asWebviewUri(
      vscode.Uri.joinPath(
        extensionUri,
        'media',
        'radio',
        RADIO_STATION_ID,
        assetPath,
      ),
    )
    .toString();
}

export interface RadioTrackOption {
  id: string;
  title: string;
  category: string;
  audioUri: string;
}

export interface RadioStationCatalog {
  stationId: string;
  stationName: string;
  tracks: RadioTrackOption[];
}

/** The full GEN II FM catalog, every entry already resolved to a webview
 * URI, in catalog (curated) order. */
export function buildRadioStationCatalog(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): RadioStationCatalog {
  return {
    stationId: RADIO_STATION_ID,
    stationName: RADIO_STATION_NAME,
    tracks: RADIO_TRACK_DEFINITIONS.map((track) => ({
      id: track.id,
      title: track.title,
      category: track.category,
      audioUri: radioTrackAudioUri(webview, extensionUri, track.assetPath),
    })),
  };
}
