import type {
  CompleteAudioGenerationTaskArtifactRequest,
  CreateAudioGenerationTaskArtifactRequest,
  CreateImageGenerationTaskArtifactRequest,
  ListMediaTaskArtifactsRequest,
  ListMediaTaskArtifactsOutput,
  MediaTaskArtifactOutput,
  MediaTaskLookupRequest,
} from "./types";
import {
  invokeAgentRuntimeBridge,
  type AgentRuntimeBridgeInvoke,
} from "./transport";

export interface AgentRuntimeMediaClientDeps {
  bridgeInvoke?: AgentRuntimeBridgeInvoke;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRequiredRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

function isRequiredString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isMediaTaskArtifactRecord(
  value: unknown,
): value is MediaTaskArtifactOutput["record"] {
  return (
    isRequiredRecord(value) &&
    isRequiredString(value.task_id) &&
    isRequiredString(value.task_type) &&
    isRequiredString(value.task_family) &&
    isNullableString(value.title) &&
    isNullableString(value.summary) &&
    isRequiredRecord(value.payload) &&
    isRequiredString(value.status) &&
    isRequiredString(value.normalized_status) &&
    isRequiredString(value.created_at) &&
    isNullableString(value.updated_at) &&
    isNullableString(value.current_attempt_id) &&
    isNullableString(value.idempotency_key) &&
    isOptionalFiniteNumber(value.retry_count) &&
    (value.last_error === undefined ||
      value.last_error === null ||
      isRequiredRecord(value.last_error)) &&
    (value.attempts === undefined ||
      (Array.isArray(value.attempts) &&
        value.attempts.every(isRequiredRecord))) &&
    (value.relationships === undefined ||
      isRequiredRecord(value.relationships)) &&
    (value.progress === undefined || isRequiredRecord(value.progress)) &&
    (value.ui_hints === undefined || isRequiredRecord(value.ui_hints))
  );
}

function isMediaTaskArtifactOutput(
  value: unknown,
): value is MediaTaskArtifactOutput {
  return (
    isRequiredRecord(value) &&
    typeof value.success === "boolean" &&
    isRequiredString(value.task_id) &&
    isRequiredString(value.task_type) &&
    isRequiredString(value.task_family) &&
    isRequiredString(value.status) &&
    isRequiredString(value.normalized_status) &&
    isNullableString(value.current_attempt_id) &&
    isRequiredString(value.path) &&
    isRequiredString(value.absolute_path) &&
    isRequiredString(value.artifact_path) &&
    isRequiredString(value.absolute_artifact_path) &&
    typeof value.reused_existing === "boolean" &&
    isNullableString(value.idempotency_key) &&
    isMediaTaskArtifactRecord(value.record)
  );
}

function isMediaTaskListFilters(value: unknown): boolean {
  return (
    isRequiredRecord(value) &&
    isNullableString(value.status) &&
    isNullableString(value.task_family) &&
    isNullableString(value.task_type) &&
    isNullableString(value.modality_contract_key) &&
    isNullableString(value.routing_outcome) &&
    (value.limit === undefined ||
      value.limit === null ||
      (typeof value.limit === "number" && Number.isFinite(value.limit)))
  );
}

function isCountList(
  value: unknown,
  key: "outcome" | "status",
): value is Array<Record<string, unknown>> {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRequiredRecord(item) &&
        isRequiredString(item[key]) &&
        typeof item.count === "number" &&
        Number.isFinite(item.count),
    )
  );
}

function isModalityRuntimeContractIndex(value: unknown): boolean {
  return (
    isRequiredRecord(value) &&
    typeof value.snapshot_count === "number" &&
    Number.isFinite(value.snapshot_count) &&
    isStringArray(value.contract_keys) &&
    (value.entry_keys === undefined || isStringArray(value.entry_keys)) &&
    isStringArray(value.execution_profile_keys) &&
    isStringArray(value.executor_adapter_keys) &&
    isStringArray(value.limecore_policy_refs) &&
    typeof value.limecore_policy_snapshot_count === "number" &&
    Number.isFinite(value.limecore_policy_snapshot_count) &&
    isCountList(value.limecore_policy_snapshot_statuses, "status") &&
    isStringArray(value.limecore_policy_decisions) &&
    typeof value.blocked_count === "number" &&
    Number.isFinite(value.blocked_count) &&
    isCountList(value.routing_outcomes, "outcome") &&
    typeof value.model_registry_assessment_count === "number" &&
    Number.isFinite(value.model_registry_assessment_count) &&
    typeof value.audio_output_count === "number" &&
    Number.isFinite(value.audio_output_count) &&
    isCountList(value.audio_output_statuses, "status") &&
    isStringArray(value.audio_output_error_codes) &&
    typeof value.transcript_count === "number" &&
    Number.isFinite(value.transcript_count) &&
    isCountList(value.transcript_statuses, "status") &&
    isStringArray(value.transcript_error_codes) &&
    Array.isArray(value.snapshots) &&
    value.snapshots.every(
      (snapshot) =>
        isRequiredRecord(snapshot) &&
        isRequiredString(snapshot.task_id) &&
        isRequiredString(snapshot.task_type) &&
        isRequiredString(snapshot.normalized_status) &&
        isStringArray(snapshot.limecore_policy_refs) &&
        isRequiredString(snapshot.routing_event) &&
        isRequiredString(snapshot.routing_outcome),
    )
  );
}

function isListMediaTaskArtifactsOutput(
  value: unknown,
): value is ListMediaTaskArtifactsOutput {
  return (
    isRequiredRecord(value) &&
    typeof value.success === "boolean" &&
    isRequiredString(value.workspace_root) &&
    isRequiredString(value.artifact_root) &&
    isMediaTaskListFilters(value.filters) &&
    typeof value.total === "number" &&
    Number.isFinite(value.total) &&
    isModalityRuntimeContractIndex(value.modality_runtime_contracts) &&
    Array.isArray(value.tasks) &&
    value.tasks.every(isMediaTaskArtifactOutput)
  );
}

function assertMediaTaskArtifactOutput(
  command: string,
  value: unknown,
): asserts value is MediaTaskArtifactOutput {
  if (!isMediaTaskArtifactOutput(value)) {
    throw new Error(`${command} did not return media task artifact output`);
  }
}

function assertListMediaTaskArtifactsOutput(
  command: string,
  value: unknown,
): asserts value is ListMediaTaskArtifactsOutput {
  if (!isListMediaTaskArtifactsOutput(value)) {
    throw new Error(`${command} did not return media task artifacts list output`);
  }
}

export function createMediaClient({
  bridgeInvoke = invokeAgentRuntimeBridge,
}: AgentRuntimeMediaClientDeps = {}) {
  async function createImageGenerationTaskArtifact(
    request: CreateImageGenerationTaskArtifactRequest,
  ): Promise<MediaTaskArtifactOutput> {
    const command = "create_image_generation_task_artifact";
    const result = await bridgeInvoke(command, {
      request,
    });
    assertMediaTaskArtifactOutput(command, result);
    return result;
  }

  async function createAudioGenerationTaskArtifact(
    request: CreateAudioGenerationTaskArtifactRequest,
  ): Promise<MediaTaskArtifactOutput> {
    const command = "create_audio_generation_task_artifact";
    const result = await bridgeInvoke(command, {
      request,
    });
    assertMediaTaskArtifactOutput(command, result);
    return result;
  }

  async function completeAudioGenerationTaskArtifact(
    request: CompleteAudioGenerationTaskArtifactRequest,
  ): Promise<MediaTaskArtifactOutput> {
    const command = "complete_audio_generation_task_artifact";
    const result = await bridgeInvoke(command, {
      request,
    });
    assertMediaTaskArtifactOutput(command, result);
    return result;
  }

  async function getMediaTaskArtifact(
    request: MediaTaskLookupRequest,
  ): Promise<MediaTaskArtifactOutput> {
    const command = "get_media_task_artifact";
    const result = await bridgeInvoke(command, { request });
    assertMediaTaskArtifactOutput(command, result);
    return result;
  }

  async function listMediaTaskArtifacts(
    request: ListMediaTaskArtifactsRequest,
  ): Promise<ListMediaTaskArtifactsOutput> {
    const command = "list_media_task_artifacts";
    const result = await bridgeInvoke(command, {
      request,
    });
    assertListMediaTaskArtifactsOutput(command, result);
    return result;
  }

  async function cancelMediaTaskArtifact(
    request: MediaTaskLookupRequest,
  ): Promise<MediaTaskArtifactOutput> {
    const command = "cancel_media_task_artifact";
    const result = await bridgeInvoke(command, {
      request,
    });
    assertMediaTaskArtifactOutput(command, result);
    return result;
  }

  return {
    cancelMediaTaskArtifact,
    completeAudioGenerationTaskArtifact,
    createAudioGenerationTaskArtifact,
    createImageGenerationTaskArtifact,
    getMediaTaskArtifact,
    listMediaTaskArtifacts,
  };
}

export const {
  cancelMediaTaskArtifact,
  completeAudioGenerationTaskArtifact,
  createAudioGenerationTaskArtifact,
  createImageGenerationTaskArtifact,
  getMediaTaskArtifact,
  listMediaTaskArtifacts,
} = createMediaClient();
