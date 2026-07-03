import {
  getStoredOemCloudAccessToken,
  getStoredOemCloudTenantId,
} from "@/lib/oemCloudSession";

export const DEFAULT_OEM_CLOUD_LOGIN_PATH = "/login";
export const DEFAULT_OEM_CLOUD_DESKTOP_CLIENT_ID = "desktop-client";
export const DEFAULT_OEM_CLOUD_DESKTOP_OAUTH_REDIRECT_URL =
  "lime://oauth/callback";
export const DEFAULT_OEM_CLOUD_DESKTOP_OAUTH_NEXT_PATH = "/welcome";

export type OemCloudPluginSignatureAlgorithm =
  | "RSASSA-PKCS1-v1_5-SHA256"
  | "RSA-PSS-SHA256"
  | "ECDSA-P256-SHA256"
  | "Ed25519";

export interface OemCloudPluginSignatureTrustRoot {
  publicKeyId: string;
  algorithm: OemCloudPluginSignatureAlgorithm;
  publicKey: string;
  appIds?: string[];
  notBefore?: string;
  notAfter?: string;
  revoked?: boolean;
  revokedAt?: string;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeBaseUrl(value: unknown): string | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  return normalized.replace(/\/+$/, "");
}

function normalizeAppPath(value: unknown): string | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (normalized === "/") {
    return normalized;
  }

  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readRecordText(
  record: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = normalizeText(record[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

const PLUGIN_SIGNATURE_ALGORITHMS =
  new Set<OemCloudPluginSignatureAlgorithm>([
    "RSASSA-PKCS1-v1_5-SHA256",
    "RSA-PSS-SHA256",
    "ECDSA-P256-SHA256",
    "Ed25519",
  ]);

function extractTenantIdFromPayload(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const directTenantId = readRecordText(payload, "tenantId", "tenant_id");
  if (directTenantId) {
    return directTenantId;
  }

  const tenant = payload.tenant;
  if (isRecord(tenant)) {
    const nestedTenantId = readRecordText(
      tenant,
      "id",
      "tenantId",
      "tenant_id",
    );
    if (nestedTenantId) {
      return nestedTenantId;
    }
  }

  if (payload.bootstrap) {
    return extractTenantIdFromPayload(payload.bootstrap);
  }

  return null;
}

function extractSessionTokenFromPayload(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const directToken = readRecordText(
    payload,
    "sessionToken",
    "session_token",
    "authToken",
    "auth_token",
    "token",
  );
  if (directToken) {
    return directToken;
  }

  const session = payload.session;
  if (isRecord(session)) {
    const sessionToken = readRecordText(
      session,
      "token",
      "sessionToken",
      "session_token",
    );
    if (sessionToken) {
      return sessionToken;
    }
  }

  if (payload.bootstrap) {
    return extractSessionTokenFromPayload(payload.bootstrap);
  }

  return null;
}

function readStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value
    .map((item) => normalizeText(item))
    .filter((item): item is string => Boolean(item));
  return items.length > 0 ? items : undefined;
}

function hasRecordKey(
  record: Record<string, unknown>,
  ...keys: string[]
): boolean {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(record, key));
}

function isValidDateText(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function readOptionalDateText(
  record: Record<string, unknown>,
  ...keys: string[]
): string | null | undefined {
  if (!hasRecordKey(record, ...keys)) {
    return undefined;
  }
  const value = readRecordText(record, ...keys);
  if (!value || !isValidDateText(value)) {
    return null;
  }
  return value;
}

function readOptionalBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | null | undefined {
  if (!hasRecordKey(record, key)) {
    return undefined;
  }
  return typeof record[key] === "boolean" ? record[key] : null;
}

function parsePluginSignatureTrustRoot(
  value: unknown,
): OemCloudPluginSignatureTrustRoot | null {
  if (!isRecord(value) || Array.isArray(value)) {
    return null;
  }
  const publicKeyId = readRecordText(
    value,
    "publicKeyId",
    "public_key_id",
    "keyId",
    "key_id",
  );
  const algorithm = readRecordText(value, "algorithm");
  const publicKey = readRecordText(value, "publicKey", "public_key", "spki");
  if (
    !publicKeyId ||
    !algorithm ||
    !publicKey ||
    !PLUGIN_SIGNATURE_ALGORITHMS.has(
      algorithm as OemCloudPluginSignatureAlgorithm,
    )
  ) {
    return null;
  }
  const notBefore = readOptionalDateText(value, "notBefore", "not_before");
  const notAfter = readOptionalDateText(value, "notAfter", "not_after");
  const revokedAt = readOptionalDateText(value, "revokedAt", "revoked_at");
  const revoked = readOptionalBoolean(value, "revoked");
  if (
    notBefore === null ||
    notAfter === null ||
    revokedAt === null ||
    revoked === null
  ) {
    return null;
  }

  return {
    publicKeyId,
    algorithm: algorithm as OemCloudPluginSignatureAlgorithm,
    publicKey,
    appIds: readStringList(value.appIds ?? value.app_ids),
    ...(notBefore ? { notBefore } : {}),
    ...(notAfter ? { notAfter } : {}),
    ...(revoked !== undefined ? { revoked } : {}),
    ...(revokedAt ? { revokedAt } : {}),
  };
}

function readPluginSignatureTrustRoots(
  value: unknown,
): OemCloudPluginSignatureTrustRoot[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(parsePluginSignatureTrustRoot)
    .filter(
      (
        item,
      ): item is OemCloudPluginSignatureTrustRoot => Boolean(item),
    );
}

function extractPluginSignatureTrustRootsFromPayload(
  payload: unknown,
): OemCloudPluginSignatureTrustRoot[] {
  if (!isRecord(payload)) {
    return [];
  }

  const directRoots = readPluginSignatureTrustRoots(
    payload.pluginSignatureTrustRoots ??
      payload.plugin_signature_trust_roots,
  );
  if (directRoots.length > 0) {
    return directRoots;
  }

  const plugins = payload.plugins ?? payload.plugins;
  if (isRecord(plugins)) {
    const nestedRoots = readPluginSignatureTrustRoots(
      plugins.signatureTrustRoots ?? plugins.signature_trust_roots,
    );
    if (nestedRoots.length > 0) {
      return nestedRoots;
    }
  }

  const security = payload.security;
  if (isRecord(security)) {
    const securityRoots = readPluginSignatureTrustRoots(
      security.pluginSignatureTrustRoots ??
        security.plugin_signature_trust_roots,
    );
    if (securityRoots.length > 0) {
      return securityRoots;
    }
  }

  if (payload.bootstrap) {
    return extractPluginSignatureTrustRootsFromPayload(payload.bootstrap);
  }

  return [];
}

interface OemCloudRuntimeOverride {
  enabled?: boolean;
  baseUrl: string | null;
  gatewayBaseUrl: string | null;
  tenantId: string | null;
  sessionToken: string | null;
  hubProviderName: string | null;
  loginPath: string | null;
  desktopClientId: string | null;
  desktopOauthRedirectUrl: string | null;
  desktopOauthNextPath: string | null;
  pluginSignatureTrustRoots: OemCloudPluginSignatureTrustRoot[];
}

function parseOemCloudRuntimeOverride(
  payload: unknown,
): OemCloudRuntimeOverride {
  if (!isRecord(payload)) {
    return {
      baseUrl: null,
      gatewayBaseUrl: null,
      tenantId: null,
      sessionToken: null,
      hubProviderName: null,
      loginPath: null,
      desktopClientId: null,
      desktopOauthRedirectUrl: null,
      desktopOauthNextPath: null,
      pluginSignatureTrustRoots: [],
    };
  }

  const baseUrl = normalizeBaseUrl(
    payload.baseUrl ?? payload.base_url ?? payload.origin,
  );
  const gatewayBaseUrl = normalizeBaseUrl(
    payload.gatewayBaseUrl ??
      payload.gateway_base_url ??
      payload.gatewayUrl ??
      payload.gateway_url,
  );
  const tenantId =
    readRecordText(payload, "tenantId", "tenant_id") ??
    extractTenantIdFromPayload(payload);
  const sessionToken =
    readRecordText(payload, "sessionToken", "session_token") ??
    extractSessionTokenFromPayload(payload);
  const hubProviderName = readRecordText(
    payload,
    "hubProviderName",
    "hub_provider_name",
    "limeHubProviderName",
    "lime_hub_provider_name",
  );
  const loginPath = normalizeAppPath(
    payload.loginPath ??
      payload.login_path ??
      payload.userCenterLoginPath ??
      payload.user_center_login_path,
  );
  const desktopClientId = readRecordText(
    payload,
    "desktopClientId",
    "desktop_client_id",
  );
  const desktopOauthRedirectUrl = readRecordText(
    payload,
    "desktopOauthRedirectUrl",
    "desktop_oauth_redirect_url",
    "desktopOAuthRedirectUrl",
    "desktopRedirectUri",
    "desktop_redirect_uri",
  );
  const desktopOauthNextPath = normalizeAppPath(
    payload.desktopOauthNextPath ??
      payload.desktop_oauth_next_path ??
      payload.desktopOAuthNextPath,
  );
  const pluginSignatureTrustRoots =
    extractPluginSignatureTrustRootsFromPayload(payload);

  return {
    enabled: typeof payload.enabled === "boolean" ? payload.enabled : undefined,
    baseUrl,
    gatewayBaseUrl,
    tenantId,
    sessionToken,
    hubProviderName,
    loginPath,
    desktopClientId,
    desktopOauthRedirectUrl,
    desktopOauthNextPath,
    pluginSignatureTrustRoots,
  };
}

function readEnvValue(name: string): string | null {
  const env = import.meta.env as Record<string, string | boolean | undefined>;
  return normalizeText(env[name]);
}

export interface OemCloudRuntimeContext {
  baseUrl: string;
  controlPlaneBaseUrl: string;
  sceneBaseUrl: string;
  gatewayBaseUrl: string;
  tenantId: string;
  sessionToken: string | null;
  hubProviderName: string | null;
  loginPath: string;
  desktopClientId: string;
  desktopOauthRedirectUrl: string;
  desktopOauthNextPath: string;
  pluginSignatureTrustRoots: OemCloudPluginSignatureTrustRoot[];
}

declare global {
  interface Window {
    __LIME_BOOTSTRAP__?: unknown;
    __LIME_OEM_CLOUD__?: unknown;
    __LIME_SESSION_TOKEN__?: unknown;
  }
}

export function resolveOemCloudRuntimeContext(): OemCloudRuntimeContext | null {
  const envBaseUrl = normalizeBaseUrl(readEnvValue("VITE_OEM_CLOUD_BASE_URL"));
  const envGatewayBaseUrl = normalizeBaseUrl(
    readEnvValue("VITE_OEM_GATEWAY_BASE_URL"),
  );
  const envTenantId = readEnvValue("VITE_OEM_TENANT_ID");
  const envSessionToken = readEnvValue("VITE_OEM_SESSION_TOKEN");
  const envEnabled = readEnvValue("VITE_OEM_CLOUD_ENABLED");
  const envHubProviderName = readEnvValue("VITE_OEM_HUB_PROVIDER_NAME");
  const envLoginPath = normalizeAppPath(
    readEnvValue("VITE_OEM_USER_CENTER_LOGIN_PATH"),
  );
  const envDesktopClientId = readEnvValue("VITE_OEM_DESKTOP_CLIENT_ID");
  const envDesktopOauthRedirectUrl = readEnvValue(
    "VITE_OEM_DESKTOP_OAUTH_REDIRECT_URL",
  );
  const envDesktopOauthNextPath = normalizeAppPath(
    readEnvValue("VITE_OEM_DESKTOP_OAUTH_NEXT_PATH"),
  );

  const envOverride: OemCloudRuntimeOverride = {
    enabled:
      envEnabled === null
        ? undefined
        : ["1", "true", "yes", "on"].includes(envEnabled.toLowerCase()),
    baseUrl: envBaseUrl,
    gatewayBaseUrl: envGatewayBaseUrl,
    tenantId: envTenantId,
    sessionToken: envSessionToken,
    hubProviderName: envHubProviderName,
    loginPath: envLoginPath,
    desktopClientId: envDesktopClientId,
    desktopOauthRedirectUrl: envDesktopOauthRedirectUrl,
    desktopOauthNextPath: envDesktopOauthNextPath,
    pluginSignatureTrustRoots: [],
  };

  const runtimeOverride =
    typeof window === "undefined"
      ? {
          baseUrl: null,
          gatewayBaseUrl: null,
          tenantId: null,
          sessionToken: null,
          hubProviderName: null,
          loginPath: null,
          desktopClientId: null,
          desktopOauthRedirectUrl: null,
          desktopOauthNextPath: null,
          pluginSignatureTrustRoots: [],
        }
      : parseOemCloudRuntimeOverride(window.__LIME_OEM_CLOUD__);

  const bootstrapPayload =
    typeof window === "undefined" ? null : window.__LIME_BOOTSTRAP__;
  const bootstrapTenantId = extractTenantIdFromPayload(bootstrapPayload);
  const bootstrapSessionToken =
    extractSessionTokenFromPayload(bootstrapPayload);
  const storedTenantId =
    typeof window === "undefined" ? null : getStoredOemCloudTenantId();
  const storedSessionToken =
    typeof window === "undefined" ? null : getStoredOemCloudAccessToken();
  const explicitWindowSessionToken =
    typeof window === "undefined"
      ? null
      : normalizeText(window.__LIME_SESSION_TOKEN__);

  const enabled =
    runtimeOverride.enabled ??
    envOverride.enabled ??
    Boolean(runtimeOverride.baseUrl ?? envOverride.baseUrl);

  const baseUrl = runtimeOverride.baseUrl ?? envOverride.baseUrl;
  const gatewayBaseUrl =
    runtimeOverride.gatewayBaseUrl ??
    envOverride.gatewayBaseUrl ??
    (baseUrl ? `${baseUrl}/gateway-api` : null);
  const tenantId =
    runtimeOverride.tenantId ??
    envOverride.tenantId ??
    bootstrapTenantId ??
    storedTenantId;
  const sessionToken =
    explicitWindowSessionToken ??
    runtimeOverride.sessionToken ??
    envOverride.sessionToken ??
    bootstrapSessionToken ??
    storedSessionToken;
  const hubProviderName =
    runtimeOverride.hubProviderName ?? envOverride.hubProviderName ?? null;
  const loginPath =
    runtimeOverride.loginPath ??
    envOverride.loginPath ??
    DEFAULT_OEM_CLOUD_LOGIN_PATH;
  const desktopClientId =
    runtimeOverride.desktopClientId ??
    envOverride.desktopClientId ??
    DEFAULT_OEM_CLOUD_DESKTOP_CLIENT_ID;
  const desktopOauthRedirectUrl =
    runtimeOverride.desktopOauthRedirectUrl ??
    envOverride.desktopOauthRedirectUrl ??
    DEFAULT_OEM_CLOUD_DESKTOP_OAUTH_REDIRECT_URL;
  const desktopOauthNextPath =
    runtimeOverride.desktopOauthNextPath ??
    envOverride.desktopOauthNextPath ??
    DEFAULT_OEM_CLOUD_DESKTOP_OAUTH_NEXT_PATH;
  const pluginSignatureTrustRoots =
    runtimeOverride.pluginSignatureTrustRoots.length > 0
      ? runtimeOverride.pluginSignatureTrustRoots
      : extractPluginSignatureTrustRootsFromPayload(bootstrapPayload);

  if (!enabled || !baseUrl || !gatewayBaseUrl || !tenantId) {
    return null;
  }

  return {
    baseUrl,
    controlPlaneBaseUrl: `${baseUrl}/api`,
    sceneBaseUrl: `${baseUrl}/scene-api`,
    gatewayBaseUrl,
    tenantId,
    sessionToken,
    hubProviderName,
    loginPath,
    desktopClientId,
    desktopOauthRedirectUrl,
    desktopOauthNextPath,
    pluginSignatureTrustRoots,
  };
}

export function resolveOemCloudPluginSignatureTrustRoots(): OemCloudPluginSignatureTrustRoot[] {
  if (typeof window === "undefined") {
    return [];
  }
  const runtimeOverride = parseOemCloudRuntimeOverride(window.__LIME_OEM_CLOUD__);
  if (runtimeOverride.pluginSignatureTrustRoots.length > 0) {
    return runtimeOverride.pluginSignatureTrustRoots;
  }
  return extractPluginSignatureTrustRootsFromPayload(window.__LIME_BOOTSTRAP__);
}

export function hasOemCloudSession(
  context: OemCloudRuntimeContext | null,
): context is OemCloudRuntimeContext & { sessionToken: string } {
  return Boolean(context?.sessionToken);
}
