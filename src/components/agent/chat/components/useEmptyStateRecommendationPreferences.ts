import { useEffect, useState } from "react";
import { getConfig } from "@/lib/api/appConfig";

export function useEmptyStateRecommendationPreferences() {
  const [appendSelectedTextToRecommendation, setAppendSelectedTextToRecommendation] =
    useState(true);

  useEffect(() => {
    const loadConfigPreferences = async () => {
      try {
        const loadedConfig = await getConfig();
        setAppendSelectedTextToRecommendation(
          loadedConfig.chat_appearance
            ?.append_selected_text_to_recommendation ?? true,
        );
      } catch (e) {
        console.error("加载入口配置失败:", e);
      }
    };
    void loadConfigPreferences();

    const handleConfigChange = () => {
      void loadConfigPreferences();
    };
    window.addEventListener(
      "chat-appearance-config-changed",
      handleConfigChange,
    );

    return () => {
      window.removeEventListener(
        "chat-appearance-config-changed",
        handleConfigChange,
      );
    };
  }, []);

  return {
    appendSelectedTextToRecommendation,
  };
}
