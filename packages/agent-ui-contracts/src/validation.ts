import type { AgentUiFixture } from "./fixtures";
import type { AgentUiProjectionState } from "./projection";
import type {
  AgentRuntimeCapabilityManifest,
  AgentRuntimeResumeContract,
} from "./capabilities";
import type {
  AgentRuntimeExecutionEvent,
  AgentRuntimeReadModel,
} from "./runtime";
import { verifyRuntimeEventSequence } from "./sequenceVerifier.js";

export type AgentUiContractValidationCode =
  | "schema_mismatch"
  | "missing_scope_id"
  | "sequence_gap"
  | "sequence_violation"
  | "secret_leak_risk"
  | "large_payload_inline"
  | "unknown_event_type";

export interface AgentUiContractValidationIssue {
  code: AgentUiContractValidationCode;
  path: string;
  message: string;
}

export class AgentUiContractValidationError extends Error {
  readonly issues: AgentUiContractValidationIssue[];

  constructor(issues: AgentUiContractValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "AgentUiContractValidationError";
    this.issues = issues;
  }
}

export function validateRuntimeEvent(
  input: unknown,
): AgentRuntimeExecutionEvent {
  const issues = collectRuntimeEventValidationIssues(input);
  throwIfIssues(issues);
  return input as AgentRuntimeExecutionEvent;
}

export function validateThreadReadModel(
  input: unknown,
): AgentRuntimeReadModel {
  const issues = collectThreadReadModelValidationIssues(input);
  throwIfIssues(issues);
  return input as AgentRuntimeReadModel;
}

export function validateProjectionState(
  input: unknown,
): AgentUiProjectionState {
  const issues = collectProjectionStateValidationIssues(input);
  throwIfIssues(issues);
  return input as AgentUiProjectionState;
}

export function validateAgentUiFixture(input: unknown): AgentUiFixture {
  const issues = collectAgentUiFixtureValidationIssues(input);
  throwIfIssues(issues);
  return input as AgentUiFixture;
}

export function validateRuntimeCapabilityManifest(
  input: unknown,
): AgentRuntimeCapabilityManifest {
  const issues = collectRuntimeCapabilityManifestValidationIssues(input);
  throwIfIssues(issues);
  return input as AgentRuntimeCapabilityManifest;
}

export function validateRuntimeResumeContract(
  input: unknown,
): AgentRuntimeResumeContract {
  const issues = collectRuntimeResumeContractValidationIssues(input);
  throwIfIssues(issues);
  return input as AgentRuntimeResumeContract;
}

export function collectRuntimeEventValidationIssues(
  input: unknown,
  path = "$",
): AgentUiContractValidationIssue[] {
  const issues: AgentUiContractValidationIssue[] = [];

  if (!isRecord(input)) {
    return [
      issue("schema_mismatch", path, "Runtime event must be an object."),
    ];
  }

  requireString(input, "id", path, issues);
  requireString(input, "schemaVersion", path, issues);
  requireString(input, "runtimeId", path, issues);
  requireString(input, "kind", path, issues);
  requireString(input, "status", path, issues);
  requireString(input, "title", path, issues);
  requireString(input, "createdAt", path, issues);

  if (!Number.isInteger(input.sequence)) {
    issues.push(
      issue(
        "schema_mismatch",
        `${path}.sequence`,
        "Runtime event sequence must be an integer.",
      ),
    );
  }

  if (typeof input.eventClass === "string") {
    collectLegacyTurnTerminalIssues(input.eventClass, `${path}.eventClass`, issues);
    collectScopeIssues(input, path, issues);
  }

  collectPayloadIssues(input.payload, `${path}.payload`, issues);
  return issues;
}

export function collectThreadReadModelValidationIssues(
  input: unknown,
  path = "$",
): AgentUiContractValidationIssue[] {
  const issues: AgentUiContractValidationIssue[] = [];

  if (!isRecord(input)) {
    return [
      issue("schema_mismatch", path, "Thread read model must be an object."),
    ];
  }

  requireArray(input, "events", path, issues);
  if (Array.isArray(input.events)) {
    input.events.forEach((item, index) => {
      collectRuntimeEventProjectionValidationIssues(
        item,
        `${path}.events[${index}]`,
        issues,
      );
    });
  }
  requireArray(input, "visibleEvents", path, issues);
  if (Array.isArray(input.visibleEvents)) {
    input.visibleEvents.forEach((item, index) => {
      collectRuntimeEventProjectionValidationIssues(
        item,
        `${path}.visibleEvents[${index}]`,
        issues,
      );
    });
  }
  requireArray(input, "pendingActions", path, issues);
  if (Array.isArray(input.pendingActions)) {
    input.pendingActions.forEach((item, index) => {
      collectRuntimeEventProjectionValidationIssues(
        item,
        `${path}.pendingActions[${index}]`,
        issues,
      );
    });
  }
  requireBoolean(input, "inputSourceRecovery", path, issues);
  requireNumber(input, "sourceCount", path, issues);
  requireStringArray(input, "artifactRefs", path, issues);
  requireStringArray(input, "evidenceRefs", path, issues);
  requireStringArray(input, "taskRefs", path, issues);

  return issues;
}

export function collectProjectionStateValidationIssues(
  input: unknown,
  path = "$",
): AgentUiContractValidationIssue[] {
  const issues: AgentUiContractValidationIssue[] = [];

  if (!isRecord(input)) {
    return [
      issue("schema_mismatch", path, "Projection state must be an object."),
    ];
  }

  requireRecord(input, "runtime", path, issues);
  requireArray(input, "messages", path, issues);
  if (Array.isArray(input.messages)) {
    input.messages.forEach((item, index) => {
      collectMessagePartValidationIssues(
        item,
        `${path}.messages[${index}]`,
        issues,
      );
    });
  }
  requireArray(input, "timeline", path, issues);
  if (Array.isArray(input.timeline)) {
    input.timeline.forEach((item, index) => {
      collectTimelineEntryValidationIssues(
        item,
        `${path}.timeline[${index}]`,
        issues,
      );
    });
  }
  requireArray(input, "graph", path, issues);
  if (Array.isArray(input.graph)) {
    input.graph.forEach((item, index) => {
      collectGraphNodeValidationIssues(item, `${path}.graph[${index}]`, issues);
    });
  }
  requireArray(input, "tools", path, issues);
  if (Array.isArray(input.tools)) {
    input.tools.forEach((item, index) => {
      collectRuntimeEventProjectionValidationIssues(
        item,
        `${path}.tools[${index}]`,
        issues,
      );
    });
  }
  requireArray(input, "actions", path, issues);
  if (Array.isArray(input.actions)) {
    input.actions.forEach((item, index) => {
      collectRuntimeEventProjectionValidationIssues(
        item,
        `${path}.actions[${index}]`,
        issues,
      );
    });
  }
  requireArray(input, "artifacts", path, issues);
  if (Array.isArray(input.artifacts)) {
    input.artifacts.forEach((item, index) => {
      collectRefValidationIssues(item, `${path}.artifacts[${index}]`, issues);
    });
  }
  requireArray(input, "evidence", path, issues);
  if (Array.isArray(input.evidence)) {
    input.evidence.forEach((item, index) => {
      collectRefValidationIssues(item, `${path}.evidence[${index}]`, issues);
    });
  }
  requireArray(input, "diagnostics", path, issues);
  if (Array.isArray(input.diagnostics)) {
    input.diagnostics.forEach((item, index) => {
      collectDiagnosticValidationIssues(
        item,
        `${path}.diagnostics[${index}]`,
        issues,
      );
    });
  }
  requireRecord(input, "subagents", path, issues);
  if (isRecord(input.subagents)) {
    collectSubagentsValidationIssues(
      input.subagents,
      `${path}.subagents`,
      issues,
    );
  }
  requireRecord(input, "readModel", path, issues);
  if (isRecord(input.readModel)) {
    issues.push(
      ...collectThreadReadModelValidationIssues(
        input.readModel,
        `${path}.readModel`,
      ),
    );
  }
  requireRecord(input, "hydration", path, issues);
  if (isRecord(input.hydration)) {
    requireString(input.hydration, "status", `${path}.hydration`, issues);
    requireNumber(input.hydration, "eventCount", `${path}.hydration`, issues);
  }
  requireRecord(input, "ephemeralUi", path, issues);

  return issues;
}

export function collectRuntimeCapabilityManifestValidationIssues(
  input: unknown,
  path = "$",
): AgentUiContractValidationIssue[] {
  const issues: AgentUiContractValidationIssue[] = [];

  if (!isRecord(input)) {
    return [
      issue("schema_mismatch", path, "Capability manifest must be an object."),
    ];
  }

  requireString(input, "schemaVersion", path, issues);
  requireString(input, "runtimeId", path, issues);
  requireString(input, "generatedAt", path, issues);
  optionalString(input, "providerId", path, issues);
  optionalString(input, "sessionId", path, issues);
  requireArray(input, "capabilities", path, issues);
  if (Array.isArray(input.capabilities)) {
    input.capabilities.forEach((capability, index) => {
      collectCapabilityEntryValidationIssues(
        capability,
        `${path}.capabilities[${index}]`,
        issues,
      );
    });
  }

  return issues;
}

export function collectRuntimeResumeContractValidationIssues(
  input: unknown,
  path = "$",
): AgentUiContractValidationIssue[] {
  const issues: AgentUiContractValidationIssue[] = [];

  if (!isRecord(input)) {
    return [
      issue("schema_mismatch", path, "Resume contract must be an object."),
    ];
  }

  requireString(input, "schemaVersion", path, issues);
  requireString(input, "runtimeId", path, issues);
  requireString(input, "sessionId", path, issues);
  requireString(input, "turnId", path, issues);
  requireString(input, "resumeMode", path, issues);
  requireString(input, "createdAt", path, issues);
  optionalString(input, "expiresAt", path, issues);
  requireStringArray(input, "openActionIds", path, issues);
  requireArray(input, "decisions", path, issues);
  if (Array.isArray(input.decisions)) {
    input.decisions.forEach((decision, index) => {
      collectResumeDecisionValidationIssues(
        decision,
        `${path}.decisions[${index}]`,
        issues,
      );
    });
  }

  collectResumeCoverageIssues(input, path, issues);
  return issues;
}

function collectMessagePartValidationIssues(
  input: unknown,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (!isRecord(input)) {
    issues.push(issue("schema_mismatch", path, "Message part must be an object."));
    return;
  }
  requireString(input, "type", path, issues);
  requireString(input, "partId", path, issues);
  requireString(input, "sourceEventId", path, issues);
  optionalString(input, "messageId", path, issues);
  optionalString(input, "role", path, issues);
  optionalString(input, "text", path, issues);
  optionalString(input, "state", path, issues);
  optionalString(input, "toolCallId", path, issues);
  optionalString(input, "artifactId", path, issues);
  optionalString(input, "evidenceId", path, issues);
  optionalString(input, "diagnosticId", path, issues);
  optionalString(input, "createdAt", path, issues);
  requireStringArray(input, "refs", path, issues);
}

function collectCapabilityEntryValidationIssues(
  input: unknown,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (!isRecord(input)) {
    issues.push(issue("schema_mismatch", path, "Capability entry must be an object."));
    return;
  }
  requireString(input, "id", path, issues);
  requireString(input, "status", path, issues);
  requireString(input, "scope", path, issues);
  requireString(input, "title", path, issues);
  optionalString(input, "detail", path, issues);
  optionalString(input, "version", path, issues);
  if ("metadata" in input && input.metadata !== undefined) {
    requireRecord(input, "metadata", path, issues);
    collectPayloadIssues(input.metadata, `${path}.metadata`, issues);
  }
}

function collectResumeDecisionValidationIssues(
  input: unknown,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (!isRecord(input)) {
    issues.push(issue("schema_mismatch", path, "Resume decision must be an object."));
    return;
  }
  requireString(input, "actionId", path, issues);
  requireString(input, "decision", path, issues);
  if ("metadata" in input && input.metadata !== undefined) {
    requireRecord(input, "metadata", path, issues);
    collectPayloadIssues(input.metadata, `${path}.metadata`, issues);
  }
}

function collectResumeCoverageIssues(
  input: Record<string, unknown>,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (!Array.isArray(input.openActionIds) || !Array.isArray(input.decisions)) {
    return;
  }
  const openActionIds = input.openActionIds.filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const decisionIds = new Set(
    input.decisions
      .filter(isRecord)
      .map((decision) => decision.actionId)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  const resumeMode =
    typeof input.resumeMode === "string" ? input.resumeMode : undefined;
  if (
    resumeMode !== "all-open-actions" &&
    resumeMode !== "selected-actions"
  ) {
    return;
  }
  const missing = openActionIds.filter((actionId) => !decisionIds.has(actionId));
  if (missing.length === 0) {
    return;
  }
  issues.push(
    issue(
      "schema_mismatch",
      `${path}.decisions`,
      `Resume contract must cover open actions: ${missing.join(", ")}.`,
    ),
  );
}

function collectTimelineEntryValidationIssues(
  input: unknown,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (!isRecord(input)) {
    issues.push(issue("schema_mismatch", path, "Timeline entry must be an object."));
    return;
  }
  requireString(input, "entryId", path, issues);
  requireString(input, "kind", path, issues);
  requireString(input, "status", path, issues);
  requireString(input, "title", path, issues);
  requireString(input, "sourceEventId", path, issues);
  requireString(input, "createdAt", path, issues);
  optionalString(input, "phase", path, issues);
  optionalString(input, "owner", path, issues);
  optionalString(input, "detail", path, issues);
  optionalString(input, "completedAt", path, issues);
  requireStringArray(input, "refs", path, issues);
  if ("sequence" in input && input.sequence !== undefined) {
    requireNumber(input, "sequence", path, issues);
  }
}

function collectGraphNodeValidationIssues(
  input: unknown,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (!isRecord(input)) {
    issues.push(issue("schema_mismatch", path, "Graph node must be an object."));
    return;
  }
  requireString(input, "nodeId", path, issues);
  requireString(input, "nodeType", path, issues);
  requireString(input, "status", path, issues);
  requireString(input, "title", path, issues);
  optionalString(input, "parentId", path, issues);
  optionalString(input, "createdAt", path, issues);
  optionalString(input, "completedAt", path, issues);
  requireStringArray(input, "refs", path, issues);
  requireStringArray(input, "sourceEventIds", path, issues);
}

function collectRuntimeEventProjectionValidationIssues(
  input: unknown,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (!isRecord(input)) {
    issues.push(issue("schema_mismatch", path, "Runtime projection event must be an object."));
    return;
  }
  requireString(input, "id", path, issues);
  requireRecord(input, "source", path, issues);
  requireString(input, "surface", path, issues);
  requireString(input, "title", path, issues);
  requireString(input, "status", path, issues);
  requireString(input, "displayStatusKey", path, issues);
  requireBoolean(input, "resolved", path, issues);
  requireString(input, "actionKind", path, issues);
  requireString(input, "targetModule", path, issues);
  optionalString(input, "detail", path, issues);
  optionalString(input, "actionId", path, issues);
  if (isRecord(input.source)) {
    issues.push(...collectRuntimeEventValidationIssues(input.source, `${path}.source`));
  }
}

function collectRefValidationIssues(
  input: unknown,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (!isRecord(input)) {
    issues.push(issue("schema_mismatch", path, "Runtime ref must be an object."));
    return;
  }
  requireString(input, "id", path, issues);
  requireString(input, "sourceEventId", path, issues);
  optionalString(input, "title", path, issues);
  optionalString(input, "status", path, issues);
  optionalString(input, "owner", path, issues);
  optionalString(input, "path", path, issues);
  optionalString(input, "contentRef", path, issues);
  optionalString(input, "mimeType", path, issues);
  optionalString(input, "preview", path, issues);
  if (typeof input.preview === "string" && input.preview.length > 512) {
    issues.push(
      issue(
        "large_payload_inline",
        `${path}.preview`,
        "Runtime ref preview must stay small; store large content behind contentRef.",
      ),
    );
  }
  if ("metadata" in input && input.metadata !== undefined) {
    requireRecord(input, "metadata", path, issues);
    collectPayloadIssues(input.metadata, `${path}.metadata`, issues);
  }
}

function collectDiagnosticValidationIssues(
  input: unknown,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (!isRecord(input)) {
    issues.push(issue("schema_mismatch", path, "Diagnostic must be an object."));
    return;
  }
  requireString(input, "id", path, issues);
  requireString(input, "sourceEventId", path, issues);
  requireString(input, "title", path, issues);
  requireString(input, "status", path, issues);
  optionalString(input, "detail", path, issues);
}

function collectSubagentsValidationIssues(
  input: Record<string, unknown>,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  requireBoolean(input, "hasSubagents", path, issues);
  requireArray(input, "threads", path, issues);
  requireArray(input, "delegationCalls", path, issues);
  requireArray(input, "activities", path, issues);
  requireStringArray(input, "activeThreadIds", path, issues);
  requireStringArray(input, "completedThreadIds", path, issues);
  requireStringArray(input, "failedThreadIds", path, issues);

  if (Array.isArray(input.threads)) {
    input.threads.forEach((item, index) => {
      collectSubagentThreadValidationIssues(
        item,
        `${path}.threads[${index}]`,
        issues,
      );
    });
  }
  if (Array.isArray(input.delegationCalls)) {
    input.delegationCalls.forEach((item, index) => {
      collectSubagentDelegationValidationIssues(
        item,
        `${path}.delegationCalls[${index}]`,
        issues,
      );
    });
  }
  if (Array.isArray(input.activities)) {
    input.activities.forEach((item, index) => {
      collectSubagentActivityValidationIssues(
        item,
        `${path}.activities[${index}]`,
        issues,
      );
    });
  }
}

function collectSubagentThreadValidationIssues(
  input: unknown,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (!isRecord(input)) {
    issues.push(issue("schema_mismatch", path, "Subagent thread must be an object."));
    return;
  }
  requireString(input, "threadId", path, issues);
  requireString(input, "subagentId", path, issues);
  requireString(input, "status", path, issues);
  requireString(input, "title", path, issues);
  optionalString(input, "parentThreadId", path, issues);
  optionalString(input, "parentTaskId", path, issues);
  optionalString(input, "taskId", path, issues);
  optionalString(input, "taskPath", path, issues);
  optionalString(input, "role", path, issues);
  optionalString(input, "nickname", path, issues);
  optionalString(input, "summary", path, issues);
  optionalString(input, "promptPreview", path, issues);
  optionalString(input, "lastActivityAt", path, issues);
  optionalString(input, "createdAt", path, issues);
  optionalString(input, "completedAt", path, issues);
  requireStringArray(input, "artifactRefs", path, issues);
  requireStringArray(input, "evidenceRefs", path, issues);
  requireStringArray(input, "sourceEventIds", path, issues);
  if ("isolation" in input && input.isolation !== undefined) {
    requireRecord(input, "isolation", path, issues);
    if (isRecord(input.isolation)) {
      collectSubagentIsolationValidationIssues(
        input.isolation,
        `${path}.isolation`,
        issues,
      );
    }
  }
}

function collectSubagentIsolationValidationIssues(
  input: Record<string, unknown>,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  optionalString(input, "runtimeProfileId", path, issues);
  optionalString(input, "modelProfileId", path, issues);
  optionalString(input, "isolationProfileId", path, issues);
  optionalString(input, "workspaceRef", path, issues);
  optionalString(input, "permissionProfile", path, issues);
  optionalString(input, "sandboxProfile", path, issues);
  optionalString(input, "forkPolicy", path, issues);
  if ("depth" in input && input.depth !== undefined) {
    requireNumber(input, "depth", path, issues);
  }
  if ("canDelegate" in input && input.canDelegate !== undefined) {
    requireBoolean(input, "canDelegate", path, issues);
  }
}

function collectSubagentDelegationValidationIssues(
  input: unknown,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (!isRecord(input)) {
    issues.push(issue("schema_mismatch", path, "Subagent delegation must be an object."));
    return;
  }
  requireString(input, "callId", path, issues);
  requireString(input, "sourceEventId", path, issues);
  requireString(input, "action", path, issues);
  requireString(input, "status", path, issues);
  requireString(input, "title", path, issues);
  optionalString(input, "parentThreadId", path, issues);
  optionalString(input, "promptPreview", path, issues);
  optionalString(input, "createdAt", path, issues);
  optionalString(input, "completedAt", path, issues);
  requireStringArray(input, "targetThreadIds", path, issues);
}

function collectSubagentActivityValidationIssues(
  input: unknown,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (!isRecord(input)) {
    issues.push(issue("schema_mismatch", path, "Subagent activity must be an object."));
    return;
  }
  requireString(input, "activityId", path, issues);
  requireString(input, "threadId", path, issues);
  requireString(input, "sourceEventId", path, issues);
  requireString(input, "kind", path, issues);
  requireString(input, "status", path, issues);
  requireString(input, "title", path, issues);
  optionalString(input, "createdAt", path, issues);
}

export function collectAgentUiFixtureValidationIssues(
  input: unknown,
  path = "$",
): AgentUiContractValidationIssue[] {
  const issues: AgentUiContractValidationIssue[] = [];

  if (!isRecord(input)) {
    return [issue("schema_mismatch", path, "Fixture must be an object.")];
  }

  requireString(input, "id", path, issues);
  requireString(input, "schemaVersion", path, issues);
  requireString(input, "title", path, issues);
  requireArray(input, "events", path, issues);
  requireRecord(input, "expected", path, issues);
  if (isRecord(input.expected)) {
    collectFixtureExpectationValidationIssues(
      input.expected,
      `${path}.expected`,
      issues,
    );
  }

  if (Array.isArray(input.events)) {
    input.events.forEach((event, index) => {
      issues.push(
        ...collectRuntimeEventValidationIssues(event, `${path}.events[${index}]`),
      );
    });
    issues.push(...collectSequenceIssues(input, path));
    issues.push(...collectSequenceViolationIssues(input, path));
  }

  if ("initialReadModel" in input && input.initialReadModel !== undefined) {
    issues.push(
      ...collectThreadReadModelValidationIssues(
        input.initialReadModel,
        `${path}.initialReadModel`,
      ),
    );
  }

  if ("finalReadModel" in input && input.finalReadModel !== undefined) {
    issues.push(
      ...collectThreadReadModelValidationIssues(
        input.finalReadModel,
        `${path}.finalReadModel`,
      ),
    );
  }

  return issues;
}

function collectFixtureExpectationValidationIssues(
  input: Record<string, unknown>,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  requireString(input, "status", path, issues);
  if ("coding" in input && input.coding !== undefined) {
    requireRecord(input, "coding", path, issues);
    if (isRecord(input.coding)) {
      collectFixtureCodingExpectationValidationIssues(
        input.coding,
        `${path}.coding`,
        issues,
      );
    }
  }
  if ("subagents" in input && input.subagents !== undefined) {
    requireRecord(input, "subagents", path, issues);
    if (isRecord(input.subagents)) {
      collectFixtureSubagentsExpectationValidationIssues(
        input.subagents,
        `${path}.subagents`,
        issues,
      );
    }
  }
}

function collectFixtureCodingExpectationValidationIssues(
  input: Record<string, unknown>,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  const numberFields = [
    "fileCount",
    "changeCount",
    "patchCount",
    "commandCount",
    "testCount",
    "blockedCount",
    "failedPatchCount",
    "failedTestCount",
  ];
  numberFields.forEach((field) => {
    if (field in input && input[field] !== undefined) {
      requireNumber(input, field, path, issues);
    }
  });
}

function collectFixtureSubagentsExpectationValidationIssues(
  input: Record<string, unknown>,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  const booleanFields = ["hasSubagents"];
  const numberFields = [
    "threadCount",
    "delegationCallCount",
    "activityCount",
    "activeThreadCount",
    "completedThreadCount",
    "failedThreadCount",
  ];
  booleanFields.forEach((field) => {
    if (field in input && input[field] !== undefined) {
      requireBoolean(input, field, path, issues);
    }
  });
  numberFields.forEach((field) => {
    if (field in input && input[field] !== undefined) {
      requireNumber(input, field, path, issues);
    }
  });
}

function collectSequenceIssues(
  fixture: Record<string, unknown>,
  path: string,
): AgentUiContractValidationIssue[] {
  if (!Array.isArray(fixture.events)) {
    return [];
  }

  const expectedDiagnostics = isRecord(fixture.expected)
    && Array.isArray(fixture.expected.diagnostics)
    ? fixture.expected.diagnostics
    : [];
  const allowsSequenceGap = expectedDiagnostics.includes("sequence_gap");
  if (allowsSequenceGap) {
    return [];
  }

  const issues: AgentUiContractValidationIssue[] = [];
  let previousSequence: number | undefined;
  fixture.events.forEach((event, index) => {
    if (!isRecord(event) || !Number.isInteger(event.sequence)) {
      return;
    }
    const sequence = event.sequence as number;
    if (
      previousSequence !== undefined
      && sequence !== previousSequence + 1
    ) {
      issues.push(
        issue(
          "sequence_gap",
          `${path}.events[${index}].sequence`,
          "Runtime event sequence must be contiguous unless the fixture declares sequence_gap diagnostics.",
        ),
      );
    }
    previousSequence = sequence;
  });
  return issues;
}

/**
 * 把流式 sequence verifier 的 violation 转成 fixture 校验 issue。
 *
 * fixture 可在 `expected.diagnostics` 中声明某个 violation code 来豁免该项，
 * 以便后续故意构造坏流 fixture（语义与 `sequence_gap` 豁免一致）。
 */
function collectSequenceViolationIssues(
  fixture: Record<string, unknown>,
  path: string,
): AgentUiContractValidationIssue[] {
  if (!Array.isArray(fixture.events)) {
    return [];
  }

  const eventIndexById = new Map<string, number>();
  fixture.events.forEach((event, index) => {
    if (isRecord(event) && typeof event.id === "string") {
      eventIndexById.set(event.id, index);
    }
  });
  const events = fixture.events.filter(isRecord) as unknown as AgentRuntimeExecutionEvent[];
  const violations = verifyRuntimeEventSequence(events);
  if (violations.length === 0) {
    return [];
  }

  const expectedDiagnostics = isRecord(fixture.expected)
    && Array.isArray(fixture.expected.diagnostics)
    ? fixture.expected.diagnostics
    : [];

  return violations
    .filter((violation) => !expectedDiagnostics.includes(violation.code))
    .map((violation) =>
      issue(
        "sequence_violation",
        sequenceViolationPath(path, violation.eventId, eventIndexById),
        violation.message,
      ),
    );
}

function sequenceViolationPath(
  fixturePath: string,
  eventId: string,
  eventIndexById: Map<string, number>,
): string {
  const eventIndex = eventIndexById.get(eventId);
  return eventIndex === undefined
    ? `${fixturePath}.events`
    : `${fixturePath}.events[${eventIndex}]`;
}

function collectScopeIssues(
  event: Record<string, unknown>,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  const eventClass = String(event.eventClass);
  const payload = isRecord(event.payload) ? event.payload : {};

  if (eventClass.startsWith("tool.") && typeof event.toolCallId !== "string") {
    issues.push(
      issue(
        "missing_scope_id",
        `${path}.toolCallId`,
        "Tool events must include toolCallId.",
      ),
    );
  }

  if (
    eventClass.startsWith("action.")
    && typeof event.actionId !== "string"
  ) {
    issues.push(
      issue(
        "missing_scope_id",
        `${path}.actionId`,
        "Action events must include actionId.",
      ),
    );
  }

  if (
    eventClass.startsWith("artifact.")
    && typeof event.artifactId !== "string"
    && !hasNonEmptyStringArray(event.artifactRefs)
  ) {
    issues.push(
      issue(
        "missing_scope_id",
        `${path}.artifactId`,
        "Artifact events must include artifactId or artifactRefs.",
      ),
    );
  }

  if (eventClass === "file.read" && !payloadString(payload, "path")) {
    issues.push(
      issue(
        "missing_scope_id",
        `${path}.payload.path`,
        "file.read events must include payload.path.",
      ),
    );
  }

  if (
    eventClass === "file.changed" &&
    typeof event.artifactId !== "string" &&
    !hasNonEmptyStringArray(event.artifactRefs)
  ) {
    issues.push(
      issue(
        "missing_scope_id",
        `${path}.artifactId`,
        "file.changed events must include artifactId or artifactRefs.",
      ),
    );
  }

  if (eventClass === "file.changed" && !payloadString(payload, "path")) {
    issues.push(
      issue(
        "missing_scope_id",
        `${path}.payload.path`,
        "file.changed events must include payload.path.",
      ),
    );
  }

  if (
    eventClass.startsWith("patch.") &&
    !payloadString(payload, "patchId") &&
    typeof event.toolCallId !== "string"
  ) {
    issues.push(
      issue(
        "missing_scope_id",
        `${path}.payload.patchId`,
        "Patch events must include payload.patchId or toolCallId.",
      ),
    );
  }

  if (
    eventClass === "patch.failed" &&
    !payloadString(payload, "failureCategory")
  ) {
    issues.push(
      issue(
        "missing_scope_id",
        `${path}.payload.failureCategory`,
        "patch.failed events must include payload.failureCategory.",
      ),
    );
  }

  if (
    eventClass.startsWith("command.") &&
    !payloadString(payload, "commandId") &&
    typeof event.toolCallId !== "string"
  ) {
    issues.push(
      issue(
        "missing_scope_id",
        `${path}.payload.commandId`,
        "Command events must include payload.commandId or toolCallId.",
      ),
    );
  }

  if (eventClass === "command.output" && !hasAnyRef(event, payload)) {
    issues.push(
      issue(
        "missing_scope_id",
        `${path}.refIds`,
        "command.output events must include an output ref.",
      ),
    );
  }

  if (
    eventClass === "command.exited" &&
    !Number.isInteger(payload.exitCode) &&
    typeof payload.status !== "string"
  ) {
    issues.push(
      issue(
        "missing_scope_id",
        `${path}.payload.exitCode`,
        "command.exited events must include payload.exitCode or payload.status.",
      ),
    );
  }

  if (
    eventClass.startsWith("test.") &&
    !payloadString(payload, "testRunId") &&
    typeof event.toolCallId !== "string"
  ) {
    issues.push(
      issue(
        "missing_scope_id",
        `${path}.payload.testRunId`,
        "Test events must include payload.testRunId or toolCallId.",
      ),
    );
  }

  if (
    eventClass === "test.completed" &&
    !payloadString(payload, "result") &&
    typeof payload.status !== "string"
  ) {
    issues.push(
      issue(
        "missing_scope_id",
        `${path}.payload.result`,
        "test.completed events must include payload.result or payload.status.",
      ),
    );
  }

  if (
    eventClass === "sandbox.blocked" &&
    !payloadString(payload, "reasonCode")
  ) {
    issues.push(
      issue(
        "missing_scope_id",
        `${path}.payload.reasonCode`,
        "sandbox.blocked events must include payload.reasonCode.",
      ),
    );
  }

  if (
    (eventClass.startsWith("evidence.") || eventClass.startsWith("review."))
    && typeof event.evidenceId !== "string"
    && !hasNonEmptyStringArray(event.evidenceRefs)
  ) {
    issues.push(
      issue(
        "missing_scope_id",
        `${path}.evidenceId`,
        "Evidence and review events must include evidenceId or evidenceRefs.",
      ),
    );
  }
}

function payloadString(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function hasAnyRef(
  event: Record<string, unknown>,
  payload: Record<string, unknown>,
): boolean {
  return (
    hasNonEmptyStringArray(event.refIds) ||
    hasNonEmptyStringArray(event.artifactRefs) ||
    hasNonEmptyStringArray(event.evidenceRefs) ||
    Boolean(payloadString(payload, "outputRef")) ||
    Boolean(payloadString(payload, "contentRef")) ||
    Boolean(payloadString(payload, "diffRef"))
  );
}

function collectLegacyTurnTerminalIssues(
  eventClass: string,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (
    [
      "done",
      "final_done",
      "cancelled",
      "turn.done",
      "turn.final_done",
      "turn.cancelled",
    ].includes(eventClass.trim())
  ) {
    issues.push(
      issue(
        "schema_mismatch",
        path,
        "Legacy turn terminal event is not allowed; use turn.completed, turn.failed, or turn.canceled.",
      ),
    );
  }
}

function collectPayloadIssues(
  input: unknown,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (input === undefined) {
    return;
  }

  const serialized = safeStringify(input);
  if (serialized.length > 32_000) {
    issues.push(
      issue(
        "large_payload_inline",
        path,
        "Large runtime payloads must be stored as refs instead of inline event payloads.",
      ),
    );
  }

  scanSecretKeys(input, path, issues);
}

function scanSecretKeys(
  input: unknown,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (!isRecord(input) && !Array.isArray(input)) {
    return;
  }

  Object.entries(input).forEach(([key, value]) => {
    const childPath = Array.isArray(input) ? `${path}[${key}]` : `${path}.${key}`;
    if (/(api[-_]?key|authorization|password|secret|token)/i.test(key)) {
      issues.push(
        issue(
          "secret_leak_risk",
          childPath,
          "Runtime payload appears to contain a secret-bearing field.",
        ),
      );
      return;
    }
    scanSecretKeys(value, childPath, issues);
  });
}

function requireString(
  input: Record<string, unknown>,
  field: string,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (typeof input[field] !== "string" || input[field] === "") {
    issues.push(
      issue(
        "schema_mismatch",
        `${path}.${field}`,
        `${field} must be a non-empty string.`,
      ),
    );
  }
}

function requireNumber(
  input: Record<string, unknown>,
  field: string,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (typeof input[field] !== "number" || !Number.isFinite(input[field])) {
    issues.push(
      issue("schema_mismatch", `${path}.${field}`, `${field} must be a number.`),
    );
  }
}

function requireBoolean(
  input: Record<string, unknown>,
  field: string,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (typeof input[field] !== "boolean") {
    issues.push(
      issue(
        "schema_mismatch",
        `${path}.${field}`,
        `${field} must be a boolean.`,
      ),
    );
  }
}

function requireArray(
  input: Record<string, unknown>,
  field: string,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (!Array.isArray(input[field])) {
    issues.push(
      issue("schema_mismatch", `${path}.${field}`, `${field} must be an array.`),
    );
  }
}

function requireRecord(
  input: Record<string, unknown>,
  field: string,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (!isRecord(input[field])) {
    issues.push(
      issue("schema_mismatch", `${path}.${field}`, `${field} must be an object.`),
    );
  }
}

function optionalString(
  input: Record<string, unknown>,
  field: string,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (field in input && input[field] !== undefined && typeof input[field] !== "string") {
    issues.push(
      issue("schema_mismatch", `${path}.${field}`, `${field} must be a string.`),
    );
  }
}

function requireStringArray(
  input: Record<string, unknown>,
  field: string,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  requireArray(input, field, path, issues);
  if (!Array.isArray(input[field])) return;
  input[field].forEach((item, index) => {
    if (typeof item !== "string") {
      issues.push(
        issue(
          "schema_mismatch",
          `${path}.${field}[${index}]`,
          `${field} entries must be strings.`,
        ),
      );
    }
  });
}

function optionalStringArray(
  input: Record<string, unknown>,
  field: string,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  if (!(field in input) || input[field] === undefined) return;
  requireStringArray(input, field, path, issues);
}

function throwIfIssues(issues: AgentUiContractValidationIssue[]): void {
  if (issues.length > 0) {
    throw new AgentUiContractValidationError(issues);
  }
}

function issue(
  code: AgentUiContractValidationCode,
  path: string,
  message: string,
): AgentUiContractValidationIssue {
  return { code, path, message };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function hasNonEmptyStringArray(input: unknown): boolean {
  return (
    Array.isArray(input)
    && input.some((item) => typeof item === "string" && item.length > 0)
  );
}

function safeStringify(input: unknown): string {
  try {
    return JSON.stringify(input) ?? "";
  } catch {
    return "";
  }
}
