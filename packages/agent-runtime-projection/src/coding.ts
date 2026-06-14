import type {
  AgentRuntimeEventProjection,
  AgentRuntimeExecutionEvent,
  AgentRuntimeProjectionInput,
  AgentUiArtifactRefView,
  AgentUiDiagnosticView,
  AgentUiEvidenceRefView,
  AgentUiProjectionState,
  AgentUiRuntimeStatusView,
} from "@limecloud/agent-ui-contracts";
import { projectAgentUiState } from "./uiState.js";

export interface CodingReadModelCommandFact {
  command_id?: string;
  commandId?: string;
  status?: string;
  command?: string;
  cwd?: string;
  exit_code?: number;
  exitCode?: number;
  output_refs?: string[];
  outputRefs?: string[];
  output_preview?: string | null;
  outputPreview?: string | null;
  source_event_ids?: string[];
  sourceEventIds?: string[];
}

export interface CodingReadModelTestRunFact {
  test_run_id?: string;
  testRunId?: string;
  status?: string;
  command_id?: string;
  commandId?: string;
  suite?: string;
  result?: string;
  passed?: number;
  failed?: number;
  output_refs?: string[];
  outputRefs?: string[];
  failure_category?: string;
  failureCategory?: string;
  source_event_ids?: string[];
  sourceEventIds?: string[];
}

export interface CodingReadModelPendingRequestFact {
  id?: string;
  turn_id?: string;
  turnId?: string;
  status?: string;
  request_type?: string;
  requestType?: string;
  title?: string;
  payload?: unknown;
}

export interface CodingReadModelFacts {
  thread_id?: string;
  threadId?: string;
  active_turn_id?: string;
  activeTurnId?: string;
  commands?: CodingReadModelCommandFact[];
  tests?: CodingReadModelTestRunFact[];
  pending_requests?: CodingReadModelPendingRequestFact[];
  pendingRequests?: CodingReadModelPendingRequestFact[];
  active_command_id?: string | null;
  activeCommandId?: string | null;
  active_test_run_id?: string | null;
  activeTestRunId?: string | null;
  active_action_id?: string | null;
  activeActionId?: string | null;
}

export interface CodingWorkbenchProjectionInput<
  TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent,
> extends AgentRuntimeProjectionInput<TEvent> {
  codingReadModel?: CodingReadModelFacts | null;
}

export type CodingWorkbenchStatus =
  | "idle"
  | "running"
  | "blocked"
  | "completed"
  | "failed"
  | "degraded";

export interface CodingMainObjectView {
  id: string;
  title: string;
  status: CodingWorkbenchStatus;
  activeFilePath?: string;
  activePatchId?: string;
  activeCommandId?: string;
  activeTestRunId?: string;
  sourceEventId?: string;
}

export interface CodingFileView {
  id: string;
  path: string;
  status: string;
  title: string;
  artifactRefs: string[];
  checkpointRef?: string;
  contentRef?: string;
  latestEventId: string;
}

export interface FileChangeView {
  id: string;
  path: string;
  status: string;
  changeKind?: string;
  artifactRefs: string[];
  checkpointRef?: string;
  diffRef?: string;
  preview?: string;
  sourceEventId: string;
}

export interface PatchView {
  patchId: string;
  status: string;
  title: string;
  path?: string;
  toolCallId?: string;
  diffRef?: string;
  failureCategory?: string;
  recoveryHintRef?: string;
  sourceEventIds: string[];
}

export interface CommandOutputView {
  commandId: string;
  status: string;
  title: string;
  command?: string;
  cwd?: string;
  exitCode?: number;
  outputRefs: string[];
  preview?: string;
  sourceEventIds: string[];
}

export interface TestRunView {
  testRunId: string;
  status: string;
  title: string;
  commandId?: string;
  suite?: string;
  result?: string;
  passed?: number;
  failed?: number;
  outputRefs: string[];
  failureCategory?: string;
  sourceEventIds: string[];
}

export interface CodingLocalUiState {
  preferredTab: "preview" | "files" | "changes" | "outputs" | "logs";
  stale: boolean;
}

export interface CodingWorkbenchView<
  TEvent extends AgentRuntimeExecutionEvent = AgentRuntimeExecutionEvent,
> {
  runtime: AgentUiRuntimeStatusView;
  mainObject: CodingMainObjectView;
  files: CodingFileView[];
  changes: FileChangeView[];
  patches: PatchView[];
  commands: CommandOutputView[];
  tests: TestRunView[];
  actions: AgentRuntimeEventProjection<TEvent>[];
  artifacts: AgentUiArtifactRefView[];
  evidence: AgentUiEvidenceRefView[];
  diagnostics: AgentUiDiagnosticView[];
  ui: CodingLocalUiState;
}

interface PatchAccumulator extends PatchView {
  sequence: number;
}

interface CommandAccumulator extends CommandOutputView {
  sequence: number;
}

interface TestAccumulator extends TestRunView {
  sequence: number;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function payload(event: AgentRuntimeExecutionEvent): Record<string, unknown> {
  return isRecord(event.payload) ? event.payload : {};
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as T;
}

function payloadString(
  event: AgentRuntimeExecutionEvent,
  ...keys: string[]
): string | undefined {
  const eventPayload = payload(event);
  for (const key of keys) {
    const value = eventPayload[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function payloadNumber(
  event: AgentRuntimeExecutionEvent,
  key: string,
): number | undefined {
  const value = payload(event)[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function valueString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function valueNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function valueStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is string => typeof item === "string" && Boolean(item.trim()),
      );
    }
  }
  return [];
}

function eventSequence(event: AgentRuntimeExecutionEvent): number {
  return typeof event.sequence === "number" ? event.sequence : 0;
}

function safeRelativePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^(?:[A-Za-z]:[\\/]|\/|file:)/.test(value)) return undefined;
  if (/(?:api[-_]?key|authorization|password|secret|token)=/i.test(value)) {
    return undefined;
  }
  return value;
}

function safePreview(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.length > 320 ? `${value.slice(0, 317)}...` : value;
}

function safeCommand(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/(?:api[-_]?key|authorization|password|secret|token)[=\s:]/i.test(value)) {
    return undefined;
  }
  return safePreview(value);
}

function refIds(event: AgentRuntimeExecutionEvent): string[] {
  return [
    ...(event.refIds ?? []),
    ...(event.artifactRefs ?? []),
    ...(event.evidenceRefs ?? []),
  ];
}

function outputRefs(event: AgentRuntimeExecutionEvent): string[] {
  return [
    ...refIds(event),
    payloadString(event, "outputRef"),
    payloadString(event, "contentRef"),
    payloadString(event, "diffRef"),
  ].filter((value): value is string => Boolean(value));
}

function eventScopeId(
  event: AgentRuntimeExecutionEvent,
  payloadKey: string,
): string | undefined {
  return payloadString(event, payloadKey) ?? event.toolCallId;
}

function isCodingEvent(event: AgentRuntimeExecutionEvent): boolean {
  const eventClass = event.eventClass ?? "";
  return (
    eventClass.startsWith("file.") ||
    eventClass.startsWith("patch.") ||
    eventClass.startsWith("command.") ||
    eventClass.startsWith("test.") ||
    eventClass === "sandbox.blocked" ||
    payloadString(event, "profileId") === "coding"
  );
}

function isTurnLifecycleEvent(event: AgentRuntimeExecutionEvent): boolean {
  return (event.eventClass ?? "").startsWith("turn.");
}

function eventMatchesAnyCodingScope(
  event: AgentRuntimeExecutionEvent,
  codingEvents: readonly AgentRuntimeExecutionEvent[],
): boolean {
  return codingEvents.some(
    (codingEvent) =>
      (event.turnId && codingEvent.turnId === event.turnId) ||
      (event.taskId && codingEvent.taskId === event.taskId),
  );
}

function collectCodingEvents(
  events: readonly AgentRuntimeExecutionEvent[],
): AgentRuntimeExecutionEvent[] {
  const directCodingEvents = events.filter(isCodingEvent);
  if (directCodingEvents.length === 0) {
    return [];
  }
  return events.filter(
    (event) =>
      isCodingEvent(event) ||
      (isTurnLifecycleEvent(event) &&
        eventMatchesAnyCodingScope(event, directCodingEvents)),
  );
}

function statusFromRuntime(
  state: AgentUiProjectionState,
  codingEvents: AgentRuntimeExecutionEvent[],
): CodingWorkbenchStatus {
  const latestTurnTerminal = [...codingEvents]
    .reverse()
    .find((event) => event.eventClass?.startsWith("turn."));
  if (latestTurnTerminal?.eventClass === "turn.completed") {
    return "completed";
  }
  if (latestTurnTerminal?.eventClass === "turn.failed") {
    return "failed";
  }
  if (latestTurnTerminal?.eventClass === "turn.canceled") {
    return "degraded";
  }
  if (codingEvents.some((event) => event.status === "blocked")) {
    return "blocked";
  }
  if (codingEvents.some((event) => event.status === "failed")) {
    return "failed";
  }
  if (state.runtime.status === "running" || state.runtime.status === "waiting") {
    return "running";
  }
  if (state.runtime.status === "completed") {
    return "completed";
  }
  if (!codingEvents.length) {
    return "idle";
  }
  return "degraded";
}

function buildMainObject(
  state: AgentUiProjectionState,
  codingEvents: AgentRuntimeExecutionEvent[],
  files: CodingFileView[],
  patches: PatchView[],
  commands: CommandOutputView[],
  tests: TestRunView[],
  readModel?: CodingReadModelFacts | null,
): CodingMainObjectView {
  const latest = codingEvents.at(-1);
  const activePatch = [...patches].reverse().find((patch) => patch.status === "running");
  return {
    id:
      latest?.turnId ??
      state.runtime.activeTurnId ??
      valueString(readModel?.active_turn_id, readModel?.activeTurnId) ??
      valueString(readModel?.thread_id, readModel?.threadId) ??
      "coding-workbench",
    title: latest?.title ?? "Coding Workbench",
    status: statusFromRuntime(state, codingEvents),
    activeFilePath: files.at(-1)?.path,
    activePatchId: activePatch?.patchId,
    activeCommandId: activeCommandId(commands, readModel),
    activeTestRunId: activeTestRunId(tests, readModel),
    sourceEventId: latest?.id,
  };
}

function collectFiles(
  events: readonly AgentRuntimeExecutionEvent[],
): CodingFileView[] {
  const files = new Map<string, CodingFileView>();
  events.forEach((event) => {
    if (event.eventClass !== "file.read" && event.eventClass !== "file.changed") {
      return;
    }
    const path = safeRelativePath(payloadString(event, "path", "relativePath"));
    if (!path) return;
    files.set(path, {
      id: path,
      path,
      status: event.status,
      title: event.title,
      artifactRefs: event.artifactRefs ?? [],
      checkpointRef: payloadString(event, "checkpointRef", "checkpointId"),
      contentRef: payloadString(event, "contentRef"),
      latestEventId: event.id,
    });
  });
  return Array.from(files.values());
}

function collectChanges(
  events: readonly AgentRuntimeExecutionEvent[],
): FileChangeView[] {
  return events.flatMap((event) => {
    if (event.eventClass !== "file.changed") return [];
    const path = safeRelativePath(payloadString(event, "path", "relativePath"));
    if (!path) return [];
    return [
      {
        id: event.id,
        path,
        status: event.status,
        changeKind: payloadString(event, "changeKind", "operation"),
        artifactRefs: event.artifactRefs ?? [],
        checkpointRef: payloadString(event, "checkpointRef", "checkpointId"),
        diffRef: payloadString(event, "diffRef"),
        preview: safePreview(payloadString(event, "preview", "summary")),
        sourceEventId: event.id,
      },
    ];
  });
}

function collectPatches(
  events: readonly AgentRuntimeExecutionEvent[],
): PatchView[] {
  const patches = new Map<string, PatchAccumulator>();
  events.forEach((event) => {
    if (!event.eventClass?.startsWith("patch.")) return;
    const patchId = eventScopeId(event, "patchId");
    if (!patchId) return;
    const previous = patches.get(patchId);
    patches.set(patchId, {
      patchId,
      status: event.status,
      title: event.title,
      path:
        safeRelativePath(payloadString(event, "path", "relativePath")) ??
        previous?.path,
      toolCallId: event.toolCallId ?? previous?.toolCallId,
      diffRef: payloadString(event, "diffRef") ?? previous?.diffRef,
      failureCategory:
        payloadString(event, "failureCategory") ?? previous?.failureCategory,
      recoveryHintRef:
        payloadString(event, "recoveryHintRef") ?? previous?.recoveryHintRef,
      sourceEventIds: [...(previous?.sourceEventIds ?? []), event.id],
      sequence: eventSequence(event),
    });
  });
  return Array.from(patches.values())
    .sort((left, right) => left.sequence - right.sequence)
    .map(({ sequence: _sequence, ...patch }) => patch);
}

function collectCommands(
  events: readonly AgentRuntimeExecutionEvent[],
): CommandOutputView[] {
  const commands = new Map<string, CommandAccumulator>();
  events.forEach((event) => {
    if (!event.eventClass?.startsWith("command.")) return;
    const commandId = eventScopeId(event, "commandId");
    if (!commandId) return;
    const previous = commands.get(commandId);
    commands.set(commandId, {
      commandId,
      status: event.status,
      title: event.title,
      command: safeCommand(payloadString(event, "command")) ?? previous?.command,
      cwd:
        safeRelativePath(payloadString(event, "cwd", "workingDirectory")) ??
        previous?.cwd,
      exitCode: payloadNumber(event, "exitCode") ?? previous?.exitCode,
      outputRefs: [...new Set([...(previous?.outputRefs ?? []), ...outputRefs(event)])],
      preview:
        safePreview(payloadString(event, "preview", "summary")) ??
        previous?.preview,
      sourceEventIds: [...(previous?.sourceEventIds ?? []), event.id],
      sequence: eventSequence(event),
    });
  });
  return Array.from(commands.values())
    .sort((left, right) => left.sequence - right.sequence)
    .map(({ sequence: _sequence, ...command }) => command);
}

function collectTests(
  events: readonly AgentRuntimeExecutionEvent[],
): TestRunView[] {
  const tests = new Map<string, TestAccumulator>();
  events.forEach((event) => {
    if (!event.eventClass?.startsWith("test.")) return;
    const testRunId = eventScopeId(event, "testRunId");
    if (!testRunId) return;
    const previous = tests.get(testRunId);
    tests.set(testRunId, {
      testRunId,
      status: event.status,
      title: event.title,
      commandId: payloadString(event, "commandId") ?? previous?.commandId,
      suite: payloadString(event, "suite") ?? previous?.suite,
      result: payloadString(event, "result", "status") ?? previous?.result,
      passed: payloadNumber(event, "passed") ?? previous?.passed,
      failed: payloadNumber(event, "failed") ?? previous?.failed,
      outputRefs: [...new Set([...(previous?.outputRefs ?? []), ...outputRefs(event)])],
      failureCategory:
        payloadString(event, "failureCategory") ?? previous?.failureCategory,
      sourceEventIds: [...(previous?.sourceEventIds ?? []), event.id],
      sequence: eventSequence(event),
    });
  });
  return Array.from(tests.values())
    .sort((left, right) => left.sequence - right.sequence)
    .map(({ sequence: _sequence, ...test }) => test);
}

function commandFromReadModel(
  command: CodingReadModelCommandFact,
): CommandOutputView | null {
  const commandId = valueString(command.command_id, command.commandId);
  if (!commandId) return null;
  const sourceEventIds = valueStringArray(
    command.source_event_ids,
    command.sourceEventIds,
  );
  return compact({
    commandId,
    status: valueString(command.status) ?? "running",
    title: safeCommand(valueString(command.command)) ?? commandId,
    command: safeCommand(valueString(command.command)),
    cwd: safeRelativePath(valueString(command.cwd)),
    exitCode: valueNumber(command.exit_code, command.exitCode),
    outputRefs: valueStringArray(command.output_refs, command.outputRefs),
    preview: safePreview(
      valueString(command.output_preview, command.outputPreview),
    ),
    sourceEventIds: sourceEventIds.length
      ? sourceEventIds
      : [`read-model:command:${commandId}`],
  });
}

function testFromReadModel(
  test: CodingReadModelTestRunFact,
): TestRunView | null {
  const testRunId = valueString(test.test_run_id, test.testRunId);
  if (!testRunId) return null;
  const sourceEventIds = valueStringArray(
    test.source_event_ids,
    test.sourceEventIds,
  );
  return compact({
    testRunId,
    status: valueString(test.status) ?? "running",
    title: valueString(test.suite, test.command_id, test.commandId) ?? testRunId,
    commandId: valueString(test.command_id, test.commandId),
    suite: valueString(test.suite),
    result: valueString(test.result),
    passed: valueNumber(test.passed),
    failed: valueNumber(test.failed),
    outputRefs: valueStringArray(test.output_refs, test.outputRefs),
    failureCategory: valueString(
      test.failure_category,
      test.failureCategory,
    ),
    sourceEventIds: sourceEventIds.length
      ? sourceEventIds
      : [`read-model:test:${testRunId}`],
  });
}

function actionEventFromReadModel(
  request: CodingReadModelPendingRequestFact,
  readModel: CodingReadModelFacts,
): AgentRuntimeExecutionEvent | null {
  const actionId = valueString(request.id);
  if (!actionId) return null;
  const requestStatus = valueString(request.status);
  const requestType = valueString(request.request_type, request.requestType);
  return compact({
    id: `read-model:action:${actionId}`,
    schemaVersion: "lime-runtime-event/v0.1",
    runtimeId: "thread-read-model",
    threadId: valueString(readModel.thread_id, readModel.threadId),
    turnId:
      valueString(request.turn_id, request.turnId) ??
      valueString(readModel.active_turn_id, readModel.activeTurnId),
    actionId,
    eventClass: "action.required",
    kind: "action",
    status: requestStatus === "resolved" ? "completed" : "blocked",
    title: valueString(request.title, requestType) ?? "Action required",
    payload: {
      actionKind: requestType,
      targetModule: "coding-workbench",
      request: request.payload,
    },
    createdAt: new Date(0).toISOString(),
  }) as AgentRuntimeExecutionEvent;
}

function mergeCommands(
  eventCommands: CommandOutputView[],
  readModel?: CodingReadModelFacts | null,
): CommandOutputView[] {
  const byId = new Map(
    eventCommands.map((command) => [command.commandId, command]),
  );
  readModel?.commands
    ?.map(commandFromReadModel)
    .filter((command): command is CommandOutputView => Boolean(command))
    .forEach((command) => {
      const existing = byId.get(command.commandId);
      byId.set(command.commandId, existing ? { ...command, ...existing } : command);
    });
  return Array.from(byId.values());
}

function mergeTests(
  eventTests: TestRunView[],
  readModel?: CodingReadModelFacts | null,
): TestRunView[] {
  const byId = new Map(eventTests.map((test) => [test.testRunId, test]));
  readModel?.tests
    ?.map(testFromReadModel)
    .filter((test): test is TestRunView => Boolean(test))
    .forEach((test) => {
      const existing = byId.get(test.testRunId);
      byId.set(test.testRunId, existing ? { ...test, ...existing } : test);
    });
  return Array.from(byId.values());
}

function mergeActions<TEvent extends AgentRuntimeExecutionEvent>(
  actions: AgentRuntimeEventProjection<TEvent>[],
  readModel?: CodingReadModelFacts | null,
): AgentRuntimeEventProjection<TEvent>[] {
  const requests =
    readModel?.pending_requests ?? readModel?.pendingRequests ?? [];
  if (!requests.length) return actions;
  const actionEvents = requests
    .map((request) => actionEventFromReadModel(request, readModel ?? {}))
    .filter((event): event is AgentRuntimeExecutionEvent => Boolean(event))
    .map(
      (event) =>
        projectAgentUiState({ executionEvents: [event as TEvent] }).actions,
    )
    .flat();
  if (!actionEvents.length) return actions;
  const byId = new Map(actions.map((action) => [action.id, action]));
  actionEvents.forEach((action) => {
    if (!byId.has(action.id)) byId.set(action.id, action);
  });
  return Array.from(byId.values());
}

function activeCommandId(
  commands: CommandOutputView[],
  readModel?: CodingReadModelFacts | null,
): string | undefined {
  return (
    valueString(readModel?.active_command_id, readModel?.activeCommandId) ??
    [...commands].reverse().find((command) => command.status === "running")
      ?.commandId
  );
}

function activeTestRunId(
  tests: TestRunView[],
  readModel?: CodingReadModelFacts | null,
): string | undefined {
  return (
    valueString(readModel?.active_test_run_id, readModel?.activeTestRunId) ??
    [...tests].reverse().find((test) => test.status === "running")?.testRunId
  );
}

function preferredTab(view: {
  changes: FileChangeView[];
  commands: CommandOutputView[];
  tests: TestRunView[];
}): CodingLocalUiState["preferredTab"] {
  if (view.tests.some((test) => test.status === "failed")) return "outputs";
  if (view.commands.length) return "outputs";
  if (view.changes.length) return "changes";
  return "preview";
}

export function projectCodingWorkbenchView<
  TEvent extends AgentRuntimeExecutionEvent,
>(
  state: AgentUiProjectionState<TEvent>,
  readModel?: CodingReadModelFacts | null,
): CodingWorkbenchView<TEvent> {
  const events = state.readModel.events.map((projection) => projection.source);
  const codingEvents = collectCodingEvents(events);
  const files = collectFiles(codingEvents);
  const changes = collectChanges(codingEvents);
  const patches = collectPatches(codingEvents);
  const commands = mergeCommands(collectCommands(codingEvents), readModel);
  const tests = mergeTests(collectTests(codingEvents), readModel);
  const actions = mergeActions(state.actions, readModel);
  const diagnostics = state.diagnostics.filter((diagnostic) =>
    codingEvents.some((event) => event.id === diagnostic.sourceEventId),
  );
  return {
    runtime: state.runtime,
    mainObject: buildMainObject(
      state,
      codingEvents,
      files,
      patches,
      commands,
      tests,
      readModel,
    ),
    files,
    changes,
    patches,
    commands,
    tests,
    actions,
    artifacts: state.artifacts,
    evidence: state.evidence,
    diagnostics,
    ui: {
      preferredTab: preferredTab({ changes, commands, tests }),
      stale: state.hydration.status === "stale" || state.hydration.status === "degraded",
    },
  };
}

export function projectCodingWorkbenchViewFromEvents<
  TEvent extends AgentRuntimeExecutionEvent,
>(
  input?: CodingWorkbenchProjectionInput<TEvent>,
): CodingWorkbenchView<TEvent> {
  return projectCodingWorkbenchView(
    projectAgentUiState(input),
    input?.codingReadModel,
  );
}
