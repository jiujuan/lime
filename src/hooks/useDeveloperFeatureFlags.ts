import { useEffect, useState } from "react";
import { getConfig, subscribeAppConfigChanged } from "@/lib/api/appConfig";
import {
  resolveClawTraceEnabled,
  resolveWorkspaceHarnessEnabled,
} from "@/lib/developerFeatures";

interface UseDeveloperFeatureFlagsResult {
  clawTraceEnabled: boolean;
  workspaceHarnessEnabled: boolean;
}

export function useDeveloperFeatureFlags(): UseDeveloperFeatureFlagsResult {
  const [clawTraceEnabled, setClawTraceEnabled] = useState(() =>
    resolveClawTraceEnabled(),
  );
  const [workspaceHarnessEnabled, setWorkspaceHarnessEnabled] = useState(() =>
    resolveWorkspaceHarnessEnabled(),
  );

  useEffect(() => {
    let active = true;

    const load = async (forceRefresh = false) => {
      try {
        const config = await getConfig(
          forceRefresh ? { forceRefresh: true } : undefined,
        );
        if (!active) {
          return;
        }
        setClawTraceEnabled(resolveClawTraceEnabled(config));
        setWorkspaceHarnessEnabled(resolveWorkspaceHarnessEnabled(config));
      } catch (error) {
        console.error("加载开发者功能开关失败:", error);
        if (active) {
          setClawTraceEnabled(resolveClawTraceEnabled());
          setWorkspaceHarnessEnabled(resolveWorkspaceHarnessEnabled());
        }
      }
    };

    void load();

    const unsubscribe = subscribeAppConfigChanged(() => {
      void load(true);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return {
    clawTraceEnabled,
    workspaceHarnessEnabled,
  };
}
