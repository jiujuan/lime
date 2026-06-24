import type { AgentAppShellLaunchResult } from "@/lib/api/agentApps";
import {
  requestWorkspaceRightSurface,
  type WorkspaceRightSurfaceRequestParams,
  type WorkspaceRightSurfaceRequestResponse,
  type WorkspaceRightSurfaceClientDeps,
} from "@/lib/api/workspaceRightSurface";
import type { ProjectedEntry } from "../types";

export interface AgentAppRightSurfaceLaunchTarget {
  workspaceId?: string | null;
  sessionId?: string | null;
  label?: string | null;
  title?: string | null;
  description?: string | null;
}

export interface AgentAppRightSurfaceLaunchInput {
  appId: string;
  title: string;
  entry: Pick<ProjectedEntry, "key" | "kind" | "title" | "route">;
  shellLaunch: AgentAppShellLaunchResult;
  target?: AgentAppRightSurfaceLaunchTarget | null;
}

export type AgentAppRightSurfaceLaunchResult =
  | {
      status: "requested";
      response: WorkspaceRightSurfaceRequestResponse;
      params: WorkspaceRightSurfaceRequestParams;
    }
  | {
      status: "skipped";
      reason:
        | "blocked"
        | "missing-target"
        | "missing-surface"
        | "unsupported-surface";
    };

function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function isRightSurfaceEmbeddable(
  shellLaunch: AgentAppShellLaunchResult,
): boolean {
  const surface = shellLaunch.surface;
  return (
    shellLaunch.status === "launched" &&
    Boolean(surface?.entryUrl?.trim()) &&
    Boolean(surface?.containerId?.trim()) &&
    surface?.supportedStrategies.includes("webContentsView") === true &&
    surface.embedding.rightSurfaceDock === true &&
    surface.embedding.iframe === false &&
    surface.embedding.browserView === false
  );
}

export function buildAgentAppRightSurfaceRequestParams(
  input: AgentAppRightSurfaceLaunchInput,
): WorkspaceRightSurfaceRequestParams | null {
  const workspaceId = normalizeOptionalString(input.target?.workspaceId);
  const sessionId = normalizeOptionalString(input.target?.sessionId);
  if (!workspaceId && !sessionId) {
    return null;
  }
  if (!isRightSurfaceEmbeddable(input.shellLaunch)) {
    return null;
  }

  const surface = input.shellLaunch.surface;
  if (!surface) {
    return null;
  }

  const appId =
    normalizeOptionalString(input.shellLaunch.appId) ??
    normalizeOptionalString(input.appId);
  if (!appId) {
    return null;
  }

  return {
    ...(workspaceId ? { workspaceId } : {}),
    ...(sessionId ? { sessionId } : {}),
    surfaceKind: "appSurface",
    origin: "agent_app_center",
    reason: "agent_app_shell_surface_ready",
    priority: "foreground",
    candidateId: appId,
    ttlMs: 10 * 60 * 1000,
    metadata: {
      appId,
      title: input.title,
      entry: {
        key: input.entry.key,
        kind: input.entry.kind,
        title: input.entry.title,
        route: input.entry.route,
      },
      source: {
        kind: "agent_app_center",
        shellKind: input.shellLaunch.shellKind,
        installMode: input.shellLaunch.installMode,
      },
      surface,
    },
  };
}

export async function requestAgentAppRightSurfaceLaunch(
  input: AgentAppRightSurfaceLaunchInput,
  deps: WorkspaceRightSurfaceClientDeps = {},
): Promise<AgentAppRightSurfaceLaunchResult> {
  if (input.shellLaunch.status !== "launched") {
    return { status: "skipped", reason: "blocked" };
  }
  if (!input.shellLaunch.surface) {
    return { status: "skipped", reason: "missing-surface" };
  }
  if (!isRightSurfaceEmbeddable(input.shellLaunch)) {
    return { status: "skipped", reason: "unsupported-surface" };
  }

  const params = buildAgentAppRightSurfaceRequestParams(input);
  if (!params) {
    return { status: "skipped", reason: "missing-target" };
  }

  const response = await requestWorkspaceRightSurface(params, deps);
  return { status: "requested", response, params };
}
