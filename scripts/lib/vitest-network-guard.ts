import http from "node:http";
import https from "node:https";

const LIVE_PROVIDER_SMOKE_ENV = "LIME_ALLOW_LIVE_PROVIDER_SMOKE";
const REAL_API_TEST_ENV = "LIME_REAL_API_TEST";
const GUARD_STATE_KEY = Symbol.for("lime.vitestNetworkGuard");
const LOCAL_HTTP_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
]);

type FetchLike = typeof fetch;
type HttpRequestLike = typeof http.request;
type HttpGetLike = typeof http.get;
type HttpsRequestLike = typeof https.request;
type HttpsGetLike = typeof https.get;
type XmlHttpRequestOpenLike = XMLHttpRequest["open"];

interface GuardState {
  nativeFetch?: FetchLike;
  guardedFetch?: FetchLike;
  nativeHttpRequest?: HttpRequestLike;
  nativeHttpGet?: HttpGetLike;
  nativeHttpsRequest?: HttpsRequestLike;
  nativeHttpsGet?: HttpsGetLike;
  guardedHttpRequest?: HttpRequestLike;
  guardedHttpGet?: HttpGetLike;
  guardedHttpsRequest?: HttpsRequestLike;
  guardedHttpsGet?: HttpsGetLike;
  nativeXmlHttpRequestOpen?: XmlHttpRequestOpenLike;
  guardedXmlHttpRequestOpen?: XmlHttpRequestOpenLike;
}

function getGuardState(): GuardState {
  const root = globalThis as typeof globalThis & {
    [GUARD_STATE_KEY]?: GuardState;
  };

  if (!root[GUARD_STATE_KEY]) {
    root[GUARD_STATE_KEY] = {
      nativeFetch:
        typeof globalThis.fetch === "function"
          ? globalThis.fetch.bind(globalThis)
          : undefined,
      nativeHttpRequest: http.request.bind(http) as HttpRequestLike,
      nativeHttpGet: http.get.bind(http) as HttpGetLike,
      nativeHttpsRequest: https.request.bind(https) as HttpsRequestLike,
      nativeHttpsGet: https.get.bind(https) as HttpsGetLike,
      nativeXmlHttpRequestOpen:
        typeof XMLHttpRequest !== "undefined"
          ? XMLHttpRequest.prototype.open
          : undefined,
    };
  }

  return root[GUARD_STATE_KEY];
}

function isTruthyEnv(value: unknown): boolean {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

export function vitestLiveProviderNetworkAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    isTruthyEnv(env[LIVE_PROVIDER_SMOKE_ENV]) ||
    isTruthyEnv(env[REAL_API_TEST_ENV])
  );
}

export function resolveFetchUrl(input: RequestInfo | URL): URL | null {
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : typeof Request !== "undefined" && input instanceof Request
          ? input.url
          : typeof (input as { url?: unknown })?.url === "string"
            ? String((input as { url: string }).url)
            : null;

  if (!rawUrl) {
    return null;
  }

  try {
    return new URL(rawUrl, "http://127.0.0.1");
  } catch {
    return null;
  }
}

export function isVitestNetworkUrlAllowed(input: RequestInfo | URL): boolean {
  const url = resolveFetchUrl(input);

  if (!url) {
    return true;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return true;
  }

  const hostname = url.hostname.toLowerCase();
  return LOCAL_HTTP_HOSTS.has(hostname) || hostname.endsWith(".localhost");
}

function isUrlAllowed(url: URL | null): boolean {
  if (!url) {
    return true;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return true;
  }

  const hostname = url.hostname.toLowerCase();
  return LOCAL_HTTP_HOSTS.has(hostname) || hostname.endsWith(".localhost");
}

function stringOption(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function isRequestOptions(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !(value instanceof URL);
}

function mergeUrlWithOptions(
  baseUrl: URL,
  options: Record<string, unknown> | undefined,
): URL {
  if (!options) {
    return baseUrl;
  }

  const merged = new URL(baseUrl.href);
  const protocol = stringOption(options.protocol);
  if (protocol) {
    merged.protocol = protocol.endsWith(":") ? protocol : `${protocol}:`;
  }

  const hostname = stringOption(options.hostname);
  const host = stringOption(options.host);
  if (hostname) {
    merged.hostname = hostname;
  } else if (host) {
    merged.host = host;
  }

  const port = stringOption(options.port);
  if (port) {
    merged.port = port;
  }

  const pathValue = stringOption(options.path);
  if (pathValue) {
    const [pathname, search = ""] = pathValue.split("?", 2);
    merged.pathname = pathname || "/";
    merged.search = search ? `?${search}` : "";
  } else {
    const pathname = stringOption(options.pathname);
    if (pathname) {
      merged.pathname = pathname;
    }
    const search = stringOption(options.search);
    if (search) {
      merged.search = search.startsWith("?") ? search : `?${search}`;
    }
  }

  return merged;
}

export function resolveNodeHttpRequestUrl(
  defaultProtocol: "http:" | "https:",
  args: unknown[],
): URL | null {
  const first = args[0];
  const second = args[1];
  const options = isRequestOptions(second) ? second : undefined;

  if (typeof first === "string" || first instanceof URL) {
    try {
      return mergeUrlWithOptions(new URL(String(first)), options);
    } catch {
      return null;
    }
  }

  if (!isRequestOptions(first)) {
    return null;
  }

  const requestOptions = first;
  const protocol =
    stringOption(requestOptions.protocol)?.replace(/:?$/, ":") ||
    defaultProtocol;
  const hostname =
    stringOption(requestOptions.hostname) || stringOption(requestOptions.host);

  if (!hostname) {
    return null;
  }

  const port = stringOption(requestOptions.port);
  const pathValue = stringOption(requestOptions.path) || "/";
  const url = new URL(`${protocol}//${hostname}`);
  if (port) {
    url.port = port;
  }
  const [pathname, search = ""] = pathValue.split("?", 2);
  url.pathname = pathname || "/";
  url.search = search ? `?${search}` : "";
  return url;
}

export function isVitestNodeHttpRequestAllowed(
  defaultProtocol: "http:" | "https:",
  args: unknown[],
): boolean {
  return isUrlAllowed(resolveNodeHttpRequestUrl(defaultProtocol, args));
}

function assertVitestNetworkRequestAllowed(
  url: URL | null,
  rawInput: unknown,
): void {
  if (vitestLiveProviderNetworkAllowed() || isUrlAllowed(url)) {
    return;
  }

  throw new Error(
    `[vitest-network-guard] 默认禁止 Vitest 外部网络请求，避免误耗真实 Provider 额度：${url?.href ?? String(rawInput)}。如确需 live Provider 测试，请设置 ${LIVE_PROVIDER_SMOKE_ENV}=1 或 ${REAL_API_TEST_ENV}=1。`,
  );
}

function createGuardedFetch(state: GuardState): FetchLike {
  const guardedFetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    assertVitestNetworkRequestAllowed(resolveFetchUrl(input), input);

    if (!state.nativeFetch) {
      throw new Error("[vitest-network-guard] 当前运行环境没有可用 fetch。");
    }

    return state.nativeFetch(input, init);
  }) as FetchLike;

  Object.defineProperty(guardedFetch, "__limeVitestNetworkGuard", {
    value: true,
  });

  return guardedFetch;
}

function createGuardedHttpRequest(
  state: GuardState,
  defaultProtocol: "http:" | "https:",
  nativeRequestKey: "nativeHttpRequest" | "nativeHttpsRequest",
): HttpRequestLike | HttpsRequestLike {
  return ((...args: Parameters<HttpRequestLike>) => {
    assertVitestNetworkRequestAllowed(
      resolveNodeHttpRequestUrl(defaultProtocol, args),
      args[0],
    );

    const nativeRequest = state[nativeRequestKey];
    if (!nativeRequest) {
      throw new Error(
        "[vitest-network-guard] 当前运行环境没有可用 http request。",
      );
    }

    return (nativeRequest as (...requestArgs: unknown[]) => unknown)(...args);
  }) as HttpRequestLike | HttpsRequestLike;
}

function createGuardedHttpGet(
  state: GuardState,
  defaultProtocol: "http:" | "https:",
  nativeGetKey: "nativeHttpGet" | "nativeHttpsGet",
): HttpGetLike | HttpsGetLike {
  return ((...args: Parameters<HttpGetLike>) => {
    assertVitestNetworkRequestAllowed(
      resolveNodeHttpRequestUrl(defaultProtocol, args),
      args[0],
    );

    const nativeGet = state[nativeGetKey];
    if (!nativeGet) {
      throw new Error("[vitest-network-guard] 当前运行环境没有可用 http get。");
    }

    return (nativeGet as (...requestArgs: unknown[]) => unknown)(...args);
  }) as HttpGetLike | HttpsGetLike;
}

function createGuardedXmlHttpRequestOpen(
  state: GuardState,
): XmlHttpRequestOpenLike {
  return (function guardedXmlHttpRequestOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    assertVitestNetworkRequestAllowed(resolveFetchUrl(url), url);

    if (!state.nativeXmlHttpRequestOpen) {
      throw new Error(
        "[vitest-network-guard] 当前运行环境没有可用 XMLHttpRequest.open。",
      );
    }

    return (state.nativeXmlHttpRequestOpen as (...args: unknown[]) => void).call(
      this,
      method,
      url,
      async,
      username,
      password,
    );
  }) as XmlHttpRequestOpenLike;
}

function isGuardedFetch(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === "function" &&
    (value as { __limeVitestNetworkGuard?: boolean }).__limeVitestNetworkGuard,
  );
}

function isGuardedXmlHttpRequestOpen(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "function" &&
      (value as { __limeVitestNetworkGuard?: boolean })
        .__limeVitestNetworkGuard,
  );
}

function patchNodeHttpModules(state: GuardState): void {
  if (http.request !== state.guardedHttpRequest) {
    if (!state.guardedHttpRequest) {
      state.guardedHttpRequest = createGuardedHttpRequest(
        state,
        "http:",
        "nativeHttpRequest",
      ) as HttpRequestLike;
    }
    http.request = state.guardedHttpRequest;
  }

  if (http.get !== state.guardedHttpGet) {
    if (!state.guardedHttpGet) {
      state.guardedHttpGet = createGuardedHttpGet(
        state,
        "http:",
        "nativeHttpGet",
      ) as HttpGetLike;
    }
    http.get = state.guardedHttpGet;
  }

  if (https.request !== state.guardedHttpsRequest) {
    if (!state.guardedHttpsRequest) {
      state.guardedHttpsRequest = createGuardedHttpRequest(
        state,
        "https:",
        "nativeHttpsRequest",
      ) as HttpsRequestLike;
    }
    https.request = state.guardedHttpsRequest;
  }

  if (https.get !== state.guardedHttpsGet) {
    if (!state.guardedHttpsGet) {
      state.guardedHttpsGet = createGuardedHttpGet(
        state,
        "https:",
        "nativeHttpsGet",
      ) as HttpsGetLike;
    }
    https.get = state.guardedHttpsGet;
  }
}

function patchXmlHttpRequest(state: GuardState): void {
  if (typeof XMLHttpRequest === "undefined") {
    return;
  }

  if (
    !state.nativeXmlHttpRequestOpen &&
    typeof XMLHttpRequest.prototype.open === "function" &&
    !isGuardedXmlHttpRequestOpen(XMLHttpRequest.prototype.open)
  ) {
    state.nativeXmlHttpRequestOpen = XMLHttpRequest.prototype.open;
  }

  if (!state.guardedXmlHttpRequestOpen) {
    state.guardedXmlHttpRequestOpen = createGuardedXmlHttpRequestOpen(state);
    Object.defineProperty(
      state.guardedXmlHttpRequestOpen,
      "__limeVitestNetworkGuard",
      {
        value: true,
      },
    );
  }

  if (XMLHttpRequest.prototype.open !== state.guardedXmlHttpRequestOpen) {
    XMLHttpRequest.prototype.open = state.guardedXmlHttpRequestOpen;
  }
}

export function installVitestNetworkGuard(): void {
  const state = getGuardState();

  if (
    !state.nativeFetch &&
    typeof globalThis.fetch === "function" &&
    !isGuardedFetch(globalThis.fetch)
  ) {
    state.nativeFetch = globalThis.fetch.bind(globalThis);
  }

  if (!state.guardedFetch) {
    state.guardedFetch = createGuardedFetch(state);
  }

  if (globalThis.fetch !== state.guardedFetch) {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: state.guardedFetch,
    });
  }

  patchNodeHttpModules(state);
  patchXmlHttpRequest(state);
}
