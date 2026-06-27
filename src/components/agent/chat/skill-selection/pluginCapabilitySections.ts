import type {
  InputbarPluginCapability,
  InputbarPluginSkillCapability,
} from "../components/Inputbar/pluginInputCapability";
import { resolveInputbarPluginDisplayName } from "../components/Inputbar/pluginInputCapability";

export interface MentionPluginCapabilityItem {
  key: string;
  title: string;
  description: string;
  plugin: InputbarPluginCapability;
  skill?: InputbarPluginSkillCapability;
  disabled: boolean;
}

function normalizeSearchText(value: string | undefined): string {
  return value?.normalize("NFKC").trim().toLowerCase() ?? "";
}

function includesQuery(value: string | undefined, query: string): boolean {
  return normalizeSearchText(value).includes(query);
}

function pluginMatchesQuery(
  plugin: InputbarPluginCapability,
  query: string,
): boolean {
  if (!query) {
    return true;
  }

  return (
    includesQuery(plugin.pluginId, query) ||
    includesQuery(plugin.displayName, query) ||
    includesQuery(plugin.description, query) ||
    (plugin.skills ?? []).some(
      (skill) =>
        includesQuery(skill.skillId, query) ||
        includesQuery(skill.title, query) ||
        includesQuery(skill.description, query),
    )
  );
}

function skillMatchesQuery(
  plugin: InputbarPluginCapability,
  skill: InputbarPluginSkillCapability,
  query: string,
): boolean {
  if (!query) {
    return true;
  }

  return (
    includesQuery(plugin.pluginId, query) ||
    includesQuery(plugin.displayName, query) ||
    includesQuery(skill.skillId, query) ||
    includesQuery(skill.title, query) ||
    includesQuery(skill.description, query)
  );
}

function isPluginBlocked(plugin: InputbarPluginCapability): boolean {
  return plugin.disabled === true || (plugin.blockerCodes?.length ?? 0) > 0;
}

function isSkillBlocked(
  plugin: InputbarPluginCapability,
  skill?: InputbarPluginSkillCapability,
): boolean {
  if (isPluginBlocked(plugin)) {
    return true;
  }
  return skill?.disabled === true || (skill?.blockerCodes?.length ?? 0) > 0;
}

function pluginDescription(plugin: InputbarPluginCapability): string {
  return plugin.description?.trim() || plugin.pluginId;
}

export function buildMentionPluginCapabilityItems(params: {
  plugins: readonly InputbarPluginCapability[];
  query: string;
}): MentionPluginCapabilityItem[] {
  const query = normalizeSearchText(params.query);
  const items: MentionPluginCapabilityItem[] = [];

  for (const plugin of params.plugins) {
    if (!pluginMatchesQuery(plugin, query)) {
      continue;
    }

    const displayName = resolveInputbarPluginDisplayName(plugin);
    items.push({
      key: `plugin:${plugin.pluginId}`,
      title: displayName,
      description: pluginDescription(plugin),
      plugin,
      disabled: isPluginBlocked(plugin),
    });

    for (const skill of plugin.skills ?? []) {
      if (!skillMatchesQuery(plugin, skill, query)) {
        continue;
      }
      const title = skill.title.trim() || skill.skillId;
      items.push({
        key: `plugin:${plugin.pluginId}:skill:${skill.skillId}`,
        title: `${displayName}:${title}`,
        description: skill.description?.trim() || pluginDescription(plugin),
        plugin,
        skill,
        disabled: isSkillBlocked(plugin, skill),
      });
    }
  }

  return items;
}
