import { buildShellChromeDescriptor, validateShellChromeDescriptor } from "../shell";
import type { AgentAppPackageDescriptor } from "./packageTarget";

export type AgentAppNativeShellRegistrationBlockerCode =
  | "DEEP_LINK_SCHEME_REUSES_DESKTOP"
  | "MACOS_IDENTITY_MISSING"
  | "SHELL_CHROME_INVALID"
  | "TARGET_NOT_STANDALONE";

export interface AgentAppNativeShellRegistrationBlocker {
  code: AgentAppNativeShellRegistrationBlockerCode;
  message: string;
  details?: unknown;
}

export interface AgentAppNativeShellRegistrationPlan {
  schemaVersion: 1;
  appId: string;
  productName: string;
  bundleIdentifier?: string;
  deepLinkSchemes: string[];
  menu: ReturnType<typeof buildShellChromeDescriptor>["menu"];
  tray: ReturnType<typeof buildShellChromeDescriptor>["tray"];
  closePolicy: ReturnType<typeof buildShellChromeDescriptor>["closePolicy"];
  nativeShellConfigPatch: {
    productName: string;
    identifier?: string;
    plugins: {
      "deep-link": {
        desktop: {
          schemes: string[];
        };
      };
    };
  };
  runtimeEnv: {
    LIME_AGENT_APP_STANDALONE_APP_ID: string;
    LIME_AGENT_APP_STANDALONE_ENTRY_KEY: string;
    LIME_AGENT_APP_STANDALONE_DEEP_LINK_SCHEME: string;
  };
  status: "ready" | "blocked";
  blockers: AgentAppNativeShellRegistrationBlocker[];
}

function isDesktopDeepLinkScheme(scheme: string): boolean {
  return scheme.trim().toLowerCase() === "lime";
}

export function buildNativeShellRegistrationPlan(params: {
  descriptor: AgentAppPackageDescriptor;
}): AgentAppNativeShellRegistrationPlan {
  const { descriptor } = params;
  const chrome = buildShellChromeDescriptor(descriptor.shell);
  const blockers: AgentAppNativeShellRegistrationBlocker[] = [];

  if (descriptor.target.kind !== "standalone") {
    blockers.push({
      code: "TARGET_NOT_STANDALONE",
      message: "Native shell registration only applies to standalone Agent Apps.",
    });
  }
  if (descriptor.target.platform === "macos" && !descriptor.target.macosIdentity) {
    blockers.push({
      code: "MACOS_IDENTITY_MISSING",
      message: "macOS standalone shell registration requires an independent Bundle ID.",
    });
  }
  const chromeIssues = validateShellChromeDescriptor(chrome);
  if (chromeIssues.length > 0) {
    blockers.push({
      code: "SHELL_CHROME_INVALID",
      message: "Standalone shell chrome descriptor is not valid for native registration.",
      details: chromeIssues,
    });
  }
  if (isDesktopDeepLinkScheme(chrome.deepLink.scheme)) {
    blockers.push({
      code: "DEEP_LINK_SCHEME_REUSES_DESKTOP",
      message: "Standalone Agent App deep link scheme must not reuse Lime Desktop's lime:// scheme.",
    });
  }

  const productName = chrome.menu.appName;
  const bundleIdentifier = descriptor.target.macosIdentity?.bundleId;
  const deepLinkSchemes = [chrome.deepLink.scheme];
  const nativeShellConfigPatch = {
    productName,
    identifier: bundleIdentifier,
    plugins: {
      "deep-link": {
        desktop: {
          schemes: deepLinkSchemes,
        },
      },
    },
  };

  return {
    schemaVersion: 1,
    appId: descriptor.shell.appId,
    productName,
    bundleIdentifier,
    deepLinkSchemes,
    menu: chrome.menu,
    tray: chrome.tray,
    closePolicy: chrome.closePolicy,
    nativeShellConfigPatch,
    runtimeEnv: {
      LIME_AGENT_APP_STANDALONE_APP_ID: descriptor.shell.appId,
      LIME_AGENT_APP_STANDALONE_ENTRY_KEY: chrome.deepLink.openEntryKey,
      LIME_AGENT_APP_STANDALONE_DEEP_LINK_SCHEME: chrome.deepLink.scheme,
    },
    status: blockers.length > 0 ? "blocked" : "ready",
    blockers,
  };
}
