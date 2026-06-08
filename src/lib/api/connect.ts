import { AppServerClient } from "@/lib/api/appServer";
import {
  METHOD_CONNECT_CALLBACK_SEND,
  METHOD_CONNECT_DEEP_LINK_RESOLVE,
  METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE,
  METHOD_CONNECT_RELAY_API_KEY_SAVE,
  type ConnectCallbackSendParams,
  type ConnectCallbackSendResponse,
  type ConnectDeepLinkResolveResponse as AppServerConnectDeepLinkResolveResponse,
  type ConnectOpenDeepLinkResolveResponse as AppServerConnectOpenDeepLinkResolveResponse,
  type ConnectRelayApiKeySaveParams,
  type ConnectRelayApiKeySaveResponse as AppServerConnectRelayApiKeySaveResponse,
} from "../../../packages/app-server-client/src/protocol";

export interface ConnectPayload {
  relay: string;
  key: string;
  name?: string;
  ref_code?: string;
}

export interface RelayBranding {
  logo: string;
  color: string;
}

export interface RelayLinks {
  homepage: string;
  register?: string;
  recharge?: string;
  docs?: string;
  status?: string;
  dashboard?: string;
  website?: string;
}

export interface RelayApi {
  base_url: string;
  protocol: string;
  auth_header: string;
  auth_prefix: string;
}

export interface RelayContact {
  email?: string;
  discord?: string;
  telegram?: string;
  twitter?: string;
}

export interface RelayFeatures {
  models: string[];
  streaming: boolean;
  function_calling: boolean;
  vision: boolean;
  verified?: boolean;
}

export interface RelayInfo {
  id: string;
  name: string;
  description: string;
  branding: RelayBranding;
  links: RelayLinks;
  api: RelayApi;
  contact: RelayContact;
  features: RelayFeatures;
}

export interface DeepLinkResult {
  payload: ConnectPayload;
  relay_info: RelayInfo | null;
  is_verified: boolean;
}

export interface OpenDeepLinkPayload {
  kind: "skill" | "prompt";
  slug: string;
  source?: string | null;
  version?: string | null;
  action?: "open" | "install" | null;
}

export interface OpenDeepLinkResult {
  payload: OpenDeepLinkPayload;
}

export interface SaveApiKeyResult {
  provider_id: string;
  key_id: string;
  provider_name: string;
  is_new_provider: boolean;
}

type ConnectAppServerClient = Pick<AppServerClient, "request">;

function appServerClient(): ConnectAppServerClient {
  return new AppServerClient();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function readStringList(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isNullableOptionalString(
  value: unknown,
): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function assertConnectDeepLinkResolveResult(
  value: unknown,
): asserts value is AppServerConnectDeepLinkResolveResponse {
  if (!isRecord(value) || !isRecord(value.payload)) {
    throw new Error("connectDeepLink/resolve did not return payload");
  }
  const payload = value.payload;
  if (
    typeof payload.relay !== "string" ||
    typeof payload.key !== "string" ||
    !isOptionalString(payload.name) ||
    !isOptionalString(payload.refCode) ||
    !(
      value.relayInfo === null ||
      value.relayInfo === undefined ||
      isRecord(value.relayInfo)
    ) ||
    typeof value.isVerified !== "boolean"
  ) {
    throw new Error("connectDeepLink/resolve did not return payload");
  }
}

function assertConnectOpenDeepLinkResolveResult(
  value: unknown,
): asserts value is AppServerConnectOpenDeepLinkResolveResponse {
  if (!isRecord(value) || !isRecord(value.payload)) {
    throw new Error("connectOpenDeepLink/resolve did not return payload");
  }
  const payload = value.payload;
  if (
    (payload.kind !== "skill" && payload.kind !== "prompt") ||
    typeof payload.slug !== "string" ||
    !isNullableOptionalString(payload.source) ||
    !isNullableOptionalString(payload.version) ||
    !(
      payload.action === undefined ||
      payload.action === null ||
      payload.action === "open" ||
      payload.action === "install"
    )
  ) {
    throw new Error("connectOpenDeepLink/resolve did not return payload");
  }
}

function assertConnectRelayApiKeySaveResult(
  value: unknown,
): asserts value is AppServerConnectRelayApiKeySaveResponse {
  if (
    !isRecord(value) ||
    typeof value.providerId !== "string" ||
    typeof value.keyId !== "string" ||
    typeof value.providerName !== "string" ||
    typeof value.isNewProvider !== "boolean"
  ) {
    throw new Error("connectRelayApiKey/save did not return saved API key");
  }
}

function assertConnectCallbackSendResult(
  value: unknown,
): asserts value is ConnectCallbackSendResponse {
  if (!isRecord(value) || typeof value.delivered !== "boolean") {
    throw new Error("connectCallback/send did not return delivered status");
  }
}

function projectRelayInfo(value: unknown): RelayInfo | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value, "id").trim();
  const name = readString(value, "name").trim();
  if (!id || !name) {
    return null;
  }

  const branding = isRecord(value.branding) ? value.branding : {};
  const links = isRecord(value.links) ? value.links : {};
  const api = isRecord(value.api) ? value.api : {};
  const contact = isRecord(value.contact) ? value.contact : {};
  const features = isRecord(value.features) ? value.features : {};

  return {
    id,
    name,
    description: readString(value, "description"),
    branding: {
      logo: readString(branding, "logo"),
      color: readString(branding, "color"),
    },
    links: {
      homepage: readString(links, "homepage"),
      register: readString(links, "register") || undefined,
      recharge: readString(links, "recharge") || undefined,
      docs: readString(links, "docs") || undefined,
      status: readString(links, "status") || undefined,
      dashboard: readString(links, "dashboard") || undefined,
      website: readString(links, "website") || undefined,
    },
    api: {
      base_url: readString(api, "base_url"),
      protocol: readString(api, "protocol"),
      auth_header: readString(api, "auth_header"),
      auth_prefix: readString(api, "auth_prefix"),
    },
    contact: {
      email: readString(contact, "email") || undefined,
      discord: readString(contact, "discord") || undefined,
      telegram: readString(contact, "telegram") || undefined,
      twitter: readString(contact, "twitter") || undefined,
    },
    features: {
      models: readStringList(features, "models"),
      streaming: readBoolean(features, "streaming"),
      function_calling: readBoolean(features, "function_calling"),
      vision: readBoolean(features, "vision"),
      verified:
        typeof features.verified === "boolean" ? features.verified : undefined,
    },
  };
}

export async function resolveConnectDeepLink(
  url: string,
  client: ConnectAppServerClient = appServerClient(),
): Promise<DeepLinkResult> {
  const response =
    await client.request<AppServerConnectDeepLinkResolveResponse>(
      METHOD_CONNECT_DEEP_LINK_RESOLVE,
      { url },
    );
  assertConnectDeepLinkResolveResult(response.result);
  return {
    payload: {
      relay: response.result.payload.relay,
      key: response.result.payload.key,
      name: response.result.payload.name,
      ref_code: response.result.payload.refCode,
    },
    relay_info: projectRelayInfo(response.result.relayInfo),
    is_verified: response.result.isVerified,
  };
}

export async function resolveOpenDeepLink(
  url: string,
  client: ConnectAppServerClient = appServerClient(),
): Promise<OpenDeepLinkResult> {
  const response =
    await client.request<AppServerConnectOpenDeepLinkResolveResponse>(
      METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE,
      { url },
    );
  assertConnectOpenDeepLinkResolveResult(response.result);
  const payload = response.result.payload;
  return {
    payload: {
      kind: payload.kind === "prompt" ? "prompt" : "skill",
      slug: payload.slug,
      source: payload.source ?? null,
      version: payload.version ?? null,
      action:
        payload.action === "install" || payload.action === "open"
          ? payload.action
          : null,
    },
  };
}

export async function saveConnectRelayApiKey(
  params: ConnectRelayApiKeySaveParams,
  client: ConnectAppServerClient = appServerClient(),
): Promise<SaveApiKeyResult> {
  const response =
    await client.request<AppServerConnectRelayApiKeySaveResponse>(
      METHOD_CONNECT_RELAY_API_KEY_SAVE,
      params,
    );
  assertConnectRelayApiKeySaveResult(response.result);
  return {
    provider_id: response.result.providerId,
    key_id: response.result.keyId,
    provider_name: response.result.providerName,
    is_new_provider: response.result.isNewProvider,
  };
}

export async function sendConnectCallback(
  params: ConnectCallbackSendParams,
  client: ConnectAppServerClient = appServerClient(),
): Promise<boolean> {
  const response = await client.request<ConnectCallbackSendResponse>(
    METHOD_CONNECT_CALLBACK_SEND,
    params,
  );
  assertConnectCallbackSendResult(response.result);
  return response.result.delivered;
}
