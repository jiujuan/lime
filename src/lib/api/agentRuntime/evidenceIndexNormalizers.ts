import type {
  AgentRuntimeEvidenceActionCount,
  AgentRuntimeEvidenceArtifactKindCount,
  AgentRuntimeEvidenceBackendCount,
  AgentRuntimeEvidenceBrowserActionIndex,
  AgentRuntimeEvidenceBrowserActionItem,
  AgentRuntimeEvidenceDecisionCount,
  AgentRuntimeEvidenceExecutorCount,
  AgentRuntimeEvidenceLimeCorePolicyEvaluation,
  AgentRuntimeEvidenceLimeCorePolicyIndex,
  AgentRuntimeEvidenceLimeCorePolicyInput,
  AgentRuntimeEvidenceLimeCorePolicyItem,
  AgentRuntimeEvidenceLimeCorePolicyValueHit,
  AgentRuntimeEvidenceStatusCount,
  AgentRuntimeEvidenceTaskIndex,
  AgentRuntimeEvidenceTaskIndexItem,
} from "./types";
import {
  isRecord,
  readArrayField,
  readNumberField,
  readOptionalBooleanField,
  readOptionalNumberField,
  readOptionalStringField,
  readRecordField,
  readStringField,
  readStringListField,
} from "./normalizerUtils";

function normalizeEvidenceStatusCount(
  value: unknown,
): AgentRuntimeEvidenceStatusCount | null {
  if (!isRecord(value)) {
    return null;
  }

  const status = readStringField(value, "status");
  if (!status) {
    return null;
  }

  return {
    status,
    count: readNumberField(value, "count"),
  };
}

function normalizeEvidenceArtifactKindCount(
  value: unknown,
): AgentRuntimeEvidenceArtifactKindCount | null {
  if (!isRecord(value)) {
    return null;
  }

  const artifactKind = readStringField(value, "artifactKind", "artifact_kind");
  if (!artifactKind) {
    return null;
  }

  return {
    artifact_kind: artifactKind,
    count: readNumberField(value, "count"),
  };
}

function normalizeEvidenceActionCount(
  value: unknown,
): AgentRuntimeEvidenceActionCount | null {
  if (!isRecord(value)) {
    return null;
  }

  const action = readStringField(value, "action");
  if (!action) {
    return null;
  }

  return {
    action,
    count: readNumberField(value, "count"),
  };
}

function normalizeEvidenceBackendCount(
  value: unknown,
): AgentRuntimeEvidenceBackendCount | null {
  if (!isRecord(value)) {
    return null;
  }

  const backend = readStringField(value, "backend");
  if (!backend) {
    return null;
  }

  return {
    backend,
    count: readNumberField(value, "count"),
  };
}

function normalizeEvidenceExecutorCount(
  value: unknown,
): AgentRuntimeEvidenceExecutorCount | null {
  if (!isRecord(value)) {
    return null;
  }

  const executor = readStringField(value, "executor");
  if (!executor) {
    return null;
  }

  return {
    executor,
    count: readNumberField(value, "count"),
  };
}

function normalizeEvidenceDecisionCount(
  value: unknown,
): AgentRuntimeEvidenceDecisionCount | null {
  if (!isRecord(value)) {
    return null;
  }

  const decision = readStringField(value, "decision");
  if (!decision) {
    return null;
  }

  return {
    decision,
    count: readNumberField(value, "count"),
  };
}

function normalizeBrowserActionItem(
  value: unknown,
): AgentRuntimeEvidenceBrowserActionItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const item: AgentRuntimeEvidenceBrowserActionItem = {
    artifact_path: readOptionalStringField(
      value,
      "artifactPath",
      "artifact_path",
    ),
    contract_key: readOptionalStringField(value, "contractKey", "contract_key"),
    source: readOptionalStringField(value, "source"),
    entry_source: readOptionalStringField(value, "entrySource", "entry_source"),
    artifact_kind: readOptionalStringField(
      value,
      "artifactKind",
      "artifact_kind",
    ),
    tool_name: readOptionalStringField(value, "toolName", "tool_name"),
    action: readOptionalStringField(value, "action"),
    action_id: readOptionalStringField(value, "actionId", "action_id"),
    status: readOptionalStringField(value, "status"),
    success: readOptionalBooleanField(value, "success"),
    session_id: readOptionalStringField(value, "sessionId", "session_id"),
    target_id: readOptionalStringField(value, "targetId", "target_id"),
    tab_id: readOptionalStringField(value, "tabId", "tab_id"),
    profile_key: readOptionalStringField(value, "profileKey", "profile_key"),
    backend: readOptionalStringField(value, "backend"),
    request_id: readOptionalStringField(value, "requestId", "request_id"),
    confirmation_request_id: readOptionalStringField(
      value,
      "confirmationRequestId",
      "confirmation_request_id",
    ),
    control_mode: readOptionalStringField(value, "controlMode", "control_mode"),
    lifecycle_state: readOptionalStringField(
      value,
      "lifecycleState",
      "lifecycle_state",
    ),
    human_reason: readOptionalStringField(value, "humanReason", "human_reason"),
    thread_id: readOptionalStringField(value, "threadId", "thread_id"),
    turn_id: readOptionalStringField(value, "turnId", "turn_id"),
    content_id: readOptionalStringField(value, "contentId", "content_id"),
    executor: readOptionalStringField(value, "executor"),
    evidence_refs: readStringListField(value, "evidenceRefs", "evidence_refs"),
    last_url: readOptionalStringField(value, "lastUrl", "last_url"),
    title: readOptionalStringField(value, "title"),
    attempt_count: readOptionalNumberField(
      value,
      "attemptCount",
      "attempt_count",
    ),
    observation_available: readOptionalBooleanField(
      value,
      "observationAvailable",
      "observation_available",
    ),
    screenshot_available: readOptionalBooleanField(
      value,
      "screenshotAvailable",
      "screenshot_available",
    ),
  };

  const hasReadableField = Object.values(item).some(
    (field) => field !== undefined && field !== "",
  );

  return hasReadableField ? item : null;
}

function normalizeBrowserActionIndex(
  value: unknown,
): AgentRuntimeEvidenceBrowserActionIndex | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const rawStatusCounts = readArrayField(
    value,
    "statusCounts",
    "status_counts",
  );
  const rawArtifactKindCounts = readArrayField(
    value,
    "artifactKindCounts",
    "artifact_kind_counts",
  );
  const rawActionCounts = readArrayField(
    value,
    "actionCounts",
    "action_counts",
  );
  const rawBackendCounts = readArrayField(
    value,
    "backendCounts",
    "backend_counts",
  );
  const rawExecutorCounts = readArrayField(
    value,
    "executorCounts",
    "executor_counts",
  );
  const rawItems = readArrayField(value, "items");

  const index: AgentRuntimeEvidenceBrowserActionIndex = {
    action_count: readNumberField(value, "actionCount", "action_count"),
    session_count: readNumberField(value, "sessionCount", "session_count"),
    observation_count: readNumberField(
      value,
      "observationCount",
      "observation_count",
    ),
    screenshot_count: readNumberField(
      value,
      "screenshotCount",
      "screenshot_count",
    ),
    last_url: readOptionalStringField(value, "lastUrl", "last_url"),
    thread_ids: readStringListField(value, "threadIds", "thread_ids"),
    turn_ids: readStringListField(value, "turnIds", "turn_ids"),
    content_ids: readStringListField(value, "contentIds", "content_ids"),
    session_ids: readStringListField(value, "sessionIds", "session_ids"),
    target_ids: readStringListField(value, "targetIds", "target_ids"),
    profile_keys: readStringListField(value, "profileKeys", "profile_keys"),
    status_counts: rawStatusCounts
      .map((entry: unknown) => normalizeEvidenceStatusCount(entry))
      .filter(Boolean) as AgentRuntimeEvidenceStatusCount[],
    artifact_kind_counts: rawArtifactKindCounts
      .map((entry: unknown) => normalizeEvidenceArtifactKindCount(entry))
      .filter(Boolean) as AgentRuntimeEvidenceArtifactKindCount[],
    action_counts: rawActionCounts
      .map((entry: unknown) => normalizeEvidenceActionCount(entry))
      .filter(Boolean) as AgentRuntimeEvidenceActionCount[],
    backend_counts: rawBackendCounts
      .map((entry: unknown) => normalizeEvidenceBackendCount(entry))
      .filter(Boolean) as AgentRuntimeEvidenceBackendCount[],
    executor_counts: rawExecutorCounts
      .map((entry: unknown) => normalizeEvidenceExecutorCount(entry))
      .filter(Boolean) as AgentRuntimeEvidenceExecutorCount[],
    items: rawItems
      .map((entry: unknown) => normalizeBrowserActionItem(entry))
      .filter(Boolean) as AgentRuntimeEvidenceBrowserActionItem[],
  };

  if (
    index.action_count === 0 &&
    index.session_count === 0 &&
    index.observation_count === 0 &&
    index.screenshot_count === 0 &&
    !index.last_url &&
    index.thread_ids.length === 0 &&
    index.turn_ids.length === 0 &&
    index.content_ids.length === 0 &&
    index.executor_counts.length === 0 &&
    index.items.length === 0
  ) {
    return undefined;
  }

  return index;
}

function normalizeTaskIndexItem(
  value: unknown,
): AgentRuntimeEvidenceTaskIndexItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const item: AgentRuntimeEvidenceTaskIndexItem = {
    artifact_path: readOptionalStringField(
      value,
      "artifactPath",
      "artifact_path",
    ),
    task_id: readOptionalStringField(value, "taskId", "task_id"),
    task_type: readOptionalStringField(value, "taskType", "task_type"),
    contract_key: readOptionalStringField(value, "contractKey", "contract_key"),
    source: readOptionalStringField(value, "source"),
    thread_id: readOptionalStringField(value, "threadId", "thread_id"),
    turn_id: readOptionalStringField(value, "turnId", "turn_id"),
    content_id: readOptionalStringField(value, "contentId", "content_id"),
    entry_key: readOptionalStringField(value, "entryKey", "entry_key"),
    entry_source: readOptionalStringField(value, "entrySource", "entry_source"),
    modality: readOptionalStringField(value, "modality"),
    skill_id: readOptionalStringField(value, "skillId", "skill_id"),
    model_id: readOptionalStringField(value, "modelId", "model_id"),
    executor_kind: readOptionalStringField(
      value,
      "executorKind",
      "executor_kind",
    ),
    executor_binding_key: readOptionalStringField(
      value,
      "executorBindingKey",
      "executor_binding_key",
    ),
    cost_state: readOptionalStringField(value, "costState", "cost_state"),
    limit_state: readOptionalStringField(value, "limitState", "limit_state"),
    estimated_cost_class: readOptionalStringField(
      value,
      "estimatedCostClass",
      "estimated_cost_class",
    ),
    limit_event_kind: readOptionalStringField(
      value,
      "limitEventKind",
      "limit_event_kind",
    ),
    quota_low: readOptionalBooleanField(value, "quotaLow", "quota_low"),
    routing_outcome: readOptionalStringField(
      value,
      "routingOutcome",
      "routing_outcome",
    ),
  };

  const hasReadableField = Object.values(item).some(
    (field) => field !== undefined && field !== "",
  );

  return hasReadableField ? item : null;
}

function normalizeTaskIndex(
  value: unknown,
): AgentRuntimeEvidenceTaskIndex | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const rawItems = readArrayField(value, "items");
  const index: AgentRuntimeEvidenceTaskIndex = {
    snapshot_count: readNumberField(value, "snapshotCount", "snapshot_count"),
    thread_ids: readStringListField(value, "threadIds", "thread_ids"),
    turn_ids: readStringListField(value, "turnIds", "turn_ids"),
    content_ids: readStringListField(value, "contentIds", "content_ids"),
    entry_keys: readStringListField(value, "entryKeys", "entry_keys"),
    modalities: readStringListField(value, "modalities"),
    skill_ids: readStringListField(value, "skillIds", "skill_ids"),
    model_ids: readStringListField(value, "modelIds", "model_ids"),
    executor_kinds: readStringListField(
      value,
      "executorKinds",
      "executor_kinds",
    ),
    executor_binding_keys: readStringListField(
      value,
      "executorBindingKeys",
      "executor_binding_keys",
    ),
    cost_states: readStringListField(value, "costStates", "cost_states"),
    limit_states: readStringListField(value, "limitStates", "limit_states"),
    estimated_cost_classes: readStringListField(
      value,
      "estimatedCostClasses",
      "estimated_cost_classes",
    ),
    limit_event_kinds: readStringListField(
      value,
      "limitEventKinds",
      "limit_event_kinds",
    ),
    quota_low_count: readNumberField(value, "quotaLowCount", "quota_low_count"),
    items: rawItems
      .map((entry: unknown) => normalizeTaskIndexItem(entry))
      .filter(Boolean) as AgentRuntimeEvidenceTaskIndexItem[],
  };

  if (
    index.snapshot_count === 0 &&
    index.thread_ids.length === 0 &&
    index.turn_ids.length === 0 &&
    index.content_ids.length === 0 &&
    index.entry_keys.length === 0 &&
    index.modalities.length === 0 &&
    index.skill_ids.length === 0 &&
    index.model_ids.length === 0 &&
    index.executor_kinds.length === 0 &&
    index.executor_binding_keys.length === 0 &&
    index.cost_states.length === 0 &&
    index.limit_states.length === 0 &&
    index.estimated_cost_classes.length === 0 &&
    index.limit_event_kinds.length === 0 &&
    index.quota_low_count === 0 &&
    index.items.length === 0
  ) {
    return undefined;
  }

  return index;
}

function normalizeLimeCorePolicyItem(
  value: unknown,
): AgentRuntimeEvidenceLimeCorePolicyItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const refs = readStringListField(value, "refs");
  const evaluatedRefs = readStringListField(
    value,
    "evaluatedRefs",
    "evaluated_refs",
  );
  const unresolvedRefs = readStringListField(
    value,
    "unresolvedRefs",
    "unresolved_refs",
  );
  const missingInputs = readStringListField(
    value,
    "missingInputs",
    "missing_inputs",
  );
  const policyInputs = readArrayField(value, "policyInputs", "policy_inputs")
    .map((entry: unknown) => normalizeLimeCorePolicyInput(entry))
    .filter(Boolean) as AgentRuntimeEvidenceLimeCorePolicyInput[];
  const pendingHitRefs = readStringListField(
    value,
    "pendingHitRefs",
    "pending_hit_refs",
  );
  const policyValueHits = readArrayField(
    value,
    "policyValueHits",
    "policy_value_hits",
  )
    .map((entry: unknown) => normalizeLimeCorePolicyValueHit(entry))
    .filter(Boolean) as AgentRuntimeEvidenceLimeCorePolicyValueHit[];
  const hasPolicyValueHitsField =
    "policyValueHits" in value || "policy_value_hits" in value;
  const policyValueHitCount =
    readOptionalNumberField(
      value,
      "policyValueHitCount",
      "policy_value_hit_count",
    ) ?? (hasPolicyValueHitsField ? policyValueHits.length : undefined);
  const policyEvaluation = normalizeLimeCorePolicyEvaluation(
    value.policyEvaluation ?? value.policy_evaluation,
  );
  const item: AgentRuntimeEvidenceLimeCorePolicyItem = {
    artifact_path: readOptionalStringField(
      value,
      "artifactPath",
      "artifact_path",
    ),
    contract_key: readOptionalStringField(value, "contractKey", "contract_key"),
    execution_profile_key: readOptionalStringField(
      value,
      "executionProfileKey",
      "execution_profile_key",
    ),
    executor_adapter_key: readOptionalStringField(
      value,
      "executorAdapterKey",
      "executor_adapter_key",
    ),
    refs,
    status: readOptionalStringField(value, "status"),
    decision: readOptionalStringField(value, "decision"),
    decision_source: readOptionalStringField(
      value,
      "decisionSource",
      "decision_source",
    ),
    decision_scope: readOptionalStringField(
      value,
      "decisionScope",
      "decision_scope",
    ),
    decision_reason: readOptionalStringField(
      value,
      "decisionReason",
      "decision_reason",
    ),
    ...(evaluatedRefs.length > 0 ? { evaluated_refs: evaluatedRefs } : {}),
    ...(unresolvedRefs.length > 0 ? { unresolved_refs: unresolvedRefs } : {}),
    ...(missingInputs.length > 0 ? { missing_inputs: missingInputs } : {}),
    ...(policyInputs.length > 0 ? { policy_inputs: policyInputs } : {}),
    ...(pendingHitRefs.length > 0 ? { pending_hit_refs: pendingHitRefs } : {}),
    ...(hasPolicyValueHitsField ? { policy_value_hits: policyValueHits } : {}),
    ...(policyValueHitCount !== undefined
      ? { policy_value_hit_count: policyValueHitCount }
      : {}),
    ...(policyEvaluation ? { policy_evaluation: policyEvaluation } : {}),
    source: readOptionalStringField(value, "source"),
  };

  const hasReadableField =
    refs.length > 0 ||
    Object.entries(item).some(
      ([key, field]) => key !== "refs" && field !== undefined && field !== "",
    );

  return hasReadableField ? item : null;
}

function normalizeLimeCorePolicyEvaluation(
  value: unknown,
): AgentRuntimeEvidenceLimeCorePolicyEvaluation | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const evaluation: AgentRuntimeEvidenceLimeCorePolicyEvaluation = {
    status: readOptionalStringField(value, "status"),
    decision: readOptionalStringField(value, "decision"),
    decision_source: readOptionalStringField(
      value,
      "decisionSource",
      "decision_source",
    ),
    decision_scope: readOptionalStringField(
      value,
      "decisionScope",
      "decision_scope",
    ),
    decision_reason: readOptionalStringField(
      value,
      "decisionReason",
      "decision_reason",
    ),
    blocking_refs: readStringListField(value, "blockingRefs", "blocking_refs"),
    ask_refs: readStringListField(value, "askRefs", "ask_refs"),
    pending_refs: readStringListField(value, "pendingRefs", "pending_refs"),
  };

  return Object.values(evaluation).some((field) =>
    Array.isArray(field) ? field.length > 0 : Boolean(field),
  )
    ? evaluation
    : undefined;
}

function normalizeLimeCorePolicyInput(
  value: unknown,
): AgentRuntimeEvidenceLimeCorePolicyInput | null {
  if (!isRecord(value)) {
    return null;
  }

  const refKey =
    readOptionalStringField(value, "refKey", "ref_key") ??
    readOptionalStringField(value, "ref");
  if (!refKey) {
    return null;
  }

  return {
    ref_key: refKey,
    status: readOptionalStringField(value, "status"),
    source: readOptionalStringField(value, "source"),
    value_source: readOptionalStringField(value, "valueSource", "value_source"),
  };
}

function normalizeLimeCorePolicyValueHit(
  value: unknown,
): AgentRuntimeEvidenceLimeCorePolicyValueHit | null {
  if (!isRecord(value)) {
    return null;
  }

  const refKey =
    readOptionalStringField(value, "refKey", "ref_key") ??
    readOptionalStringField(value, "ref");
  if (!refKey) {
    return null;
  }

  return {
    ref_key: refKey,
    status: readOptionalStringField(value, "status"),
    source: readOptionalStringField(value, "source"),
    value_source: readOptionalStringField(value, "valueSource", "value_source"),
    value:
      value.value !== undefined
        ? value.value
        : value.policyValue !== undefined
          ? value.policyValue
          : value.policy_value,
    summary: readOptionalStringField(value, "summary"),
    evidence_ref: readOptionalStringField(value, "evidenceRef", "evidence_ref"),
    observed_at: readOptionalStringField(value, "observedAt", "observed_at"),
  };
}

function normalizeLimeCorePolicyIndex(
  value: unknown,
): AgentRuntimeEvidenceLimeCorePolicyIndex | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const rawStatusCounts = readArrayField(
    value,
    "statusCounts",
    "status_counts",
  );
  const rawDecisionCounts = readArrayField(
    value,
    "decisionCounts",
    "decision_counts",
  );
  const rawItems = readArrayField(value, "items");
  const index: AgentRuntimeEvidenceLimeCorePolicyIndex = {
    snapshot_count: readNumberField(value, "snapshotCount", "snapshot_count"),
    ref_keys: readStringListField(value, "refKeys", "ref_keys"),
    missing_inputs: readStringListField(
      value,
      "missingInputs",
      "missing_inputs",
    ),
    pending_hit_refs: readStringListField(
      value,
      "pendingHitRefs",
      "pending_hit_refs",
    ),
    policy_value_hit_count: readNumberField(
      value,
      "policyValueHitCount",
      "policy_value_hit_count",
    ),
    status_counts: rawStatusCounts
      .map((entry: unknown) => normalizeEvidenceStatusCount(entry))
      .filter(Boolean) as AgentRuntimeEvidenceStatusCount[],
    decision_counts: rawDecisionCounts
      .map((entry: unknown) => normalizeEvidenceDecisionCount(entry))
      .filter(Boolean) as AgentRuntimeEvidenceDecisionCount[],
    items: rawItems
      .map((entry: unknown) => normalizeLimeCorePolicyItem(entry))
      .filter(Boolean) as AgentRuntimeEvidenceLimeCorePolicyItem[],
  };

  if (
    index.snapshot_count === 0 &&
    index.ref_keys.length === 0 &&
    (index.missing_inputs?.length ?? 0) === 0 &&
    (index.pending_hit_refs?.length ?? 0) === 0 &&
    (index.policy_value_hit_count ?? 0) === 0 &&
    index.status_counts.length === 0 &&
    index.decision_counts.length === 0 &&
    index.items.length === 0
  ) {
    return undefined;
  }

  return index;
}

export function normalizeEvidenceModalityRuntimeContracts(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  const snapshotIndexRecord = readRecordField(
    value,
    "snapshotIndex",
    "snapshot_index",
  );
  const taskIndex = normalizeTaskIndex(
    snapshotIndexRecord
      ? readRecordField(snapshotIndexRecord, "taskIndex", "task_index")
      : undefined,
  );
  const browserActionIndex = normalizeBrowserActionIndex(
    snapshotIndexRecord
      ? readRecordField(
          snapshotIndexRecord,
          "browserActionIndex",
          "browser_action_index",
        )
      : undefined,
  );
  const limeCorePolicyIndex = normalizeLimeCorePolicyIndex(
    snapshotIndexRecord
      ? readRecordField(
          snapshotIndexRecord,
          "limecorePolicyIndex",
          "limecore_policy_index",
        )
      : undefined,
  );
  const snapshotCount = readNumberField(
    value,
    "snapshotCount",
    "snapshot_count",
  );

  if (
    snapshotCount === 0 &&
    !taskIndex &&
    !browserActionIndex &&
    !limeCorePolicyIndex
  ) {
    return undefined;
  }
  const snapshotIndex =
    taskIndex || browserActionIndex || limeCorePolicyIndex
      ? {
          ...(taskIndex ? { task_index: taskIndex } : {}),
          ...(browserActionIndex
            ? { browser_action_index: browserActionIndex }
            : {}),
          ...(limeCorePolicyIndex
            ? { limecore_policy_index: limeCorePolicyIndex }
            : {}),
        }
      : undefined;

  return {
    snapshot_count: snapshotCount,
    snapshot_index: snapshotIndex,
  };
}
