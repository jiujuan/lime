import type { PageParams } from "@/types/page";
import type { PluginHistorySessionCandidate } from "./history/pluginHistorySessionSelection";
import { resolvePluginMarketplaceItemLabel } from "./marketplace/pluginMarketplaceActions";
import type { PluginMarketplaceViewItem } from "./marketplace/pluginMarketplaceViewModel";
import type { PluginSkillDeclaration } from "./manifest/types";

function resolvePluginMentionLabel(item: PluginMarketplaceViewItem): string {
  return resolvePluginMarketplaceItemLabel(item);
}

function resolvePluginOpenActivationEntry(
  item: PluginMarketplaceViewItem,
): PluginMarketplaceViewItem["activationEntries"][number] | undefined {
  return item.activationEntries.find(
    (entry) =>
      entry.intent === "at_command" &&
      (entry.aliases?.some((alias) => alias.trim()) || entry.title.trim()),
  );
}

function resolvePluginOpenSkill(
  item: PluginMarketplaceViewItem,
  skill: PluginSkillDeclaration | undefined,
): PluginSkillDeclaration | undefined {
  if (skill) {
    return skill;
  }
  return item.skills.find((candidate) => candidate.id.trim());
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
  const activationEntry = skill
    ? undefined
    : resolvePluginOpenActivationEntry(item);
  const selectedSkill =
    activationEntry && !skill ? undefined : resolvePluginOpenSkill(item, skill);
  const activationMention =
    activationEntry?.aliases?.find((alias) => alias.trim())?.trim() ||
    (activationEntry?.title.trim() ? `@${activationEntry.title.trim()}` : "");
  const skillLabel =
    activationEntry && !skill
      ? undefined
      : selectedSkill?.title.trim() || selectedSkill?.id.trim();
  const mention =
    activationMention ||
    (skillLabel ? `@${mentionLabel}:${skillLabel}` : `@${mentionLabel}`);
  const trigger = mention.trim();
  return {
    agentEntry: "new-task",
    initialUserPrompt: `${trigger} `,
    initialAutoSendRequestMetadata: {
      harness: {
        plugin_activation_intent: {
          source: "plugin_marketplace_open",
          trigger,
          plugin_id: item.pluginId,
          active_agent_app_id: item.appId?.trim() || undefined,
          active_entry_key:
            activationEntry?.key.trim() || item.pluginName.trim() || undefined,
          entry_task_kind: activationEntry?.taskKind?.trim() || undefined,
          entry_workflow_key: activationEntry?.workflowKey?.trim() || undefined,
          entry_output_artifact_kind:
            activationEntry?.outputArtifactKind?.trim() || undefined,
          entry_right_surface:
            activationEntry?.rightSurface?.trim() || undefined,
          entry_expected_objects: activationEntry?.expectedObjects?.length
            ? activationEntry.expectedObjects
            : undefined,
          selected_skill_keys: selectedSkill?.id.trim()
            ? [selectedSkill.id.trim()]
            : undefined,
        },
      },
    },
    autoRunInitialPromptOnMount: false,
    newChatAt: Date.now(),
    immersiveHome: false,
  };
}

export function buildPluginMarketplaceHistoryAgentParams(
  item: PluginMarketplaceViewItem,
  candidate: PluginHistorySessionCandidate,
): PageParams | null {
  if (
    item.primaryAction.kind !== "view_history" ||
    item.primaryAction.disabled
  ) {
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
