import type {
  NormalizedAppManifest,
  PackageIdentity,
} from "@/features/plugin/types";
import type {
  PluginActivationEntryDeclaration,
  PluginArtifactRendererActionDeclaration,
  PluginArtifactRendererDeclaration,
  PluginContract,
  PluginContractProvenance,
  PluginConnectorDeclaration,
  PluginHistoryDefaultSurface,
  PluginHistoryFallback,
  PluginHistoryRestoreDeclaration,
  PluginManifest,
  PluginManifestInstallContract,
  PluginMcpServerDeclaration,
  PluginRendererKind,
  PluginRightSurfaceContract,
  PluginSkillDeclaration,
  PluginSubagentDeclaration,
  PluginUiDeclaration,
  PluginWorkflowDeclaration,
  PluginWorkflowStepDeclaration,
} from "./types";
export { PluginManifestError } from "./pluginContractErrors";
import { PluginManifestError } from "./pluginContractErrors";
import {
  buildPluginManifestFromPluginManifest,
  buildPluginRightSurfaceFromPluginManifest,
} from "./pluginContractPlugin";
import {
  normalizeActivationEntry,
  normalizeCliDeclarations,
  normalizeComponentPaths,
  normalizeContributions,
  normalizeHookDeclarations,
  normalizeManifestInterface,
} from "./pluginContractComponents";
import {
  isRecord,
  readBoolean,
  readRecords,
  readString,
  readStringArray,
  requireString,
  uniqueStrings,
} from "./pluginContractUtils";

export { buildPluginManifestFromPluginManifest } from "./pluginContractPlugin";

interface NormalizePluginManifestOptions {
  provenance?: PluginContractProvenance;
  rightSurface?: PluginRightSurfaceContract;
}

function normalizeManifestName(
  raw: Record<string, unknown>,
): string | undefined {
  return readString(raw.id) ?? readString(raw.name);
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

function normalizePluginUi(
  record: Record<string, unknown>,
): PluginUiDeclaration {
  const uiKind = readString(record.uiKind);
  if (uiKind && !["page", "pane", "webcontents_view"].includes(uiKind)) {
    throw new PluginManifestError(
      `Plugin UI kind is unsupported: ${uiKind}`,
    );
  }

  return {
    id: requireString(record, "id"),
    title: requireString(record, "title"),
    description: readString(record.description),
    uiKind: uiKind as PluginUiDeclaration["uiKind"] | undefined,
    defaultSurfaceKind: readString(record.defaultSurfaceKind),
    entryKey: readString(record.entryKey),
  };
}

function normalizeSubagent(
  record: Record<string, unknown>,
): PluginSubagentDeclaration {
  return {
    id: requireString(record, "id"),
    title: readString(record.title) ?? requireString(record, "id"),
    description: readString(record.description),
    activation: readString(record.activation),
    required: readBoolean(record.required, false),
    skills: readStringArray(record.skills),
  };
}

function normalizeWorkflowStep(
  record: Record<string, unknown>,
): PluginWorkflowStepDeclaration {
  return {
    id: requireString(record, "id"),
    title: readString(record.title),
    subagent: readString(record.subagent),
    skillRefs: readStringArray(record.skillRefs),
    expectedOutput: readString(record.expectedOutput),
  };
}

function normalizeWorkflow(
  record: Record<string, unknown>,
): PluginWorkflowDeclaration {
  const hookPolicyRecord = isRecord(record.hookPolicy)
    ? record.hookPolicy
    : isRecord(record.hook_policy)
      ? record.hook_policy
      : undefined;
  const hookPolicy = hookPolicyRecord
    ? Object.fromEntries(
        Object.entries(hookPolicyRecord).flatMap(([eventName, refs]) => {
          const values = readStringArray(refs);
          return values.length > 0 ? [[eventName, values]] : [];
        }),
      )
    : undefined;
  return {
    key: requireString(record, "key"),
    title: readString(record.title),
    path: readString(record.path),
    taskKind: readString(record.taskKind) ?? readString(record.task_kind),
    triggerIntents: readStringArray(record.triggerIntents),
    outputArtifactKind:
      readString(record.outputArtifactKind) ??
      readString(record.output_artifact_kind),
    cliRefs: readStringArray(record.cliRefs ?? record.cli_refs),
    connectorRefs: readStringArray(
      record.connectorRefs ?? record.connector_refs,
    ),
    ...(hookPolicy && Object.keys(hookPolicy).length > 0 ? { hookPolicy } : {}),
    steps: Array.isArray(record.steps)
      ? readRecords(record.steps, "workflows.steps").map(normalizeWorkflowStep)
      : [],
    humanReview: readBoolean(record.humanReview, false),
    required: readBoolean(record.required, false),
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
    description: readString(record.description),
    kind: kind as PluginConnectorDeclaration["kind"],
    taskKinds: readStringArray(record.taskKinds ?? record.task_kinds),
    path: readString(record.path),
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

function normalizeRendererActionRisk(
  value: unknown,
): PluginArtifactRendererActionDeclaration["risk"] {
  const risk = readString(value) ?? "read";
  if (risk !== "read" && risk !== "write") {
    throw new PluginManifestError(
      `Plugin renderer action risk is unsupported: ${risk}`,
    );
  }
  return risk;
}

function normalizeRendererAction(
  record: Record<string, unknown>,
): PluginArtifactRendererActionDeclaration {
  return {
    key: requireString(record, "key"),
    intent: readString(record.intent),
    risk: normalizeRendererActionRisk(record.risk),
    taskKind: readString(record.taskKind) ?? readString(record.task_kind),
    title: readString(record.title),
  };
}

function normalizeArtifactRenderer(
  record: Record<string, unknown>,
): PluginArtifactRendererDeclaration {
  return {
    artifactType: requireString(record, "artifactType"),
    surfaceKind: requireString(record, "surfaceKind"),
    rendererKind: normalizeRendererKind(record.rendererKind),
    entry: readString(record.entry),
    outputArtifactKind:
      readString(record.outputArtifactKind) ??
      readString(record.output_artifact_kind),
    paneKind: readString(record.paneKind) ?? readString(record.pane_kind),
    actionKeys: readStringArray(record.actionKeys),
    actions: Array.isArray(record.actions)
      ? readRecords(record.actions, "artifactRenderers.actions").map(
          normalizeRendererAction,
        )
      : [],
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

function normalizeInstallContract(
  value: unknown,
): PluginManifestInstallContract | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const install: PluginManifestInstallContract = {};
  if (typeof value.local === "boolean") {
    install.local = value.local;
  }
  if (typeof value.cloud === "boolean") {
    install.cloud = value.cloud;
  }
  const authentication = readString(value.authentication);
  if (authentication) {
    install.authentication = authentication;
  }
  return Object.keys(install).length > 0 ? install : undefined;
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
    defaultActiveTab: renderers.length > 0 ? "articleWorkspace" : undefined,
    supportedTabs: [
      "articleWorkspace",
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
    articleWorkspace: {
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
  const ui = Array.isArray(raw.ui)
    ? readRecords(raw.ui, "ui").map(normalizePluginUi)
    : [];
  const subagents = Array.isArray(raw.subagents)
    ? readRecords(raw.subagents, "subagents").map(normalizeSubagent)
    : [];
  const clis = normalizeCliDeclarations(raw.clis ?? raw.cli);
  const workflows = Array.isArray(raw.workflows)
    ? readRecords(raw.workflows, "workflows").map(normalizeWorkflow)
    : [];
  const connectors = Array.isArray(raw.connectors)
    ? readRecords(raw.connectors, "connectors").map(normalizeConnector)
    : [];
  const hooks = normalizeHookDeclarations(raw.hooks);
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
  const contributions = normalizeContributions(raw.contributions);

  return {
    schemaVersion: 1,
    id,
    packageSchemaVersion: readString(raw.schemaVersion),
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
    ...(contributions ? { contributions } : {}),
    componentPaths,
    skills,
    ui,
    subagents,
    clis,
    workflows,
    connectors,
    hooks,
    mcpServers,
    artifactRenderers,
    activationEntries,
    historyRestore,
    install: normalizeInstallContract(raw.install),
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

export function buildPluginContractFromPluginManifest(params: {
  manifest: NormalizedAppManifest;
  identity?: PackageIdentity;
}): PluginContract {
  const pluginManifest = buildPluginManifestFromPluginManifest(
    params.manifest,
  );
  const rightSurface = buildPluginRightSurfaceFromPluginManifest(
    params.manifest,
  );

  return normalizePluginManifest(pluginManifest, {
    rightSurface,
    provenance: {
      sourceKind: "plugin_manifest",
      sourceId: params.manifest.appId,
      sourceVersion: params.manifest.version,
      packageHash: params.identity?.packageHash,
      manifestHash: params.identity?.manifestHash,
    },
  });
}
