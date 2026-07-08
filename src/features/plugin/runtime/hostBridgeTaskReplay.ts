import type { PluginRuntimeProcessView } from "../types";
import { buildAgentRuntimeProcessView } from "./agentRuntimeProcess";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const item = value[key];
  return typeof item === "string" && item.trim() ? item.trim() : undefined;
}

export interface PluginTaskSubscription {
  subscriptionId: string;
  taskId: string;
  sessionId?: string;
  pollIntervalMs: number;
  bridgeAction?: string;
  expectedOutput?: unknown;
  runtimeEventName?: string;
  runtimeEventUnlisten?: () => void;
  timerId?: number;
  inFlight: boolean;
  terminalArtifactReplayPolls: number;
  events: unknown[];
  latestTask?: unknown;
  process?: PluginRuntimeProcessView;
}

export function readTaskIdFromPayload(
  payload: Record<string, unknown>,
): string | undefined {
  const directTaskId = readString(payload, "taskId");
  if (directTaskId) {
    return directTaskId;
  }
  if (isRecord(payload.input)) {
    const inputTaskId = readString(payload.input, "taskId");
    if (inputTaskId) {
      return inputTaskId;
    }
  }
  return Array.isArray(payload.args) && typeof payload.args[0] === "string"
    ? payload.args[0].trim()
    : undefined;
}

export function readSessionIdFromPayload(
  payload: Record<string, unknown>,
): string | undefined {
  const directSessionId =
    readString(payload, "sessionId") ?? readString(payload, "session_id");
  if (directSessionId) {
    return directSessionId;
  }
  if (isRecord(payload.input)) {
    return (
      readString(payload.input, "sessionId") ??
      readString(payload.input, "session_id")
    );
  }
  return undefined;
}

export function readRuntimeEventNameFromPayload(
  appId: string,
  taskId: string,
  payload: Record<string, unknown>,
): string {
  const explicit =
    readString(payload, "eventName") ??
    (isRecord(payload.input)
      ? readString(payload.input, "eventName")
      : undefined);
  return explicit ?? `plugin_runtime:${appId}:${taskId}`;
}

export function buildTaskEventsFromRuntimeEventPayload(
  payload: unknown,
): unknown[] {
  if (!isRecord(payload)) {
    return [];
  }
  return [
    {
      eventType:
        readString(payload, "eventType") ??
        readString(payload, "type") ??
        "task:runtimeEvent",
      status: readString(payload, "status"),
      message:
        readString(payload, "message") ??
        readString(payload, "status") ??
        readString(payload, "type") ??
        "AgentRuntime event",
      payload,
    },
  ];
}

export function readTaskEventsFromValue(value: unknown): unknown[] {
  if (!isRecord(value)) {
    return [];
  }
  const artifactEvents = buildArtifactReplayEventsFromValue(value);
  if (Array.isArray(value.events)) {
    return [...value.events, ...artifactEvents];
  }
  if (Array.isArray(value.taskEvents)) {
    return [...value.taskEvents, ...artifactEvents];
  }
  return artifactEvents;
}

function taskEventIdentity(event: unknown, index: number): string {
  if (!isRecord(event)) {
    return `event:${index}`;
  }
  const stableParts = [
    readString(event, "eventId"),
    readString(event, "id"),
    readString(event, "type") ?? readString(event, "eventType"),
    readString(event, "requestId"),
    readString(event, "message"),
    readString(event, "occurredAt") ?? readString(event, "at"),
  ].filter(Boolean);
  return stableParts.length ? stableParts.join(":") : `event:${index}`;
}

export function mergeTaskEvents(...groups: unknown[][]): unknown[] {
  const seen = new Set<string>();
  const merged: unknown[] = [];
  groups.flat().forEach((event, index) => {
    if (!event) {
      return;
    }
    const key = taskEventIdentity(event, index);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    merged.push(event);
  });
  return merged;
}

function readArtifactsFromValue(value: unknown): Record<string, unknown>[] {
  if (!isRecord(value)) {
    return [];
  }
  const direct = Array.isArray(value.artifacts) ? value.artifacts : [];
  const fromResult = isRecord(value.result)
    ? readArtifactsFromValue(value.result)
    : [];
  const fromThreadRead = isRecord(value.threadRead)
    ? readArtifactsFromValue(value.threadRead)
    : [];
  return [...direct, ...fromResult, ...fromThreadRead].filter(isRecord);
}

function repairUnescapedStringQuotes(value: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }
    if (inString && char === "\\") {
      output += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      if (!inString) {
        inString = true;
        output += char;
        continue;
      }
      const next = value.slice(index + 1).match(/\S/)?.[0];
      if (!next || [",", "}", "]", ":"].includes(next)) {
        inString = false;
        output += char;
      } else {
        output += `\\"`;
      }
      continue;
    }
    output += char;
  }
  return output;
}

function parseJsonRecordCandidate(
  candidate: string,
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(candidate);
    return isRecord(parsed) ? parsed : null;
  } catch {
    const repaired = repairUnescapedStringQuotes(candidate);
    if (repaired === candidate) {
      return null;
    }
    try {
      const parsed = JSON.parse(repaired);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function parseJsonObjectFromMarkdown(
  content: string,
): Record<string, unknown> | null {
  const text = content.trim();
  const candidates: string[] = [];
  if (text.startsWith("{") && text.endsWith("}")) {
    candidates.push(text);
  }
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    candidates.push(match[1]?.trim() ?? "");
  }
  for (const candidate of candidates.filter(Boolean)) {
    const parsed = parseJsonRecordCandidate(candidate);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function hasContentFactoryWorkspacePatchFields(
  value: Record<string, unknown>,
): boolean {
  return [
    "workspace",
    "project",
    "sceneTable",
    "scene_table",
    "contentBatch",
    "content_batch",
    "scripts",
    "scriptBatch",
    "script_batch",
    "imagePrompts",
    "image_prompts",
    "assetPack",
    "asset_pack",
    "projectKnowledge",
    "project_knowledge",
    "strategyReport",
    "strategy_report",
    "reviewReport",
    "review_report",
  ].some((key) => isRecord(value[key]) || Array.isArray(value[key]));
}

function extractWorkspacePatchFromValue(
  value: unknown,
  depth = 0,
): Record<string, unknown> | undefined {
  if (depth > 10 || value == null) {
    return undefined;
  }
  if (typeof value === "string") {
    const parsed = parseJsonObjectFromMarkdown(value);
    return parsed
      ? extractWorkspacePatchFromValue(parsed, depth + 1)
      : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const patch = extractWorkspacePatchFromValue(item, depth + 1);
      if (patch) {
        return patch;
      }
    }
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  for (const key of [
    "contentFactoryWorkspacePatch",
    "content_factory_workspace_patch",
    "workspacePatch",
    "workspace_patch",
  ]) {
    const patch = value[key];
    if (isRecord(patch)) {
      return patch;
    }
  }
  const kind = readString(value, "kind") ?? readString(value, "artifactKind");
  if (
    kind === "content_factory.workspace_patch" ||
    kind === "content_factory_workspace_patch" ||
    kind === "workspacePatch" ||
    kind === "workspace_patch" ||
    hasContentFactoryWorkspacePatchFields(value)
  ) {
    return value;
  }
  for (const key of [
    "payload",
    "result",
    "threadRead",
    "metadata",
    "artifactDocument",
    "artifact_document",
    "process",
    "runtimeProcess",
    "runtimeEvent",
    "events",
    "taskEvents",
    "artifacts",
    "items",
    "blocks",
    "content",
    "markdown",
    "text",
    "message",
    "output",
    "response",
    "streamText",
  ]) {
    const patch = extractWorkspacePatchFromValue(value[key], depth + 1);
    if (patch) {
      return patch;
    }
  }
  return undefined;
}

function buildArtifactReplayEventsFromValue(value: unknown): unknown[] {
  const artifacts = readArtifactsFromValue(value);
  if (!artifacts.length) {
    return [];
  }
  return artifacts.map((artifact, index) => {
    const metadata = isRecord(artifact.metadata) ? artifact.metadata : {};
    const artifactRef =
      readString(artifact, "path") ??
      readString(artifact, "item_id") ??
      readString(artifact, "id") ??
      `artifact:${index + 1}`;
    const artifactDocument =
      isRecord(metadata.artifactDocument) ||
      isRecord(metadata.artifact_document)
        ? (metadata.artifactDocument ?? metadata.artifact_document)
        : undefined;
    const workspacePatch =
      isRecord(metadata.workspacePatch) ||
      isRecord(metadata.contentFactoryWorkspacePatch)
        ? (metadata.workspacePatch ?? metadata.contentFactoryWorkspacePatch)
        : extractWorkspacePatchFromValue(artifactDocument);
    return {
      eventType: "artifact:created",
      status: readString(artifact, "status") ?? "created",
      message:
        readString(artifact, "title") ??
        readString(artifact, "artifact_type") ??
        "Artifact 已创建",
      artifactRef,
      payload: {
        artifact,
        artifactDocument,
        workspacePatch,
        contentFactoryWorkspacePatch: workspacePatch,
      },
    };
  });
}

export function isTerminalTaskValue(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const status = String(value.taskStatus ?? value.status ?? "").toLowerCase();
  return [
    "succeeded",
    "success",
    "completed",
    "complete",
    "failed",
    "failure",
    "error",
    "cancelled",
    "canceled",
  ].includes(status);
}

export function isSuccessfulTerminalTaskValue(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const status = String(value.taskStatus ?? value.status ?? "").toLowerCase();
  return ["succeeded", "success", "completed", "complete"].includes(status);
}

export function hasWorkspacePatchPayload(value: unknown): boolean {
  if (extractWorkspacePatchFromValue(value)) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  if (isRecord(value.payload) && hasWorkspacePatchPayload(value.payload)) {
    return true;
  }
  if (isRecord(value.result) && hasWorkspacePatchPayload(value.result)) {
    return true;
  }
  if (
    isRecord(value.threadRead) &&
    hasWorkspacePatchPayload(value.threadRead)
  ) {
    return true;
  }
  if (
    Array.isArray(value.events) &&
    value.events.some(hasWorkspacePatchPayload)
  ) {
    return true;
  }
  if (
    Array.isArray(value.taskEvents) &&
    value.taskEvents.some(hasWorkspacePatchPayload)
  ) {
    return true;
  }
  if (
    Array.isArray(value.artifacts) &&
    value.artifacts.some(hasWorkspacePatchPayload)
  ) {
    return true;
  }
  return false;
}

export function hasArtifactPayload(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (readArtifactsFromValue(value).length > 0) {
    return true;
  }
  if (Array.isArray(value.events) && value.events.some(hasArtifactPayload)) {
    return true;
  }
  if (
    Array.isArray(value.taskEvents) &&
    value.taskEvents.some(hasArtifactPayload)
  ) {
    return true;
  }
  return false;
}

export function shouldWaitForContentFactoryPatch(
  subscription: Pick<PluginTaskSubscription, "bridgeAction">,
): boolean {
  return subscription.bridgeAction === "contentFactoryProduction";
}

export function shouldWaitForImageArtifact(
  subscription: Pick<PluginTaskSubscription, "bridgeAction">,
): boolean {
  return subscription.bridgeAction === "studioLogoGenerate";
}

export function readRuntimeProcess(
  value: unknown,
): PluginRuntimeProcessView | null {
  if (!isRecord(value)) {
    return null;
  }
  if (isRecord(value.runtimeProcess)) {
    return value.runtimeProcess as unknown as PluginRuntimeProcessView;
  }
  if (isRecord(value.process)) {
    return value.process as unknown as PluginRuntimeProcessView;
  }
  const task = isRecord(value.task) ? value.task : undefined;
  if (isRecord(task?.runtimeProcess)) {
    return task.runtimeProcess as unknown as PluginRuntimeProcessView;
  }
  if (isRecord(task?.process)) {
    return task.process as unknown as PluginRuntimeProcessView;
  }
  const snapshot = isRecord(value.snapshot) ? value.snapshot : undefined;
  if (isRecord(snapshot?.runtimeProcess)) {
    return snapshot.runtimeProcess as unknown as PluginRuntimeProcessView;
  }
  if (isRecord(snapshot?.process)) {
    return snapshot.process as unknown as PluginRuntimeProcessView;
  }
  return null;
}

export function updateTaskSubscriptionProcess(
  subscription: PluginTaskSubscription,
  value: unknown,
  events: unknown[],
): PluginRuntimeProcessView {
  if (
    isRecord(value) &&
    (Array.isArray(value.events) || Array.isArray(value.taskEvents))
  ) {
    subscription.latestTask = value;
  }
  subscription.events = mergeTaskEvents(subscription.events, events);
  const explicitProcess = readRuntimeProcess(value);
  if (explicitProcess) {
    subscription.process = explicitProcess;
    return explicitProcess;
  }
  const process = buildAgentRuntimeProcessView({
    events: subscription.events,
    task: subscription.latestTask,
    snapshot: value,
  });
  subscription.process = process;
  return process;
}
