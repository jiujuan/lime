import type { AgentUiFixture } from "./fixtures";
import type { AgentUiProjectionState } from "./projection";
import type {
  AgentRuntimeExecutionEvent,
  AgentRuntimeReadModel,
} from "./runtime";

export type AgentUiContractValidationCode =
  | "schema_mismatch"
  | "missing_scope_id"
  | "sequence_gap"
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

function collectScopeIssues(
  event: Record<string, unknown>,
  path: string,
  issues: AgentUiContractValidationIssue[],
): void {
  const eventClass = String(event.eventClass);

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
