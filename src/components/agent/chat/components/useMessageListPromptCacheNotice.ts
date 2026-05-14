import { useMemo } from "react";
import {
  resolveConfiguredProviderPromptCacheSupportNotice,
  useConfiguredProviders,
} from "@/hooks/useConfiguredProviders";
import { resolvePromptCacheActivity } from "../utils/tokenUsageSummary";
import type { Message } from "../types";

interface UseMessageListPromptCacheNoticeOptions {
  lastAssistantMessage: Message | null;
  providerType?: string;
  restoredPromptCacheNoticeReady: boolean;
}

export function useMessageListPromptCacheNotice({
  lastAssistantMessage,
  providerType,
  restoredPromptCacheNoticeReady,
}: UseMessageListPromptCacheNoticeOptions) {
  const shouldInspectPromptCacheNotice = useMemo(
    () =>
      Boolean(
        providerType?.trim() &&
          restoredPromptCacheNoticeReady &&
          lastAssistantMessage?.usage &&
          !lastAssistantMessage.isThinking &&
          resolvePromptCacheActivity(lastAssistantMessage.usage) <= 0,
      ),
    [lastAssistantMessage, providerType, restoredPromptCacheNoticeReady],
  );
  const { providers } = useConfiguredProviders({
    autoLoad: shouldInspectPromptCacheNotice,
  });

  return useMemo(
    () =>
      shouldInspectPromptCacheNotice
        ? resolveConfiguredProviderPromptCacheSupportNotice(
            providers,
            providerType,
          )
        : null,
    [providerType, providers, shouldInspectPromptCacheNotice],
  );
}
