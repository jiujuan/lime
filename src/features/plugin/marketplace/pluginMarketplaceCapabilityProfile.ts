import type {
  PluginRegistryItem,
  PluginSkillDeclaration,
} from "../manifest/types";
import type { PluginMarketplaceItem } from "./types";

export type PluginMarketplaceCapabilitySectionKind =
  | "applied_agent"
  | "subagents"
  | "cli_tools"
  | "app_authorization"
  | "skills";

export type PluginMarketplaceCapabilityStatus =
  | "ready"
  | "needs_setup"
  | "blocked"
  | "declared";

export interface PluginMarketplaceCapabilityItem {
  id: string;
  title: string;
  description?: string;
  status: PluginMarketplaceCapabilityStatus;
  meta: string[];
}

export interface PluginMarketplaceCapabilitySection {
  kind: PluginMarketplaceCapabilitySectionKind;
  titleKey: string;
  descriptionKey: string;
  items: PluginMarketplaceCapabilityItem[];
}

export interface PluginMarketplaceCapabilityProfile {
  sections: PluginMarketplaceCapabilitySection[];
  summary: {
    agentCount: number;
    subagentCount: number;
    toolCount: number;
    skillCount: number;
  };
}

interface BuildPluginMarketplaceCapabilityProfileParams {
  item: PluginMarketplaceItem;
  registryItem: PluginRegistryItem;
  skills: readonly PluginSkillDeclaration[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStrings(value.map(readString));
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const record = asRecord(entry);
        return record ? [record] : [];
      })
    : [];
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function capabilityStatus(
  registryItem: PluginRegistryItem,
): PluginMarketplaceCapabilityStatus {
  if (registryItem.activationState === "blocked") {
    return "blocked";
  }
  if (!registryItem.installed || !registryItem.enabled) {
    return "needs_setup";
  }
  if (registryItem.activationState === "activatable") {
    return "ready";
  }
  return "declared";
}

function pushSection(
  sections: PluginMarketplaceCapabilitySection[],
  section: PluginMarketplaceCapabilitySection,
) {
  if (section.items.length > 0) {
    sections.push(section);
  }
}

function appliedAgentItems(params: {
  item: PluginMarketplaceItem;
  summary: Record<string, unknown> | undefined;
  status: PluginMarketplaceCapabilityStatus;
}): PluginMarketplaceCapabilityItem[] {
  const agentApps = readRecords(params.summary?.agentApps);
  const declaredAgents =
    agentApps.length > 0
      ? agentApps
      : params.item.appId
        ? [
            {
              id: params.item.appId,
              title: params.item.displayName,
              description: params.item.description,
            },
          ]
        : [];
  return declaredAgents.map((agent) => {
    const id =
      readString(agent.id) ?? params.item.appId ?? params.item.pluginKey;
    const entryKey = readString(agent.entryKey);
    const uiKind = readString(agent.uiKind);
    return {
      id,
      title: readString(agent.title) ?? params.item.displayName,
      description: readString(agent.description) ?? params.item.description,
      status: params.status,
      meta: uniqueStrings([entryKey ? `entry:${entryKey}` : undefined, uiKind]),
    };
  });
}

function subagentItems(params: {
  summary: Record<string, unknown> | undefined;
  status: PluginMarketplaceCapabilityStatus;
}): PluginMarketplaceCapabilityItem[] {
  const declaredSubagents = readRecords(params.summary?.subagents);
  if (declaredSubagents.length > 0) {
    return declaredSubagents.map((subagent) => {
      const id = readString(subagent.id) ?? "subagent";
      return {
        id,
        title: readString(subagent.title) ?? id,
        description: readString(subagent.description),
        status: params.status,
        meta: uniqueStrings([
          readString(subagent.activation),
          ...readStringArray(subagent.skills).map((skill) => `skill:${skill}`),
          readBoolean(subagent.required) ? "required" : undefined,
        ]),
      };
    });
  }
  const workbench = asRecord(params.summary?.workbench);
  const tasks = readRecords(workbench?.workbenchTasks);
  const agentRuntime = asRecord(params.summary?.agentRuntime);
  const runtimeTasks = readRecords(agentRuntime?.tasks);
  const sourceTasks = tasks.length > 0 ? tasks : runtimeTasks;
  return sourceTasks.map((task) => {
    const kind = readString(task.kind) ?? "agent_app.task";
    const expectedObjects = readStringArray(task.expectedObjects);
    const requiredCapabilities = readStringArray(task.requiredCapabilities);
    return {
      id: kind,
      title: readString(task.title) ?? kind,
      description: readString(task.description),
      status: params.status,
      meta: uniqueStrings([
        kind,
        ...expectedObjects.map((objectKind) => `object:${objectKind}`),
        ...requiredCapabilities,
        readString(task.defaultSurface),
      ]),
    };
  });
}

function cliToolItems(params: {
  summary: Record<string, unknown> | undefined;
  status: PluginMarketplaceCapabilityStatus;
}): PluginMarketplaceCapabilityItem[] {
  const toolRefs = readRecords(params.summary?.toolRefs).map((tool) => ({
    id: readString(tool.key) ?? "tool",
    title: readString(tool.title) ?? readString(tool.key) ?? "tool",
    description: readString(tool.description) ?? readString(tool.provider),
    status: params.status,
    meta: readStringArray(tool.capabilities),
  }));
  const runtimePackage = asRecord(params.summary?.runtimePackage);
  const runtimeWorker = asRecord(runtimePackage?.worker);
  const agentRuntime = asRecord(params.summary?.agentRuntime);
  const agentRuntimeWorker = asRecord(agentRuntime?.worker);
  const workerEntrypoint =
    readString(runtimeWorker?.entrypoint) ??
    readString(runtimeWorker?.path) ??
    readString(agentRuntimeWorker?.entrypoint);
  if (!workerEntrypoint) {
    return toolRefs;
  }
  return [
    ...toolRefs,
    {
      id: "task-worker",
      title: "task-worker",
      description: workerEntrypoint,
      status: params.status,
      meta: uniqueStrings([
        readString(runtimeWorker?.outputArtifactKind) ??
          readString(agentRuntimeWorker?.outputArtifactKind),
      ]),
    },
  ];
}

function authorizationItems(params: {
  item: PluginMarketplaceItem;
  summary: Record<string, unknown> | undefined;
  status: PluginMarketplaceCapabilityStatus;
}): PluginMarketplaceCapabilityItem[] {
  const requires = asRecord(params.summary?.requires);
  const requiredCapabilities = asRecord(requires?.capabilities);
  const capabilities = uniqueStrings([
    ...(params.item.capabilities ?? []),
    ...Object.keys(requiredCapabilities ?? {}),
    ...readStringArray(params.summary?.capabilities),
  ]);
  return [
    {
      id: "installation",
      title: params.item.policy.installation,
      description: params.item.policy.authentication,
      status: params.status,
      meta: capabilities.slice(0, 8),
    },
  ];
}

function skillItems(params: {
  summary: Record<string, unknown> | undefined;
  skills: readonly PluginSkillDeclaration[];
  status: PluginMarketplaceCapabilityStatus;
}): PluginMarketplaceCapabilityItem[] {
  const seen = new Set<string>();
  const declaredSkills = params.skills.map((skill) => {
    seen.add(skill.id);
    return {
      id: skill.id,
      title: skill.title || skill.id,
      description: skill.description,
      status: params.status,
      meta: skill.required ? ["required"] : [],
    };
  });
  const skillRefs = readRecords(params.summary?.skillRefs).flatMap((ref) => {
    const id = readString(ref.id) ?? readString(ref.key);
    if (!id || seen.has(id)) {
      return [];
    }
    seen.add(id);
    return [
      {
        id,
        title: readString(ref.title) ?? id,
        description: readString(ref.description),
        status: params.status,
        meta: uniqueStrings([
          readString(ref.activation),
          readBoolean(ref.required) ? "required" : undefined,
        ]),
      },
    ];
  });
  return [...declaredSkills, ...skillRefs];
}

export function buildPluginMarketplaceCapabilityProfile({
  item,
  registryItem,
  skills,
}: BuildPluginMarketplaceCapabilityProfileParams): PluginMarketplaceCapabilityProfile {
  const summary = asRecord(item.manifestSummary);
  const status = capabilityStatus(registryItem);
  const sections: PluginMarketplaceCapabilitySection[] = [];

  const agents = appliedAgentItems({ item, summary, status });
  const subagents = subagentItems({ summary, status });
  const tools = cliToolItems({ summary, status });
  const authorization = authorizationItems({ item, summary, status });
  const skillList = skillItems({ summary, skills, status });

  pushSection(sections, {
    kind: "applied_agent",
    titleKey: "plugin.marketplace.capability.appliedAgent",
    descriptionKey: "plugin.marketplace.capability.appliedAgentDescription",
    items: agents,
  });
  pushSection(sections, {
    kind: "subagents",
    titleKey: "plugin.marketplace.capability.subagents",
    descriptionKey: "plugin.marketplace.capability.subagentsDescription",
    items: subagents,
  });
  pushSection(sections, {
    kind: "cli_tools",
    titleKey: "plugin.marketplace.capability.cliTools",
    descriptionKey: "plugin.marketplace.capability.cliToolsDescription",
    items: tools,
  });
  pushSection(sections, {
    kind: "app_authorization",
    titleKey: "plugin.marketplace.capability.appAuthorization",
    descriptionKey: "plugin.marketplace.capability.appAuthorizationDescription",
    items: authorization,
  });
  pushSection(sections, {
    kind: "skills",
    titleKey: "plugin.marketplace.capability.skills",
    descriptionKey: "plugin.marketplace.capability.skillsDescription",
    items: skillList,
  });

  return {
    sections,
    summary: {
      agentCount: agents.length,
      subagentCount: subagents.length,
      toolCount: tools.length,
      skillCount: skillList.length,
    },
  };
}
