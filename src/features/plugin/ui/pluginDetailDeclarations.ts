import type { AgentPageParams } from "@/types/page";
import type { InstalledPluginState, ProjectedEntry } from "../types";
import type { AppCenterItem } from "./PluginsPageViewModel";

export type DetailDeclaration = {
  key: string;
  title: string;
  description?: string;
  meta?: string;
  aliases?: string[];
  required?: boolean;
  taskKind?: string;
  workflowKey?: string;
  outputArtifactKind?: string;
  rightSurface?: string;
  expectedObjects?: string[];
};

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function readTextArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = readText(item);
        return text ? [text] : [];
      })
    : [];
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const records: Record<string, unknown>[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (record) {
      records.push(record);
    }
  }
  return records;
}

function detailDeclarationFromRecord(
  entry: Record<string, unknown>,
  fallback: DetailDeclaration | undefined,
  fallbackTitle: string,
): DetailDeclaration {
  const key = readText(entry.key) ?? fallback?.key ?? "";
  const aliases = readTextArray(entry.aliases);
  const taskKind =
    readText(entry.taskKind) ?? readText(entry.task_kind) ?? fallback?.taskKind;
  const workflowKey =
    readText(entry.workflowKey) ??
    readText(entry.workflow_key) ??
    readText(entry.workflow) ??
    fallback?.workflowKey;
  const outputArtifactKind =
    readText(entry.outputArtifactKind) ??
    readText(entry.output_artifact_kind) ??
    fallback?.outputArtifactKind;
  const rightSurface =
    readText(entry.rightSurface) ??
    readText(entry.right_surface) ??
    fallback?.rightSurface;
  const expectedObjects = readTextArray(
    entry.expectedObjects ?? entry.expected_objects,
  );
  const defaultObjectKind =
    readText(entry.defaultObjectKind) ?? readText(entry.default_object_kind);
  const mergedExpectedObjects =
    expectedObjects.length > 0
      ? expectedObjects
      : fallback?.expectedObjects?.length
        ? fallback.expectedObjects
        : defaultObjectKind
          ? [defaultObjectKind]
          : undefined;

  return {
    key,
    title:
      readText(entry.title) ??
      fallback?.title ??
      taskKind ??
      key ??
      fallbackTitle,
    description: readText(entry.description) ?? fallback?.description,
    meta: taskKind ?? outputArtifactKind ?? fallback?.meta,
    aliases: aliases.length > 0 ? aliases : fallback?.aliases,
    taskKind,
    workflowKey,
    outputArtifactKind,
    rightSurface,
    expectedObjects: mergedExpectedObjects,
  };
}

function uniqueDetailDeclarations(
  declarations: DetailDeclaration[],
): DetailDeclaration[] {
  const seen = new Set<string>();
  const result: DetailDeclaration[] = [];
  for (const declaration of declarations) {
    if (!declaration.key || seen.has(declaration.key)) {
      continue;
    }
    seen.add(declaration.key);
    result.push(declaration);
  }
  return result;
}

function normalizeActivationLookupKey(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function activationDeclarationMatchesProjectedEntry(
  declaration: DetailDeclaration,
  entry: ProjectedEntry,
): boolean {
  const declarationKeys = [
    declaration.key,
    declaration.title,
    declaration.taskKind,
    declaration.workflowKey,
  ].map(normalizeActivationLookupKey);
  const entryKeys = [entry.key, entry.title, entry.route].map(
    normalizeActivationLookupKey,
  );
  return declarationKeys.some(
    (left) =>
      left &&
      entryKeys.some(
        (right) => right && (left === right || left.includes(right)),
      ),
  );
}

function buildDetailActivationEntriesFromState(params: {
  state?: InstalledPluginState;
  fallbackTitle: string;
}): DetailDeclaration[] {
  const manifest = params.state?.manifest;
  const runtime = asRecord(manifest?.agentRuntime);
  const manifestActivationRecords = readRecordArray(
    manifest?.activationEntries,
  );
  const manifestActivationByKey = new Map<string, DetailDeclaration>();
  for (const entry of manifestActivationRecords) {
    const declaration = detailDeclarationFromRecord(
      entry,
      undefined,
      params.fallbackTitle,
    );
    if (declaration.key) {
      manifestActivationByKey.set(declaration.key, declaration);
    }
  }
  const runtimeRecords = [
    ...readRecordArray(runtime?.activationEntries),
    ...readRecordArray(runtime?.intents),
  ];
  const declaredRecords =
    runtimeRecords.length > 0 ? runtimeRecords : manifestActivationRecords;
  const declared = declaredRecords.map<DetailDeclaration>((entry) => {
    const key = readText(entry.key);
    return detailDeclarationFromRecord(
      entry,
      key ? manifestActivationByKey.get(key) : undefined,
      params.fallbackTitle,
    );
  });
  return uniqueDetailDeclarations(declared);
}

export function buildDetailActivationEntries(
  item: AppCenterItem,
): DetailDeclaration[] {
  const runtimeDeclared = buildDetailActivationEntriesFromState({
    state: item.installedState,
    fallbackTitle: item.title,
  });
  const projected = item.entries.map<DetailDeclaration>((entry) => ({
    key: entry.key,
    title: entry.title,
    description: entry.description,
    meta: entry.kind,
  }));
  return runtimeDeclared.length > 0
    ? runtimeDeclared
    : uniqueDetailDeclarations(projected);
}

export function resolveActivationDeclarationForProjectedEntry(params: {
  state: InstalledPluginState;
  entry: ProjectedEntry;
}): DetailDeclaration {
  const declarations = buildDetailActivationEntriesFromState({
    state: params.state,
    fallbackTitle: params.entry.title,
  });
  return (
    declarations.find((declaration) =>
      activationDeclarationMatchesProjectedEntry(declaration, params.entry),
    ) ?? {
      key: params.entry.key,
      title: params.entry.title,
      description: params.entry.description,
      meta: params.entry.kind,
    }
  );
}

export function activationMentionTrigger(
  declaration: DetailDeclaration,
): string {
  const alias = declaration.aliases?.find((item) => item.trim())?.trim();
  const raw = alias || declaration.title || declaration.key;
  return raw.startsWith("@") ? raw : `@${raw}`;
}

export function hasAgentActivationRoute(
  declaration: DetailDeclaration,
): boolean {
  return Boolean(
    declaration.taskKind ||
    declaration.workflowKey ||
    declaration.outputArtifactKind ||
    declaration.rightSurface ||
    declaration.aliases?.some((item) => item.trim()),
  );
}

export function buildPluginActivationAgentParams(params: {
  state: InstalledPluginState;
  declaration: DetailDeclaration;
  projectId?: string;
}): AgentPageParams {
  const trigger = activationMentionTrigger(params.declaration);
  const launchRequestId = Date.now();
  return {
    agentEntry: "new-task",
    ...(params.projectId ? { projectId: params.projectId } : {}),
    initialUserPrompt: `${trigger} `,
    initialSessionName: params.declaration.title,
    autoRunInitialPromptOnMount: false,
    newChatAt: launchRequestId,
    immersiveHome: false,
  };
}

export function buildDetailSubagents(item: AppCenterItem): DetailDeclaration[] {
  return uniqueDetailDeclarations(
    (item.installedState?.manifest.subagents ?? []).map((subagent) => ({
      key: subagent.id,
      title: subagent.title ?? subagent.id,
      description: subagent.description,
      meta: subagent.activation,
      required: subagent.required,
      aliases: readTextArray(subagent.skills),
    })),
  );
}

export function buildDetailSkills(item: AppCenterItem): DetailDeclaration[] {
  const skillRequirements = item.installedState?.projection.skillRequirements;
  if (skillRequirements?.length) {
    return uniqueDetailDeclarations(
      skillRequirements.map((skill) => ({
        key: skill.id,
        title: skill.title ?? skill.id,
        description: skill.description,
        meta: skill.activation ?? skill.standard,
        required: skill.required,
      })),
    );
  }

  return uniqueDetailDeclarations(
    (item.installedState?.manifest.skillRefs ?? []).map((skill) => ({
      key: skill.id,
      title: skill.title ?? skill.id,
      description: skill.description,
      meta: skill.activation,
      required: skill.required,
    })),
  );
}

function joinDetailMeta(
  ...parts: Array<string | undefined>
): string | undefined {
  const values = parts.filter((part): part is string => Boolean(part));
  return values.length > 0
    ? Array.from(new Set(values)).join(" / ")
    : undefined;
}

export function buildDetailTools(item: AppCenterItem): DetailDeclaration[] {
  const toolRequirements = item.installedState?.projection.toolRequirements;
  if (toolRequirements?.length) {
    return uniqueDetailDeclarations(
      toolRequirements.map((tool) => ({
        key: tool.key,
        title: tool.title ?? tool.key,
        description: tool.description,
        meta: joinDetailMeta(tool.bindingKind, tool.provider),
        required: tool.required,
        aliases: tool.capabilities.length > 0 ? tool.capabilities : undefined,
      })),
    );
  }

  return uniqueDetailDeclarations(
    (item.installedState?.manifest.toolRefs ?? []).map((tool) => ({
      key: tool.key,
      title: tool.title ?? tool.key,
      description: tool.description,
      meta: tool.provider,
      required: tool.required,
      aliases: tool.capabilities?.length ? tool.capabilities : undefined,
    })),
  );
}

export function buildDetailMcpBindings(
  item: AppCenterItem,
): DetailDeclaration[] {
  const projectionBindings =
    item.installedState?.projection.runtimeCapabilities?.mcpBindings;
  const fallbackBindings =
    item.installedState?.manifest.runtimeCapabilities?.mcpBindings;
  const bindings = projectionBindings?.length
    ? projectionBindings
    : (fallbackBindings ?? []);

  return uniqueDetailDeclarations(
    bindings.map((binding) => ({
      key: `${binding.serverId}:${binding.toolKey}`,
      title: binding.serverId,
      description: binding.toolKey,
      meta: binding.provider,
      required: binding.required,
    })),
  );
}
