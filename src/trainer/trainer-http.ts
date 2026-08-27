/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Minimal HTTP GET used by the Trainer Card.
 *
 * Deliberately avoids naming any global HTTP type (fetch, Response,
 * RequestInit, AbortSignal). Those are declared in lib.dom and lib.webworker,
 * and this file is compiled under three different lib sets:
 *
 *   tsconfig.extension.json  lib: ["es6"]              (no DOM)
 *   tsconfig.test.json       lib: ["es6", "DOM"]
 *   tsconfig.web.json        lib: ["es6", "WebWorker"]
 *
 * Reaching the globals structurally through `globalThis` keeps all three happy
 * and avoids "subsequent variable declarations must have the same type".
 *
 * There is no https/fs fallback on purpose: webExtensionConfig.resolve.fallback
 * in webpack.config.js does not map 'https', so a static require would break
 * the web build at resolve time rather than merely lacking a fallback.
 */

/** The only response surface the Trainer Card needs. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  header(name: string): string | null;
  json(): Promise<unknown>;
}

/** No fetch in this runtime (Node < 18, i.e. VS Code older than ~1.82). */
export class HttpUnavailableError extends Error {
  constructor() {
    super('No fetch implementation is available in this runtime.');
    this.name = 'HttpUnavailableError';
  }
}

/** Offline, DNS failure, TLS failure, or an aborted request. */
export class HttpNetworkError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Network request failed.');
    this.name = 'HttpNetworkError';
  }
}

interface FetchLikeResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    redirect: string;
    signal?: unknown;
  },
) => Promise<FetchLikeResponse>;

interface AbortControllerLike {
  abort(): void;
  signal: unknown;
}

function globals(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

function resolveFetch(): FetchLike | undefined {
  const candidate = globals()['fetch'];
  return typeof candidate === 'function'
    ? (candidate as unknown as FetchLike)
    : undefined;
}

/**
 * False on VS Code hosts whose Node runtime predates global fetch. Callers
 * surface this as a distinct, actionable message instead of a generic failure —
 * the extension still works, only the Trainer Card is unavailable.
 */
export function isHttpAvailable(): boolean {
  return resolveFetch() !== undefined;
}

export async function httpGetJson(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<HttpResponse> {
  const doFetch = resolveFetch();
  if (!doFetch) {
    throw new HttpUnavailableError();
  }

  const AbortCtor = globals()['AbortController'] as
    | (new () => AbortControllerLike)
    | undefined;
  const controller = AbortCtor ? new AbortCtor() : undefined;

  let timer: ReturnType<typeof setTimeout> | undefined;
  if (controller) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const res = await doFetch(url, {
      method: 'GET',
      headers,
      // GitHub 301-redirects renamed accounts, and we want to follow those.
      redirect: 'follow',
      signal: controller ? controller.signal : undefined,
    });
    return {
      ok: res.ok,
      status: res.status,
      header: (name: string) => res.headers.get(name),
      json: () => res.json(),
    };
  } catch (e) {
    throw new HttpNetworkError(e);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
