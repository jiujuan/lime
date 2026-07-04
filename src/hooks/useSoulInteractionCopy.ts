import { useEffect, useState } from "react";
import { getConfig, subscribeAppConfigChanged } from "@/lib/api/appConfig";
import {
  resolveSoulInteractionCopy,
  type SoulInteractionCopy,
} from "@/lib/soul/interactionCopy";

interface UseSoulInteractionCopyOptions {
  enabled?: boolean;
}

export function useSoulInteractionCopy({
  enabled = true,
}: UseSoulInteractionCopyOptions = {}): SoulInteractionCopy {
  const [copy, setCopy] = useState<SoulInteractionCopy>(() =>
    resolveSoulInteractionCopy(),
  );

  useEffect(() => {
    if (!enabled) {
      setCopy(resolveSoulInteractionCopy());
      return;
    }

    let active = true;

    const load = async (forceRefresh = false) => {
      try {
        const config = await getConfig(
          forceRefresh ? { forceRefresh: true } : undefined,
        );
        if (!active) {
          return;
        }
        setCopy(resolveSoulInteractionCopy({ soul: config.memory?.soul }));
      } catch (error) {
        console.error("加载 Soul 交互口吻配置失败:", error);
        if (active) {
          setCopy(resolveSoulInteractionCopy());
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

  return copy;
}
