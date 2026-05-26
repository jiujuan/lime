import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

import {
  LIVE_PROVIDER_SMOKE_ENV,
  REAL_API_TEST_ENV,
  type FetchInit,
  type FetchInput,
  isVitestResolvedNetworkUrlAllowed,
  resolveFetchUrl,
  resolveNodeHttpRequestUrl,
  resolveNodeSocketConnectUrl,
  vitestLiveProviderNetworkAllowed,
} from "./vitest-network-policy";

export {
  isVitestNetworkUrlAllowed,
  isVitestNodeHttpRequestAllowed,
  isVitestNodeSocketConnectAllowed,
  resolveFetchUrl,
  resolveNodeHttpRequestUrl,
  resolveNodeSocketConnectUrl,
  vitestLiveProviderNetworkAllowed,
} from "./vitest-network-policy";

const GUARD_STATE_KEY = Symbol.for("lime.vitestNetworkGuard");

type FetchLike = typeof fetch;
type HttpRequestLike = typeof http.request;
type HttpGetLike = typeof http.get;
type HttpsRequestLike = typeof https.request;
type HttpsGetLike = typeof https.get;
type NetConnectLike = typeof net.connect;
type NetCreateConnectionLike = typeof net.createConnection;
type TlsConnectLike = typeof tls.connect;
type XmlHttpRequestOpenLike = XMLHttpRequest["open"];

interface GuardState {
  nativeFetch?: FetchLike;
  guardedFetch?: FetchLike;
  nativeHttpRequest?: HttpRequestLike;
  nativeHttpGet?: HttpGetLike;
  nativeHttpsRequest?: HttpsRequestLike;
  nativeHttpsGet?: HttpsGetLike;
  nativeNetConnect?: NetConnectLike;
  nativeNetCreateConnection?: NetCreateConnectionLike;
  nativeTlsConnect?: TlsConnectLike;
  guardedHttpRequest?: HttpRequestLike;
  guardedHttpGet?: HttpGetLike;
  guardedHttpsRequest?: HttpsRequestLike;
  guardedHttpsGet?: HttpsGetLike;
  guardedNetConnect?: NetConnectLike;
  guardedNetCreateConnection?: NetCreateConnectionLike;
  guardedTlsConnect?: TlsConnectLike;
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
      nativeNetConnect: net.connect.bind(net) as NetConnectLike,
      nativeNetCreateConnection: net.createConnection.bind(
        net,
      ) as NetCreateConnectionLike,
      nativeTlsConnect: tls.connect.bind(tls) as TlsConnectLike,
      nativeXmlHttpRequestOpen:
        typeof XMLHttpRequest !== "undefined"
          ? XMLHttpRequest.prototype.open
          : undefined,
    };
  }

  return root[GUARD_STATE_KEY];
}

function assertVitestNetworkRequestAllowed(
  url: URL | null,
  rawInput: unknown,
): void {
  if (
    vitestLiveProviderNetworkAllowed() ||
    isVitestResolvedNetworkUrlAllowed(url)
  ) {
    return;
  }

  throw new Error(
    `[vitest-network-guard] 默认禁止 Vitest 外部网络请求，避免误耗真实 Provider 额度：${url?.href ?? String(rawInput)}。如确需 live Provider 测试，请设置 ${LIVE_PROVIDER_SMOKE_ENV}=1 或 ${REAL_API_TEST_ENV}=1。`,
  );
}

function createGuardedFetch(state: GuardState): FetchLike {
  const guardedFetch = (async (
    input: FetchInput | URL,
    init?: FetchInit,
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

function createGuardedNetConnect(state: GuardState): NetConnectLike {
  return ((...args: Parameters<NetConnectLike>) => {
    assertVitestNetworkRequestAllowed(
      resolveNodeSocketConnectUrl("http:", args),
      args[0],
    );

    if (!state.nativeNetConnect) {
      throw new Error(
        "[vitest-network-guard] 当前运行环境没有可用 net connect。",
      );
    }

    return (state.nativeNetConnect as (...requestArgs: unknown[]) => unknown)(
      ...args,
    );
  }) as NetConnectLike;
}

function createGuardedNetCreateConnection(
  state: GuardState,
): NetCreateConnectionLike {
  return ((...args: Parameters<NetCreateConnectionLike>) => {
    assertVitestNetworkRequestAllowed(
      resolveNodeSocketConnectUrl("http:", args),
      args[0],
    );

    if (!state.nativeNetCreateConnection) {
      throw new Error(
        "[vitest-network-guard] 当前运行环境没有可用 net createConnection。",
      );
    }

    return (
      state.nativeNetCreateConnection as (...requestArgs: unknown[]) => unknown
    )(...args);
  }) as NetCreateConnectionLike;
}

function createGuardedTlsConnect(state: GuardState): TlsConnectLike {
  return ((...args: Parameters<TlsConnectLike>) => {
    assertVitestNetworkRequestAllowed(
      resolveNodeSocketConnectUrl("https:", args),
      args[0],
    );

    if (!state.nativeTlsConnect) {
      throw new Error(
        "[vitest-network-guard] 当前运行环境没有可用 tls connect。",
      );
    }

    return (state.nativeTlsConnect as (...requestArgs: unknown[]) => unknown)(
      ...args,
    );
  }) as TlsConnectLike;
}

function createGuardedXmlHttpRequestOpen(
  state: GuardState,
): XmlHttpRequestOpenLike {
  return function guardedXmlHttpRequestOpen(
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

    return (
      state.nativeXmlHttpRequestOpen as (...args: unknown[]) => void
    ).call(this, method, url, async, username, password);
  } as XmlHttpRequestOpenLike;
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
    (value as { __limeVitestNetworkGuard?: boolean }).__limeVitestNetworkGuard,
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

function patchNodeSocketModules(state: GuardState): void {
  if (net.connect !== state.guardedNetConnect) {
    if (!state.guardedNetConnect) {
      state.guardedNetConnect = createGuardedNetConnect(state);
    }
    net.connect = state.guardedNetConnect;
  }

  if (net.createConnection !== state.guardedNetCreateConnection) {
    if (!state.guardedNetCreateConnection) {
      state.guardedNetCreateConnection =
        createGuardedNetCreateConnection(state);
    }
    net.createConnection = state.guardedNetCreateConnection;
  }

  if (tls.connect !== state.guardedTlsConnect) {
    if (!state.guardedTlsConnect) {
      state.guardedTlsConnect = createGuardedTlsConnect(state);
    }
    tls.connect = state.guardedTlsConnect;
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
  patchNodeSocketModules(state);
  patchXmlHttpRequest(state);
}
