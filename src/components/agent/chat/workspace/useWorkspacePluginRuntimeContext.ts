import { useCallback, useEffect, useMemo, useState } from "react";
import type { InstalledPluginState } from "@/features/plugin/types";
import {
  PLUGINS_CHANGED_EVENT,
  listInstalledPlugins,
} from "@/lib/api/plugins";
import {
  buildWorkspacePluginRuntimeContext,
  type WorkspacePluginRuntimeContext,
} from "./workspacePluginRuntimeContext";

const EMPTY_INSTALLED_PLUGINS: readonly InstalledPluginState[] = [];

export interface UseWorkspacePluginRuntimeContextOptions {
  enabled?: boolean;
  requestMetadata?: Record<string, unknown>;
  listInstalled?: () => Promise<{ states: InstalledPluginState[] }>;
}

export interface UseWorkspacePluginRuntimeContextResult {
  context: WorkspacePluginRuntimeContext;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useWorkspacePluginRuntimeContext({
  enabled = false,
  requestMetadata,
  listInstalled = listInstalledPlugins,
}: UseWorkspacePluginRuntimeContextOptions): UseWorkspacePluginRuntimeContextResult {
  const [installedPlugins, setInstalledPlugins] = useState<
    readonly InstalledPluginState[]
  >(EMPTY_INSTALLED_PLUGINS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const shouldLoadInstalledPlugins = enabled || Boolean(requestMetadata);
  const refresh = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
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
        setInstalledPlugins(result.states);
        setError(null);
      } catch (caught) {
        if (disposed || currentSeq !== refreshSeq) {
          return;
        }
        setInstalledPlugins(EMPTY_INSTALLED_PLUGINS);
        setError(caught instanceof Error ? caught : new Error(String(caught)));
      } finally {
        if (!disposed && currentSeq === refreshSeq) {
          setLoading(false);
        }
      }
    };

    if (!shouldLoadInstalledPlugins) {
      setLoading(false);
      setError(null);
      setInstalledPlugins(EMPTY_INSTALLED_PLUGINS);
      return () => {
        disposed = true;
      };
    }

    void refresh();

    if (typeof window === "undefined") {
      return () => {
        disposed = true;
      };
    }

    window.addEventListener(PLUGINS_CHANGED_EVENT, refresh);
    return () => {
      disposed = true;
      window.removeEventListener(PLUGINS_CHANGED_EVENT, refresh);
    };
  }, [listInstalled, refreshKey, shouldLoadInstalledPlugins]);

  const context = useMemo(
    () =>
      buildWorkspacePluginRuntimeContext({
        requestMetadata,
        installedPlugins,
      }),
    [installedPlugins, requestMetadata],
  );

  return {
    context,
    loading,
    error,
    refresh,
  };
}
