import {
  buildPluginRightSurfaceContract,
  type PluginRightSurfaceContract,
} from "@/features/plugin/host";
import type {
  NormalizedAppEntry,
  NormalizedAppManifest,
  WorkbenchObjectSurfaceDeclaration,
  WorkbenchProductionObjectDeclaration,
} from "@/features/plugin/types";
import {
  normalizeActivationEntry,
  normalizeCliDeclaration,
  normalizeHookDeclarations,
  normalizeManifestInterface,
} from "./pluginContractComponents";
import {
  isRecord,
  readRecords,
  readString,
  readStringArray,
  uniqueStrings,
} from "./pluginContractUtils";
import type {
  PluginActivationEntryDeclaration,
  PluginActivationEntryKind,
  PluginArtifactRendererDeclaration,
  PluginCliDeclaration,
  PluginConnectorDeclaration,
  PluginHistoryRestoreDeclaration,
  PluginHookDeclaration,
  PluginManifest,
  PluginRendererKind,
  PluginRightSurfaceContract,
  PluginUiDeclaration,
} from "./types";

interface AgentRuntimeIntent {
  key: string;
  title?: string;
  aliases: string[];
  taskKind?: string;
  workflowKey?: string;
  outputArtifactKind?: string;
  rightSurface?: string;
  expectedObjects?: string[];
  defaultObjectKind?: string;
}

function primaryObjectKind(
  manifest: NormalizedAppManifest,
): string | undefined {
  return (
    manifest.workbench?.productionObjects?.find((object) => object.primary)
      ?.kind ?? manifest.workbench?.articleWorkspace?.primaryObjectKinds?.[0]
  );
}

function activationKindForEntry(
  entry: NormalizedAppEntry,
): PluginActivationEntryKind {
  return entry.kind === "page" ||
    entry.kind === "panel" ||
    entry.kind === "workflow" ||
    entry.kind === "command" ||
    entry.kind === "expert-chat"
    ? "pluginUi"
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

function readPluginWorkerOutputArtifactKind(
  manifest: NormalizedAppManifest,
): string | undefined {
  const runtimeWorker = isRecord(manifest.agentRuntime)
    ? isRecord(manifest.agentRuntime.worker)
      ? manifest.agentRuntime.worker
      : undefined
    : undefined;
  return (
    readString(manifest.runtimePackage.worker?.outputArtifactKind) ??
    readString(runtimeWorker?.outputArtifactKind) ??
    readString(runtimeWorker?.output_artifact_kind)
  );
}

function connectorKindFromToolProvider(
  provider: string | undefined,
): PluginConnectorDeclaration["kind"] | undefined {
  if (!provider?.startsWith("connector:")) {
    return undefined;
  }
  const kind = provider.slice("connector:".length);
  if (["account", "api", "data_source", "external_app"].includes(kind)) {
    return kind as PluginConnectorDeclaration["kind"];
  }
  return "api";
}

function connectorsFromPluginToolRefs(
  manifest: NormalizedAppManifest,
): PluginConnectorDeclaration[] {
  return (manifest.toolRefs ?? []).flatMap((tool) => {
    const kind = connectorKindFromToolProvider(tool.provider);
    if (!kind) {
      return [];
    }
    return [
      {
        id: tool.key,
        title: tool.title ?? tool.key,
        description: tool.description,
        kind,
        required: tool.required ?? false,
      },
    ];
  });
}

function clisFromPlugin(
  manifest: NormalizedAppManifest,
): PluginCliDeclaration[] {
  const runtimePackage = manifest.runtimePackage as unknown as Record<
    string,
    unknown
  >;
  const runtimeCli = isRecord(runtimePackage.cli)
    ? runtimePackage.cli
    : undefined;
  const agentRuntime = isRecord(manifest.agentRuntime)
    ? manifest.agentRuntime
    : undefined;
  const agentRuntimeCli = isRecord(agentRuntime?.cli)
    ? agentRuntime.cli
    : undefined;
  return [
    ...(runtimeCli ? [normalizeCliDeclaration(runtimeCli, "runtime-cli")] : []),
    ...(agentRuntimeCli
      ? [normalizeCliDeclaration(agentRuntimeCli, "agent-runtime-cli")]
      : []),
  ];
}

function hooksFromPlugin(
  manifest: NormalizedAppManifest,
): PluginHookDeclaration[] {
  const runtimePackage = manifest.runtimePackage as unknown as Record<
    string,
    unknown
  >;
  const runtimeHooks = isRecord(runtimePackage.hooks)
    ? runtimePackage.hooks
    : undefined;
  const agentRuntime = isRecord(manifest.agentRuntime)
    ? manifest.agentRuntime
    : undefined;
  const agentRuntimeHooks = isRecord(agentRuntime?.hooks)
    ? agentRuntime.hooks
    : undefined;
  return [
    ...normalizeHookDeclarations(runtimeHooks),
    ...normalizeHookDeclarations(agentRuntimeHooks),
  ];
}

function artifactRenderersFromPlugin(
  manifest: NormalizedAppManifest,
): PluginArtifactRendererDeclaration[] {
  const objects = productionObjectByKind(manifest);
  const outputArtifactKind = readPluginWorkerOutputArtifactKind(manifest);
  return (manifest.workbench?.objectSurfaces ?? []).map((surface) => {
    const object = objects.get(surface.objectKind);
    return {
      artifactType: object?.artifactKind ?? surface.objectKind,
      surfaceKind: surface.surfaceKind,
      rendererKind: mapWorkbenchRendererKind(surface),
      outputArtifactKind,
      paneKind: surface.surfaceKind,
      defaultPane: surface.surfaceKind,
    };
  });
}

function readAgentRuntimeIntents(agentRuntime: unknown): AgentRuntimeIntent[] {
  const runtime = isRecord(agentRuntime) ? agentRuntime : undefined;
  const intents = Array.isArray(runtime?.intents) ? runtime.intents : [];
  const activationEntries = Array.isArray(runtime?.activationEntries)
    ? runtime.activationEntries
    : [];
  const records = [...activationEntries, ...intents];
  if (records.length === 0) {
    return [];
  }
  return records.flatMap((intent) => {
    if (!isRecord(intent)) {
      return [];
    }
    const key = readString(intent.key);
    if (!key) {
      return [];
    }
    const expectedObjects = Array.isArray(intent.expectedObjects)
      ? intent.expectedObjects.map(readString)
      : Array.isArray(intent.expected_objects)
        ? intent.expected_objects.map(readString)
        : [];
    return [
      {
        key,
        title: readString(intent.title),
        aliases: readStringArray(intent.aliases),
        taskKind: readString(intent.taskKind) ?? readString(intent.task_kind),
        workflowKey:
          readString(intent.workflowKey) ??
          readString(intent.workflow_key) ??
          readString(intent.workflow),
        outputArtifactKind:
          readString(intent.outputArtifactKind) ??
          readString(intent.output_artifact_kind),
        rightSurface:
          readString(intent.rightSurface) ?? readString(intent.right_surface),
        expectedObjects: uniqueStrings(expectedObjects),
        defaultObjectKind: expectedObjects.find(Boolean),
      },
    ];
  });
}

function hasDefinedValue(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : value !== undefined;
}

function mergeByKey<T extends { key: string }>(items: T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of items) {
    const existing = merged.get(item.key);
    if (!existing) {
      merged.set(item.key, item);
      continue;
    }
    merged.set(item.key, {
      ...existing,
      ...Object.fromEntries(
        Object.entries(item).filter(([, value]) => hasDefinedValue(value)),
      ),
    } as T);
  }
  return Array.from(merged.values());
}

function activationEntriesFromPlugin(
  manifest: NormalizedAppManifest,
): PluginActivationEntryDeclaration[] {
  const defaultObjectKind = primaryObjectKind(manifest);
  const declared = Array.isArray(manifest.activationEntries)
    ? readRecords(manifest.activationEntries, "activationEntries").map(
        normalizeActivationEntry,
      )
    : [];
  const entries = manifest.entries.map((entry) => ({
    key: entry.key,
    title: entry.title,
    kind: activationKindForEntry(entry),
    intent: "manual" as const,
    workflowKey: entry.workflow,
    defaultObjectKind,
  }));
  const intents = readAgentRuntimeIntents(manifest.agentRuntime).map(
    (intent) => ({
      key: intent.key,
      title: intent.title ?? manifest.displayName,
      aliases: intent.aliases,
      kind: "plugin" as const,
      intent: "at_command" as const,
      taskKind: intent.taskKind,
      workflowKey: intent.workflowKey,
      outputArtifactKind: intent.outputArtifactKind,
      rightSurface: intent.rightSurface,
      expectedObjects: intent.expectedObjects,
      defaultObjectKind: intent.defaultObjectKind ?? defaultObjectKind,
    }),
  );
  return mergeByKey([...declared, ...entries, ...intents]).map((entry) =>
    enrichPluginActivationWorkflowKey(manifest, entry),
  );
}

function enrichPluginActivationWorkflowKey(
  manifest: NormalizedAppManifest,
  entry: PluginActivationEntryDeclaration,
): PluginActivationEntryDeclaration {
  if (entry.workflowKey) {
    return entry;
  }
  const workflowKey = resolvePluginActivationWorkflowKey(manifest, entry);
  return workflowKey ? { ...entry, workflowKey } : entry;
}

function resolvePluginActivationWorkflowKey(
  manifest: NormalizedAppManifest,
  entry: PluginActivationEntryDeclaration,
): string | undefined {
  return (
    manifest.workflows?.find((workflow) =>
      workflow.triggerIntents?.includes(entry.key),
    )?.key ??
    (entry.taskKind
      ? manifest.workflows?.find(
          (workflow) => workflow.taskKind === entry.taskKind,
        )?.key
      : undefined)
  );
}

function historyRestoreFromPlugin(
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

function pluginUiDeclarationFromPlugin(
  manifest: NormalizedAppManifest,
): PluginUiDeclaration {
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
  contract: PluginRightSurfaceContract,
): PluginRightSurfaceContract {
  return {
    defaultActiveTab: contract.defaultActiveTab ?? undefined,
    supportedTabs: contract.supportedTabs,
    historyRestore: {
      enabled: contract.historyRestore.enabled,
      restoreSelection: contract.historyRestore.restoreSelection,
      restoreLayout: contract.historyRestore.restoreLayout,
    },
    articleWorkspace: {
      enabled: contract.articleWorkspace.enabled,
      primaryObjectKind:
        contract.articleWorkspace.objects.find((object) => object.primary)
          ?.kind ?? contract.articleWorkspace.objects[0]?.kind,
      selectionPolicy: contract.historyRestore.restoreSelection
        ? "last"
        : "primary",
    },
    panes: contract.articleWorkspace.panes.map((pane) => ({
      kind: pane,
      title: pane,
      rendererKind: contract.articleWorkspace.rendererKinds.includes(
        "app_declared",
      )
        ? "app_declared"
        : "host_builtin",
    })),
  };
}

export function buildPluginRightSurfaceFromPluginManifest(
  manifest: NormalizedAppManifest,
): PluginRightSurfaceContract {
  return convertAgentRightSurface(buildPluginRightSurfaceContract(manifest));
}

export function buildPluginManifestFromPluginManifest(
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
    interface: normalizeManifestInterface(manifest.interface),
    skills: (manifest.skillRefs ?? []).map((skill) => ({
      id: skill.id,
      title: skill.title ?? skill.id,
      description: skill.description,
      path: skill.path,
      required: skill.required ?? false,
    })),
    ui: [pluginUiDeclarationFromPlugin(manifest)],
    subagents: (manifest.subagents ?? []).map((subagent) => ({
      id: subagent.id,
      title: subagent.title ?? subagent.id,
      description: subagent.description,
      activation: subagent.activation,
      required: subagent.required ?? false,
      skills: subagent.skills ?? [],
    })),
    workflows: (manifest.workflows ?? []).map((workflow) => {
      const workflowRecord = workflow as unknown as Record<string, unknown>;
      return {
        key: workflow.key,
        title: workflow.title,
        path: workflow.path,
        taskKind: workflow.taskKind,
        triggerIntents: workflow.triggerIntents,
        outputArtifactKind: workflow.outputArtifactKind,
        cliRefs: readStringArray(
          workflowRecord.cliRefs ?? workflowRecord.cli_refs,
        ),
        connectorRefs: readStringArray(
          workflowRecord.connectorRefs ?? workflowRecord.connector_refs,
        ),
        hookPolicy: normalizePluginWorkflowHookPolicy(workflow),
        steps: Array.isArray(workflow.steps)
          ? workflow.steps.flatMap((step) => {
              if (!isRecord(step)) {
                return [];
              }
              const id = readString(step.id);
              if (!id) {
                return [];
              }
              return [
                {
                  id,
                  title: readString(step.title),
                  subagent: readString(step.subagent),
                  skillRefs: readStringArray(step.skillRefs),
                  expectedOutput: readString(step.expectedOutput),
                },
              ];
            })
          : [],
        humanReview: workflow.humanReview ?? false,
        required: workflow.required ?? false,
      };
    }),
    connectors: connectorsFromPluginToolRefs(manifest),
    clis: clisFromPlugin(manifest),
    hooks: hooksFromPlugin(manifest),
    artifactRenderers: artifactRenderersFromPlugin(manifest),
    activationEntries: activationEntriesFromPlugin(manifest),
    historyRestore: historyRestoreFromPlugin(manifest),
    componentPaths: manifest.componentPaths,
  };
}

function normalizePluginWorkflowHookPolicy(
  workflowValue: unknown,
): Record<string, string[]> | undefined {
  const workflow = isRecord(workflowValue) ? workflowValue : {};
  const policy = isRecord(workflow.hookPolicy)
    ? workflow.hookPolicy
    : isRecord(workflow.hook_policy)
      ? workflow.hook_policy
      : undefined;
  if (!policy) {
    return undefined;
  }
  const normalized = Object.fromEntries(
    Object.entries(policy).flatMap(([eventName, refs]) => {
      const values = readStringArray(refs);
      return values.length > 0 ? [[eventName, values]] : [];
    }),
  );
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}
