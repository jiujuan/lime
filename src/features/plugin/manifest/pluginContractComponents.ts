import type {
  PluginActivationEntryDeclaration,
  PluginActivationEntryKind,
  PluginCliDeclaration,
  PluginHookDeclaration,
  PluginManifestComponentPaths,
  PluginManifestContributions,
  PluginManifestInterface,
} from "./types";
import { PluginManifestError } from "./pluginContractErrors";
import {
  isRecord,
  readBoolean,
  readRecords,
  readString,
  readStringArray,
  requireString,
  uniqueStrings,
} from "./pluginContractUtils";

function readRecordArrayOrItems(
  value: unknown,
  field: string,
  nestedKeys: string[],
): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return readRecords(value, field);
  }
  const record = isRecord(value) ? value : undefined;
  if (!record) {
    return [];
  }
  return nestedKeys.flatMap((key) =>
    readRecords(record[key], `${field}.${key}`),
  );
}

export function normalizeComponentPaths(
  raw: Record<string, unknown>,
): PluginManifestComponentPaths {
  const componentPaths = isRecord(raw.componentPaths) ? raw.componentPaths : {};
  const contributions = isRecord(raw.contributions) ? raw.contributions : {};
  const agents =
    readString(componentPaths.agents) ??
    (typeof raw.agents === "string" ? readString(raw.agents) : undefined);
  const subagents =
    readString(componentPaths.subagents) ?? readString(contributions.subagents);
  const skills =
    readString(componentPaths.skills) ??
    readString(contributions.skills) ??
    (typeof raw.skills === "string" ? readString(raw.skills) : undefined);
  const cli =
    readString(componentPaths.cli) ??
    (typeof raw.cli === "string" ? readString(raw.cli) : undefined);
  const clis =
    readString(componentPaths.clis) ?? readString(contributions.clis);
  const connectors =
    readString(componentPaths.connectors) ??
    readString(contributions.connectors);
  const resources =
    readString(componentPaths.resources) ?? readString(contributions.resources);
  const workflows =
    readString(componentPaths.workflows) ?? readString(contributions.workflows);
  const artifacts =
    readString(componentPaths.artifacts) ?? readString(contributions.artifacts);
  const locales =
    readString(componentPaths.locales) ?? readString(contributions.locales);
  const examples =
    readString(componentPaths.examples) ?? readString(contributions.examples);
  const hooks =
    readString(componentPaths.hooks) ??
    readString(contributions.hooks) ??
    (typeof raw.hooks === "string" ? readString(raw.hooks) : undefined);
  const apps =
    readString(componentPaths.apps) ??
    (typeof raw.apps === "string" ? readString(raw.apps) : undefined);
  const runtime =
    readString(componentPaths.runtime) ?? readString(contributions.runtime);
  const workbench =
    readString(componentPaths.workbench) ?? readString(contributions.workbench);
  const rawMcpServers =
    componentPaths.mcpServers ?? contributions.mcpServers ?? raw.mcpServers;
  const mcpServers =
    isRecord(rawMcpServers) || typeof rawMcpServers === "string"
      ? rawMcpServers
      : undefined;
  return {
    ...(agents ? { agents } : {}),
    ...(subagents ? { subagents } : {}),
    ...(skills ? { skills } : {}),
    ...(cli ? { cli } : {}),
    ...(clis ? { clis } : {}),
    ...(connectors ? { connectors } : {}),
    ...(resources ? { resources } : {}),
    ...(workflows ? { workflows } : {}),
    ...(artifacts ? { artifacts } : {}),
    ...(locales ? { locales } : {}),
    ...(examples ? { examples } : {}),
    ...(mcpServers !== undefined ? { mcpServers } : {}),
    ...(apps ? { apps } : {}),
    ...(hooks ? { hooks } : {}),
    ...(runtime ? { runtime } : {}),
    ...(workbench ? { workbench } : {}),
  };
}

export function normalizeContributions(
  value: unknown,
): PluginManifestContributions | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const mcpServers = value.mcpServers;
  const contributions: PluginManifestContributions = {
    ...(readString(value.runtime)
      ? { runtime: readString(value.runtime) }
      : {}),
    ...(readString(value.workbench)
      ? { workbench: readString(value.workbench) }
      : {}),
    ...(readString(value.skills) ? { skills: readString(value.skills) } : {}),
    ...(readString(value.subagents)
      ? { subagents: readString(value.subagents) }
      : {}),
    ...(readString(value.clis) ? { clis: readString(value.clis) } : {}),
    ...(readString(value.connectors)
      ? { connectors: readString(value.connectors) }
      : {}),
    ...(readString(value.hooks) ? { hooks: readString(value.hooks) } : {}),
    ...(readString(value.resources)
      ? { resources: readString(value.resources) }
      : {}),
    ...(readString(value.workflows)
      ? { workflows: readString(value.workflows) }
      : {}),
    ...(readString(value.artifacts)
      ? { artifacts: readString(value.artifacts) }
      : {}),
    ...(readString(value.locales)
      ? { locales: readString(value.locales) }
      : {}),
    ...(readString(value.examples)
      ? { examples: readString(value.examples) }
      : {}),
    ...(isRecord(mcpServers) || typeof mcpServers === "string"
      ? { mcpServers }
      : {}),
  };
  return Object.keys(contributions).length > 0 ? contributions : undefined;
}

export function normalizeManifestInterface(
  value: unknown,
): PluginManifestInterface | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const capabilities = readStringArray(value.capabilities);
  const screenshots = readStringArray(value.screenshots);
  const defaultPrompt = readStringArray(value.defaultPrompt);
  return {
    displayName: readString(value.displayName),
    shortDescription: readString(value.shortDescription),
    longDescription: readString(value.longDescription),
    developerName: readString(value.developerName),
    category: readString(value.category),
    capabilities,
    websiteUrl: readString(value.websiteUrl) ?? readString(value.websiteURL),
    privacyPolicyUrl:
      readString(value.privacyPolicyUrl) ?? readString(value.privacyPolicyURL),
    termsOfServiceUrl:
      readString(value.termsOfServiceUrl) ??
      readString(value.termsOfServiceURL),
    defaultPrompt,
    brandColor: readString(value.brandColor),
    composerIcon: readString(value.composerIcon),
    logo: readString(value.logo),
    logoDark: readString(value.logoDark),
    screenshots,
  };
}

function normalizeActivationKind(value: unknown): PluginActivationEntryKind {
  const kind = readString(value);
  if (!kind || !["plugin", "agentApp", "skill"].includes(kind)) {
    throw new PluginManifestError(
      `Plugin activation entry kind is unsupported: ${kind ?? ""}`,
    );
  }
  return kind as PluginActivationEntryKind;
}

export function normalizeActivationEntry(
  record: Record<string, unknown>,
): PluginActivationEntryDeclaration {
  const intent = readString(record.intent);
  if (
    intent &&
    !["manual", "at_command", "history_restore", "chip"].includes(intent)
  ) {
    throw new PluginManifestError(
      `Plugin activation entry intent is unsupported: ${intent}`,
    );
  }
  const taskKind = readString(record.taskKind) ?? readString(record.task_kind);
  const workflowKey =
    readString(record.workflowKey) ??
    readString(record.workflow_key) ??
    readString(record.workflow);
  const outputArtifactKind =
    readString(record.outputArtifactKind) ??
    readString(record.output_artifact_kind);
  const rightSurface =
    readString(record.rightSurface) ?? readString(record.right_surface);
  const expectedObjects = uniqueStrings([
    ...readStringArray(record.expectedObjects),
    ...readStringArray(record.expected_objects),
  ]);

  return {
    key: requireString(record, "key"),
    title: requireString(record, "title"),
    aliases: readStringArray(record.aliases),
    kind: normalizeActivationKind(record.kind),
    intent: intent as PluginActivationEntryDeclaration["intent"] | undefined,
    ...(taskKind ? { taskKind } : {}),
    ...(workflowKey ? { workflowKey } : {}),
    ...(outputArtifactKind ? { outputArtifactKind } : {}),
    ...(rightSurface ? { rightSurface } : {}),
    ...(expectedObjects.length > 0 ? { expectedObjects } : {}),
    defaultObjectKind: readString(record.defaultObjectKind),
  };
}

export function normalizeCliDeclaration(
  record: Record<string, unknown>,
  fallbackId?: string,
): PluginCliDeclaration {
  const id =
    readString(record.id) ??
    readString(record.key) ??
    readString(record.name) ??
    fallbackId;
  if (!id) {
    throw new PluginManifestError("Plugin CLI declaration missing id or key");
  }
  return {
    id,
    title: readString(record.title) ?? readString(record.displayName),
    description: readString(record.description),
    entrypoint: readString(record.entrypoint) ?? readString(record.path),
    registry: readString(record.registry),
    commands: readStringArray(record.commands),
    required: readBoolean(record.required, false),
  };
}

export function normalizeHookDeclaration(
  record: Record<string, unknown>,
): PluginHookDeclaration {
  const key =
    readString(record.key) ?? readString(record.id) ?? readString(record.event);
  if (!key) {
    throw new PluginManifestError(
      "Plugin hook declaration missing key, id, or event",
    );
  }
  return {
    key,
    title: readString(record.title),
    description: readString(record.description),
    event: readString(record.event),
    entrypoint: readString(record.entrypoint),
    path: readString(record.path),
    required: readBoolean(record.required, false),
  };
}

export function normalizeCliDeclarations(
  value: unknown,
): PluginCliDeclaration[] {
  if (typeof value === "string") {
    return [];
  }
  if (isRecord(value)) {
    const declaration = normalizeCliDeclaration(value, "cli");
    return declaration.entrypoint ||
      declaration.registry ||
      declaration.commands?.length
      ? [declaration]
      : [];
  }
  return readRecords(value, "clis").map((record) =>
    normalizeCliDeclaration(record),
  );
}

export function normalizeHookDeclarations(
  value: unknown,
): PluginHookDeclaration[] {
  return readRecordArrayOrItems(value, "hooks", ["items", "handlers"]).map(
    normalizeHookDeclaration,
  );
}
