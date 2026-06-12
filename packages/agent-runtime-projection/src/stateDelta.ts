import type {
  AgentRuntimeExecutionEvent,
  AgentRuntimeJsonPatchOperation,
  AgentRuntimeStateDelta,
  AgentUiDiagnosticView,
  AgentUiProjectionState,
  AgentUiRefView,
} from "@limecloud/agent-ui-contracts";

type JsonPointerToken = string;

type StateDeltaApplyResult<TEvent extends AgentRuntimeExecutionEvent> = {
  state: AgentUiProjectionState<TEvent>;
  applied: boolean;
  error?: string;
};

type AgentRuntimeMoveOrCopyPatchOperation = {
  op: "move" | "copy";
  path: string;
  from: string;
};

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isMoveOrCopyPatchOperation(
  operation: AgentRuntimeJsonPatchOperation,
): operation is AgentRuntimeMoveOrCopyPatchOperation {
  return operation.op === "move" || operation.op === "copy";
}

function isPatchOperation(input: unknown): input is AgentRuntimeJsonPatchOperation {
  if (!isRecord(input)) return false;
  if (typeof input.op !== "string" || typeof input.path !== "string") {
    return false;
  }
  if (input.op === "add" || input.op === "replace" || input.op === "test") {
    return Object.prototype.hasOwnProperty.call(input, "value");
  }
  if (input.op === "remove") return true;
  if (input.op === "move" || input.op === "copy") {
    return typeof input.from === "string";
  }
  return false;
}

function isStateDeltaEvent(event: AgentRuntimeExecutionEvent): boolean {
  return event.eventClass === "state.delta";
}

function readPatch(input: Record<string, unknown>): AgentRuntimeJsonPatchOperation[] | undefined {
  const patch = input.patch ?? input.ops;
  if (!Array.isArray(patch)) return undefined;
  return patch.every(isPatchOperation) ? patch : undefined;
}

export function readAgentRuntimeStateDelta(
  event: AgentRuntimeExecutionEvent,
): AgentRuntimeStateDelta | undefined {
  if (!isStateDeltaEvent(event)) return undefined;
  const payload = event.payload;
  if (!isRecord(payload)) return undefined;
  const candidate = isRecord(payload.stateDelta) ? payload.stateDelta : payload;
  const target = candidate.target;
  const patch = readPatch(candidate);
  if (typeof target !== "string" || !target.trim() || !patch) {
    return undefined;
  }
  return {
    schemaVersion:
      typeof candidate.schemaVersion === "string"
        ? candidate.schemaVersion
        : "lime-runtime-state-delta/v0.1",
    runtimeId:
      typeof candidate.runtimeId === "string"
        ? candidate.runtimeId
        : event.runtimeId ?? "runtime",
    threadId:
      typeof candidate.threadId === "string" ? candidate.threadId : event.threadId,
    turnId: typeof candidate.turnId === "string" ? candidate.turnId : event.turnId,
    sequence:
      typeof candidate.sequence === "number" && Number.isFinite(candidate.sequence)
        ? candidate.sequence
        : event.sequence ?? 0,
    baseEventId:
      typeof candidate.baseEventId === "string"
        ? candidate.baseEventId
        : typeof candidate.baseCursor === "string"
          ? candidate.baseCursor
          : undefined,
    target,
    patch,
    createdAt:
      typeof candidate.createdAt === "string" ? candidate.createdAt : event.createdAt,
  };
}

function decodePointerToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function encodePointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

function parsePointer(path: string): JsonPointerToken[] {
  if (path === "") return [];
  if (!path.startsWith("/")) {
    throw new Error(`JSON Pointer must start with "/": ${path}`);
  }
  return path.slice(1).split("/").map(decodePointerToken);
}

function pointerFromTokens(tokens: readonly JsonPointerToken[]): string {
  return tokens.length ? `/${tokens.map(encodePointerToken).join("/")}` : "";
}

function targetTokens(target: string): JsonPointerToken[] {
  if (target === "projection") return [];
  if (target === "readModel") return ["readModel"];
  if (target === "runtime") return ["runtime"];
  if (target.startsWith("projection.")) {
    return target.slice("projection.".length).split(".").filter(Boolean);
  }
  if (target.startsWith("readModel.")) {
    return ["readModel", ...target.slice("readModel.".length).split(".").filter(Boolean)];
  }
  if (target.startsWith("runtime.")) {
    return ["runtime", ...target.slice("runtime.".length).split(".").filter(Boolean)];
  }
  throw new Error(`Unsupported state.delta target: ${target}`);
}

function normalizeTargetPath(
  target: string,
  path: string,
): JsonPointerToken[] {
  const targetPath = targetTokens(target);
  const opPath = parsePointer(path);
  if (!targetPath.length) return opPath;

  const lastTargetToken = targetPath[targetPath.length - 1];
  if (opPath[0] === "items" && lastTargetToken) {
    return [...targetPath, ...opPath.slice(1)];
  }
  if (opPath[0] === lastTargetToken) {
    return [...targetPath.slice(0, -1), ...opPath];
  }
  return [...targetPath, ...opPath];
}

function normalizeOperation(
  target: string,
  operation: AgentRuntimeJsonPatchOperation,
): AgentRuntimeJsonPatchOperation {
  const path = pointerFromTokens(normalizeTargetPath(target, operation.path));
  if (isMoveOrCopyPatchOperation(operation)) {
    return {
      ...operation,
      path,
      from: pointerFromTokens(normalizeTargetPath(target, operation.from)),
    };
  }
  return { ...operation, path };
}

function stateDeltaTargetArea(
  delta: AgentRuntimeStateDelta,
): string | undefined {
  const operation = delta.patch[0];
  if (!operation) return undefined;
  try {
    const tokens = normalizeTargetPath(delta.target, operation.path);
    const [root, second] = tokens;
    if (!root) return undefined;
    if (root === "readModel") return `readModel.${second ?? "*"}`;
    return root;
  } catch {
    return undefined;
  }
}

function eventTouchesStateDeltaArea(
  event: AgentRuntimeExecutionEvent,
  area: string,
): boolean {
  if (isStateDeltaEvent(event)) return false;
  const eventClass = event.eventClass ?? "";
  if (area === "runtime" || area === "timeline") return true;
  if (area === "messages") {
    return Boolean(
      event.kind === "model" ||
        event.kind === "note" ||
        event.kind === "draft" ||
        event.kind === "evidence" ||
        eventClass.startsWith("model.") ||
        eventClass.startsWith("reasoning.") ||
        eventClass === "tool.result" ||
        eventClass === "tool.failed" ||
        eventClass === "artifact.changed" ||
        eventClass === "evidence.changed" ||
        eventClass === "runtime.error" ||
        event.status === "failed" ||
        event.status === "blocked",
    );
  }
  if (area === "graph") {
    return Boolean(
      event.subagentId ||
        event.toolCallId ||
        event.actionId ||
        event.stepId ||
        event.attemptId ||
        event.runId ||
        event.taskId ||
        event.turnId,
    );
  }
  if (area === "tools") {
    return event.kind === "tool" || eventClass.startsWith("tool.");
  }
  if (area === "actions") {
    return event.kind === "action" || eventClass.startsWith("action.");
  }
  if (area === "artifacts") {
    return Boolean(
      event.kind === "draft" ||
        eventClass === "artifact.changed" ||
        event.artifactRefs?.length,
    );
  }
  if (area === "evidence") {
    return Boolean(
      event.kind === "evidence" ||
        eventClass === "evidence.changed" ||
        event.evidenceRefs?.length,
    );
  }
  if (area === "diagnostics") {
    return Boolean(
      event.status === "failed" ||
        event.status === "blocked" ||
        eventClass === "runtime.error",
    );
  }
  if (area === "subagents") {
    return Boolean(
      event.subagentId ||
        event.workerId ||
        eventClass.startsWith("subagent.") ||
        eventClass.startsWith("handoff.") ||
        eventClass.startsWith("review.") ||
        eventClass === "agent.spawned" ||
        eventClass === "agent.completed" ||
        eventClass === "agent.handoff",
    );
  }
  if (area === "readModel.events" || area === "readModel.visibleEvents") {
    return true;
  }
  if (area === "readModel.pendingActions") {
    return eventClass === "action.required" || isActionTerminalEventClass(eventClass);
  }
  if (area === "readModel.taskRefs") return Boolean(event.taskId);
  if (area === "readModel.artifactRefs") return Boolean(event.artifactRefs?.length);
  if (area === "readModel.evidenceRefs") return Boolean(event.evidenceRefs?.length);
  if (area === "readModel.inputSourceRecovery") {
    return eventClass === "action.required" || isActionTerminalEventClass(eventClass);
  }
  return false;
}

function isActionTerminalEventClass(eventClass: string): boolean {
  return (
    eventClass === "action.resolved" ||
    eventClass === "action.cancelled" ||
    eventClass === "action.canceled" ||
    eventClass === "action.expired"
  );
}

function isSupersededStateDelta(
  delta: AgentRuntimeStateDelta,
  index: number,
  events: readonly AgentRuntimeExecutionEvent[],
): boolean {
  const area = stateDeltaTargetArea(delta);
  if (!area) return false;
  return events
    .slice(index + 1)
    .some((event) => eventTouchesStateDeltaArea(event, area));
}

function assertAllowedProjectionPath(tokens: readonly JsonPointerToken[]): void {
  const [root, second] = tokens;
  const allowedRoots = new Set([
    "runtime",
    "messages",
    "timeline",
    "graph",
    "tools",
    "actions",
    "artifacts",
    "evidence",
    "diagnostics",
    "subagents",
    "readModel",
    "hydration",
    "ephemeralUi",
  ]);
  if (!root || !allowedRoots.has(root)) {
    throw new Error(`state.delta cannot patch unknown projection root: /${root ?? ""}`);
  }
  if (root === "readModel" && (second === "events" || second === "visibleEvents")) {
    throw new Error(`state.delta cannot patch runtime fact projections at /${root}/${second}`);
  }
  if (root === "readModel" && second === "pendingActions") {
    throw new Error("state.delta cannot patch pending action facts at /readModel/pendingActions");
  }
}

function clonePatchValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => clonePatchValue(item)) as T;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, clonePatchValue(item)]),
    ) as T;
  }
  return value;
}

function arrayIndex(token: string, length: number, allowAppend: boolean): number {
  if (token === "-" && allowAppend) return length;
  if (!/^(0|[1-9]\d*)$/.test(token)) {
    throw new Error(`Invalid array index: ${token}`);
  }
  const index = Number(token);
  if (!Number.isSafeInteger(index)) throw new Error(`Invalid array index: ${token}`);
  return index;
}

function valueAt(document: unknown, tokens: readonly JsonPointerToken[]): unknown {
  let current = document;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      const index = arrayIndex(token, current.length, false);
      if (index >= current.length) throw new Error(`Path does not exist: ${pointerFromTokens(tokens)}`);
      current = current[index];
      continue;
    }
    if (
      !isRecord(current) ||
      !Object.prototype.hasOwnProperty.call(current, token)
    ) {
      throw new Error(`Path does not exist: ${pointerFromTokens(tokens)}`);
    }
    current = current[token];
  }
  return current;
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function addValue(
  document: unknown,
  tokens: readonly JsonPointerToken[],
  value: unknown,
): unknown {
  if (!tokens.length) return clonePatchValue(value);
  const [token, ...rest] = tokens;
  if (Array.isArray(document)) {
    const copy = document.slice();
    const index = arrayIndex(token, copy.length, rest.length === 0);
    if (rest.length === 0) {
      if (index > copy.length) throw new Error(`Array index out of range: ${token}`);
      copy.splice(index, 0, clonePatchValue(value));
      return copy;
    }
    if (index >= copy.length) throw new Error(`Path does not exist: ${pointerFromTokens(tokens)}`);
    copy[index] = addValue(copy[index], rest, value);
    return copy;
  }
  if (!isRecord(document)) {
    throw new Error(`Cannot add into non-object path: ${pointerFromTokens(tokens)}`);
  }
  if (
    rest.length > 0 &&
    !Object.prototype.hasOwnProperty.call(document, token)
  ) {
    throw new Error(`Path does not exist: ${pointerFromTokens(tokens)}`);
  }
  return {
    ...document,
    [token]: rest.length ? addValue(document[token], rest, value) : clonePatchValue(value),
  };
}

function replaceValue(
  document: unknown,
  tokens: readonly JsonPointerToken[],
  value: unknown,
): unknown {
  if (!tokens.length) return clonePatchValue(value);
  valueAt(document, tokens);
  const parent = tokens.slice(0, -1);
  const key = tokens[tokens.length - 1];
  return addValue(removeValue(document, tokens), [...parent, key], value);
}

function removeValue(
  document: unknown,
  tokens: readonly JsonPointerToken[],
): unknown {
  if (!tokens.length) return undefined;
  const [token, ...rest] = tokens;
  if (Array.isArray(document)) {
    const copy = document.slice();
    const index = arrayIndex(token, copy.length, false);
    if (index >= copy.length) throw new Error(`Array index out of range: ${token}`);
    if (rest.length === 0) {
      copy.splice(index, 1);
      return copy;
    }
    copy[index] = removeValue(copy[index], rest);
    return copy;
  }
  if (
    !isRecord(document) ||
    !Object.prototype.hasOwnProperty.call(document, token)
  ) {
    throw new Error(`Path does not exist: ${pointerFromTokens(tokens)}`);
  }
  if (rest.length === 0) {
    const copy = { ...document };
    delete copy[token];
    return copy;
  }
  return {
    ...document,
    [token]: removeValue(document[token], rest),
  };
}

function isDescendantPath(
  parent: readonly JsonPointerToken[],
  child: readonly JsonPointerToken[],
): boolean {
  return parent.length < child.length && parent.every((token, index) => token === child[index]);
}

function applyOperation(
  document: unknown,
  operation: AgentRuntimeJsonPatchOperation,
): unknown {
  const pathTokens = parsePointer(operation.path);
  assertAllowedProjectionPath(pathTokens);
  if (operation.op === "add") {
    return addValue(document, pathTokens, operation.value);
  }
  if (operation.op === "replace") {
    return replaceValue(document, pathTokens, operation.value);
  }
  if (operation.op === "remove") {
    return removeValue(document, pathTokens);
  }
  if (operation.op === "test") {
    const current = valueAt(document, pathTokens);
    if (!deepEqual(current, operation.value)) {
      throw new Error(`JSON Patch test failed at ${operation.path}`);
    }
    return document;
  }
  if (isMoveOrCopyPatchOperation(operation)) {
    const fromTokens = parsePointer(operation.from);
    assertAllowedProjectionPath(fromTokens);
    const value = clonePatchValue(valueAt(document, fromTokens));
    if (operation.op === "copy") {
      return addValue(document, pathTokens, value);
    }
    if (isDescendantPath(fromTokens, pathTokens)) {
      throw new Error(
        `Cannot move ${operation.from} into its descendant ${operation.path}`,
      );
    }
    return addValue(removeValue(document, fromTokens), pathTokens, value);
  }
  throw new Error(`Unsupported JSON Patch operation: ${(operation as { op: string }).op}`);
}

function applyPatch<TEvent extends AgentRuntimeExecutionEvent>(
  state: AgentUiProjectionState<TEvent>,
  delta: AgentRuntimeStateDelta,
): AgentUiProjectionState<TEvent> {
  let document: unknown = state;
  for (const operation of delta.patch.map((op) => normalizeOperation(delta.target, op))) {
    document = applyOperation(document, operation);
  }
  if (!isRecord(document)) {
    throw new Error("state.delta patch must keep projection state as an object");
  }
  return syncProjectionRefsFromReadModel(
    document as unknown as AgentUiProjectionState<TEvent>,
  );
}

function diagnosticForStateDeltaFailure(
  event: AgentRuntimeExecutionEvent,
  message: string,
): AgentUiDiagnosticView {
  return {
    id: `state-delta:${event.id}`,
    sourceEventId: event.id,
    title: "state.delta apply failed",
    detail: message,
    status: "failed",
  };
}

function upsertDiagnostic<TEvent extends AgentRuntimeExecutionEvent>(
  state: AgentUiProjectionState<TEvent>,
  diagnostic: AgentUiDiagnosticView,
): AgentUiProjectionState<TEvent> {
  const diagnostics = state.diagnostics.filter((item) => item.id !== diagnostic.id);
  diagnostics.push(diagnostic);
  return {
    ...state,
    diagnostics,
    hydration: {
      ...state.hydration,
      status: "stale",
    },
  };
}

function syncRefs(
  refs: readonly AgentUiRefView[],
  ids: readonly string[],
): AgentUiRefView[] {
  const byId = new Map(refs.map((ref) => [ref.id, ref]));
  ids.forEach((id) => {
    if (!byId.has(id)) byId.set(id, { id, sourceEventId: id });
  });
  return Array.from(byId.values());
}

function syncProjectionRefsFromReadModel<TEvent extends AgentRuntimeExecutionEvent>(
  state: AgentUiProjectionState<TEvent>,
): AgentUiProjectionState<TEvent> {
  return {
    ...state,
    artifacts: syncRefs(state.artifacts, state.readModel.artifactRefs),
    evidence: syncRefs(state.evidence, state.readModel.evidenceRefs),
    subagents: {
      ...state.subagents,
      hasSubagents: state.subagents.threads.length > 0,
      activeThreadIds: state.subagents.threads
        .filter(
          (thread) =>
            thread.status === "pending" ||
            thread.status === "running" ||
            thread.status === "blocked",
        )
        .map((thread) => thread.threadId),
      completedThreadIds: state.subagents.threads
        .filter((thread) => thread.status === "completed")
        .map((thread) => thread.threadId),
      failedThreadIds: state.subagents.threads
        .filter((thread) => thread.status === "failed")
        .map((thread) => thread.threadId),
    },
  };
}

export function applyAgentRuntimeStateDeltaToProjectionState<
  TEvent extends AgentRuntimeExecutionEvent,
>(
  state: AgentUiProjectionState<TEvent>,
  event: TEvent,
): StateDeltaApplyResult<TEvent> {
  if (!isStateDeltaEvent(event)) {
    return { state, applied: false };
  }
  const delta = readAgentRuntimeStateDelta(event);
  if (!delta) {
    return {
      state: upsertDiagnostic(
        state,
        diagnosticForStateDeltaFailure(event, "Missing or invalid state.delta payload."),
      ),
      applied: false,
      error: "Missing or invalid state.delta payload.",
    };
  }
  try {
    const patchedState = applyPatch(state, delta);
    return {
      state: {
        ...patchedState,
        hydration: {
          ...patchedState.hydration,
          eventCount: state.hydration.eventCount,
        },
      },
      applied: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      state: upsertDiagnostic(state, diagnosticForStateDeltaFailure(event, message)),
      applied: false,
      error: message,
    };
  }
}

export function applyAgentRuntimeStateDeltasToProjectionState<
  TEvent extends AgentRuntimeExecutionEvent,
>(
  state: AgentUiProjectionState<TEvent>,
  events: readonly TEvent[],
): AgentUiProjectionState<TEvent> {
  let nextState = state;
  for (const [index, event] of events.entries()) {
    const delta = readAgentRuntimeStateDelta(event);
    if (delta && isSupersededStateDelta(delta, index, events)) {
      continue;
    }
    nextState = applyAgentRuntimeStateDeltaToProjectionState(
      nextState,
      event,
    ).state;
  }
  return nextState;
}
