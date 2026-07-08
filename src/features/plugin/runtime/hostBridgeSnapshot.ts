import {
  LIME_COLOR_SCHEME_CHANGED_EVENT,
  loadLimeColorSchemeId,
  type LimeColorSchemeId,
} from "@/lib/appearance/colorSchemes";
import {
  getEffectiveLimeThemeMode,
  LIME_THEME_CHANGED_EVENT,
  loadLimeThemeMode,
  type LimeEffectiveThemeMode,
  type LimeThemeMode,
} from "@/lib/appearance/themeMode";

export const PLUGIN_BRIDGE_PROTOCOL = "lime.plugin.bridge";
export const PLUGIN_BRIDGE_VERSION = 1;

export { LIME_COLOR_SCHEME_CHANGED_EVENT, LIME_THEME_CHANGED_EVENT };

export interface LimePluginBridgeMessage {
  protocol: typeof PLUGIN_BRIDGE_PROTOCOL;
  version: typeof PLUGIN_BRIDGE_VERSION;
  type: string;
  requestId?: string;
  appId: string;
  entryKey?: string;
  payload?: unknown;
}

export interface PluginThemePayload {
  themeMode: LimeThemeMode;
  effectiveThemeMode: LimeEffectiveThemeMode;
  colorSchemeId: LimeColorSchemeId;
  tokens: Record<string, string>;
}

export interface PluginHostSnapshotPayload {
  app: {
    appId: string;
    entryKey?: string;
    displayName: string;
    route?: string;
    runtimeOrigin: string;
  };
  host: {
    name: "Lime";
    bridgeProtocol: typeof PLUGIN_BRIDGE_PROTOCOL;
    bridgeVersion: typeof PLUGIN_BRIDGE_VERSION;
    locale: string;
    visibilityState: PluginVisibilityState;
    sentAt: string;
  };
  theme: PluginThemePayload;
  cloud?: {
    controlPlaneBaseUrl?: string;
    tenantId?: string;
    hasSession: boolean;
  };
  capabilities: {
    available: string[];
    blocked: string[];
  };
}

export interface PluginHostBridgeCapabilities {
  available: string[];
  blocked: string[];
}

export type PluginVisibilityState = "hidden" | "visible" | "prerender";

export interface TrustedPluginBridgeMessage {
  message: LimePluginBridgeMessage;
  source: Window;
  origin: string;
}

export interface BuildPluginHostSnapshotOptions {
  appId: string;
  entryKey?: string;
  displayName: string;
  entryRoute?: string;
  entryUrl?: string;
  locale?: string;
  runtimeOrigin: string;
  cloud?:
    | PluginHostSnapshotPayload["cloud"]
    | (() => PluginHostSnapshotPayload["cloud"]);
  capabilities?: PluginHostBridgeCapabilities;
  now?: () => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function collectCssVariableTokens(root: HTMLElement): Record<string, string> {
  const tokens: Record<string, string> = {};
  const appendToken = (name: string, value: string) => {
    if (!name.startsWith("--lime-") && !name.startsWith("--app-")) {
      return;
    }
    const normalized = value.trim();
    if (normalized) {
      tokens[name] = normalized;
    }
  };

  for (let index = 0; index < root.style.length; index += 1) {
    const name = root.style.item(index);
    appendToken(name, root.style.getPropertyValue(name));
  }

  if (typeof window !== "undefined" && window.getComputedStyle) {
    const computed = window.getComputedStyle(root);
    for (let index = 0; index < computed.length; index += 1) {
      const name = computed.item(index);
      appendToken(name, computed.getPropertyValue(name));
    }
  }

  return tokens;
}

function normalizeCapabilities(
  capabilities?: PluginHostBridgeCapabilities,
): PluginHostBridgeCapabilities {
  if (!capabilities) {
    return {
      available: ["lime.ui"],
      blocked: [
        "lime.storage",
        "lime.agent",
        "lime.knowledge",
        "lime.workflow",
      ],
    };
  }
  return {
    available: Array.from(
      new Set(["lime.ui", ...capabilities.available]),
    ).sort(),
    blocked: Array.from(
      new Set(capabilities.blocked.filter((item) => item !== "lime.ui")),
    ).sort(),
  };
}

export function readDocumentVisibilityState(): PluginVisibilityState {
  if (typeof document === "undefined") {
    return "visible";
  }
  const visibilityState = String(document.visibilityState);
  return visibilityState === "hidden"
    ? "hidden"
    : visibilityState === "prerender"
      ? "prerender"
      : "visible";
}

export function buildPluginThemePayload(
  root: HTMLElement = typeof document === "undefined"
    ? (undefined as never)
    : document.documentElement,
): PluginThemePayload {
  const themeMode = loadLimeThemeMode();
  const effectiveThemeMode = getEffectiveLimeThemeMode(themeMode);
  return {
    themeMode,
    effectiveThemeMode,
    colorSchemeId: loadLimeColorSchemeId(),
    tokens: root ? collectCssVariableTokens(root) : {},
  };
}

export function buildPluginHostSnapshot(
  options: BuildPluginHostSnapshotOptions,
): PluginHostSnapshotPayload {
  const cloudSource =
    typeof options.cloud === "function" ? options.cloud() : options.cloud;
  const cloud = cloudSource
    ? {
        controlPlaneBaseUrl: cloudSource.controlPlaneBaseUrl,
        tenantId: cloudSource.tenantId,
        hasSession: Boolean(cloudSource.hasSession),
      }
    : undefined;
  return {
    app: {
      appId: options.appId,
      entryKey: options.entryKey,
      displayName: options.displayName,
      route: options.entryRoute,
      runtimeOrigin: options.runtimeOrigin,
    },
    host: {
      name: "Lime",
      bridgeProtocol: PLUGIN_BRIDGE_PROTOCOL,
      bridgeVersion: PLUGIN_BRIDGE_VERSION,
      locale:
        options.locale ??
        (typeof document !== "undefined" && document.documentElement.lang
          ? document.documentElement.lang
          : typeof navigator !== "undefined"
            ? navigator.language
            : "zh-CN"),
      visibilityState: readDocumentVisibilityState(),
      sentAt: (options.now ?? (() => new Date().toISOString()))(),
    },
    theme: buildPluginThemePayload(),
    ...(cloud ? { cloud } : {}),
    capabilities: normalizeCapabilities(options.capabilities),
  };
}

export function resolvePluginRuntimeOrigin(entryUrl: string): string | null {
  try {
    return new URL(entryUrl).origin;
  } catch {
    return null;
  }
}

export function isLimePluginBridgeMessage(
  value: unknown,
): value is LimePluginBridgeMessage {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.protocol === PLUGIN_BRIDGE_PROTOCOL &&
    value.version === PLUGIN_BRIDGE_VERSION &&
    typeof value.type === "string" &&
    typeof value.appId === "string" &&
    (value.requestId === undefined || typeof value.requestId === "string") &&
    (value.entryKey === undefined || typeof value.entryKey === "string")
  );
}

export function isTrustedPluginBridgeMessage(
  event: MessageEvent<unknown>,
  options: {
    appWindow: Window | null;
    runtimeOrigin: string;
    appId: string;
    entryKey?: string;
  },
): TrustedPluginBridgeMessage | null {
  if (!options.appWindow || event.source !== options.appWindow) {
    return null;
  }
  if (event.origin !== options.runtimeOrigin) {
    return null;
  }
  if (!isLimePluginBridgeMessage(event.data)) {
    return null;
  }
  if (event.data.appId !== options.appId) {
    return null;
  }
  if (options.entryKey && event.data.entryKey !== options.entryKey) {
    return null;
  }
  return {
    message: event.data,
    source: options.appWindow,
    origin: event.origin,
  };
}
