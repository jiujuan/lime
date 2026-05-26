import process from "node:process";

export const LIVE_PROVIDER_SMOKE_ENV = "LIME_ALLOW_LIVE_PROVIDER_SMOKE";
export const REAL_API_TEST_ENV = "LIME_REAL_API_TEST";

const LOCAL_HTTP_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
]);

type FetchLike = typeof fetch;

export type FetchInput = Parameters<FetchLike>[0];
export type FetchInit = Parameters<FetchLike>[1];

function isTruthyEnv(value: unknown): boolean {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

export function vitestLiveProviderNetworkAllowed(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (
    isTruthyEnv(env[LIVE_PROVIDER_SMOKE_ENV]) ||
    isTruthyEnv(env[REAL_API_TEST_ENV])
  );
}

export function resolveFetchUrl(input: FetchInput | URL): URL | null {
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

export function isVitestResolvedNetworkUrlAllowed(url: URL | null): boolean {
  if (!url) {
    return true;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return true;
  }

  const hostname = url.hostname.toLowerCase();
  return LOCAL_HTTP_HOSTS.has(hostname) || hostname.endsWith(".localhost");
}

export function isVitestNetworkUrlAllowed(input: FetchInput | URL): boolean {
  return isVitestResolvedNetworkUrlAllowed(resolveFetchUrl(input));
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
  return isVitestResolvedNetworkUrlAllowed(
    resolveNodeHttpRequestUrl(defaultProtocol, args),
  );
}

export function resolveNodeSocketConnectUrl(
  defaultProtocol: "http:" | "https:",
  args: unknown[],
): URL | null {
  const first = args[0];
  const second = args[1];
  const options = isRequestOptions(first)
    ? first
    : isRequestOptions(second)
      ? second
      : undefined;

  if (first instanceof URL) {
    return mergeUrlWithOptions(first, options);
  }

  if (typeof first === "string" && first.includes("://")) {
    try {
      return mergeUrlWithOptions(new URL(first), options);
    } catch {
      return null;
    }
  }

  if (typeof first === "number" && Number.isFinite(first)) {
    const host =
      stringOption(second) ||
      stringOption(options?.hostname) ||
      stringOption(options?.host) ||
      stringOption(options?.servername) ||
      "127.0.0.1";
    const url = new URL(`${defaultProtocol}//${host}`);
    url.port = String(first);
    return url;
  }

  if (!options) {
    return null;
  }

  const hostname =
    stringOption(options.hostname) ||
    stringOption(options.host) ||
    stringOption(options.servername);
  const port = stringOption(options.port);

  if (!hostname) {
    return null;
  }

  const url = new URL(`${defaultProtocol}//${hostname}`);
  if (port) {
    url.port = port;
  }
  return url;
}

export function isVitestNodeSocketConnectAllowed(
  defaultProtocol: "http:" | "https:",
  args: unknown[],
): boolean {
  return isVitestResolvedNetworkUrlAllowed(
    resolveNodeSocketConnectUrl(defaultProtocol, args),
  );
}
