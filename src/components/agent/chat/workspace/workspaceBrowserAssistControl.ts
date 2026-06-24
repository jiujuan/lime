import type { BrowserSessionRef } from "./workspaceBrowserSessionRef";
import { buildBrowserSessionRef } from "./workspaceBrowserSessionRef";

export type BrowserAssistControlChannel =
  | "app_server_browser_session"
  | "extension_bridge";

export interface BrowserAssistControlSessionSource {
  sessionId?: string | null;
  profileKey?: string | null;
  url?: string | null;
  title?: string | null;
  targetId?: string | null;
  transportKind?: string | null;
  sourceRequestId?: string | null;
}

export interface BrowserAssistControlPlan {
  channel: BrowserAssistControlChannel;
  action: "navigate" | "read_page";
  sessionId?: string;
  profileKey?: string;
  args?: Record<string, unknown>;
}

export type BrowserAssistActionPolicyReason =
  | "current_navigation"
  | "current_read"
  | "browser_mutation"
  | "browser_script"
  | "unknown_browser_action";

export interface BrowserAssistActionConfirmationRequest {
  requestId: string;
  actionType: "tool_confirmation";
  toolName: string;
  arguments: Record<string, unknown>;
  prompt?: string;
}

export interface BrowserAssistActionPolicyDecision {
  action: string;
  mode: "auto" | "requires_confirmation";
  reason: BrowserAssistActionPolicyReason;
  confirmationRequest?: BrowserAssistActionConfirmationRequest;
}

export interface BrowserAssistActionPolicyInput {
  sessionRef: BrowserSessionRef | null;
  action: string;
  args?: Record<string, unknown> | null;
  requestId?: string | null;
  toolName?: string | null;
  prompt?: string | null;
}

const AUTO_BROWSER_ACTIONS = new Set([
  "navigate",
  "read_page",
  "get_page_info",
  "get_page_text",
  "read_console_messages",
  "read_network_requests",
]);

const MUTATING_BROWSER_ACTIONS = new Set([
  "click",
  "type",
  "form_input",
  "submit",
  "select",
  "check",
  "uncheck",
  "press",
  "drag",
  "drop",
  "upload",
  "file_upload",
  "download",
]);

const SCRIPT_BROWSER_ACTIONS = new Set(["javascript", "execute_javascript"]);

export function buildBrowserAssistControlSessionRef(
  source: BrowserAssistControlSessionSource,
): BrowserSessionRef {
  return buildBrowserSessionRef({
    browserSessionId: source.sessionId,
    profileKey: source.profileKey,
    adapterKind: resolveBrowserAssistControlAdapterKind(source.transportKind),
    launchUrl: source.url,
    title: source.title,
    sourceRequestId: source.sourceRequestId,
    targetId: source.targetId,
  });
}

function resolveBrowserAssistControlAdapterKind(
  transportKind?: string | null,
): string | null {
  const normalized = transportKind?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "cdp_frames" || normalized === "cdp_direct") {
    return "cdp";
  }
  return normalized;
}

function normalizeBrowserAction(action: string): string {
  return (
    action
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_") || "unknown"
  );
}

function firstStringValue(
  source: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function compactBrowserActionArguments(
  args: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).filter(([, value]) => {
      if (value === undefined || value === null) {
        return false;
      }
      return typeof value !== "string" || value.trim().length > 0;
    }),
  );
}

function resolveBrowserActionTargetUrl(
  sessionRef: BrowserSessionRef | null,
  args: Record<string, unknown> | null | undefined,
): string | null {
  return (
    firstStringValue(args, [
      "url",
      "href",
      "endpoint",
      "target_url",
      "targetUrl",
    ]) ||
    sessionRef?.launchUrl ||
    null
  );
}

function resolveBrowserActionPolicyReason(
  action: string,
): BrowserAssistActionPolicyReason {
  if (action === "navigate") {
    return "current_navigation";
  }
  if (AUTO_BROWSER_ACTIONS.has(action)) {
    return "current_read";
  }
  if (SCRIPT_BROWSER_ACTIONS.has(action)) {
    return "browser_script";
  }
  if (MUTATING_BROWSER_ACTIONS.has(action)) {
    return "browser_mutation";
  }
  return "unknown_browser_action";
}

function buildBrowserAssistActionConfirmationRequest(
  input: BrowserAssistActionPolicyInput,
  action: string,
  reason: BrowserAssistActionPolicyReason,
): BrowserAssistActionConfirmationRequest {
  const args = input.args ?? {};
  const targetUrl = resolveBrowserActionTargetUrl(input.sessionRef, args);
  const sessionScope =
    input.sessionRef?.browserSessionId ||
    input.sessionRef?.profileKey ||
    "unknown";
  const requestId =
    input.requestId?.trim() ||
    `browser_action_confirmation:${action}:${sessionScope}`;
  const permissionFacts = compactBrowserActionArguments({
    risk_level:
      reason === "browser_script" || reason === "unknown_browser_action"
        ? "high"
        : "medium",
    risk_reason: "browser",
    scope_kind: targetUrl ? "url" : "tool",
    scope_value: targetUrl || sessionScope,
  });
  const confirmationArguments = compactBrowserActionArguments({
    action,
    sessionId: input.sessionRef?.browserSessionId,
    profileKey: input.sessionRef?.profileKey,
    url: targetUrl,
    args,
    permission_facts: permissionFacts,
  });

  return {
    requestId,
    actionType: "tool_confirmation",
    toolName: input.toolName?.trim() || "browserSession/action/execute",
    arguments: confirmationArguments,
    ...(input.prompt?.trim() ? { prompt: input.prompt.trim() } : {}),
  };
}

export function resolveBrowserAssistActionPolicy(
  input: BrowserAssistActionPolicyInput,
): BrowserAssistActionPolicyDecision {
  const action = normalizeBrowserAction(input.action);
  const reason = resolveBrowserActionPolicyReason(action);

  if (AUTO_BROWSER_ACTIONS.has(action)) {
    return {
      action,
      mode: "auto",
      reason,
    };
  }

  return {
    action,
    mode: "requires_confirmation",
    reason,
    confirmationRequest: buildBrowserAssistActionConfirmationRequest(
      input,
      action,
      reason,
    ),
  };
}

export function resolveBrowserAssistNavigationControlPlan(
  sessionRef: BrowserSessionRef | null,
  url: string,
  timeoutMs = 20000,
): BrowserAssistControlPlan | null {
  const normalizedUrl = url.trim();
  if (!sessionRef || !normalizedUrl) {
    return null;
  }

  if (sessionRef.adapterKind === "cdp" && sessionRef.browserSessionId) {
    return {
      channel: "app_server_browser_session",
      action: "navigate",
      sessionId: sessionRef.browserSessionId,
      args: {
        action: "goto",
        url: normalizedUrl,
        timeout_ms: timeoutMs,
      },
    };
  }

  if (sessionRef.adapterKind === "unknown" && sessionRef.profileKey) {
    return {
      channel: "extension_bridge",
      action: "navigate",
      profileKey: sessionRef.profileKey,
      args: {
        url: normalizedUrl,
        wait_for_page_info: true,
      },
    };
  }

  return null;
}

export function resolveBrowserAssistObservationControlPlan(
  sessionRef: BrowserSessionRef | null,
): BrowserAssistControlPlan | null {
  if (!sessionRef) {
    return null;
  }

  if (sessionRef.adapterKind === "cdp" && sessionRef.browserSessionId) {
    return {
      channel: "app_server_browser_session",
      action: "read_page",
      sessionId: sessionRef.browserSessionId,
    };
  }

  if (sessionRef.adapterKind === "unknown" && sessionRef.profileKey) {
    return {
      channel: "extension_bridge",
      action: "read_page",
      profileKey: sessionRef.profileKey,
    };
  }

  return null;
}
