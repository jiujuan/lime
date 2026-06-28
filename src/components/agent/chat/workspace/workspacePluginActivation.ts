import type { InstalledAgentAppState } from "@/features/agent-app/types";
import {
  buildPluginActivationMentionCatalog,
  parsePluginActivationMention,
  projectPluginRegistryFromInstalledAgentApps,
  type PluginActivationContext,
  type PluginActivationContextSource,
  type PluginActivationMentionParseResult,
  type PluginObjectRef,
} from "@/features/plugin";
import type { HandleSendOptions } from "../hooks/handleSendTypes";
import { asRecord } from "./commands/skillSlotUtils";
import {
  buildAgentAppIntentSystemPrompt,
  resolveWorkspaceAgentAppIntent,
  type WorkspaceAgentAppIntentMatch,
  type WorkspaceAgentAppIntentSource,
} from "./workspaceAgentAppIntentRouting";

export interface WorkspacePluginActivationResolution {
  status: "matched" | "blocked";
  trigger: string;
  body: string;
  context?: PluginActivationContext;
  intentMatch?: WorkspaceAgentAppIntentMatch;
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
  intentSources: readonly WorkspaceAgentAppIntentSource[];
}

function resolvePluginActivationParseResult(params: {
  text: string;
  sessionId: string;
  installedAgentApps: readonly InstalledAgentAppState[];
}): WorkspacePluginActivationParseResolution | null {
  const projection = projectPluginRegistryFromInstalledAgentApps(
    params.installedAgentApps,
  );
  const contracts = projection.contracts;
  if (contracts.length > 0) {
    const parseResult = parsePluginActivationMention({
      text: params.text,
      catalog: buildPluginActivationMentionCatalog({
        contracts,
        registryItems: projection.registry,
      }),
      sessionId: params.sessionId,
      source: "user",
    });
    if (parseResult) {
      return {
        parseResult,
        intentSources: params.installedAgentApps,
      };
    }
  }
  return null;
}

export function resolveWorkspacePluginActivation(params: {
  text: string;
  sessionId?: string | null;
  installedAgentApps: readonly InstalledAgentAppState[];
}): WorkspacePluginActivationResolution | null {
  const sessionId = params.sessionId?.trim();
  if (!sessionId) {
    return null;
  }
  const parseResolution = resolvePluginActivationParseResult({
    text: params.text,
    sessionId,
    installedAgentApps: params.installedAgentApps,
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
  const activeAppId =
    parseResult.context.activeAgentAppId ?? parseResult.context.pluginId;
  const activeSources = parseResolution.intentSources.filter(
    (source) => source.appId === activeAppId,
  );
  const intentMatch =
    resolveWorkspaceAgentAppIntent(
      parseResult.context.activeEntryKey ?? "",
      activeSources,
    ) ??
    resolveWorkspaceAgentAppIntent(parseResult.match.body, activeSources) ??
    resolveWorkspaceAgentAppIntent(params.text, activeSources) ??
    undefined;
  return {
    status: "matched",
    ...base,
    context: parseResult.context,
    intentMatch,
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
  );
  const subagents = resolveActivationSubagents(manifest, intent?.taskKind);
  const skillRefs = resolveActivationSkillRefs(manifest, intent?.taskKind);
  const workflowRecord = asRecord(workflow);
  const runtimeRecord = asRecord(manifest?.agentRuntime);
  return {
    plugin_activation: {
      source: "plugin_explicit_mention",
      trigger: resolution.trigger,
      body: resolution.body,
      session_id: context.sessionId,
      plugin_id: context.pluginId,
      active_agent_app_id: context.activeAgentAppId,
      active_entry_key: context.activeEntryKey,
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
      output_artifact_kind: intent?.outputArtifactKind,
      right_surface: intent?.rightSurface,
      expected_objects: intent?.expectedObjects,
      matched_phrase: intent?.matchedPhrase,
      workflow_key: workflow?.key,
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
      runtime_registries: buildActivationRuntimeRegistries(runtimeRecord),
      default_prompts: readInterfaceDefaultPrompts(manifest?.interface),
    },
    ...(intent
      ? {
          plugin_activation_intent: {
            source: intent.source,
            app_id: intent.appId,
            app_name: intent.appName,
            intent_key: intent.intentKey,
            task_kind: intent.taskKind,
            output_artifact_kind: intent.outputArtifactKind,
            right_surface: intent.rightSurface,
            expected_objects: intent.expectedObjects,
            matched_phrase: intent.matchedPhrase,
          },
        }
      : {}),
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
  manifest: WorkspaceAgentAppIntentMatch["manifest"] | undefined,
  intentKey: string | undefined,
  taskKind: string | undefined,
) {
  if (!manifest || (!intentKey && !taskKind)) {
    return undefined;
  }
  return manifest.workflows.find(
    (workflow) =>
      (intentKey
        ? workflow.triggerIntents?.includes(intentKey) ||
          workflow.key === intentKey
        : false) ||
      (taskKind ? workflow.taskKind === taskKind : false),
  );
}

function resolveActivationSubagents(
  manifest: WorkspaceAgentAppIntentMatch["manifest"] | undefined,
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
  manifest: WorkspaceAgentAppIntentMatch["manifest"] | undefined,
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
      activeAgentAppId: readString(activation, [
        "active_agent_app_id",
        "activeAgentAppId",
      ]),
      activeEntryKey: readString(activation, [
        "active_entry_key",
        "activeEntryKey",
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
    ? buildAgentAppIntentSystemPrompt(params.resolution.intentMatch)
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
