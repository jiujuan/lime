import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentUiPerformanceSnapshot } from "@/lib/agentUiPerformanceMetrics";
import type { AgentUiPerformanceTraceHistoryRecord } from "@/lib/agentUiPerformanceTraceHistory";
import { WorkspaceTraceTab } from "./WorkspaceTraceTab";
import { buildWorkspaceTracePanelModel } from "./workspaceTracePanelModel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

const SECRET_PROMPT = "SECRET_PROMPT_PAYLOAD";
const SECRET_PROVIDER_PAYLOAD = "SECRET_PROVIDER_PAYLOAD";
const SECRET_ASSISTANT_DELTA = "SECRET_ASSISTANT_DELTA";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
});

function mount(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(node);
  });

  mountedRoots.push({ root, container });
  return container;
}

function buildSnapshot(): AgentUiPerformanceSnapshot {
  return {
    entries: [
      {
        id: 1,
        phase: "agentStream.firstTextDelta",
        at: 200,
        wallTime: 1_782_000_000_000,
        sessionId: "session-1",
        workspaceId: "workspace-1",
        source: "agent-stream",
        metrics: {
          prompt: SECRET_PROMPT,
          providerPayload: SECRET_PROVIDER_PAYLOAD,
          assistantDelta: SECRET_ASSISTANT_DELTA,
        },
      },
    ],
    sessions: [
      {
        sessionId: "session-1",
        workspaceId: "workspace-1",
        homeInputToSubmitAcceptedMs: 55,
        providerWaitMs: 1200,
        serverToRendererFirstTextDeltaMs: 34,
        clientLocalOutputMs: 90,
        homeInputToFirstTextPaintMs: 1379,
        longTaskCount: 2,
        longTaskMaxMs: 130,
        messageListComputeMaxMs: 42,
        messageListRenderGroupsMaxMs: 57,
        phases: [
          "homeInput.submit",
          "agentStream.submitAccepted",
          "agentStream.providerTrace",
          "agentStream.firstTextDelta",
          "agentStream.firstTextPaint",
        ],
      },
    ],
  };
}

function buildBaselineRecord(): AgentUiPerformanceTraceHistoryRecord {
  return {
    id: "baseline-fast-client",
    label: "retained-fast-client",
    saved_at: "2026-06-01T00:00:00.000Z",
    saved_at_ms: 1_780_000_000_000,
    schema_version: 1,
    summary: {
      entry_count: 1,
      session_count: 1,
      sessions: [
        {
          sessionId: "session-1",
          workspaceId: "workspace-1",
          phase_count: 5,
          phases: [
            "homeInput.submit",
            "agentStream.submitAccepted",
            "agentStream.providerTrace",
            "agentStream.firstTextDelta",
            "agentStream.firstTextPaint",
          ],
          metrics: {
            clientLocalOutputMs: 20,
            providerWaitMs: 1180,
            serverToRendererFirstTextDeltaMs: 30,
          },
        },
      ],
      truncated_session_count: 0,
    },
  };
}

function buildProviderSlowSnapshot(): AgentUiPerformanceSnapshot {
  const snapshot = buildSnapshot();
  return {
    entries: snapshot.entries,
    sessions: [
      {
        ...snapshot.sessions[0],
        clientLocalOutputMs: 95,
        homeInputToFirstTextPaintMs: 5080,
        providerWaitMs: 4960,
        serverToRendererFirstTextDeltaMs: 42,
      },
    ],
  };
}

function buildProviderFastBaselineRecord(): AgentUiPerformanceTraceHistoryRecord {
  return {
    ...buildBaselineRecord(),
    id: "baseline-fast-provider",
    label: "retained-fast-provider",
    summary: {
      entry_count: 1,
      session_count: 1,
      sessions: [
        {
          sessionId: "session-1",
          workspaceId: "workspace-1",
          phase_count: 5,
          phases: [
            "homeInput.submit",
            "agentStream.submitAccepted",
            "agentStream.providerTrace",
            "agentStream.firstTextDelta",
            "agentStream.firstTextPaint",
          ],
          metrics: {
            clientLocalOutputMs: 90,
            providerWaitMs: 1200,
            serverToRendererFirstTextDeltaMs: 40,
          },
        },
      ],
      truncated_session_count: 0,
    },
  };
}

function buildSnapshotWithLatestHistoryRestore(): AgentUiPerformanceSnapshot {
  const snapshot = buildSnapshot();
  return {
    entries: [
      ...snapshot.entries,
      {
        id: 2,
        phase: "workspace.historyRestore.messageListPaint",
        at: 260,
        wallTime: 1_782_000_000_060,
        sessionId: "history-session",
        workspaceId: "workspace-1",
        source: "workspace-history",
        metrics: {},
      },
    ],
    sessions: [
      ...snapshot.sessions,
      {
        sessionId: "history-session",
        workspaceId: "workspace-1",
        clickToFetchStartMs: 12,
        fetchDetailDurationMs: 44,
        clickToMessageListPaintMs: 88,
        phases: [
          "workspace.historyRestore.click",
          "workspace.historyRestore.fetchDetail",
          "workspace.historyRestore.messageListPaint",
        ],
      },
    ],
  };
}

describe("WorkspaceTraceTab", () => {
  it("应把首字链路拆成 client / server / bridge，并只把 client 段计入可优化耗时", () => {
    const model = buildWorkspaceTracePanelModel(buildSnapshot(), {
      enabled: true,
      sessionId: "session-1",
      workspaceId: "workspace-1",
    });

    expect(
      model.segments.map((segment) => ({
        id: segment.id,
        owner: segment.owner,
        valueMs: segment.valueMs,
      })),
    ).toEqual([
      { id: "input_to_accepted", owner: "client", valueMs: 55 },
      { id: "server_wait", owner: "server", valueMs: 1200 },
      { id: "server_to_renderer", owner: "bridge", valueMs: 34 },
      { id: "renderer_to_paint", owner: "client", valueMs: 90 },
    ]);
    expect(model.clientActionableMs).toBe(145);
    expect(model.totalFirstTextPaintMs).toBe(1379);
    expect(model.missingPhaseIds).toEqual([]);
    expect(model.recordedPhaseGroups).toEqual([
      { id: "input_submit", count: 1 },
      { id: "turn_submit", count: 1 },
      { id: "provider_wait", count: 1 },
      { id: "first_text", count: 2 },
    ]);
  });

  it("最后一条记录是历史恢复时，也应默认选中同 workspace 最近 Claw 发送链路", () => {
    const model = buildWorkspaceTracePanelModel(
      buildSnapshotWithLatestHistoryRestore(),
      {
        enabled: true,
        sessionId: "history-session",
        workspaceId: "workspace-1",
      },
    );

    expect(model.session?.sessionId).toBe("session-1");
    expect(model.sessionKind).toBe("claw_turn");
    expect(model.totalFirstTextPaintMs).toBe(1379);
  });

  it("只有历史恢复链路时应明确提示当前不是发送链路", () => {
    const snapshot: AgentUiPerformanceSnapshot = {
      entries: [
        {
          id: 1,
          phase: "workspace.historyRestore.messageListPaint",
          at: 100,
          wallTime: 1_782_000_000_000,
          sessionId: "history-only",
          workspaceId: "workspace-1",
          source: "workspace-history",
          metrics: {},
        },
      ],
      sessions: [
        {
          sessionId: "history-only",
          workspaceId: "workspace-1",
          clickToFetchStartMs: 10,
          clickToMessageListPaintMs: 80,
          phases: [
            "messageList.paint",
            "agentRuntime.getSession.success",
            "session.switch.fetchDetail.success",
            "messageList.paint",
            "agentRuntime.getSession.success",
            "session.switch.success",
            "messageList.commit",
            "agentUi.longTask",
          ],
        },
      ],
    };
    const model = buildWorkspaceTracePanelModel(snapshot, {
      enabled: true,
      sessionId: "history-only",
      workspaceId: "workspace-1",
    });

    expect(model.sessionKind).toBe("history_restore");
    expect(model.totalFirstTextPaintMs).toBeNull();
    expect(model.segments).toEqual([]);
    expect(model.historyRestoreMetrics).toEqual([
      { id: "click_to_fetch_start", valueMs: 10 },
      { id: "click_to_message_list_paint", valueMs: 80 },
    ]);
    expect(model.recordedPhaseGroups).toEqual([
      { id: "history_switch", count: 1 },
      { id: "history_fetch_detail", count: 1 },
      { id: "runtime_session", count: 2 },
      { id: "message_list", count: 3 },
      { id: "ui_long_task", count: 1 },
    ]);

    const container = mount(
      <WorkspaceTraceTab
        enabled
        sessionId="history-only"
        snapshot={snapshot}
        workspaceId="workspace-1"
      />,
    );

    expect(container.textContent).toContain(
      "agentChat.tracePanel.sessionKind.history_restore",
    );
    expect(container.textContent).toContain(
      "agentChat.tracePanel.historyRestore.title",
    );
    expect(container.textContent).toContain("80 ms");
    expect(container.textContent).toContain(
      "agentChat.tracePanel.recordedPhases.group.history_switch",
    );
    expect(container.textContent).toContain(
      "agentChat.tracePanel.recordedPhases.group.message_list",
    );
    expect(container.textContent).not.toContain("messageList.paint");
    expect(container.textContent).not.toContain(
      "agentRuntime.getSession.success",
    );
    expect(container.textContent).not.toContain(
      "agentChat.tracePanel.latencySplit.title",
    );
    expect(container.textContent).not.toContain(
      "agentChat.tracePanel.baseline.title",
    );
    expect(container.textContent).not.toContain(
      "agentChat.tracePanel.regression.title",
    );
    expect(container.textContent).not.toContain("--");
  });

  it("应基于 retained baseline 给出回退归因，而不是只看当前总首字", () => {
    const model = buildWorkspaceTracePanelModel(buildSnapshot(), {
      baselineRecords: [buildBaselineRecord()],
      enabled: true,
      sessionId: "session-1",
      workspaceId: "workspace-1",
    });

    expect(model.baselineComparison.verdict).toBe("regressed");
    expect(model.baselineComparison.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          baseline_ms: 20,
          current_ms: 90,
          delta_ms: 70,
          key: "clientLocalOutputMs",
          verdict: "regressed",
        }),
      ]),
    );
    expect(model.regressionReport.primary_owner).toBe("lime_client");
    expect(model.primaryRegressionSegment).toMatchObject({
      delta_ms: 70,
      key: "clientLocalOutputMs",
      owner: "lime_client",
    });
  });

  it("provider 等待主导首字时应归因到 provider_api，而不是 Lime 客户端", () => {
    const model = buildWorkspaceTracePanelModel(buildProviderSlowSnapshot(), {
      baselineRecords: [buildProviderFastBaselineRecord()],
      enabled: true,
      sessionId: "session-1",
      workspaceId: "workspace-1",
    });

    expect(model.totalFirstTextPaintMs).toBe(5080);
    expect(model.clientActionableMs).toBe(150);
    expect(model.slowSegments[0]).toMatchObject({
      id: "server_wait",
      owner: "server",
      valueMs: 4960,
    });
    expect(model.baselineComparison.verdict).toBe("regressed");
    expect(model.regressionReport.primary_owner).toBe("provider_api");
    expect(model.primaryRegressionSegment).toMatchObject({
      baseline_ms: 1200,
      current_ms: 4960,
      delta_ms: 3760,
      key: "providerWaitMs",
      owner: "provider_api",
    });
    expect(model.currentAttribution).toMatchObject({
      owner: "provider_api",
      ownerTotalMs: 4960,
      primarySegmentId: "server_wait",
      primarySegmentValueMs: 4960,
      reason: "provider_wait_dominant",
      severity: "slow",
    });
  });

  it("没有 baseline 时也应基于当前分段给出首字主因", () => {
    const snapshot = buildProviderSlowSnapshot();
    const model = buildWorkspaceTracePanelModel(snapshot, {
      enabled: true,
      sessionId: "session-1",
      workspaceId: "workspace-1",
    });

    expect(model.baselineComparison.verdict).toBe("no_baseline");
    expect(model.regressionReport.primary_owner).toBeNull();
    expect(model.currentAttribution).toMatchObject({
      owner: "provider_api",
      ownerTotalMs: 4960,
      primarySegmentId: "server_wait",
      reason: "provider_wait_dominant",
      severity: "slow",
    });

    const container = mount(
      <WorkspaceTraceTab
        enabled
        snapshot={snapshot}
        workspaceId="workspace-1"
      />,
    );

    expect(container.textContent).toContain(
      "agentChat.tracePanel.currentAttribution.title",
    );
    expect(container.textContent).toContain(
      "agentChat.tracePanel.currentAttribution.message.provider_wait_dominant",
    );
    expect(container.textContent).toContain("4960 ms");
    expect(container.textContent).toContain("98%");
  });

  it("禁用 comparison 时应保留当前会话指标但跳过 baseline 与 regression 重计算", () => {
    const model = buildWorkspaceTracePanelModel(buildSnapshot(), {
      baselineRecords: [buildBaselineRecord()],
      enabled: true,
      includeComparisons: false,
      sessionId: "session-1",
      workspaceId: "workspace-1",
    });

    expect(model.session?.sessionId).toBe("session-1");
    expect(model.segments).toHaveLength(4);
    expect(model.baselineComparison.verdict).toBe("no_baseline");
    expect(model.baselineComparison.metrics).toEqual([]);
    expect(model.regressionReport.verdict).toBe("no_evidence");
    expect(model.regressionReport.segments).toEqual([]);
  });

  it("缺关键阶段时应给出面向人的覆盖缺口", () => {
    const model = buildWorkspaceTracePanelModel(
      {
        entries: [],
        sessions: [
          {
            sessionId: "session-missing",
            phases: ["homeInput.submit"],
          },
        ],
      },
      {
        enabled: true,
        sessionId: "session-missing",
      },
    );

    expect(model.missingPhaseIds).toEqual([
      "input_to_accepted",
      "server_wait",
      "server_to_renderer",
      "renderer_to_paint",
    ]);
  });

  it("无数据时应展示人读空态，而不是 raw JSON", () => {
    const container = mount(
      <WorkspaceTraceTab
        enabled={false}
        snapshot={{ entries: [], sessions: [] }}
      />,
    );

    expect(container.textContent).toContain("agentChat.tracePanel.empty.title");
    expect(container.textContent).toContain(
      "agentChat.tracePanel.empty.disabled",
    );
    expect(container.textContent).not.toContain("{");
    expect(container.textContent).not.toContain("entries");
  });

  it("主面板只展示分段摘要，不泄露 entries 中的 prompt / provider / delta 原文", () => {
    const container = mount(
      <WorkspaceTraceTab
        baselineRecords={[buildBaselineRecord()]}
        enabled
        snapshot={buildSnapshot()}
      />,
    );

    expect(container.textContent).toContain("session-1");
    expect(container.textContent).toContain("1379 ms");
    expect(container.textContent).toContain(
      "agentChat.tracePanel.baseline.title",
    );
    expect(container.textContent).toContain(
      "agentChat.tracePanel.regression.primary",
    );
    expect(container.textContent).toContain("+70 ms");
    expect(container.textContent).not.toContain(SECRET_PROMPT);
    expect(container.textContent).not.toContain(SECRET_PROVIDER_PAYLOAD);
    expect(container.textContent).not.toContain(SECRET_ASSISTANT_DELTA);
  });

  it("复制 evidence 时只输出 compact diagnostic summary，不带 raw entries", async () => {
    const onCopyEvidence = vi.fn().mockResolvedValue(undefined);
    const container = mount(
      <WorkspaceTraceTab
        baselineRecords={[buildBaselineRecord()]}
        enabled
        snapshot={buildSnapshot()}
        onCopyEvidence={onCopyEvidence}
      />,
    );
    const copyButton = container.querySelector<HTMLButtonElement>("button");

    await act(async () => {
      copyButton?.click();
      await Promise.resolve();
    });

    expect(onCopyEvidence).toHaveBeenCalledTimes(1);
    const copiedText = String(onCopyEvidence.mock.calls[0]?.[0] ?? "");
    const payload = JSON.parse(copiedText);
    expect(payload).toMatchObject({
      schema_version: 1,
      source: "workspace_trace_tab",
      selected_session_id: "session-1",
      summary: {
        entry_count: 1,
        session_count: 1,
        sessions: [
          {
            sessionId: "session-1",
            workspaceId: "workspace-1",
            phase_count: 5,
          },
        ],
      },
    });
    expect(payload.baseline_comparison).toMatchObject({
      baseline_label: "retained-fast-client",
      verdict: "regressed",
    });
    expect(payload.regression_report).toMatchObject({
      primary_owner: "lime_client",
      verdict: "regressed",
    });
    expect(payload.current_attribution).toMatchObject({
      owner: "provider_api",
      primarySegmentId: "server_wait",
      reason: "provider_wait_dominant",
    });
    expect(copiedText).not.toContain(SECRET_PROMPT);
    expect(copiedText).not.toContain(SECRET_PROVIDER_PAYLOAD);
    expect(copiedText).not.toContain(SECRET_ASSISTANT_DELTA);
    expect(payload).not.toHaveProperty("records");
    expect(payload.summary.sessions[0]).not.toHaveProperty("entries");
    expect(payload.summary.sessions[0].metrics).toMatchObject({
      providerWaitMs: 1200,
      clientLocalOutputMs: 90,
    });
  });
});
