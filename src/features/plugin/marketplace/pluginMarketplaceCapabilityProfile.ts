import type {
  PluginRegistryItem,
  PluginSkillDeclaration,
} from "../manifest/types";
import type { PluginMarketplaceItem } from "./types";

export type PluginMarketplaceCapabilitySectionKind =
  | "plugin_ui"
  | "subagents"
  | "workflows"
  | "cli_tools"
  | "connectors"
  | "lifecycle_hooks"
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
    uiCount: number;
    subagentCount: number;
    workflowCount: number;
    toolCount: number;
    connectorCount: number;
    hookCount: number;
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

function readNestedRecords(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown>[] {
  const record = asRecord(value);
  if (!record) {
    return [];
  }
  return keys.flatMap((key) => readRecords(record[key]));
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function dedupeItemsById(
  items: PluginMarketplaceCapabilityItem[],
): PluginMarketplaceCapabilityItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function toolProvider(tool: Record<string, unknown>): string | undefined {
  return readString(tool.provider);
}

function isConnectorTool(tool: Record<string, unknown>): boolean {
  const provider = toolProvider(tool);
  return (
    provider === "connector-registry" ||
    Boolean(provider?.startsWith("connector:"))
  );
}

function isLifecycleHookTool(tool: Record<string, unknown>): boolean {
  return toolProvider(tool) === "lifecycle-hook";
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

function pluginUiItems(params: {
  item: PluginMarketplaceItem;
  summary: Record<string, unknown> | undefined;
  status: PluginMarketplaceCapabilityStatus;
}): PluginMarketplaceCapabilityItem[] {
  const pluginUi = readRecords(params.summary?.ui);
  const declaredUi =
    pluginUi.length > 0
      ? pluginUi
      : params.item.appId
        ? [
            {
              id: params.item.appId,
              title: params.item.displayName,
              description: params.item.description,
            },
          ]
        : [];
  return declaredUi.map((ui) => {
    const id = readString(ui.id) ?? params.item.appId ?? params.item.pluginKey;
    const entryKey = readString(ui.entryKey);
    const uiKind = readString(ui.uiKind);
    return {
      id,
      title: readString(ui.title) ?? params.item.displayName,
      description: readString(ui.description) ?? params.item.description,
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
    const kind = readString(task.kind) ?? "plugin.task";
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

function workflowHookPolicyMeta(value: unknown): string[] {
  const policy = asRecord(value);
  if (!policy) {
    return [];
  }
  return Object.entries(policy).flatMap(([eventName, refs]) =>
    readStringArray(refs).map((ref) => `hook:${eventName}:${ref}`),
  );
}

function workflowItems(params: {
  summary: Record<string, unknown> | undefined;
  status: PluginMarketplaceCapabilityStatus;
}): PluginMarketplaceCapabilityItem[] {
  const agentRuntime = asRecord(params.summary?.agentRuntime);
  return dedupeItemsById(
    [
      ...readRecords(params.summary?.workflows),
      ...readRecords(agentRuntime?.workflows),
    ].map((workflow) => {
      const key =
        readString(workflow.key) ?? readString(workflow.id) ?? "workflow";
      const steps = readRecords(workflow.steps);
      return {
        id: key,
        title: readString(workflow.title) ?? key,
        description:
          readString(workflow.description) ??
          readString(workflow.taskKind) ??
          readString(workflow.path),
        status: params.status,
        meta: uniqueStrings([
          readString(workflow.taskKind),
          readString(workflow.outputArtifactKind),
          ...readStringArray(workflow.triggerIntents).map(
            (intent) => `intent:${intent}`,
          ),
          ...readStringArray(workflow.cliRefs).map((cli) => `cli:${cli}`),
          ...readStringArray(workflow.connectorRefs).map(
            (connector) => `connector:${connector}`,
          ),
          ...workflowHookPolicyMeta(workflow.hookPolicy),
          steps.length > 0 ? `steps:${steps.length}` : undefined,
          readBoolean(workflow.humanReview) ? "human-review" : undefined,
        ]),
      };
    }),
  );
}

function cliToolItems(params: {
  summary: Record<string, unknown> | undefined;
  status: PluginMarketplaceCapabilityStatus;
}): PluginMarketplaceCapabilityItem[] {
  const cliTools = readNestedRecords(params.summary?.clis, ["tools"]);
  const toolRefs = [...cliTools, ...readRecords(params.summary?.toolRefs)]
    .filter((tool) => !isConnectorTool(tool) && !isLifecycleHookTool(tool))
    .map((tool) => ({
      id: readString(tool.key) ?? readString(tool.id) ?? "tool",
      title:
        readString(tool.title) ??
        readString(tool.displayName) ??
        readString(tool.key) ??
        readString(tool.id) ??
        "tool",
      description:
        readString(tool.description) ??
        readString(tool.provider) ??
        readString(tool.path),
      status: params.status,
      meta: uniqueStrings([
        ...readStringArray(tool.capabilities),
        readString(tool.provider),
        readString(tool.path),
      ]),
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
  return dedupeItemsById([
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
  ]);
}

function connectorItems(params: {
  summary: Record<string, unknown> | undefined;
  status: PluginMarketplaceCapabilityStatus;
}): PluginMarketplaceCapabilityItem[] {
  const agentRuntime = asRecord(params.summary?.agentRuntime);
  const runtimeConnectors = asRecord(agentRuntime?.connectors);
  const registryPath = readString(runtimeConnectors?.registry);
  const registryItems: Record<string, unknown>[] = registryPath
    ? [
        {
          id: "connector-registry",
          title: "connector-registry",
          description: registryPath,
          kind: "registry",
        },
      ]
    : [];
  const connectorRecords = [
    ...readRecords(params.summary?.connectors),
    ...readRecords(runtimeConnectors?.items),
    ...readRecords(runtimeConnectors?.connectors),
    ...registryItems,
    ...readRecords(params.summary?.toolRefs).filter(isConnectorTool),
  ];
  return dedupeItemsById(
    connectorRecords.map((connector) => {
      const id =
        readString(connector.id) ??
        readString(connector.key) ??
        readString(connector.title) ??
        "connector";
      const providerKind = toolProvider(connector)?.replace(/^connector:/, "");
      return {
        id,
        title: readString(connector.title) ?? id,
        description:
          readString(connector.description) ??
          readString(connector.path) ??
          readString(connector.provider),
        status: params.status,
        meta: uniqueStrings([
          readString(connector.kind) ?? providerKind,
          ...readStringArray(connector.taskKinds).map((task) => `task:${task}`),
          ...readStringArray(connector.capabilities).map(
            (capability) => `task:${capability}`,
          ),
          readString(connector.path),
          readBoolean(connector.required) ? "required" : undefined,
        ]),
      };
    }),
  );
}

function hookRecordsFromSummary(
  summary: Record<string, unknown> | undefined,
): Record<string, unknown>[] {
  const agentRuntime = asRecord(summary?.agentRuntime);
  const runtimeHooks = asRecord(agentRuntime?.hooks);
  return [
    ...readRecords(summary?.hooks),
    ...readNestedRecords(summary?.hooks, ["items", "handlers"]),
    ...readRecords(runtimeHooks?.items),
    ...readRecords(runtimeHooks?.handlers),
    ...readRecords(summary?.toolRefs).filter(isLifecycleHookTool),
  ];
}

function hookItems(params: {
  summary: Record<string, unknown> | undefined;
  status: PluginMarketplaceCapabilityStatus;
}): PluginMarketplaceCapabilityItem[] {
  return dedupeItemsById(
    hookRecordsFromSummary(params.summary).map((hook) => {
      const id =
        readString(hook.key) ??
        readString(hook.id) ??
        readString(hook.event) ??
        "hook";
      return {
        id: id.startsWith("hook:") ? id.slice("hook:".length) : id,
        title: readString(hook.title) ?? readString(hook.event) ?? id,
        description:
          readString(hook.description) ??
          readString(hook.entrypoint) ??
          readString(hook.path),
        status: params.status,
        meta: uniqueStrings([
          readString(hook.event),
          readString(hook.entrypoint) ?? readString(hook.path),
          readBoolean(hook.required) ? "required" : undefined,
        ]),
      };
    }),
  );
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

  const pluginUi = pluginUiItems({ item, summary, status });
  const subagents = subagentItems({ summary, status });
  const workflows = workflowItems({ summary, status });
  const tools = cliToolItems({ summary, status });
  const connectors = connectorItems({ summary, status });
  const hooks = hookItems({ summary, status });
  const authorization = authorizationItems({ item, summary, status });
  const skillList = skillItems({ summary, skills, status });

  pushSection(sections, {
    kind: "plugin_ui",
    titleKey: "plugin.marketplace.capability.pluginUi",
    descriptionKey: "plugin.marketplace.capability.pluginUiDescription",
    items: pluginUi,
  });
  pushSection(sections, {
    kind: "subagents",
    titleKey: "plugin.marketplace.capability.subagents",
    descriptionKey: "plugin.marketplace.capability.subagentsDescription",
    items: subagents,
  });
  pushSection(sections, {
    kind: "workflows",
    titleKey: "plugin.marketplace.capability.workflows",
    descriptionKey: "plugin.marketplace.capability.workflowsDescription",
    items: workflows,
  });
  pushSection(sections, {
    kind: "cli_tools",
    titleKey: "plugin.marketplace.capability.cliTools",
    descriptionKey: "plugin.marketplace.capability.cliToolsDescription",
    items: tools,
  });
  pushSection(sections, {
    kind: "connectors",
    titleKey: "plugin.marketplace.capability.connectors",
    descriptionKey: "plugin.marketplace.capability.connectorsDescription",
    items: connectors,
  });
  pushSection(sections, {
    kind: "lifecycle_hooks",
    titleKey: "plugin.marketplace.capability.hooks",
    descriptionKey: "plugin.marketplace.capability.hooksDescription",
    items: hooks,
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
      uiCount: pluginUi.length,
      subagentCount: subagents.length,
      workflowCount: workflows.length,
      toolCount: tools.length,
      connectorCount: connectors.length,
      hookCount: hooks.length,
      skillCount: skillList.length,
    },
  };
}
