import {
  buildAgentAppRightSurfaceContract,
  type AgentAppRightSurfaceContract,
} from "@/features/agent-app/host";
import type {
  NormalizedAppEntry,
  NormalizedAppManifest,
  PackageIdentity,
  WorkbenchObjectSurfaceDeclaration,
  WorkbenchProductionObjectDeclaration,
} from "@/features/agent-app/types";
import type {
  PluginActivationEntryDeclaration,
  PluginActivationEntryKind,
  PluginAgentAppDeclaration,
  PluginArtifactRendererDeclaration,
  PluginContract,
  PluginContractProvenance,
  PluginConnectorDeclaration,
  PluginHistoryDefaultSurface,
  PluginHistoryFallback,
  PluginHistoryRestoreDeclaration,
  PluginManifest,
  PluginManifestComponentPaths,
  PluginManifestInterface,
  PluginMcpServerDeclaration,
  PluginRendererKind,
  PluginRightSurfaceContract,
  PluginSkillDeclaration,
} from "./types";

export class PluginManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginManifestError";
  }
}

interface NormalizePluginManifestOptions {
  provenance?: PluginContractProvenance;
  rightSurface?: PluginRightSurfaceContract;
}

interface AgentRuntimeIntent {
  key: string;
  title?: string;
  defaultObjectKind?: string;
}

function normalizeManifestName(
  raw: Record<string, unknown>,
): string | undefined {
  return readString(raw.id) ?? readString(raw.name);
}

function normalizeManifestInterface(
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
    websiteUrl: readString(value.websiteURL),
    privacyPolicyUrl: readString(value.privacyPolicyURL),
    termsOfServiceUrl: readString(value.termsOfServiceURL),
    defaultPrompt,
    brandColor: readString(value.brandColor),
    composerIcon: readString(value.composerIcon),
    logo: readString(value.logo),
    logoDark: readString(value.logoDark),
    screenshots,
  };
}

function normalizeComponentPaths(
  raw: Record<string, unknown>,
): PluginManifestComponentPaths {
  const componentPaths = isRecord(raw.componentPaths) ? raw.componentPaths : {};
  const skills =
    readString(componentPaths.skills) ??
    (typeof raw.skills === "string" ? readString(raw.skills) : undefined);
  const hooks =
    readString(componentPaths.hooks) ??
    (typeof raw.hooks === "string" ? readString(raw.hooks) : undefined);
  const apps =
    readString(componentPaths.apps) ??
    (typeof raw.apps === "string" ? readString(raw.apps) : undefined);
  const rawMcpServers = componentPaths.mcpServers ?? raw.mcpServers;
  const mcpServers =
    isRecord(rawMcpServers) || typeof rawMcpServers === "string"
      ? rawMcpServers
      : undefined;
  return {
    ...(skills ? { skills } : {}),
    ...(mcpServers !== undefined ? { mcpServers } : {}),
    ...(apps ? { apps } : {}),
    ...(hooks ? { hooks } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = readString(record[key]);
  if (!value) {
    throw new PluginManifestError(
      `Plugin manifest missing string field: ${key}`,
    );
  }
  return value;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStrings(value.map(readString));
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function readRecords(value: unknown, field: string): Record<string, unknown>[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new PluginManifestError(
      `Plugin manifest field must be an array: ${field}`,
    );
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new PluginManifestError(
        `Plugin manifest ${field}[${index}] must be an object`,
      );
    }
    return item;
  });
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeSkill(
  record: Record<string, unknown>,
): PluginSkillDeclaration {
  return {
    id: requireString(record, "id"),
    title: requireString(record, "title"),
    description: readString(record.description),
    path: readString(record.path),
    required: readBoolean(record.required, false),
  };
}

function normalizeAgentApp(
  record: Record<string, unknown>,
): PluginAgentAppDeclaration {
  const uiKind = readString(record.uiKind);
  if (uiKind && !["page", "pane", "webcontents_view"].includes(uiKind)) {
    throw new PluginManifestError(
      `Plugin agentApp uiKind is unsupported: ${uiKind}`,
    );
  }

  return {
    id: requireString(record, "id"),
    title: requireString(record, "title"),
    description: readString(record.description),
    uiKind: uiKind as PluginAgentAppDeclaration["uiKind"] | undefined,
    defaultSurfaceKind: readString(record.defaultSurfaceKind),
    entryKey: readString(record.entryKey),
  };
}

function normalizeConnector(
  record: Record<string, unknown>,
): PluginConnectorDeclaration {
  const kind = requireString(record, "kind");
  if (!["account", "api", "data_source", "external_app"].includes(kind)) {
    throw new PluginManifestError(
      `Plugin connector kind is unsupported: ${kind}`,
    );
  }
  return {
    id: requireString(record, "id"),
    title: requireString(record, "title"),
    kind: kind as PluginConnectorDeclaration["kind"],
    required: readBoolean(record.required, false),
  };
}

function normalizeMcpServer(
  record: Record<string, unknown>,
): PluginMcpServerDeclaration {
  return {
    id: requireString(record, "id"),
    title: requireString(record, "title"),
    serverKey: readString(record.serverKey),
    required: readBoolean(record.required, false),
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

function normalizeActivationEntry(
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

  return {
    key: requireString(record, "key"),
    title: requireString(record, "title"),
    kind: normalizeActivationKind(record.kind),
    intent: intent as PluginActivationEntryDeclaration["intent"] | undefined,
    defaultObjectKind: readString(record.defaultObjectKind),
  };
}

function normalizeRendererKind(value: unknown): PluginRendererKind {
  const kind = readString(value);
  if (
    !kind ||
    !["host_builtin", "app_declared", "artifact_viewer"].includes(kind)
  ) {
    throw new PluginManifestError(
      `Plugin renderer kind is unsupported: ${kind ?? ""}`,
    );
  }
  return kind as PluginRendererKind;
}

function normalizeArtifactRenderer(
  record: Record<string, unknown>,
): PluginArtifactRendererDeclaration {
  return {
    artifactType: requireString(record, "artifactType"),
    surfaceKind: requireString(record, "surfaceKind"),
    rendererKind: normalizeRendererKind(record.rendererKind),
    entry: readString(record.entry),
    capabilities: readStringArray(record.capabilities),
    fallbackRendererKind: readString(record.fallbackRendererKind),
    defaultPane: readString(record.defaultPane),
  };
}

function normalizeHistoryDefaultSurface(
  value: unknown,
): PluginHistoryDefaultSurface {
  const surface = readString(value);
  if (surface === "primaryArtifact" || surface === "selectedObject") {
    return surface;
  }
  return "chat";
}

function normalizeHistoryFallback(value: unknown): PluginHistoryFallback {
  return readString(value) === "artifactPreview"
    ? "artifactPreview"
    : "chatOnly";
}

function normalizeHistoryRestore(
  value: unknown,
): PluginHistoryRestoreDeclaration {
  const record = isRecord(value) ? value : {};
  return {
    defaultSurface: normalizeHistoryDefaultSurface(record.defaultSurface),
    restoreSelection: readBoolean(record.restoreSelection, false),
    restoreLayout: readBoolean(record.restoreLayout, false),
    fallback: normalizeHistoryFallback(record.fallback),
  };
}

function defaultHistoryRestore(
  renderers: readonly PluginArtifactRendererDeclaration[],
): PluginHistoryRestoreDeclaration {
  return renderers.length > 0
    ? {
        defaultSurface: "selectedObject",
        restoreSelection: true,
        restoreLayout: true,
        fallback: "artifactPreview",
      }
    : {
        defaultSurface: "chat",
        restoreSelection: false,
        restoreLayout: false,
        fallback: "chatOnly",
      };
}

function defaultActivationEntry(params: {
  id: string;
  displayName: string;
  renderers: readonly PluginArtifactRendererDeclaration[];
}): PluginActivationEntryDeclaration {
  return {
    key: params.id,
    title: params.displayName,
    kind: "plugin",
    intent: "manual",
    defaultObjectKind: params.renderers[0]?.artifactType,
  };
}

function dedupeByKey<T extends { key: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.key)) {
      return false;
    }
    seen.add(item.key);
    return true;
  });
}

function buildRightSurfaceContract(params: {
  renderers: readonly PluginArtifactRendererDeclaration[];
  historyRestore: PluginHistoryRestoreDeclaration;
}): PluginRightSurfaceContract {
  const { renderers, historyRestore } = params;
  const panes = renderers.map((renderer) => ({
    kind: renderer.defaultPane ?? renderer.surfaceKind,
    title: renderer.surfaceKind,
    rendererKind: renderer.rendererKind,
  }));
  const primaryRenderer = renderers[0];

  return {
    defaultActiveTab: renderers.length > 0 ? "productProfile" : undefined,
    supportedTabs: [
      "productProfile",
      "file",
      "evidence",
      "terminal",
      "browser",
      "sideChat",
    ],
    historyRestore: {
      enabled: historyRestore.defaultSurface !== "chat",
      restoreSelection: historyRestore.restoreSelection,
      restoreLayout: historyRestore.restoreLayout,
    },
    productWorkspace: {
      enabled: renderers.length > 0,
      primaryObjectKind: primaryRenderer?.artifactType,
      selectionPolicy: historyRestore.restoreSelection ? "last" : "primary",
    },
    panes,
  };
}

function normalizePluginManifestInput(input: unknown): PluginManifest {
  if (!isRecord(input)) {
    throw new PluginManifestError("Plugin manifest must be an object");
  }
  return input as unknown as PluginManifest;
}

export function normalizePluginManifest(
  input: unknown,
  options: NormalizePluginManifestOptions = {},
): PluginContract {
  const manifest = normalizePluginManifestInput(input);
  const raw = manifest as unknown as Record<string, unknown>;
  const id = normalizeManifestName(raw);
  if (!id) {
    throw new PluginManifestError(
      "Plugin manifest missing string field: id or name",
    );
  }
  const interfaceContract = normalizeManifestInterface(raw.interface);
  const displayName =
    interfaceContract?.displayName ??
    readString(raw.displayName) ??
    readString(raw.name) ??
    id;
  const version = requireString(raw, "version");
  const skills = Array.isArray(raw.skills)
    ? readRecords(raw.skills, "skills").map(normalizeSkill)
    : [];
  const agentApps = Array.isArray(raw.agentApps)
    ? readRecords(raw.agentApps, "agentApps").map(normalizeAgentApp)
    : [];
  const connectors = Array.isArray(raw.connectors)
    ? readRecords(raw.connectors, "connectors").map(normalizeConnector)
    : [];
  const mcpServers = Array.isArray(raw.mcpServers)
    ? readRecords(raw.mcpServers, "mcpServers").map(normalizeMcpServer)
    : [];
  const artifactRenderers = Array.isArray(raw.artifactRenderers)
    ? readRecords(raw.artifactRenderers, "artifactRenderers").map(
        normalizeArtifactRenderer,
      )
    : [];
  const declaredActivationEntries = Array.isArray(raw.activationEntries)
    ? readRecords(raw.activationEntries, "activationEntries").map(
        normalizeActivationEntry,
      )
    : [];
  const activationEntries = dedupeByKey(
    declaredActivationEntries.length
      ? declaredActivationEntries
      : [
          defaultActivationEntry({
            id,
            displayName,
            renderers: artifactRenderers,
          }),
        ],
  );
  const historyRestore =
    raw.historyRestore === undefined
      ? defaultHistoryRestore(artifactRenderers)
      : normalizeHistoryRestore(raw.historyRestore);
  const componentPaths = normalizeComponentPaths(raw);

  return {
    schemaVersion: 1,
    id,
    name: readString(raw.name) ?? undefined,
    displayName,
    version,
    description:
      readString(raw.description) ??
      interfaceContract?.longDescription ??
      interfaceContract?.shortDescription ??
      "",
    keywords: readStringArray(raw.keywords),
    categories: uniqueStrings([
      ...readStringArray(raw.categories),
      interfaceContract?.category,
    ]),
    capabilities: uniqueStrings([
      ...readStringArray(raw.capabilities),
      ...(interfaceContract?.capabilities ?? []),
    ]),
    ...(interfaceContract ? { interface: interfaceContract } : {}),
    componentPaths,
    skills,
    agentApps,
    connectors,
    mcpServers,
    artifactRenderers,
    activationEntries,
    historyRestore,
    rightSurface:
      options.rightSurface ??
      buildRightSurfaceContract({
        renderers: artifactRenderers,
        historyRestore,
      }),
    provenance: options.provenance ?? {
      sourceKind: "plugin_manifest",
      sourceId: id,
      sourceVersion: version,
    },
  };
}

function primaryObjectKind(
  manifest: NormalizedAppManifest,
): string | undefined {
  return (
    manifest.workbench?.productionObjects?.find((object) => object.primary)
      ?.kind ?? manifest.workbench?.productWorkspace?.primaryObjectKinds?.[0]
  );
}

function activationKindForEntry(
  entry: NormalizedAppEntry,
): PluginActivationEntryKind {
  return entry.kind === "page" || entry.kind === "panel"
    ? "agentApp"
    : "plugin";
}

function mapWorkbenchRendererKind(
  surface: WorkbenchObjectSurfaceDeclaration,
): PluginRendererKind {
  if (
    surface.renderer === "app_surface" ||
    surface.renderer === "app_declared"
  ) {
    return "app_declared";
  }
  if (surface.renderer === "artifact_viewer") {
    return "artifact_viewer";
  }
  return "host_builtin";
}

function productionObjectByKind(
  manifest: NormalizedAppManifest,
): Map<string, WorkbenchProductionObjectDeclaration> {
  return new Map(
    (manifest.workbench?.productionObjects ?? []).map((object) => [
      object.kind,
      object,
    ]),
  );
}

function artifactRenderersFromAgentApp(
  manifest: NormalizedAppManifest,
): PluginArtifactRendererDeclaration[] {
  const objects = productionObjectByKind(manifest);
  return (manifest.workbench?.objectSurfaces ?? []).map((surface) => {
    const object = objects.get(surface.objectKind);
    return {
      artifactType: object?.artifactKind ?? surface.objectKind,
      surfaceKind: surface.surfaceKind,
      rendererKind: mapWorkbenchRendererKind(surface),
      defaultPane: surface.surfaceKind,
    };
  });
}

function readAgentRuntimeIntents(agentRuntime: unknown): AgentRuntimeIntent[] {
  const intents = isRecord(agentRuntime) ? agentRuntime.intents : undefined;
  if (!Array.isArray(intents)) {
    return [];
  }
  return intents.flatMap((intent) => {
    if (!isRecord(intent)) {
      return [];
    }
    const key = readString(intent.key);
    if (!key) {
      return [];
    }
    const expectedObjects = Array.isArray(intent.expectedObjects)
      ? intent.expectedObjects.map(readString)
      : [];
    return [
      {
        key,
        title: readString(intent.title),
        defaultObjectKind: expectedObjects.find(Boolean),
      },
    ];
  });
}

function activationEntriesFromAgentApp(
  manifest: NormalizedAppManifest,
): PluginActivationEntryDeclaration[] {
  const defaultObjectKind = primaryObjectKind(manifest);
  const entries = manifest.entries.map((entry) => ({
    key: entry.key,
    title: entry.title,
    kind: activationKindForEntry(entry),
    intent: "manual" as const,
    defaultObjectKind,
  }));
  const intents = readAgentRuntimeIntents(manifest.agentRuntime).map(
    (intent) => ({
      key: intent.key,
      title: intent.title ?? manifest.displayName,
      kind: "plugin" as const,
      intent: "at_command" as const,
      defaultObjectKind: intent.defaultObjectKind ?? defaultObjectKind,
    }),
  );
  return dedupeByKey([...entries, ...intents]);
}

function historyRestoreFromAgentApp(
  manifest: NormalizedAppManifest,
): PluginHistoryRestoreDeclaration | undefined {
  const restore = manifest.workbench?.historyRestore;
  if (!restore) {
    return undefined;
  }
  const defaultSurface =
    restore.defaultSurface === "selectedObject" ||
    restore.defaultSurface === "primaryObject"
      ? "selectedObject"
      : restore.defaultSurface === "primaryArtifact"
        ? "primaryArtifact"
        : "chat";

  return {
    defaultSurface,
    restoreSelection: restore.restoreSelection !== false,
    restoreLayout: restore.restoreLayout !== false,
    fallback:
      restore.fallback === "artifactPreview" ? "artifactPreview" : "chatOnly",
  };
}

function pluginAgentAppDeclarationFromAgentApp(
  manifest: NormalizedAppManifest,
): PluginAgentAppDeclaration {
  return {
    id: manifest.appId,
    title: manifest.displayName,
    description: manifest.description,
    uiKind: manifest.runtimePackage.ui ? "page" : "pane",
    defaultSurfaceKind: primaryObjectKind(manifest),
    entryKey: manifest.entries[0]?.key,
  };
}

function convertAgentRightSurface(
  contract: AgentAppRightSurfaceContract,
): PluginRightSurfaceContract {
  return {
    defaultActiveTab: contract.defaultActiveTab ?? undefined,
    supportedTabs: contract.supportedTabs,
    historyRestore: {
      enabled: contract.historyRestore.enabled,
      restoreSelection: contract.historyRestore.restoreSelection,
      restoreLayout: contract.historyRestore.restoreLayout,
    },
    productWorkspace: {
      enabled: contract.productProfile.enabled,
      primaryObjectKind:
        contract.productProfile.objects.find((object) => object.primary)
          ?.kind ?? contract.productProfile.objects[0]?.kind,
      selectionPolicy: contract.historyRestore.restoreSelection
        ? "last"
        : "primary",
    },
    panes: contract.productProfile.panes.map((pane) => ({
      kind: pane,
      title: pane,
      rendererKind: contract.productProfile.rendererKinds.includes(
        "app_declared",
      )
        ? "app_declared"
        : "host_builtin",
    })),
  };
}

export function buildPluginManifestFromAgentAppManifest(
  manifest: NormalizedAppManifest,
): PluginManifest {
  const categories = uniqueStrings([
    manifest.presentation?.category,
    manifest.appType,
  ]);

  return {
    id: manifest.appId,
    displayName: manifest.displayName,
    version: manifest.version,
    description: manifest.description,
    categories,
    capabilities: Object.keys(manifest.requires.capabilities).sort(),
    skills: manifest.skillRefs.map((skill) => ({
      id: skill.id,
      title: skill.id,
      required: skill.required ?? false,
    })),
    agentApps: [pluginAgentAppDeclarationFromAgentApp(manifest)],
    artifactRenderers: artifactRenderersFromAgentApp(manifest),
    activationEntries: activationEntriesFromAgentApp(manifest),
    historyRestore: historyRestoreFromAgentApp(manifest),
  };
}

export function buildPluginContractFromAgentAppManifest(params: {
  manifest: NormalizedAppManifest;
  identity?: PackageIdentity;
}): PluginContract {
  const pluginManifest = buildPluginManifestFromAgentAppManifest(
    params.manifest,
  );
  const rightSurface = convertAgentRightSurface(
    buildAgentAppRightSurfaceContract(params.manifest),
  );

  return normalizePluginManifest(pluginManifest, {
    rightSurface,
    provenance: {
      sourceKind: "agent_app_manifest",
      sourceId: params.manifest.appId,
      sourceVersion: params.manifest.version,
      packageHash: params.identity?.packageHash,
      manifestHash: params.identity?.manifestHash,
    },
  });
}
