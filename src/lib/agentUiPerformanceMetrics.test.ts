import { afterEach, describe, expect, it } from "vitest";
import {
  clearAgentUiPerformanceMetrics,
  getAgentUiPerformanceMetrics,
  recordAgentUiPerformanceMetric,
  summarizeAgentUiPerformanceMetrics,
  subscribeAgentUiPerformanceMetricRecorded,
} from "./agentUiPerformanceMetrics";
import { clearAgentUiPerformanceTraceHistory } from "./agentUiPerformanceTraceHistory";

describe("agentUiPerformanceMetrics", () => {
  afterEach(() => {
    clearAgentUiPerformanceMetrics();
    clearAgentUiPerformanceTraceHistory();
  });

  it("应按会话汇总旧会话打开链路的关键耗时", () => {
    clearAgentUiPerformanceMetrics();

    recordAgentUiPerformanceMetric("sidebar.conversation.click", {
      sessionId: "session-a",
      source: "conversation_shelf",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("session.switch.start", {
      sessionId: "session-a",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("session.switch.fetchDetail.start", {
      sessionId: "session-a",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("session.switch.fetchDetail.success", {
      requestDurationMs: 174,
      sessionId: "session-a",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("agentRuntime.getSession.start", {
      sessionId: "session-a",
    });
    recordAgentUiPerformanceMetric("agentRuntime.getSession.success", {
      durationMs: 181,
      sessionId: "session-a",
    });
    recordAgentUiPerformanceMetric("agentUi.longTask", {
      durationMs: 52.4,
      sessionId: "session-a",
    });
    recordAgentUiPerformanceMetric("agentUi.longTask", {
      durationMs: 86.8,
      sessionId: "session-a",
    });
    recordAgentUiPerformanceMetric("session.switch.success", {
      durationMs: 220,
      sessionId: "session-a",
    });
    recordAgentUiPerformanceMetric("messageList.paint", {
      historicalContentPartsDeferredCount: 2,
      historicalMarkdownDeferredCount: 3,
      hiddenHistoryCount: 120,
      messageListComputeMs: 18.6,
      messageListGroupBuildMs: 1.2,
      messageListHistoricalContentPartsScanMs: 0.8,
      messageListHistoricalMarkdownTargetScanMs: 2.1,
      messageListRenderGroupsMs: 1.9,
      messageListThreadItemsScanMs: 7.4,
      messageListTimelineBuildMs: 5.2,
      messagesCount: 40,
      persistedHiddenHistoryCount: 120,
      renderedMessagesCount: 10,
      sessionId: "session-a",
      threadItemsScanDeferred: true,
      threadItemsCount: 0,
    });
    recordAgentUiPerformanceMetric("messageList.paint", {
      hiddenHistoryCount: 80,
      messageListComputeMs: 9.2,
      messageListGroupBuildMs: 1,
      messageListHistoricalContentPartsScanMs: 0.4,
      messageListHistoricalMarkdownTargetScanMs: 1.1,
      messageListRenderGroupsMs: 1.3,
      messageListThreadItemsScanMs: 2.7,
      messageListTimelineBuildMs: 2.8,
      messagesCount: 40,
      renderedMessagesCount: 40,
      persistedHiddenHistoryCount: 80,
      sessionId: "session-a",
      threadItemsCount: 12,
    });

    const summary = summarizeAgentUiPerformanceMetrics();
    expect(summary.sessions).toEqual([
      expect.objectContaining({
        sessionId: "session-a",
        workspaceId: "workspace-a",
        fetchDetailDurationMs: 174,
        runtimeGetSessionDurationMs: 181,
        switchStartCount: 1,
        fetchDetailStartCount: 1,
        fetchDetailErrorCount: 0,
        runtimeGetSessionStartCount: 1,
        runtimeGetSessionErrorCount: 0,
        messageListPaintCount: 2,
        finalMessagesCount: 40,
        finalRenderedMessagesCount: 40,
        finalThreadItemsCount: 12,
        hiddenHistoryCount: 80,
        historicalContentPartsDeferredMax: 2,
        historicalMarkdownDeferredMax: 3,
        longTaskCount: 2,
        longTaskMaxMs: 87,
        messageListComputeMaxMs: 19,
        messageListGroupBuildMaxMs: 1,
        messageListHistoricalContentPartsScanMaxMs: 1,
        messageListHistoricalMarkdownTargetScanMaxMs: 2,
        messageListRenderGroupsMaxMs: 2,
        messageListThreadItemsScanMaxMs: 7,
        messageListTimelineBuildMaxMs: 5,
        persistedHiddenHistoryCount: 80,
        threadItemsScanDeferredCount: 1,
      }),
    ]);
    expect(summary.sessions[0]?.clickToSwitchStartMs).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.clickToMessageListPaintMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.clickToFirstMessageListPaintMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.clickToFirstMessageListPaintMs ?? 0,
    ).toBeLessThanOrEqual(summary.sessions[0]?.clickToMessageListPaintMs ?? 0);
  });

  it("应在 window 上暴露给 Playwright 读取的 API", () => {
    recordAgentUiPerformanceMetric("sidebar.conversation.click", {
      sessionId: "session-window-api",
    });

    expect(window.__LIME_AGENTUI_PERF__?.entries()).toHaveLength(1);
    expect(window.__LIME_AGENTUI_PERF__?.summary().sessions[0]?.sessionId).toBe(
      "session-window-api",
    );
    expect(
      window.__LIME_AGENTUI_PERF__?.saveSnapshot("window snapshot"),
    ).toMatchObject({
      label: "window snapshot",
    });
    expect(window.__LIME_AGENTUI_PERF__?.history()).toHaveLength(1);
    expect(window.__LIME_AGENTUI_PERF__?.exportHistory().records).toHaveLength(
      1,
    );
    window.__LIME_AGENTUI_PERF__?.clearHistory();
    expect(window.__LIME_AGENTUI_PERF__?.history()).toHaveLength(0);

    window.__LIME_AGENTUI_PERF__?.clear();
    expect(getAgentUiPerformanceMetrics()).toHaveLength(0);
  });

  it("应发布 summary-only 的本地 metric recorded 事件", () => {
    const details: unknown[] = [];
    const unsubscribe = subscribeAgentUiPerformanceMetricRecorded((detail) => {
      details.push(detail);
    });

    recordAgentUiPerformanceMetric("agentStream.firstTextDelta", {
      providerPayload: "secret-provider-payload",
      serverToRendererDeltaMs: 120,
      sessionId: "session-event",
      workspaceId: "workspace-event",
    });
    unsubscribe();

    expect(details).toEqual([
      {
        id: 1,
        phase: "agentStream.firstTextDelta",
        sessionId: "session-event",
        source: null,
        workspaceId: "workspace-event",
      },
    ]);
    expect(JSON.stringify(details)).not.toContain("secret-provider-payload");
    expect(JSON.stringify(details)).not.toContain("serverToRendererDeltaMs");
  });

  it("应汇总首页输入提交到会话壳和发送派发的耗时", () => {
    recordAgentUiPerformanceMetric("homeInput.submit", {
      requestId: "request-a",
      sessionId: "draft-a",
      triggerToHomeSubmitMs: 7,
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("homeInput.pendingShellApplied", {
      durationMs: 11,
      requestId: "request-a",
      sessionId: "draft-a",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("homeInput.pendingPreviewCommitted", {
      durationMs: 14,
      requestId: "request-a",
      sessionId: "draft-a",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("homeInput.pendingPreviewPaint", {
      durationMs: 19,
      requestId: "request-a",
      sessionId: "draft-a",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("homeInput.sendDispatch.start", {
      elapsedMs: 31,
      requestId: "request-a",
      sessionId: "draft-a",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("workspaceSend.plan.ready", {
      durationMs: 24.2,
      requestId: "request-a",
      sessionId: "draft-a",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("agentStream.assistantDraft", {
      requestId: "request-a",
      sessionId: "draft-a",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("agentStream.assistantDraftPaint", {
      requestId: "request-a",
      sessionId: "draft-a",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("agentStream.request.start", {
      requestId: "request-a",
      sessionId: "draft-a",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("agentStream.ensureSession.done", {
      durationMs: 42.4,
      requestId: "request-a",
      sessionId: "draft-a",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("agentStream.submitDispatched", {
      requestId: "request-a",
      sessionId: "draft-a",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("agentStream.submitAccepted", {
      homeSubmittedDeltaMs: 80,
      requestId: "request-a",
      sessionId: "draft-a",
      submitInvokeMs: 18.4,
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("agentStream.firstEvent", {
      requestId: "request-a",
      sessionId: "draft-a",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("agentStream.firstRuntimeStatus", {
      requestId: "request-a",
      sessionId: "draft-a",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("agentStream.firstTextDelta", {
      homeSubmittedDeltaMs: 120,
      providerWaitMs: 320.4,
      requestId: "request-a",
      rendererEventReceivedDeltaMs: 8.6,
      serverToRendererDeltaMs: 42.2,
      sessionId: "draft-a",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("agentStream.firstTextRenderFlush", {
      requestId: "request-a",
      sessionId: "draft-a",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("agentStream.firstTextPaint", {
      clientLocalOutputDeltaMs: 16.8,
      homeSubmittedDeltaMs: 150,
      requestId: "request-a",
      sessionId: "draft-a",
      workspaceId: "workspace-a",
    });
    recordAgentUiPerformanceMetric("taskCenter.draftMaterialize.success", {
      durationMs: 88.6,
      materializedSessionId: "session-a",
      sessionId: "draft-a",
      workspaceId: "workspace-a",
    });

    const summary = summarizeAgentUiPerformanceMetrics();
    expect(summary.sessions).toEqual([
      expect.objectContaining({
        homeInputMaterializeDurationMs: 89,
        inputbarTriggerToHomeSubmitMs: 7,
        inputbarTriggerToPendingPreviewCommitMs: 14,
        inputbarTriggerToPendingPreviewPaintMs: 19,
        inputbarTriggerToPendingShellMs: 11,
        inputbarTriggerToSendDispatchMs: 31,
        inputbarTriggerToSubmitAcceptedMs: 80,
        inputbarTriggerToFirstTextDeltaMs: 120,
        inputbarTriggerToFirstTextPaintMs: 150,
        streamEnsureSessionDurationMs: 42,
        streamSubmitInvokeDurationMs: 18,
        sessionId: "draft-a",
        workspaceId: "workspace-a",
      }),
    ]);
    expect(
      summary.sessions[0]?.homeInputToPendingShellMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.homeInputToPendingPreviewPaintMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.homeInputToPendingPreviewCommitMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.homeInputToSendDispatchMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.homeInputToSendPlanReadyMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.homeInputToAssistantDraftMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.homeInputToAssistantDraftPaintMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.homeInputToStreamRequestStartMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.homeInputToSubmitAcceptedMs,
    ).toBeGreaterThanOrEqual(0);
    expect(summary.sessions[0]?.homeInputToFirstEventMs).toBeGreaterThanOrEqual(
      0,
    );
    expect(
      summary.sessions[0]?.homeInputToFirstRuntimeStatusMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.homeInputToFirstTextDeltaMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.homeInputToFirstTextRenderFlushMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.homeInputToFirstTextPaintMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.sendDispatchToSubmitAcceptedMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.streamSubmitDispatchedToAcceptedMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.submitAcceptedToFirstEventMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.firstEventToFirstTextDeltaMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.firstTextDeltaToFirstTextPaintMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.streamRequestStartToFirstTextPaintMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.submitAcceptedToFirstTextPaintMs,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.sessions[0]?.firstEventToFirstTextPaintMs,
    ).toBeGreaterThanOrEqual(0);
    expect(summary.sessions[0]?.providerWaitMs).toBe(320);
    expect(summary.sessions[0]?.serverToRendererFirstTextDeltaMs).toBe(42);
    expect(summary.sessions[0]?.rendererApplyFirstTextDeltaMs).toBe(9);
    expect(summary.sessions[0]?.clientLocalOutputMs).toBe(17);
  });

  it("应按 requestId 把首页 pending preview 合并到 materialized 真实会话摘要", () => {
    recordAgentUiPerformanceMetric("homeInput.submit", {
      requestId: "request-merge",
      sessionId: "draft-merge",
      triggerToHomeSubmitMs: 6,
      workspaceId: "workspace-merge",
    });
    recordAgentUiPerformanceMetric("homeInput.pendingShellApplied", {
      durationMs: 12,
      requestId: "request-merge",
      sessionId: "draft-merge",
      workspaceId: "workspace-merge",
    });
    recordAgentUiPerformanceMetric("homeInput.pendingPreviewCommitted", {
      durationMs: 15,
      requestId: "request-merge",
      sessionId: "draft-merge",
      workspaceId: "workspace-merge",
    });
    recordAgentUiPerformanceMetric("homeInput.pendingPreviewPaint", {
      durationMs: 18,
      requestId: "request-merge",
      sessionId: "draft-merge",
      workspaceId: "workspace-merge",
    });
    recordAgentUiPerformanceMetric("taskCenter.draftMaterialize.success", {
      durationMs: 41,
      materializedSessionId: "session-merge",
      requestId: "request-merge",
      sessionId: "draft-merge",
      workspaceId: "workspace-merge",
    });
    recordAgentUiPerformanceMetric("homeInput.sendDispatch.start", {
      elapsedMs: 52,
      requestId: "request-merge",
      sessionId: "session-merge",
      workspaceId: "workspace-merge",
    });
    recordAgentUiPerformanceMetric("agentStream.submitAccepted", {
      homeSubmittedDeltaMs: 90,
      requestId: "request-merge",
      sessionId: "session-merge",
      workspaceId: "workspace-merge",
    });
    recordAgentUiPerformanceMetric("agentStream.firstTextDelta", {
      homeSubmittedDeltaMs: 130,
      providerWaitMs: 80,
      requestId: "request-merge",
      sessionId: "session-merge",
      workspaceId: "workspace-merge",
    });
    recordAgentUiPerformanceMetric("agentStream.firstTextPaint", {
      clientLocalOutputDeltaMs: 14,
      homeSubmittedDeltaMs: 160,
      requestId: "request-merge",
      sessionId: "session-merge",
      workspaceId: "workspace-merge",
    });

    const summary = summarizeAgentUiPerformanceMetrics();
    const materializedSession = summary.sessions.find(
      (session) => session.sessionId === "session-merge",
    );

    expect(materializedSession).toMatchObject({
      homeInputMaterializeDurationMs: 41,
      inputbarTriggerToHomeSubmitMs: 6,
      inputbarTriggerToPendingPreviewCommitMs: 15,
      inputbarTriggerToPendingPreviewPaintMs: 18,
      inputbarTriggerToPendingShellMs: 12,
      inputbarTriggerToSendDispatchMs: 52,
      inputbarTriggerToSubmitAcceptedMs: 90,
      inputbarTriggerToFirstTextDeltaMs: 130,
      inputbarTriggerToFirstTextPaintMs: 160,
      sessionId: "session-merge",
      workspaceId: "workspace-merge",
    });
  });
});
