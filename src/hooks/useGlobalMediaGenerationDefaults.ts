import { useEffect, useState } from "react";
import { getConfig, subscribeAppConfigChanged } from "@/lib/api/appConfig";
import type { MediaGenerationDefaults } from "@/lib/mediaGeneration";

interface UseGlobalMediaGenerationDefaultsResult {
  mediaDefaults: MediaGenerationDefaults;
  loading: boolean;
}

interface UseGlobalMediaGenerationDefaultsOptions {
  enabled?: boolean;
}

export async function readGlobalMediaGenerationDefaults({
  forceRefresh = false,
}: { forceRefresh?: boolean } = {}): Promise<MediaGenerationDefaults> {
  const config = await getConfig(
    forceRefresh ? { forceRefresh: true } : undefined,
  );
  return config.workspace_preferences?.media_defaults ?? {};
}

export function useGlobalMediaGenerationDefaults({
  enabled = true,
}: UseGlobalMediaGenerationDefaultsOptions = {}): UseGlobalMediaGenerationDefaultsResult {
  const [mediaDefaults, setMediaDefaults] = useState<MediaGenerationDefaults>(
    {},
  );
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setMediaDefaults({});
      return;
    }

    let active = true;

    const load = async (forceRefresh = false) => {
      setLoading(true);
      try {
        const nextMediaDefaults = await readGlobalMediaGenerationDefaults({
          forceRefresh,
        });
        if (!active) {
          return;
        }
        setMediaDefaults(nextMediaDefaults);
      } catch (error) {
        console.error("加载全局媒体默认设置失败:", error);
        if (active) {
          setMediaDefaults({});
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

  return { mediaDefaults, loading };
}
