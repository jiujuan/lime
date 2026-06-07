import { useEffect, useState } from "react";
import { getConfig, subscribeAppConfigChanged } from "@/lib/api/appConfig";
import { resolveEnabledSidebarNavItems } from "@/lib/navigation/sidebarNav";

const COMPANION_NAV_ITEM_ID = "companion";

export function useCompanionEntryEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

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
        setEnabled(
          resolveEnabledSidebarNavItems(
            config.navigation?.enabled_items,
            config.navigation?.schema_version,
          ).includes(COMPANION_NAV_ITEM_ID),
        );
      } catch (error) {
        if (active) {
          setEnabled(false);
        }
        console.error("加载桌宠入口配置失败:", error);
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

  return enabled;
}
