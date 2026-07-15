import type {
  AgentRuntimeEvidenceMcpResourceContentRef,
  AgentRuntimeEvidenceMcpResourceRead,
  AgentRuntimeEvidenceMcpToolResult,
  AgentRuntimeEvidenceSkillInvocation,
  AgentRuntimeEvidenceSkillSearch,
} from "./evidenceTypes";
import { normalizeEvidenceModalityRuntimeContracts } from "./evidenceIndexNormalizers";
import { normalizeEvidenceVerificationSummary } from "./evidenceVerificationNormalizers";
import {
  isRecord,
  readNumberField,
  readOptionalBooleanField,
  readOptionalNumberField,
  readOptionalStringField,
  readRecordField,
  readStringField,
  readStringListField,
} from "./normalizerUtils";

function normalizeEvidenceSignalCoverageEntry(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  return {
    signal: readStringField(value, "signal"),
    status: readStringField(value, "status"),
    source: readStringField(value, "source"),
    detail: readStringField(value, "detail"),
  };
}

function normalizeEvidenceSkillInvocation(
  value: unknown,
): AgentRuntimeEvidenceSkillInvocation | null {
  if (!isRecord(value)) {
    return null;
  }

  const skillName = readStringField(value, "skillName", "skill_name");
  if (!skillName) {
    return null;
  }

  return {
    event: readStringField(value, "event") || "skill_invocation",
    skill_name: skillName,
    status: readStringField(value, "status"),
    source_event_id: readStringField(value, "sourceEventId", "source_event_id"),
    source_event_type: readStringField(
      value,
      "sourceEventType",
      "source_event_type",
    ),
    turn_id: readOptionalStringField(value, "turnId", "turn_id"),
    tool_call_id: readOptionalStringField(value, "toolCallId", "tool_call_id"),
    workspace_skill_source: readRecordField(
      value,
      "workspaceSkillSource",
      "workspace_skill_source",
    ),
    workspace_skill_runtime_enable: readRecordField(
      value,
      "workspaceSkillRuntimeEnable",
      "workspace_skill_runtime_enable",
    ),
    modality_runtime_contract: readRecordField(
      value,
      "modalityRuntimeContract",
      "modality_runtime_contract",
    ),
  };
}

function normalizeEvidenceSkillSearch(
  value: unknown,
): AgentRuntimeEvidenceSkillSearch | null {
  if (!isRecord(value)) {
    return null;
  }

  const sourceEventId = readStringField(
    value,
    "sourceEventId",
    "source_event_id",
  );
  if (!sourceEventId) {
    return null;
  }

  return {
    event: readStringField(value, "event") || "skill_search",
    query: readOptionalStringField(value, "query"),
    result_count: readOptionalNumberField(value, "resultCount", "result_count"),
    snapshot_skill_count: readOptionalNumberField(
      value,
      "snapshotSkillCount",
      "snapshot_skill_count",
    ),
    status: readStringField(value, "status"),
    source_event_id: sourceEventId,
    source_event_type: readStringField(
      value,
      "sourceEventType",
      "source_event_type",
    ),
    turn_id: readOptionalStringField(value, "turnId", "turn_id"),
    tool_call_id: readOptionalStringField(value, "toolCallId", "tool_call_id"),
  };
}

function normalizeEvidenceMcpToolResult(
  value: unknown,
): AgentRuntimeEvidenceMcpToolResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const toolName = readStringField(value, "toolName", "tool_name");
  const sourceEventId = readStringField(
    value,
    "sourceEventId",
    "source_event_id",
  );
  if (!toolName || !sourceEventId) {
    return null;
  }

  return {
    event: readStringField(value, "event") || "mcp_tool_result",
    tool_name: toolName,
    status: readStringField(value, "status"),
    source_event_id: sourceEventId,
    source_event_type: readStringField(
      value,
      "sourceEventType",
      "source_event_type",
    ),
    has_structured_content:
      readOptionalBooleanField(
        value,
        "hasStructuredContent",
        "has_structured_content",
      ) ?? false,
    structured_content_keys: readStringListField(
      value,
      "structuredContentKeys",
      "structured_content_keys",
    ),
    turn_id: readOptionalStringField(value, "turnId", "turn_id"),
    tool_call_id: readOptionalStringField(value, "toolCallId", "tool_call_id"),
  };
}

function normalizeEvidenceMcpResourceContentRef(
  value: unknown,
): AgentRuntimeEvidenceMcpResourceContentRef | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    index: readNumberField(value, "index"),
    type: readOptionalStringField(value, "type"),
    uri: readOptionalStringField(value, "uri"),
    mime_type: readOptionalStringField(value, "mimeType", "mime_type"),
    text_char_count: readOptionalNumberField(
      value,
      "textCharCount",
      "text_char_count",
    ),
    blob_base64_bytes: readOptionalNumberField(
      value,
      "blobBase64Bytes",
      "blob_base64_bytes",
    ),
  };
}

function normalizeEvidenceMcpResourceRead(
  value: unknown,
): AgentRuntimeEvidenceMcpResourceRead | null {
  if (!isRecord(value)) {
    return null;
  }

  const uri = readStringField(value, "uri");
  const sourceEventId = readStringField(
    value,
    "sourceEventId",
    "source_event_id",
  );
  if (!uri || !sourceEventId) {
    return null;
  }

  const rawContentRefs = value.contentRefs ?? value.content_refs;
  const contentRefs = Array.isArray(rawContentRefs)
    ? rawContentRefs
        .map((entry: unknown) => normalizeEvidenceMcpResourceContentRef(entry))
        .filter(
          (
            entry,
          ): entry is NonNullable<
            ReturnType<typeof normalizeEvidenceMcpResourceContentRef>
          > => entry !== null,
        )
    : [];

  return {
    event: readStringField(value, "event") || "mcp_resource_read",
    tool_name:
      readStringField(value, "toolName", "tool_name") || "ReadMcpResourceTool",
    uri,
    server: readOptionalStringField(value, "server"),
    status: readStringField(value, "status"),
    source_event_id: sourceEventId,
    source_event_type: readStringField(
      value,
      "sourceEventType",
      "source_event_type",
    ),
    mime_types: readStringListField(value, "mimeTypes", "mime_types"),
    content_count: readOptionalNumberField(
      value,
      "contentCount",
      "content_count",
    ),
    content_refs: contentRefs,
    turn_id: readOptionalStringField(value, "turnId", "turn_id"),
    tool_call_id: readOptionalStringField(value, "toolCallId", "tool_call_id"),
  };
}

export function normalizeEvidenceObservabilitySummary(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  const rawSignalCoverage = value.signalCoverage ?? value.signal_coverage;
  const signalCoverage = Array.isArray(rawSignalCoverage)
    ? rawSignalCoverage
        .map((entry: unknown) => normalizeEvidenceSignalCoverageEntry(entry))
        .filter(
          (
            entry,
          ): entry is NonNullable<
            ReturnType<typeof normalizeEvidenceSignalCoverageEntry>
          > => entry !== null,
        )
    : [];
  const verificationSummary = normalizeEvidenceVerificationSummary(
    value.verificationSummary ?? value.verification_summary,
  );
  const schemaVersion = readOptionalStringField(
    value,
    "schemaVersion",
    "schema_version",
  );
  const knownGaps = readStringListField(value, "knownGaps", "known_gaps");
  const modalityRuntimeContracts = normalizeEvidenceModalityRuntimeContracts(
    readRecordField(
      value,
      "modalityRuntimeContracts",
      "modality_runtime_contracts",
    ),
  );
  const rawSkillInvocations = value.skillInvocations ?? value.skill_invocations;
  const skillInvocations = Array.isArray(rawSkillInvocations)
    ? rawSkillInvocations
        .map((entry: unknown) => normalizeEvidenceSkillInvocation(entry))
        .filter(
          (
            entry,
          ): entry is NonNullable<
            ReturnType<typeof normalizeEvidenceSkillInvocation>
          > => entry !== null,
        )
    : [];
  const rawSkillSearches = value.skillSearches ?? value.skill_searches;
  const skillSearches = Array.isArray(rawSkillSearches)
    ? rawSkillSearches
        .map((entry: unknown) => normalizeEvidenceSkillSearch(entry))
        .filter(
          (
            entry,
          ): entry is NonNullable<
            ReturnType<typeof normalizeEvidenceSkillSearch>
          > => entry !== null,
        )
    : [];
  const rawMcpToolResults = value.mcpToolResults ?? value.mcp_tool_results;
  const mcpToolResults = Array.isArray(rawMcpToolResults)
    ? rawMcpToolResults
        .map((entry: unknown) => normalizeEvidenceMcpToolResult(entry))
        .filter(
          (
            entry,
          ): entry is NonNullable<
            ReturnType<typeof normalizeEvidenceMcpToolResult>
          > => entry !== null,
        )
    : [];
  const rawMcpResourceReads =
    value.mcpResourceReads ?? value.mcp_resource_reads;
  const mcpResourceReads = Array.isArray(rawMcpResourceReads)
    ? rawMcpResourceReads
        .map((entry: unknown) => normalizeEvidenceMcpResourceRead(entry))
        .filter(
          (
            entry,
          ): entry is NonNullable<
            ReturnType<typeof normalizeEvidenceMcpResourceRead>
          > => entry !== null,
        )
    : [];

  if (
    !schemaVersion &&
    signalCoverage.length === 0 &&
    knownGaps.length === 0 &&
    !verificationSummary &&
    !modalityRuntimeContracts &&
    skillInvocations.length === 0 &&
    skillSearches.length === 0 &&
    mcpToolResults.length === 0 &&
    mcpResourceReads.length === 0
  ) {
    return undefined;
  }

  return {
    schema_version: schemaVersion,
    known_gaps: knownGaps,
    signal_coverage: signalCoverage,
    verification_summary: verificationSummary,
    modality_runtime_contracts: modalityRuntimeContracts,
    skill_invocations: skillInvocations,
    skill_searches: skillSearches,
    mcp_tool_results: mcpToolResults,
    mcp_resource_reads: mcpResourceReads,
  };
}
