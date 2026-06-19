import { describe, expect, it, vi } from "vitest";
import {
  clearAgentUiProjectionEvents,
  createConversationProjectionStore,
  selectAgentUiProjectionEvents,
  selectAgentUiProjectionEventsBySurface,
  selectAgentUiProjectionEventsBySurfaceForScope,
  selectAgentUiProjectionEventsByType,
  selectAgentUiProjectionEventsByTypeForScope,
  selectAgentUiProjectionEventsForScope,
  selectLatestAgentUiProjectionEventByType,
  selectLatestAgentUiProjectionEventForAction,
  selectLatestAgentUiProjectionEventForArtifact,
  selectLatestAgentUiProjectionEventForEvidence,
  selectLatestAgentUiProjectionEventForRun,
  selectLatestAgentUiProjectionEventForScope,
  selectLatestAgentUiProjectionEventForToolCall,
  selectConversationStreamDiagnostics,
  selectLatestConversationStreamDiagnostic,
} from "./conversationProjectionStore";

describe("conversationProjectionStore", () => {
  it("应记录 stream diagnostics，并按 session 提供最新投影", () => {
    const store = createConversationProjectionStore();
    const listener = vi.fn();
    store.subscribe(listener);

    const first = store.recordStreamDiagnostic({
      phase: "agentStream.request.start",
      at: 10,
      wallTime: 1000,
      sessionId: "session-a",
      workspaceId: "workspace-a",
      source: "test",
      requestId: "request-a",
      actualSessionId: null,
      metrics: {
        route: "home",
      },
    });
    const second = store.recordStreamDiagnostic({
      phase: "agentStream.firstTextDelta",
      at: 20,
      wallTime: 1010,
      sessionId: "session-a",
      workspaceId: "workspace-a",
      source: "test",
      requestId: "request-a",
      actualSessionId: "actual-a",
      metrics: {
        latencyMs: 10,
      },
    });

    const snapshot = store.getSnapshot();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(selectConversationStreamDiagnostics(snapshot)).toEqual([
      first,
      second,
    ]);
    expect(
      selectLatestConversationStreamDiagnostic(snapshot, "session-a"),
    ).toEqual(second);
  });

  it("应只通知 diagnostics 订阅者，未变化的其它 slice 保持引用稳定", () => {
    const store = createConversationProjectionStore();
    const before = store.getSnapshot();

    store.recordStreamDiagnostic({
      phase: "agentStream.firstEvent",
      at: 1,
      wallTime: 1,
      sessionId: "session-b",
      workspaceId: "workspace-b",
      source: "test",
      requestId: "request-b",
      actualSessionId: null,
      metrics: {},
    });

    const after = store.getSnapshot();
    expect(after.diagnostics).not.toBe(before.diagnostics);
    expect(after.session).toBe(before.session);
    expect(after.stream).toBe(before.stream);
    expect(after.queue).toBe(before.queue);
    expect(after.render).toBe(before.render);
    expect(after.agentUi).toBe(before.agentUi);
  });

  it("无 sessionId 时应按 requestId 记录最新 stream diagnostic", () => {
    const store = createConversationProjectionStore();

    const entry = store.recordStreamDiagnostic({
      phase: "agentStream.submitAccepted",
      at: 1,
      wallTime: 1,
      sessionId: null,
      workspaceId: "workspace-c",
      source: "test",
      requestId: "request-c",
      actualSessionId: null,
      metrics: {},
    });

    expect(
      selectLatestConversationStreamDiagnostic(
        store.getSnapshot(),
        "request-c",
      ),
    ).toEqual(entry);
  });

  it("应记录 Agent UI projection events，并按 run/tool/action/artifact 建索引", () => {
    const store = createConversationProjectionStore();
    const listener = vi.fn();
    store.subscribe(listener);

    const [toolEvent, actionEvent, artifactEvent, evidenceEvent] =
      store.recordAgentUiProjectionEvents([
        {
          type: "tool.result",
          sourceType: "tool_end",
          sequence: 1,
          sessionId: "session-a",
          runId: "run-a",
          toolCallId: "tool-a",
          owner: "tool",
          scope: "tool_call",
          phase: "completed",
          surface: "tool_ui",
        },
        {
          type: "action.required",
          sourceType: "action_required",
          sequence: 2,
          sessionId: "session-a",
          runId: "run-a",
          actionId: "action-a",
          owner: "action",
          scope: "action_request",
          phase: "waiting",
          surface: "hitl",
        },
        {
          type: "artifact.preview.ready",
          sourceType: "artifact_snapshot",
          sequence: 3,
          sessionId: "session-a",
          runId: "run-a",
          artifactId: "artifact-a",
          owner: "artifact",
          scope: "artifact",
          phase: "completed",
          surface: "artifact_workspace",
        },
        {
          type: "evidence.changed",
          sourceType: "evidence_projection",
          sequence: 4,
          sessionId: "session-a",
          runId: "run-a",
          evidenceId: "evidence-a",
          owner: "evidence",
          scope: "evidence",
          phase: "completed",
          surface: "timeline_evidence",
        },
      ]);

    const snapshot = store.getSnapshot();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(selectAgentUiProjectionEvents(snapshot)).toEqual([
      toolEvent,
      actionEvent,
      artifactEvent,
      evidenceEvent,
    ]);
    expect(
      selectAgentUiProjectionEventsByType(snapshot, "tool.result"),
    ).toEqual([toolEvent]);
    expect(
      selectLatestAgentUiProjectionEventByType(snapshot, "evidence.changed"),
    ).toBe(evidenceEvent);
    expect(selectLatestAgentUiProjectionEventForRun(snapshot, "run-a")).toBe(
      evidenceEvent,
    );
    expect(
      selectLatestAgentUiProjectionEventForToolCall(snapshot, "tool-a"),
    ).toBe(toolEvent);
    expect(
      selectLatestAgentUiProjectionEventForAction(snapshot, "action-a"),
    ).toBe(actionEvent);
    expect(
      selectLatestAgentUiProjectionEventForArtifact(snapshot, "artifact-a"),
    ).toBe(artifactEvent);
    expect(
      selectLatestAgentUiProjectionEventForEvidence(snapshot, "evidence-a"),
    ).toBe(evidenceEvent);
  });

  it("同一 turn/tool 已有 item lifecycle 时应丢弃 legacy tool_start/tool_end 主事件", () => {
    const store = createConversationProjectionStore();
    const itemStarted = {
      type: "tool.progress",
      sourceType: "item_started",
      sequence: 1,
      sessionId: "session-a",
      threadId: "thread-a",
      turnId: "turn-a",
      toolCallId: "tool-a",
      owner: "tool",
      scope: "tool_call",
      phase: "acting",
      surface: "tool_ui",
      persistence: "archive",
    } as const;
    const itemCompleted = {
      ...itemStarted,
      type: "tool.result",
      sourceType: "item_completed",
      sequence: 4,
      phase: "completed",
    } as const;
    const legacyStarted = {
      ...itemStarted,
      type: "tool.started",
      sourceType: "tool_start",
      sequence: 2,
      persistence: "ephemeral_live",
    } as const;
    const legacyResult = {
      ...itemStarted,
      type: "tool.result",
      sourceType: "tool_end",
      sequence: 5,
      phase: "completed",
      persistence: "archive",
    } as const;
    const legacyOutputDelta = {
      ...itemStarted,
      type: "tool.output.delta",
      sourceType: "tool_output_delta",
      sequence: 3,
      persistence: "ephemeral_live",
    } as const;

    expect(
      store.recordAgentUiProjectionEvents([
        itemStarted,
        legacyStarted,
        legacyOutputDelta,
        itemCompleted,
        legacyResult,
      ]),
    ).toEqual([itemStarted, legacyOutputDelta, itemCompleted]);

    expect(selectAgentUiProjectionEvents(store.getSnapshot())).toEqual([
      itemStarted,
      legacyOutputDelta,
      itemCompleted,
    ]);
    expect(
      selectLatestAgentUiProjectionEventForToolCall(
        store.getSnapshot(),
        "tool-a",
      ),
    ).toBe(itemCompleted);
  });

  it("legacy tool event 先到后收到 item lifecycle 时应回收旧主事件", () => {
    const store = createConversationProjectionStore();
    const legacyStarted = {
      type: "tool.started",
      sourceType: "tool_start",
      sequence: 1,
      sessionId: "session-a",
      threadId: "thread-a",
      turnId: "turn-a",
      toolCallId: "tool-a",
      owner: "tool",
      scope: "tool_call",
      phase: "acting",
      surface: "tool_ui",
      persistence: "ephemeral_live",
    } as const;
    const itemCompleted = {
      ...legacyStarted,
      type: "tool.result",
      sourceType: "item_completed",
      sequence: 2,
      phase: "completed",
      persistence: "archive",
    } as const;

    store.recordAgentUiProjectionEvents([legacyStarted]);
    expect(selectAgentUiProjectionEvents(store.getSnapshot())).toEqual([
      legacyStarted,
    ]);

    expect(store.recordAgentUiProjectionEvents([itemCompleted])).toEqual([
      itemCompleted,
    ]);
    expect(selectAgentUiProjectionEvents(store.getSnapshot())).toEqual([
      itemCompleted,
    ]);
  });

  it("不同 turn 的同名 toolCallId 不应被 item lifecycle 去重误删", () => {
    const store = createConversationProjectionStore();
    const itemCompleted = {
      type: "tool.result",
      sourceType: "item_completed",
      sequence: 1,
      sessionId: "session-a",
      threadId: "thread-a",
      turnId: "turn-a",
      toolCallId: "tool-a",
      owner: "tool",
      scope: "tool_call",
      phase: "completed",
      surface: "tool_ui",
      persistence: "archive",
    } as const;
    const nextTurnLegacyStarted = {
      ...itemCompleted,
      type: "tool.started",
      sourceType: "tool_start",
      sequence: 2,
      turnId: "turn-b",
      phase: "acting",
      persistence: "ephemeral_live",
    } as const;

    expect(
      store.recordAgentUiProjectionEvents([
        itemCompleted,
        nextTurnLegacyStarted,
      ]),
    ).toEqual([itemCompleted, nextTurnLegacyStarted]);

    expect(selectAgentUiProjectionEvents(store.getSnapshot())).toEqual([
      itemCompleted,
      nextTurnLegacyStarted,
    ]);
  });

  it("应支持清空全局 Agent UI projection events", () => {
    const store = createConversationProjectionStore();
    store.recordAgentUiProjectionEvents([
      {
        type: "text.delta",
        sourceType: "text_delta",
        sessionId: "session-a",
        owner: "model",
        scope: "part",
        phase: "producing",
      },
    ]);
    expect(selectAgentUiProjectionEvents(store.getSnapshot())).toHaveLength(1);
    store.clearAgentUiProjectionEvents();
    expect(selectAgentUiProjectionEvents(store.getSnapshot())).toEqual([]);

    clearAgentUiProjectionEvents();
  });

  it("应支持按 session/thread/run 等 scope 读取 Agent UI projection events", () => {
    const store = createConversationProjectionStore();
    const [first, second, third] = store.recordAgentUiProjectionEvents([
      {
        type: "task.changed",
        sourceType: "queue_added",
        sequence: 1,
        sessionId: "session-a",
        threadId: "thread-a",
        runId: "run-a",
        taskId: "task-a",
        owner: "task",
        scope: "task",
        phase: "submitted",
        surface: "task_capsule",
      },
      {
        type: "evidence.changed",
        sourceType: "evidence_projection",
        sequence: 2,
        sessionId: "session-a",
        threadId: "thread-a",
        runId: "run-a",
        evidenceId: "evidence-a",
        owner: "evidence",
        scope: "evidence",
        phase: "completed",
        surface: "timeline_evidence",
      },
      {
        type: "diagnostic.changed",
        sourceType: "runtime_status",
        sequence: 3,
        sessionId: "session-b",
        threadId: "thread-b",
        runId: "run-b",
        owner: "diagnostics",
        scope: "run",
        phase: "routing",
        surface: "diagnostics",
      },
    ]);

    const snapshot = store.getSnapshot();
    expect(
      selectAgentUiProjectionEventsForScope(snapshot, {
        sessionId: "session-a",
      }),
    ).toEqual([first, second]);
    expect(
      selectAgentUiProjectionEventsByTypeForScope(
        snapshot,
        "evidence.changed",
        { sessionId: "session-a" },
      ),
    ).toEqual([second]);
    expect(
      selectAgentUiProjectionEventsBySurface(snapshot, "task_capsule"),
    ).toEqual([first]);
    expect(
      selectAgentUiProjectionEventsBySurfaceForScope(
        snapshot,
        "timeline_evidence",
        { sessionId: "session-a" },
      ),
    ).toEqual([second]);
    expect(
      selectLatestAgentUiProjectionEventForScope(snapshot, {
        threadId: "thread-a",
        runId: "run-a",
      }),
    ).toBe(second);
    expect(
      selectLatestAgentUiProjectionEventForScope(snapshot, {
        sessionId: "session-b",
      }),
    ).toBe(third);
  });
});
