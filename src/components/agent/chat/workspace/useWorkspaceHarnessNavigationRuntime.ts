import { useCallback } from "react";
import { SettingsTabs } from "@/types/settings";
import type {
  ExecutionPolicyFocusContext,
  ProviderSettingsFocusContext,
} from "@/types/page";
import type { AgentChatWorkspaceProps } from "../agentChatWorkspaceContract";

interface UseWorkspaceHarnessNavigationRuntimeParams {
  onNavigate?: AgentChatWorkspaceProps["onNavigate"];
}

export function useWorkspaceHarnessNavigationRuntime({
  onNavigate,
}: UseWorkspaceHarnessNavigationRuntimeParams) {
  const handleManageProvidersFromHarness = useCallback(
    (focus?: ProviderSettingsFocusContext) => {
      onNavigate?.("settings", {
        tab: SettingsTabs.Providers,
        providerView: "settings",
        ...(focus ? { providerFocus: focus } : {}),
      });
    },
    [onNavigate],
  );

  const handleOpenExecutionPolicySettingsFromHarness = useCallback(
    (focus?: ExecutionPolicyFocusContext) => {
      onNavigate?.("settings", {
        tab: SettingsTabs.ExecutionPolicy,
        ...(focus ? { executionPolicyFocus: focus } : {}),
      });
    },
    [onNavigate],
  );

  return {
    handleManageProvidersFromHarness,
    handleOpenExecutionPolicySettingsFromHarness,
  };
}
