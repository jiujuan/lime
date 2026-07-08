import i18n from "i18next";
import { executeBrowserSessionAction } from "@/lib/api/browserRuntime";
import { initLimeI18n } from "@/i18n/createI18n";
import { browserExecuteAction } from "@/lib/webview-api";
import type { Artifact } from "@/lib/artifact/types";
import type { BrowserAssistSessionState } from "../types";
import { asRecord, readFirstString } from "./browserAssistArtifact";
import type { BrowserAssistControlPlan } from "./workspaceBrowserAssistControl";

export function normalizeBrowserAssistState(
  value: string | null | undefined,
): string {
  return value?.trim().toLowerCase() || "";
}

export function isFailedBrowserAssistLaunchState(
  value: string | null | undefined,
): boolean {
  return normalizeBrowserAssistState(value) === "failed";
}

export function normalizeBrowserAssistBackend(
  value: string | null | undefined,
): "lime_extension_bridge" | "cdp_direct" | undefined {
  if (value === "lime_extension_bridge" || value === "cdp_direct") {
    return value;
  }
  return undefined;
}

export function getWorkspaceText(
  key: string,
  options?: Record<string, unknown>,
): string {
  const instance = i18n.isInitialized ? i18n : initLimeI18n();
  return String(instance.t(key as never, { ns: "workspace", ...options }));
}

export function getBrowserAssistFallbackTitle(): string {
  return getWorkspaceText("workspace.browserAssistRenderer.titleFallback");
}

export function getBrowserAssistAttachedLaunchHint(): string {
  return getWorkspaceText("workspace.browserAssistRenderer.launching.detail");
}

export function buildAttachedSessionOnlyErrorMessage(
  targetLabel: string,
  error?: unknown,
): string {
  const detail =
    error instanceof Error
      ? error.message.trim()
      : typeof error === "string"
        ? error.trim()
        : "";
  return getWorkspaceText(
    detail
      ? "workspace.browserAssistRenderer.failed.attachedOnlyWithDetail"
      : "workspace.browserAssistRenderer.failed.attachedOnly",
    { target: targetLabel, detail },
  );
}

export function resolveBrowserActionPageSnapshot(
  resultData: unknown,
  fallbackUrl: string,
  fallbackTitle: string,
) {
  const normalizedResultData = asRecord(resultData);
  const pageInfo =
    asRecord(normalizedResultData?.page_info) ||
    asRecord(normalizedResultData?.pageInfo);

  return {
    url:
      readFirstString(
        [pageInfo, normalizedResultData],
        ["url", "target_url", "targetUrl"],
      ) || fallbackUrl,
    title:
      readFirstString(
        [pageInfo, normalizedResultData],
        ["title", "target_title", "targetTitle"],
      ) || fallbackTitle,
  };
}

export async function executeBrowserAssistControlPlan(
  plan: BrowserAssistControlPlan,
) {
  if (plan.channel === "app_server_browser_session") {
    if (!plan.sessionId) {
      throw new Error("Browser session ref 缺少 sessionId");
    }
    const result = await executeBrowserSessionAction({
      sessionId: plan.sessionId,
      action: plan.action,
      args: plan.args,
    });
    return {
      data: result.result,
      sessionId: result.sessionId,
      targetId: undefined,
      transportKind: "cdp_frames",
    };
  }

  if (!plan.profileKey) {
    throw new Error("Browser session ref 缺少 profileKey");
  }
  const result = await browserExecuteAction({
    profile_key: plan.profileKey,
    backend: "lime_extension_bridge",
    action: plan.action,
    args: plan.args,
    timeout_ms: 20000,
  });
  if (!result.success) {
    throw new Error(result.error || "浏览器控制失败");
  }
  return {
    data: result.data,
    sessionId: result.session_id,
    targetId: result.target_id,
    transportKind: "existing_session",
  };
}

export function hasActiveBrowserAssistSession(
  sessionState: BrowserAssistSessionState | null,
): boolean {
  if (!sessionState) {
    return false;
  }

  if (!sessionState.sessionId && !sessionState.profileKey) {
    return false;
  }

  const lifecycleState = normalizeBrowserAssistState(
    sessionState.lifecycleState,
  );
  return !["failed", "closed", "terminated"].includes(lifecycleState || "");
}

export function shouldAutoOpenPassiveBrowserAssist(
  artifact: Artifact | null,
  launching: boolean,
): boolean {
  if (launching) {
    return true;
  }

  if (!artifact) {
    return false;
  }

  const meta = asRecord(artifact.meta);
  const launchState = readFirstString(meta ? [meta] : [], [
    "launchState",
    "launch_state",
  ]);

  return (
    artifact.status === "pending" ||
    normalizeBrowserAssistState(launchState) === "launching"
  );
}
