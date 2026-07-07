import type {
  InstalledPluginState,
  PluginRuntimeCapabilities,
} from "@/features/plugin/types";
import {
  buildPluginActivationMentionCatalog,
  parsePluginActivationMention,
  projectPluginRegistryFromInstalledPlugins,
  type PluginActivationContext,
  type PluginActivationContextSource,
  type PluginActivationMentionParseResult,
  type PluginContract,
  type PluginObjectRef,
  type PluginRegistryItem,
} from "@/features/plugin";
import type { HandleSendOptions } from "../hooks/handleSendTypes";
import { asRecord } from "./commands/skillSlotUtils";
import {
  buildPluginIntentSystemPrompt,
  resolveWorkspacePluginIntent,
  type WorkspacePluginIntentMatch,
  type WorkspacePluginIntentSource,
} from "./workspacePluginIntentRouting";
import {
  buildWorkspacePluginRuntimeReadiness,
  type WorkspacePluginRuntimeReadiness,
} from "./workspacePluginRuntimeReadiness";

export interface WorkspacePluginActivationResolution {
  status: "matched" | "blocked";
  trigger: string;
  body: string;
  context?: PluginActivationContext;
  intentMatch?: WorkspacePluginIntentMatch;
  runtimeReadiness?: WorkspacePluginRuntimeReadiness;
  runtimeCapabilities?: PluginRuntimeCapabilities;
  blockerCodes?: string[];
}

export interface WorkspacePluginActivationRequestMetadata {
  source: string;
  trigger: string;
  body: string;
  context: PluginActivationContext;
}

interface WorkspacePluginActivationParseResolution {
  parseResult: PluginActivationMentionParseResult;
  intentSources: readonly WorkspacePluginIntentSource[];
  installedPlugins: readonly InstalledPluginState[];
  contracts: readonly PluginContract[];
}

function canActivateLocalPluginChatTurnWithReadinessBlockers(
  state: InstalledPluginState | undefined,
): boolean {
  if (!state || state.disabled === true) {
    return false;
  }
  const sourceKind = state.identity?.sourceKind;
  if (sourceKind !== "local_folder" && sourceKind !== "local_archive") {
    return false;
  }
  const blockers = state.readiness?.blockers ?? [];
  return (
    state.readiness?.status === "blocked" &&
    blockers.length > 0 &&
    blockers.every((issue) => issue.code === "CAPABILITY_MISSING")
  );
}

function chatActivationRegistryItems(params: {
  registry: readonly PluginRegistryItem[];
  installedPlugins: readonly InstalledPluginState[];
}): PluginRegistryItem[] {
  return params.registry.map((item) => {
    const state = params.installedPlugins.find(
      (candidate) => candidate.appId === item.pluginId,
    );
    if (!canActivateLocalPluginChatTurnWithReadinessBlockers(state)) {
      return item;
    }
    return {
      ...item,
      activationState: "activatable",
      capabilityStates: item.capabilityStates.includes("activatable")
        ? item.capabilityStates
        : [...item.capabilityStates, "activatable"],
    };
  });
}

function resolvePluginActivationParseResult(params: {
  text: string;
  sessionId: string;
  installedPlugins: readonly InstalledPluginState[];
}): WorkspacePluginActivationParseResolution | null {
  const projection = projectPluginRegistryFromInstalledPlugins(
    params.installedPlugins,
  );
  const contracts = projection.contracts;
  if (contracts.length > 0) {
    const parseResult = parsePluginActivationMention({
      text: params.text,
      catalog: buildPluginActivationMentionCatalog({
        contracts,
        registryItems: chatActivationRegistryItems({
          registry: projection.registry,
          installedPlugins: params.installedPlugins,
        }),
      }),
      sessionId: params.sessionId,
      source: "user",
    });
    if (parseResult) {
      return {
        parseResult,
        intentSources: params.installedPlugins,
        installedPlugins: params.installedPlugins,
        contracts,
      };
    }
  }
  return null;
}

export function resolveWorkspacePluginActivation(params: {
  text: string;
  sessionId?: string | null;
  installedPlugins: readonly InstalledPluginState[];
}): WorkspacePluginActivationResolution | null {
  const sessionId = params.sessionId?.trim();
  if (!sessionId) {
    return null;
  }
  const parseResolution = resolvePluginActivationParseResult({
    text: params.text,
    sessionId,
    installedPlugins: params.installedPlugins,
  });
  if (!parseResolution) {
    return null;
  }
  const { parseResult } = parseResolution;
  const base = {
    trigger: parseResult.match.trigger,
    body: parseResult.match.body,
  };
  if (parseResult.status === "blocked") {
    return {
      status: "blocked",
      ...base,
      blockerCodes: parseResult.blockerCodes,
    };
  }
  const activePluginUiId =
    parseResult.context.activePluginUiId ?? parseResult.context.pluginId;
  const activeSources = parseResolution.intentSources.filter(
    (source) => source.appId === activePluginUiId,
  );
  const intentMatch =
    resolveWorkspacePluginIntentFromActivationContext(
      parseResult.context,
      activeSources,
    ) ??
    resolveWorkspacePluginIntent(parseResult.match.body, activeSources) ??
    resolveWorkspacePluginIntent(params.text, activeSources) ??
    undefined;
  const contract = parseResolution.contracts.find(
    (candidate) => candidate.id === parseResult.context.pluginId,
  );
  const installedPlugin = parseResolution.installedPlugins.find(
    (source) => source.appId === activePluginUiId,
  );
  const runtimeReadiness = contract
    ? buildWorkspacePluginRuntimeReadiness({
        contract,
        installedPlugin,
        activePluginUiId: parseResult.context.activePluginUiId,
        workflowKey:
          parseResult.context.workflowKey ?? intentMatch?.workflowKey,
        taskKind: parseResult.context.taskKind ?? intentMatch?.taskKind,
        intentKey: intentMatch?.intentKey,
      })
    : undefined;
  return {
    status: "matched",
    ...base,
    context: parseResult.context,
    intentMatch,
    runtimeReadiness,
    runtimeCapabilities: pluginRuntimeCapabilities(installedPlugin),
  };
}

function resolveWorkspacePluginIntentFromActivationContext(
  context: PluginActivationContext,
  sources: readonly WorkspacePluginIntentSource[],
): WorkspacePluginIntentMatch | null {
  const activeEntryKey = context.activeEntryKey?.trim();
  if (!activeEntryKey) {
    return null;
  }
  const match = resolveWorkspacePluginIntent(activeEntryKey, sources);
  if (!match) {
    return null;
  }
  return {
    ...match,
    taskKind: context.taskKind ?? match.taskKind,
    workflowKey: context.workflowKey ?? match.workflowKey,
    outputArtifactKind: context.outputArtifactKind ?? match.outputArtifactKind,
    rightSurface: context.rightSurface ?? match.rightSurface,
    expectedObjects: context.expectedObjects?.length
      ? context.expectedObjects
      : match.expectedObjects,
  };
}

function pluginActivationMetadata(
  resolution: WorkspacePluginActivationResolution,
) {
  if (resolution.status !== "matched" || !resolution.context) {
    return {};
  }
  const { context } = resolution;
  const intent = resolution.intentMatch;
  const manifest = intent?.manifest;
  const workflow = resolveActivationWorkflow(
    manifest,
    intent?.intentKey,
    intent?.taskKind,
    intent?.workflowKey,
  );
  const subagents = resolveActivationSubagents(manifest, intent?.taskKind);
  const skillRefs = resolveActivationSkillRefs(manifest, intent?.taskKind);
  const workflowRecord = asRecord(workflow);
  const runtimeRecord = asRecord(manifest?.agentRuntime);
  const runtimeCapabilities = resolution.runtimeCapabilities;
  return {
    plugin_activation: {
      source: "plugin_explicit_mention",
      trigger: resolution.trigger,
      body: resolution.body,
      session_id: context.sessionId,
      plugin_id: context.pluginId,
      active_plugin_ui_id: context.activePluginUiId,
      active_entry_key: context.activeEntryKey,
      entry_task_kind: context.taskKind,
      entry_workflow_key: context.workflowKey,
      entry_output_artifact_kind: context.outputArtifactKind,
      entry_right_surface: context.rightSurface,
      entry_expected_objects: context.expectedObjects,
      selected_skill_keys: context.selectedSkillKeys,
      selected_object_ref: context.selectedObjectRef
        ? {
            plugin_id: context.selectedObjectRef.pluginId,
            object_kind: context.selectedObjectRef.objectKind,
            object_id: context.selectedObjectRef.objectId,
            version: context.selectedObjectRef.version,
            artifact_ids: context.selectedObjectRef.artifactIds,
            source_turn_id: context.selectedObjectRef.sourceTurnId,
            source_task_id: context.selectedObjectRef.sourceTaskId,
          }
        : undefined,
      opened_tabs: context.openedTabs,
      pinned_tabs: context.pinnedTabs,
      context_source: context.source,
      intent_key: intent?.intentKey,
      task_kind: intent?.taskKind,
      intent_workflow_key: intent?.workflowKey,
      output_artifact_kind: intent?.outputArtifactKind,
      right_surface: intent?.rightSurface,
      expected_objects: intent?.expectedObjects,
      matched_phrase: intent?.matchedPhrase,
      workflow_key: workflow?.key,
      workflow_contract: buildActivationWorkflowContract({
        workflow,
        intent,
        expectedObjects: context.expectedObjects,
      }),
      workflow,
      subagents,
      skill_refs: skillRefs,
      cli_refs: readStringArray(workflowRecord ?? {}, ["cliRefs", "cli_refs"]),
      connector_refs: readStringArray(workflowRecord ?? {}, [
        "connectorRefs",
        "connector_refs",
      ]),
      hook_policy:
        asRecord(workflowRecord?.hookPolicy) ??
        asRecord(workflowRecord?.hook_policy),
      runtime_readiness: contextRuntimeReadiness(resolution.runtimeReadiness),
      runtime_capabilities: runtimeCapabilities,
      runtime_registries: buildActivationRuntimeRegistries(runtimeRecord),
      default_prompts: readInterfaceDefaultPrompts(manifest?.interface),
    },
    ...(runtimeCapabilities
      ? {
          plugin_runtime_capabilities: runtimeCapabilities,
        }
      : {}),
    ...(resolution.runtimeReadiness
      ? {
          plugin_runtime_readiness: contextRuntimeReadiness(
            resolution.runtimeReadiness,
          ),
        }
      : {}),
    ...(intent
      ? {
          plugin_activation_intent: {
            source: intent.source,
            app_id: intent.appId,
            app_name: intent.appName,
            intent_key: intent.intentKey,
            task_kind: intent.taskKind,
            workflow_key: intent.workflowKey,
            output_artifact_kind: intent.outputArtifactKind,
            right_surface: intent.rightSurface,
            expected_objects: intent.expectedObjects,
            matched_phrase: intent.matchedPhrase,
          },
        }
      : {}),
  };
}

function pluginRuntimeCapabilities(
  state: InstalledPluginState | undefined,
): PluginRuntimeCapabilities | undefined {
  return (
    state?.projection?.runtimeCapabilities ??
    state?.manifest.runtimeCapabilities
  );
}

function contextRuntimeReadiness(
  readiness: WorkspacePluginRuntimeReadiness | undefined,
) {
  if (!readiness) {
    return undefined;
  }
  return {
    source: readiness.source,
    plugin_id: readiness.pluginId,
    active_plugin_ui_id: readiness.activePluginUiId,
    workflow_key: readiness.workflowKey,
    task_kind: readiness.taskKind,
    status: readiness.status,
    checked_at: readiness.checkedAt,
    connector_refs: readiness.connectorRefs,
    hook_refs: readiness.hookRefs,
    cli_refs: readiness.cliRefs,
    connectors: readiness.connectors.map(runtimeReadinessItemRecord),
    hooks: readiness.hooks.map(runtimeReadinessItemRecord),
    clis: readiness.clis.map(runtimeReadinessItemRecord),
    blocker_codes: readiness.blockerCodes,
    warning_codes: readiness.warningCodes,
  };
}

function runtimeReadinessItemRecord(
  item: WorkspacePluginRuntimeReadiness["connectors"][number],
) {
  return {
    id: item.id,
    title: item.title,
    required: item.required,
    status: item.status,
    reason_codes: item.reasonCodes,
    source: item.source,
    kind: item.kind,
    task_kinds: item.taskKinds,
    event: item.event,
    entrypoint: item.entrypoint,
  };
}

function buildActivationRuntimeRegistries(
  runtime: Record<string, unknown> | undefined,
) {
  if (!runtime) {
    return undefined;
  }
  const cli = asRecord(runtime.cli);
  const connectors = asRecord(runtime.connectors);
  const hooks = asRecord(runtime.hooks);
  if (!cli && !connectors && !hooks) {
    return undefined;
  }
  return {
    cli: cli
      ? {
          entrypoint: readString(cli, ["entrypoint"]),
          registry: readString(cli, ["registry"]),
          commands: readStringArray(cli, ["commands"]),
        }
      : undefined,
    connectors: connectors
      ? {
          registry: readString(connectors, ["registry"]),
        }
      : undefined,
    hooks: hooks
      ? {
          directory: readString(hooks, ["directory"]),
          handlers: Array.isArray(hooks.handlers) ? hooks.handlers : undefined,
        }
      : undefined,
  };
}

function resolveActivationWorkflow(
  manifest: WorkspacePluginIntentMatch["manifest"] | undefined,
  intentKey: string | undefined,
  taskKind: string | undefined,
  workflowKey: string | undefined,
) {
  if (!manifest || (!intentKey && !taskKind && !workflowKey)) {
    return undefined;
  }
  const workflows = Array.isArray(manifest.workflows) ? manifest.workflows : [];
  return workflows.find(
    (workflow) =>
      (workflowKey ? workflow.key === workflowKey : false) ||
      (intentKey
        ? workflow.triggerIntents?.includes(intentKey) ||
          workflow.key === intentKey
        : false) ||
      (taskKind ? workflow.taskKind === taskKind : false),
  );
}

function buildActivationWorkflowContract(params: {
  workflow:
    | WorkspacePluginIntentMatch["manifest"]["workflows"][number]
    | undefined;
  intent: WorkspacePluginIntentMatch | undefined;
  expectedObjects: readonly string[] | undefined;
}) {
  const workflow = params.workflow;
  const intent = params.intent;
  if (!workflow && !intent) {
    return undefined;
  }
  const workflowRecord = asRecord(workflow);
  const steps = Array.isArray(workflow?.steps)
    ? workflow.steps
        .map((step) => {
          const record = asRecord(step);
          if (!record) {
            return null;
          }
          const id = readString(record, ["id"]);
          const title = readString(record, ["title"]);
          const subagent = readString(record, ["subagent"]);
          const expectedOutput = readString(record, [
            "expectedOutput",
            "expected_output",
          ]);
          const skillRefs = readStringArray(record, [
            "skillRefs",
            "skill_refs",
          ]);
          if (!id && !title && !subagent && !expectedOutput && !skillRefs) {
            return null;
          }
          return {
            id,
            title,
            subagent,
            skill_refs: skillRefs,
            expected_output: expectedOutput,
          };
        })
        .filter(Boolean)
    : undefined;
  return {
    key: workflow?.key ?? intent?.workflowKey,
    title: workflow?.title,
    task_kind: workflow?.taskKind ?? intent?.taskKind,
    output_artifact_kind:
      workflow?.outputArtifactKind ?? intent?.outputArtifactKind,
    right_surface: intent?.rightSurface,
    expected_objects: intent?.expectedObjects?.length
      ? intent.expectedObjects
      : params.expectedObjects,
    connector_refs: readStringArray(workflowRecord ?? {}, [
      "connectorRefs",
      "connector_refs",
    ]),
    cli_refs: readStringArray(workflowRecord ?? {}, ["cliRefs", "cli_refs"]),
    hook_policy:
      asRecord(workflowRecord?.hookPolicy) ??
      asRecord(workflowRecord?.hook_policy),
    steps,
  };
}

function resolveActivationSubagents(
  manifest: WorkspacePluginIntentMatch["manifest"] | undefined,
  taskKind: string | undefined,
) {
  if (!manifest) {
    return undefined;
  }
  const subagents = manifest.subagents ?? [];
  const matched = subagents.filter(
    (subagent) => !taskKind || subagent.activation === taskKind,
  );
  return (matched.length > 0 ? matched : subagents).map((subagent) => ({
    id: subagent.id,
    title: subagent.title ?? subagent.id,
    description: subagent.description,
    activation: subagent.activation,
    required: subagent.required,
    skills: subagent.skills,
  }));
}

function resolveActivationSkillRefs(
  manifest: WorkspacePluginIntentMatch["manifest"] | undefined,
  taskKind: string | undefined,
) {
  if (!manifest) {
    return undefined;
  }
  const matched = (manifest.skillRefs ?? []).filter(
    (skill) => !taskKind || skill.activation === taskKind || !skill.activation,
  );
  return matched.map((skill) => ({
    id: skill.id,
    title: skill.title ?? skill.id,
    description: skill.description,
    required: skill.required,
    activation: skill.activation,
  }));
}

function readInterfaceDefaultPrompts(value: unknown): string[] | undefined {
  const record = asRecord(value);
  const prompts = readStringArray(record ?? {}, ["defaultPrompt"]);
  return prompts?.length ? prompts : undefined;
}

function readString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readStringArray(
  record: Record<string, unknown>,
  keys: readonly string[],
): string[] | undefined {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) {
      continue;
    }
    const items = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    if (items.length > 0) {
      return Array.from(new Set(items));
    }
  }
  return undefined;
}

function parsePluginObjectRef(value: unknown): PluginObjectRef | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const pluginId = readString(record, ["plugin_id", "pluginId"]);
  const objectKind = readString(record, ["object_kind", "objectKind"]);
  const objectId = readString(record, ["object_id", "objectId"]);
  if (!pluginId || !objectKind || !objectId) {
    return undefined;
  }
  return {
    pluginId,
    objectKind,
    objectId,
    version: readString(record, ["version"]),
    artifactIds: readStringArray(record, ["artifact_ids", "artifactIds"]),
    sourceTurnId: readString(record, ["source_turn_id", "sourceTurnId"]),
    sourceTaskId: readString(record, ["source_task_id", "sourceTaskId"]),
  };
}

function normalizeContextSource(
  value: string | undefined,
): PluginActivationContextSource {
  if (value === "history" || value === "route" || value === "restore") {
    return value;
  }
  return "user";
}

export function extractWorkspacePluginActivationFromRequestMetadata(
  requestMetadata: Record<string, unknown> | undefined,
): WorkspacePluginActivationRequestMetadata | null {
  const metadata = asRecord(requestMetadata);
  const harness = asRecord(metadata?.harness);
  const activation =
    asRecord(harness?.plugin_activation) ||
    asRecord(harness?.pluginActivation) ||
    asRecord(metadata?.plugin_activation) ||
    asRecord(metadata?.pluginActivation);
  if (!activation) {
    return null;
  }

  const source = readString(activation, ["source"]);
  const trigger = readString(activation, ["trigger"]);
  const sessionId = readString(activation, ["session_id", "sessionId"]);
  const pluginId = readString(activation, ["plugin_id", "pluginId"]);
  if (!source || !trigger || !sessionId || !pluginId) {
    return null;
  }

  return {
    source,
    trigger,
    body: readString(activation, ["body"]) ?? "",
    context: {
      sessionId,
      pluginId,
      activePluginUiId: readString(activation, [
        "active_plugin_ui_id",
        "activePluginUiId",
      ]),
      activeEntryKey: readString(activation, [
        "active_entry_key",
        "activeEntryKey",
      ]),
      taskKind: readString(activation, ["entry_task_kind", "taskKind"]),
      workflowKey: readString(activation, [
        "entry_workflow_key",
        "workflowKey",
      ]),
      outputArtifactKind: readString(activation, [
        "entry_output_artifact_kind",
        "outputArtifactKind",
      ]),
      rightSurface: readString(activation, [
        "entry_right_surface",
        "rightSurface",
      ]),
      expectedObjects: readStringArray(activation, [
        "entry_expected_objects",
        "expectedObjects",
      ]),
      selectedSkillKeys: readStringArray(activation, [
        "selected_skill_keys",
        "selectedSkillKeys",
      ]),
      selectedObjectRef: parsePluginObjectRef(
        activation.selected_object_ref ?? activation.selectedObjectRef,
      ),
      openedTabs: readStringArray(activation, ["opened_tabs", "openedTabs"]),
      pinnedTabs: readStringArray(activation, ["pinned_tabs", "pinnedTabs"]),
      source: normalizeContextSource(
        readString(activation, ["context_source", "contextSource"]),
      ),
    },
  };
}

export function mergePluginActivationSendOptions(params: {
  sendOptions?: HandleSendOptions;
  resolution: WorkspacePluginActivationResolution;
}): HandleSendOptions | undefined {
  if (params.resolution.status !== "matched") {
    return params.sendOptions;
  }
  const previousRequestMetadata = params.sendOptions?.requestMetadata || {};
  const previousHarness = asRecord(previousRequestMetadata.harness) || {};
  const intentSystemPrompt = params.resolution.intentMatch
    ? buildPluginIntentSystemPrompt(params.resolution.intentMatch)
    : undefined;
  const previousSystemPrompt = params.sendOptions?.systemPromptOverride?.trim();
  return {
    ...(params.sendOptions || {}),
    systemPromptOverride:
      intentSystemPrompt && previousSystemPrompt
        ? `${previousSystemPrompt}\n\n${intentSystemPrompt}`
        : intentSystemPrompt || params.sendOptions?.systemPromptOverride,
    requestMetadata: {
      ...previousRequestMetadata,
      harness: {
        ...previousHarness,
        ...pluginActivationMetadata(params.resolution),
      },
    },
  };
}
