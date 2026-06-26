import {
  requestWorkspaceRightSurface,
  type WorkspaceRightSurfaceClientDeps,
  type WorkspaceRightSurfaceRequestParams,
  type WorkspaceRightSurfaceRequestResponse,
} from "@/lib/api/workspaceRightSurface";
import type { ProjectedEntry } from "../types";
import type { AgentAppRightSurfaceLaunchTarget } from "./agentAppRightSurfaceLaunch";

export interface AgentAppBrowserIntentLaunchInput {
  appId: string;
  title?: string | null;
  entry: Pick<ProjectedEntry, "key" | "kind" | "title" | "route">;
  intentResponse: unknown;
  target?: AgentAppRightSurfaceLaunchTarget | null;
}

export type AgentAppBrowserIntentLaunchResult =
  | {
      status: "requested";
      response: WorkspaceRightSurfaceRequestResponse;
      params: WorkspaceRightSurfaceRequestParams;
    }
  | {
      status: "skipped";
      reason: "missing-target" | "unsupported-intent";
    };

const BROWSER_INTENT_TTL_MS = 10 * 60 * 1000;

function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  value: Record<string, unknown> | null,
  key: string,
): string | null {
  const item = value?.[key];
  return typeof item === "string" && item.trim() ? item.trim() : null;
}

function readBrowserOpenUrl(response: Record<string, unknown>): string | null {
  const intent = isRecord(response.intent) ? response.intent : null;
  const input = isRecord(response.input) ? response.input : null;
  return readString(intent, "url") ?? readString(input, "url");
}

function hasRightSurfaceTarget(
  target: AgentAppRightSurfaceLaunchTarget | null | undefined,
): boolean {
  return Boolean(
    normalizeOptionalString(target?.workspaceId) ||
    normalizeOptionalString(target?.sessionId),
  );
}

function resolveBrowserOpenIntent(response: unknown): { url: string } | null {
  if (!isRecord(response)) {
    return null;
  }
  if (
    readString(response, "capability") !== "lime.browser" ||
    readString(response, "method") !== "open" ||
    readString(response, "status") !== "requires_agent_task"
  ) {
    return null;
  }

  const url = readBrowserOpenUrl(response);
  return url ? { url } : null;
}

export function buildAgentAppBrowserIntentRightSurfaceRequestParams(
  input: AgentAppBrowserIntentLaunchInput,
): WorkspaceRightSurfaceRequestParams | null {
  const workspaceId = normalizeOptionalString(input.target?.workspaceId);
  const sessionId = normalizeOptionalString(input.target?.sessionId);
  if (!workspaceId && !sessionId) {
    return null;
  }

  const intent = resolveBrowserOpenIntent(input.intentResponse);
  if (!intent) {
    return null;
  }

  return {
    ...(workspaceId ? { workspaceId } : {}),
    ...(sessionId ? { sessionId } : {}),
    surfaceKind: "browser",
    origin: "agent_app",
    reason: "agent_app_browser_intent",
    priority: "foreground",
    candidateId: intent.url,
    ttlMs: BROWSER_INTENT_TTL_MS,
    metadata: {
      appId: input.appId,
      ...(input.title ? { title: input.title } : {}),
      entry: {
        key: input.entry.key,
        kind: input.entry.kind,
        title: input.entry.title,
        route: input.entry.route,
      },
      source: {
        kind: "agent_app_browser_intent",
        appId: input.appId,
        entryKey: input.entry.key,
        capability: "lime.browser",
        method: "open",
      },
      capability: "lime.browser",
      method: "open",
      launchUrl: intent.url,
      intent: {
        url: intent.url,
      },
      browser: {
        launchUrl: intent.url,
        url: intent.url,
        controlMode: "shared",
        lifecycleState: "waiting_for_human",
      },
      controlMode: "shared",
      lifecycleState: "waiting_for_human",
    },
  };
}

export async function requestAgentAppBrowserRightSurfaceIntent(
  input: AgentAppBrowserIntentLaunchInput,
  deps: WorkspaceRightSurfaceClientDeps = {},
): Promise<AgentAppBrowserIntentLaunchResult> {
  if (!hasRightSurfaceTarget(input.target)) {
    return { status: "skipped", reason: "missing-target" };
  }

  const params = buildAgentAppBrowserIntentRightSurfaceRequestParams(input);
  if (!params) {
    return { status: "skipped", reason: "unsupported-intent" };
  }

  const response = await requestWorkspaceRightSurface(params, deps);
  return { status: "requested", response, params };
}
