import type { PageParams } from "@/types/page";
import type { PluginHistorySessionCandidate } from "./history/pluginHistorySessionSelection";
import { resolvePluginMarketplaceItemLabel } from "./marketplace/pluginMarketplaceActions";
import type { PluginMarketplaceViewItem } from "./marketplace/pluginMarketplaceViewModel";
import type { PluginSkillDeclaration } from "./manifest/types";

function resolvePluginMentionLabel(item: PluginMarketplaceViewItem): string {
  return resolvePluginMarketplaceItemLabel(item);
}

export function buildPluginMarketplaceOpenAgentParams(
  item: PluginMarketplaceViewItem,
  skill?: PluginSkillDeclaration,
): PageParams | null {
  if (item.primaryAction.kind !== "open" || item.primaryAction.disabled) {
    return null;
  }
  const mentionLabel = resolvePluginMentionLabel(item);
  if (!mentionLabel) {
    return null;
  }
  const skillLabel = skill?.title.trim() || skill?.id.trim();
  const mention = skillLabel ? `${mentionLabel}:${skillLabel}` : mentionLabel;
  return {
    agentEntry: "new-task",
    initialUserPrompt: `@${mention} `,
    initialAutoSendRequestMetadata: {
      harness: {
        plugin_activation_intent: {
          source: "plugin_marketplace_open",
          trigger: `@${mention}`,
          plugin_id: item.pluginId,
          active_agent_app_id: item.appId?.trim() || undefined,
          active_entry_key: item.pluginName.trim() || undefined,
          selected_skill_keys: skill?.id.trim() ? [skill.id.trim()] : undefined,
        },
      },
    },
    autoRunInitialPromptOnMount: true,
    newChatAt: Date.now(),
    immersiveHome: false,
  };
}

export function buildPluginMarketplaceHistoryAgentParams(
  item: PluginMarketplaceViewItem,
  candidate: PluginHistorySessionCandidate,
): PageParams | null {
  if (item.primaryAction.kind !== "view_history" || item.primaryAction.disabled) {
    return null;
  }
  const pluginId = candidate.pluginId.trim() || item.pluginId.trim();
  const sessionId = candidate.sessionId.trim();
  if (!pluginId) {
    return null;
  }
  if (!sessionId) {
    return null;
  }
  return {
    agentEntry: "claw",
    initialSessionId: sessionId,
    immersiveHome: false,
    initialRequestMetadata: {
      harness: {
        plugin_history_restore: {
          session_id: sessionId,
          plugin_id: pluginId,
          active_agent_app_id:
            candidate.activeAgentAppId ?? item.appId?.trim() ?? undefined,
          active_entry_key:
            candidate.activeEntryKey ?? item.pluginName.trim() ?? undefined,
          artifact_refs:
            candidate.artifactRefs.length > 0
              ? candidate.artifactRefs
              : undefined,
        },
      },
    },
    entryBannerMessage: "plugin.marketplace.history.entryBanner",
    newChatAt: Date.now(),
  };
}
