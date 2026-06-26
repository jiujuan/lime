import type { PageParams } from "@/types/page";
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
    newChatAt: Date.now(),
    immersiveHome: false,
  };
}

export function buildPluginMarketplaceHistoryAgentParams(
  item: PluginMarketplaceViewItem,
): PageParams | null {
  if (item.primaryAction.kind !== "view_history" || item.primaryAction.disabled) {
    return null;
  }
  const pluginId = item.pluginId.trim();
  if (!pluginId) {
    return null;
  }
  return {
    agentEntry: "claw",
    immersiveHome: false,
    initialRequestMetadata: {
      harness: {
        plugin_history_restore: {
          session_id: `plugin-history:${pluginId}`,
          plugin_id: pluginId,
          active_agent_app_id: item.appId?.trim() || undefined,
          active_entry_key: item.pluginName.trim() || undefined,
        },
      },
    },
    entryBannerMessage: "plugin.marketplace.history.entryBanner",
    newChatAt: Date.now(),
  };
}
