import type { WorkspaceRightSurfacePendingRequest } from "@/lib/api/workspaceRightSurface";
import {
  buildBrowserSessionRef,
  buildBrowserSessionRefFromBrowserAssistMetadata,
  type BrowserSessionRef,
} from "./workspaceBrowserSessionRef";

export interface WorkspaceRightSurfaceBrowserIntent {
  source: "rightSurfacePending";
  sourceRequestId: string;
  origin: string;
  reason?: string | null;
  priority: "foreground" | "background";
  browserSessionId?: string | null;
  launchUrl?: string | null;
  title?: string | null;
  profileKey?: string | null;
  targetId?: string | null;
  lifecycleState?: string | null;
  controlMode?: string | null;
  sessionRef: BrowserSessionRef;
}

export function buildWorkspaceRightSurfacePendingBrowserIntent(
  pendingRequests: readonly WorkspaceRightSurfacePendingRequest[],
): WorkspaceRightSurfaceBrowserIntent | null {
  for (const request of pendingRequests) {
    if (request.status !== "pending" || request.surfaceKind !== "browser") {
      continue;
    }

    const metadata = asRecord(request.metadata);
    const browser = asRecord(metadata?.browser);
    const browserAssist =
      asRecord(metadata?.browserAssist) || asRecord(metadata?.browser_assist);
    const harness = asRecord(metadata?.harness);
    const harnessBrowserAssist =
      asRecord(harness?.browserAssist) || asRecord(harness?.browser_assist);
    const runtime = asRecord(metadata?.browserRuntime);
    const browserAssistSessionRef =
      buildBrowserSessionRefFromBrowserAssistMetadata(metadata, {
        sourceRequestId: request.requestId,
      });

    const launchUrl =
      firstString(
        metadata?.launchUrl,
        metadata?.launch_url,
        metadata?.browserLaunchUrl,
        metadata?.browser_launch_url,
        metadata?.url,
        metadata?.href,
        browser?.launchUrl,
        browser?.launch_url,
        browser?.url,
        browserAssist?.launchUrl,
        browserAssist?.launch_url,
        browserAssistSessionRef?.launchUrl,
        runtime?.launchUrl,
        runtime?.launch_url,
      ) ?? navigableCandidate(request.candidateId);
    const browserSessionId = firstString(
      metadata?.browserSessionId,
      metadata?.browser_session_id,
      metadata?.cdpSessionId,
      metadata?.cdp_session_id,
      browser?.browserSessionId,
      browser?.browser_session_id,
      browser?.sessionId,
      browser?.session_id,
      browserAssist?.browserSessionId,
      browserAssist?.browser_session_id,
      browserAssist?.sessionId,
      browserAssist?.session_id,
      browserAssistSessionRef?.browserSessionId,
      runtime?.browserSessionId,
      runtime?.browser_session_id,
    );
    const title = firstString(
      metadata?.title,
      metadata?.pageTitle,
      metadata?.page_title,
      metadata?.name,
      browser?.title,
      browser?.pageTitle,
      browser?.page_title,
      browserAssist?.title,
      browserAssist?.pageTitle,
      browserAssist?.page_title,
      browserAssistSessionRef?.title,
      runtime?.title,
    );
    const profileKey = firstString(
      metadata?.profileKey,
      metadata?.profile_key,
      browser?.profileKey,
      browser?.profile_key,
      browserAssist?.profileKey,
      browserAssist?.profile_key,
      browserAssistSessionRef?.profileKey,
      runtime?.profileKey,
      runtime?.profile_key,
    );
    const targetId = firstString(
      metadata?.targetId,
      metadata?.target_id,
      browser?.targetId,
      browser?.target_id,
      browserAssist?.targetId,
      browserAssist?.target_id,
      runtime?.targetId,
      runtime?.target_id,
    );
    const adapterKind = firstString(
      metadata?.adapterKind,
      metadata?.adapter_kind,
      browser?.adapterKind,
      browser?.adapter_kind,
      browserAssist?.adapterKind,
      browserAssist?.adapter_kind,
      browserAssistSessionRef?.adapterKind,
      runtime?.adapterKind,
      runtime?.adapter_kind,
    );
    const lifecycleState = firstString(
      metadata?.lifecycleState,
      metadata?.lifecycle_state,
      browser?.lifecycleState,
      browser?.lifecycle_state,
      browser?.status,
      browserAssist?.lifecycleState,
      browserAssist?.lifecycle_state,
      harnessBrowserAssist?.lifecycleState,
      harnessBrowserAssist?.lifecycle_state,
      runtime?.lifecycleState,
      runtime?.lifecycle_state,
    );
    const controlMode = firstString(
      metadata?.controlMode,
      metadata?.control_mode,
      browser?.controlMode,
      browser?.control_mode,
      browserAssist?.controlMode,
      browserAssist?.control_mode,
      harnessBrowserAssist?.controlMode,
      harnessBrowserAssist?.control_mode,
      runtime?.controlMode,
      runtime?.control_mode,
    );

    return {
      source: "rightSurfacePending",
      sourceRequestId: request.requestId,
      origin: request.origin,
      reason: request.reason ?? null,
      priority: request.priority === "foreground" ? "foreground" : "background",
      browserSessionId,
      launchUrl,
      title,
      profileKey,
      targetId,
      lifecycleState,
      controlMode,
      sessionRef: buildBrowserSessionRef({
        sourceRequestId: request.requestId,
        browserSessionId,
        profileKey,
        adapterKind,
        launchUrl,
        title,
        targetId,
      }),
    };
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function navigableCandidate(value?: string | null): string | null {
  const normalized = firstString(value);
  if (!normalized) {
    return null;
  }
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#].*)?$/i.test(
      normalized,
    ) ||
    /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d{1,5})?(?:[/?#].*)?$/i.test(
      normalized,
    )
  ) {
    return normalized;
  }
  return null;
}
