import { useEffect, useState } from "react";
import { getConfig, subscribeAppConfigChanged } from "@/lib/api/appConfig";
import type { ServiceModelsConfig } from "@/lib/api/appConfigTypes";

interface UseServiceModelsConfigResult {
  serviceModels: ServiceModelsConfig;
  agentResponseLanguage?: string;
  loading: boolean;
}

export function useServiceModelsConfig(): UseServiceModelsConfigResult {
  const [serviceModels, setServiceModels] = useState<ServiceModelsConfig>({});
  const [agentResponseLanguage, setAgentResponseLanguage] = useState<
    string | undefined
  >();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  return {
    serviceModels,
    agentResponseLanguage,
    loading,
  };
}
