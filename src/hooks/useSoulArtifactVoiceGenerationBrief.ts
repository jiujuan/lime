import { useEffect, useState } from "react";
import { getConfig, subscribeAppConfigChanged } from "@/lib/api/appConfig";
import { buildSoulArtifactVoiceGenerationBrief } from "@/lib/soul/soulConfig";

interface UseSoulArtifactVoiceGenerationBriefResult {
  generationBrief?: Record<string, unknown>;
  loading: boolean;
}

export function useSoulArtifactVoiceGenerationBrief(): UseSoulArtifactVoiceGenerationBriefResult {
  const [generationBrief, setGenerationBrief] = useState<
    Record<string, unknown> | undefined
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
        setGenerationBrief(
          buildSoulArtifactVoiceGenerationBrief(config.memory?.soul),
        );
      } catch (error) {
        console.error("加载创作声线配置失败:", error);
        if (active) {
          setGenerationBrief(undefined);
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

  return { generationBrief, loading };
}
