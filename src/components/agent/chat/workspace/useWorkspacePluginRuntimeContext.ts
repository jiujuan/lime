import { useEffect, useMemo, useState } from "react";
import type { InstalledAgentAppState } from "@/features/agent-app/types";
import {
  AGENT_APPS_CHANGED_EVENT,
  listInstalledAgentApps,
} from "@/lib/api/agentApps";
import { extractWorkspacePluginActivationFromRequestMetadata } from "./workspacePluginActivation";
import {
  buildWorkspacePluginRuntimeContext,
  type WorkspacePluginRuntimeContext,
} from "./workspacePluginRuntimeContext";

const EMPTY_INSTALLED_AGENT_APPS: readonly InstalledAgentAppState[] = [];

export interface UseWorkspacePluginRuntimeContextOptions {
  preloadInstalled?: boolean;
  requestMetadata?: Record<string, unknown>;
  listInstalled?: () => Promise<{ states: InstalledAgentAppState[] }>;
}

export interface UseWorkspacePluginRuntimeContextResult {
  context: WorkspacePluginRuntimeContext;
  loading: boolean;
  error: Error | null;
}

export function useWorkspacePluginRuntimeContext({
  preloadInstalled = false,
  requestMetadata,
  listInstalled = listInstalledAgentApps,
}: UseWorkspacePluginRuntimeContextOptions): UseWorkspacePluginRuntimeContextResult {
  const hasPluginActivation = useMemo(
    () => Boolean(extractWorkspacePluginActivationFromRequestMetadata(requestMetadata)),
    [requestMetadata],
  );
  const [installedAgentApps, setInstalledAgentApps] = useState<
    readonly InstalledAgentAppState[]
  >(EMPTY_INSTALLED_AGENT_APPS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!hasPluginActivation && !preloadInstalled) {
      setInstalledAgentApps(EMPTY_INSTALLED_AGENT_APPS);
      setLoading(false);
      setError(null);
      return;
    }

    let disposed = false;
    let refreshSeq = 0;

    const refresh = async () => {
      const currentSeq = (refreshSeq += 1);
      setLoading(true);
      try {
        const result = await listInstalled();
        if (disposed || currentSeq !== refreshSeq) {
          return;
        }
        setInstalledAgentApps(result.states);
        setError(null);
      } catch (caught) {
        if (disposed || currentSeq !== refreshSeq) {
          return;
        }
        setInstalledAgentApps(EMPTY_INSTALLED_AGENT_APPS);
        setError(caught instanceof Error ? caught : new Error(String(caught)));
      } finally {
        if (!disposed && currentSeq === refreshSeq) {
          setLoading(false);
        }
      }
    };

    void refresh();

    if (typeof window === "undefined") {
      return () => {
        disposed = true;
      };
    }

    window.addEventListener(AGENT_APPS_CHANGED_EVENT, refresh);
    return () => {
      disposed = true;
      window.removeEventListener(AGENT_APPS_CHANGED_EVENT, refresh);
    };
  }, [hasPluginActivation, listInstalled, preloadInstalled]);

  const context = useMemo(
    () =>
      buildWorkspacePluginRuntimeContext({
        requestMetadata,
        installedAgentApps,
      }),
    [installedAgentApps, requestMetadata],
  );

  return {
    context,
    loading,
    error,
  };
}
