import type {
  PluginActivationEntryDeclaration,
  PluginContract,
  PluginRegistryActivationState,
  PluginRegistryItem,
} from "../manifest/types";

export type PluginActivationContextSource =
  | "user"
  | "history"
  | "route"
  | "restore";

export interface PluginObjectRef {
  pluginId: string;
  objectKind: string;
  objectId: string;
  version?: string;
  artifactIds?: string[];
  sourceTurnId?: string;
  sourceTaskId?: string;
}

export interface PluginActivationContext {
  sessionId: string;
  pluginId: string;
  activeAgentAppId?: string;
  activeEntryKey?: string;
  taskKind?: string;
  workflowKey?: string;
  outputArtifactKind?: string;
  rightSurface?: string;
  expectedObjects?: string[];
  selectedSkillKeys?: string[];
  selectedObjectRef?: PluginObjectRef;
  openedTabs?: string[];
  pinnedTabs?: string[];
  source: PluginActivationContextSource;
}

export interface PluginActivationMentionCatalogEntry {
  prefix: string;
  pluginId: string;
  pluginDisplayName: string;
  activeAgentAppId?: string;
  activeEntryKey?: string;
  selectedSkillKeys?: string[];
  taskKind?: string;
  workflowKey?: string;
  outputArtifactKind?: string;
  rightSurface?: string;
  expectedObjects?: string[];
  defaultObjectKind?: string;
  activationState: PluginRegistryActivationState;
  blockerCodes: string[];
}

export interface PluginActivationMentionCatalog {
  entries: PluginActivationMentionCatalogEntry[];
}

export interface PluginActivationMentionMatch {
  rawText: string;
  trigger: string;
  body: string;
  entry: PluginActivationMentionCatalogEntry;
}

export type PluginActivationMentionParseResult =
  | {
      status: "matched";
      match: PluginActivationMentionMatch;
      context: PluginActivationContext;
    }
  | {
      status: "blocked";
      match: PluginActivationMentionMatch;
      blockerCodes: string[];
    };

interface BuildPluginActivationMentionCatalogParams {
  contracts: readonly PluginContract[];
  registryItems?: readonly PluginRegistryItem[];
}

interface ParsePluginActivationMentionParams {
  text: string;
  catalog: PluginActivationMentionCatalog;
  sessionId: string;
  source?: PluginActivationContextSource;
}

function normalizePrefix(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function isBoundary(value: string, prefixLength: number): boolean {
  return value.length === prefixLength || /\s/.test(value[prefixLength] ?? "");
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function activationStateForPlugin(
  pluginId: string,
  registryItems: readonly PluginRegistryItem[] | undefined,
): {
  activationState: PluginRegistryActivationState;
  blockerCodes: string[];
} {
  if (!registryItems) {
    return {
      activationState: "activatable",
      blockerCodes: [],
    };
  }
  const item = registryItems.find(
    (candidate) => candidate.pluginId === pluginId,
  );
  if (!item) {
    return {
      activationState: "blocked",
      blockerCodes: ["PLUGIN_REGISTRY_ITEM_MISSING"],
    };
  }
  return {
    activationState: item.activationState,
    blockerCodes: item.blockerCodes,
  };
}

function prefixVariantsForEntry(params: {
  contract: PluginContract;
  entry: PluginActivationEntryDeclaration;
}): string[] {
  const { contract, entry } = params;
  const includePluginPrefixes =
    entry.key === contract.id ||
    entry.title === contract.displayName ||
    entry.kind === "agentApp";
  return uniqueStrings([
    includePluginPrefixes ? `@${contract.displayName}` : undefined,
    includePluginPrefixes ? `@${contract.id}` : undefined,
    entry.title !== contract.displayName ? `@${entry.title}` : undefined,
    ...(entry.aliases ?? []).map((alias) =>
      alias.trim().startsWith("@") ? alias : `@${alias}`,
    ),
  ]);
}

function defaultAgentAppId(contract: PluginContract): string | undefined {
  return contract.agentApps[0]?.id;
}

function catalogEntryForPrefix(params: {
  contract: PluginContract;
  entry: PluginActivationEntryDeclaration;
  prefix: string;
  activationState: PluginRegistryActivationState;
  blockerCodes: string[];
}): PluginActivationMentionCatalogEntry {
  const { contract, entry } = params;
  return {
    prefix: params.prefix,
    pluginId: contract.id,
    pluginDisplayName: contract.displayName,
    activeAgentAppId: defaultAgentAppId(contract),
    activeEntryKey: entry.key,
    taskKind: entry.taskKind,
    workflowKey: entry.workflowKey,
    outputArtifactKind: entry.outputArtifactKind,
    rightSurface: entry.rightSurface,
    expectedObjects: entry.expectedObjects?.length
      ? entry.expectedObjects
      : entry.defaultObjectKind
        ? [entry.defaultObjectKind]
        : undefined,
    defaultObjectKind: entry.defaultObjectKind,
    activationState: params.activationState,
    blockerCodes: params.blockerCodes,
  };
}

function skillPrefixVariants(params: {
  contract: PluginContract;
  pluginPrefix: string;
  skillId: string;
  skillTitle: string;
}): string[] {
  return uniqueStrings([
    `${params.pluginPrefix}:${params.skillId}`,
    `${params.pluginPrefix}:${params.skillTitle}`,
  ]);
}

function buildSkillCatalogEntries(params: {
  contract: PluginContract;
  entry: PluginActivationEntryDeclaration;
  activationState: PluginRegistryActivationState;
  blockerCodes: string[];
}): PluginActivationMentionCatalogEntry[] {
  const { contract, entry } = params;
  if (contract.skills.length === 0) {
    return [];
  }
  const pluginPrefixes = uniqueStrings([
    `@${contract.displayName}`,
    `@${contract.id}`,
  ]);
  return contract.skills.flatMap((skill) =>
    pluginPrefixes.flatMap((pluginPrefix) =>
      skillPrefixVariants({
        contract,
        pluginPrefix,
        skillId: skill.id,
        skillTitle: skill.title,
      }).map((prefix) => ({
        prefix,
        pluginId: contract.id,
        pluginDisplayName: contract.displayName,
        activeEntryKey: entry.key,
        selectedSkillKeys: [skill.id],
        taskKind: entry.taskKind,
        workflowKey: entry.workflowKey,
        outputArtifactKind: entry.outputArtifactKind,
        rightSurface: entry.rightSurface,
        expectedObjects: entry.expectedObjects?.length
          ? entry.expectedObjects
          : entry.defaultObjectKind
            ? [entry.defaultObjectKind]
            : undefined,
        defaultObjectKind: entry.defaultObjectKind,
        activationState: params.activationState,
        blockerCodes: params.blockerCodes,
      })),
    ),
  );
}

function dedupeCatalogEntries(
  entries: PluginActivationMentionCatalogEntry[],
): PluginActivationMentionCatalogEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${normalizePrefix(entry.prefix)}::${entry.pluginId}::${
      entry.activeEntryKey ?? ""
    }::${entry.selectedSkillKeys?.join(",") ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function buildPluginActivationMentionCatalog(
  params: BuildPluginActivationMentionCatalogParams,
): PluginActivationMentionCatalog {
  const registryItems = params.registryItems;
  const entries = params.contracts.flatMap((contract) => {
    const state = activationStateForPlugin(contract.id, registryItems);
    const activationEntries = contract.activationEntries;
    const defaultActivationEntry = activationEntries[0];
    if (!defaultActivationEntry) {
      return [];
    }
    const baseEntries = activationEntries.flatMap((entry) =>
      prefixVariantsForEntry({
        contract,
        entry,
      }).map((prefix) =>
        catalogEntryForPrefix({
          contract,
          entry,
          prefix,
          ...state,
        }),
      ),
    );
    return [
      ...baseEntries,
      ...buildSkillCatalogEntries({
        contract,
        entry: defaultActivationEntry,
        ...state,
      }),
    ];
  });

  return {
    entries: dedupeCatalogEntries(entries).sort(
      (left, right) =>
        normalizePrefix(right.prefix).length -
        normalizePrefix(left.prefix).length,
    ),
  };
}

export function buildPluginActivationContext(params: {
  sessionId: string;
  entry: PluginActivationMentionCatalogEntry;
  source?: PluginActivationContextSource;
}): PluginActivationContext {
  return {
    sessionId: params.sessionId,
    pluginId: params.entry.pluginId,
    activeAgentAppId: params.entry.activeAgentAppId,
    activeEntryKey: params.entry.activeEntryKey,
    taskKind: params.entry.taskKind,
    workflowKey: params.entry.workflowKey,
    outputArtifactKind: params.entry.outputArtifactKind,
    rightSurface: params.entry.rightSurface,
    expectedObjects: params.entry.expectedObjects,
    selectedSkillKeys: params.entry.selectedSkillKeys,
    selectedObjectRef: params.entry.defaultObjectKind
      ? {
          pluginId: params.entry.pluginId,
          objectKind: params.entry.defaultObjectKind,
          objectId: "pending",
        }
      : undefined,
    openedTabs: params.entry.defaultObjectKind
      ? [params.entry.rightSurface ?? "articleWorkspace"]
      : undefined,
    source: params.source ?? "user",
  };
}

export function parsePluginActivationMention(
  params: ParsePluginActivationMentionParams,
): PluginActivationMentionParseResult | null {
  const trimmedStart = params.text.trimStart();
  if (!trimmedStart.startsWith("@")) {
    return null;
  }
  const normalizedText = normalizePrefix(trimmedStart);
  for (const entry of params.catalog.entries) {
    const normalizedPrefix = normalizePrefix(entry.prefix);
    if (
      !normalizedPrefix ||
      !normalizedText.startsWith(normalizedPrefix) ||
      !isBoundary(normalizedText, normalizedPrefix.length)
    ) {
      continue;
    }
    const trigger = trimmedStart.slice(0, normalizedPrefix.length);
    const match: PluginActivationMentionMatch = {
      rawText: params.text,
      trigger,
      body: trimmedStart.slice(trigger.length).trim(),
      entry,
    };
    if (entry.activationState !== "activatable") {
      return {
        status: "blocked",
        match,
        blockerCodes: entry.blockerCodes.length
          ? entry.blockerCodes
          : ["PLUGIN_ACTIVATION_BLOCKED"],
      };
    }
    return {
      status: "matched",
      match,
      context: buildPluginActivationContext({
        sessionId: params.sessionId,
        entry,
        source: params.source,
      }),
    };
  }
  return null;
}
