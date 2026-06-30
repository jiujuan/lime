import { useCallback, useEffect, useState } from "react";
import { getConfig, subscribeAppConfigChanged } from "@/lib/api/appConfig";
import type { ServiceModelsConfig } from "@/lib/api/appConfigTypes";

interface UseServiceModelsConfigResult {
  serviceModels: ServiceModelsConfig;
  agentResponseLanguage?: string;
  loading: boolean;
  refresh: (options?: { forceRefresh?: boolean }) => Promise<{
    serviceModels: ServiceModelsConfig;
    agentResponseLanguage?: string;
  }>;
}

interface UseServiceModelsConfigOptions {
  enabled?: boolean;
}

export function useServiceModelsConfig({
  enabled = true,
}: UseServiceModelsConfigOptions = {}): UseServiceModelsConfigResult {
  const [serviceModels, setServiceModels] = useState<ServiceModelsConfig>({});
  const [agentResponseLanguage, setAgentResponseLanguage] = useState<
    string | undefined
  >();
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(
    async (options: { forceRefresh?: boolean } = {}) => {
      setLoading(true);
      try {
        const config = await getConfig(
          options.forceRefresh ? { forceRefresh: true } : undefined,
        );
        const nextServiceModels =
          config.workspace_preferences?.service_models ?? {};
        const nextAgentResponseLanguage =
          config.workspace_preferences?.agent_response_language;
        setServiceModels(nextServiceModels);
        setAgentResponseLanguage(nextAgentResponseLanguage);
        return {
          serviceModels: nextServiceModels,
          agentResponseLanguage: nextAgentResponseLanguage,
        };
      } catch (error) {
        console.error("加载服务模型运行时配置失败:", error);
        setServiceModels({});
        setAgentResponseLanguage(undefined);
        return {
          serviceModels: {},
          agentResponseLanguage: undefined,
        };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let active = true;

    const load = async (forceRefresh = false) => {
      setLoading(true);
      try {
        const config = await getConfig(
          forceRefresh ? { forceRefresh: true } : undefined,
        );
        if (!active) {
          return;
        }
        setServiceModels(config.workspace_preferences?.service_models ?? {});
        setAgentResponseLanguage(
          config.workspace_preferences?.agent_response_language,
        );
      } catch (error) {
        console.error("加载服务模型运行时配置失败:", error);
        if (active) {
          setServiceModels({});
          setAgentResponseLanguage(undefined);
        }
      } finally {
        if (active) {
          setLoading(false);
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
  }, [enabled]);

  return {
    serviceModels,
    agentResponseLanguage,
    loading,
    refresh,
  };
}
