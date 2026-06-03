import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { recordAgentUiProjectionEvents } from "../projection/conversationProjectionStore";
import {
  mockGetAgentRuntimeSession,
  openTechnicalDetails,
  renderPanel,
} from "./TeamWorkbenchSummaryPanel.testFixtures";

describe("TeamWorkbenchSummaryPanel", () => {
  it("应展示 requested fix 回填输入框后的发起状态", () => {
    recordAgentUiProjectionEvents([
      {
        type: "task.changed",
        sourceType: "evidence_projection",
        sequence: 1,
        sessionId: "session-team-1",
        reviewId: "review-1",
        workItemId: "review-1:requested-fix:1",
        taskId: "review-1:requested-fix:1",
        owner: "task",
        scope: "task",
        phase: "waiting",
        surface: "work_board",
        persistence: "snapshot",
        control: "assign",
        runtimeEntity: "work_item",
        payload: {
          taskEvent: "review_requested_fix",
          requestedFix: "补齐 evidence pack 导出记录",
          executionStatus: "pending",
        },
      },
    ]);

    const onWorkbenchAction = vi.fn().mockReturnValue("seeded_work_item");
    const container = renderPanel({
      currentSessionId: "session-team-1",
      onWorkbenchAction,
    });
    openTechnicalDetails(container);

    const requestedFixAction = container.querySelector<HTMLButtonElement>(
      '[data-agentui-action-target="review-1:requested-fix:1"]',
    );
    expect(requestedFixAction).not.toBeNull();

    act(() => {
      requestedFixAction?.click();
    });

    expect(onWorkbenchAction).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(
      "指派修复 · review-1:requested-fix:1",
    );
    expect(container.textContent).toContain("已回填输入");
    expect(container.textContent).toContain(
      "修复请求已回填到输入框；发送后才会进入执行，这里不会直接标记完成。",
    );
  });
  it("应展示 requested fix 已提交到 runtime turn 的执行状态", async () => {
    recordAgentUiProjectionEvents([
      {
        type: "task.changed",
        sourceType: "evidence_projection",
        sequence: 1,
        sessionId: "session-team-1",
        reviewId: "review-1",
        workItemId: "review-1:requested-fix:1",
        taskId: "review-1:requested-fix:1",
        owner: "task",
        scope: "task",
        phase: "waiting",
        surface: "work_board",
        persistence: "snapshot",
        control: "assign",
        runtimeEntity: "work_item",
        payload: {
          taskEvent: "review_requested_fix",
          requestedFix: "补齐 evidence pack 导出记录",
          executionStatus: "pending",
        },
      },
    ]);

    const onWorkbenchAction = vi.fn().mockResolvedValue("submitted_work_item");
    const container = renderPanel({
      currentSessionId: "session-team-1",
      onWorkbenchAction,
    });
    openTechnicalDetails(container);

    const requestedFixAction = container.querySelector<HTMLButtonElement>(
      '[data-agentui-action-target="review-1:requested-fix:1"]',
    );
    expect(requestedFixAction).not.toBeNull();

    await act(async () => {
      requestedFixAction?.click();
    });

    expect(onWorkbenchAction).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("已提交执行");
    expect(container.textContent).toContain(
      "修复请求已提交为执行请求；结果会等后台记录回写后再更新。",
    );
  });
  it("没有实时活动时应从队友任务历史正文读取记录预览", async () => {
    mockGetAgentRuntimeSession.mockResolvedValue({
      id: "child-1",
      name: "分析助手",
      created_at: 1_710_000_000,
      updated_at: 1_710_000_100,
      messages: [
        {
          id: "message-1",
          role: "assistant",
          timestamp: 1_710_000_090,
          content: [
            {
              type: "text",
              text: "历史正文：已完成差异梳理，并整理出两个未对齐项。",
            },
          ],
        },
      ],
      items: [
        {
          id: "item-input-1",
          thread_id: "thread-child-1",
          turn_id: "turn-child-1",
          sequence: 4,
          status: "in_progress",
          started_at: "2026-05-09T10:00:00Z",
          updated_at: "2026-05-09T10:00:02Z",
          type: "request_user_input",
          request_id: "input-1",
          action_type: "clarify_fix_scope",
          prompt: "请选择修复策略",
          questions: [{ question: "先修 UI 还是协议？", header: "修复范围" }],
        },
        {
          id: "item-tool-1",
          thread_id: "thread-child-1",
          turn_id: "turn-child-1",
          sequence: 3,
          status: "in_progress",
          started_at: "2026-05-09T10:00:00Z",
          updated_at: "2026-05-09T10:00:01Z",
          type: "tool_call",
          tool_name: "browser_snapshot",
          output: "正在读取页面结构。",
        },
        {
          id: "item-message-1",
          thread_id: "thread-child-1",
          turn_id: "turn-child-1",
          sequence: 2,
          status: "completed",
          started_at: "2026-05-09T09:59:00Z",
          completed_at: "2026-05-09T09:59:10Z",
          updated_at: "2026-05-09T09:59:10Z",
          type: "agent_message",
          text: "历史正文：已完成差异梳理，并整理出两个未对齐项。",
        },
      ],
      queued_turns: [
        {
          queued_turn_id: "queued-turn-1",
          message_preview: "继续处理 Agent UI transcript drilldown",
          message_text: "继续处理 Agent UI transcript drilldown",
          created_at: 1_710_000_095,
          image_count: 1,
          position: 0,
        },
      ],
    });
    recordAgentUiProjectionEvents([
      {
        type: "agent.changed",
        sourceType: "subagent_status_changed",
        sequence: 1,
        sessionId: "session-team-1",
        taskId: "child-1",
        agentId: "child-1",
        owner: "agent",
        scope: "agent",
        phase: "completed",
        surface: "teammate_transcript",
        persistence: "snapshot",
        control: "open_detail",
        runtimeEntity: "subagent_turn",
        transcriptRef: "child-1:turn-child-1",
        payload: {
          agentEvent: "teammate_transcript_ref",
        },
      },
    ]);

    const container = renderPanel({
      currentSessionId: "session-team-1",
      childSubagentSessions: [
        {
          id: "child-1",
          name: "分析助手",
          created_at: 1_710_000_000,
          updated_at: 1_710_000_100,
          session_type: "sub_agent",
          runtime_status: "completed",
          latest_turn_status: "completed",
          task_summary: "梳理标准差异",
          role_hint: "explorer",
        },
      ],
    });
    openTechnicalDetails(container);

    const transcriptAction = container.querySelector<HTMLButtonElement>(
      '[data-agentui-action-target="child-1:turn-child-1"]',
    );
    expect(transcriptAction).not.toBeNull();

    await act(async () => {
      transcriptAction?.click();
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGetAgentRuntimeSession).toHaveBeenCalledWith("child-1", {
      historyLimit: 20,
    });
    expect(container.textContent).toContain("记录明细");
    expect(container.textContent).toContain("输入队列 1 条");
    expect(container.textContent).toContain("待处理输入 1 条");
    expect(container.textContent).toContain("工具活动 1 条");
    expect(container.textContent).toContain("近期消息 1 条");
    expect(container.textContent).toContain("这里只展示已有输入队列与历史正文");
    expect(container.textContent).toContain("继续处理工作台记录明细");
    expect(container.textContent).not.toContain("Agent UI transcript");
    expect(container.textContent).toContain("图片 1");
    expect(container.textContent).toContain("请选择修复策略");
    expect(container.textContent).toContain("等待补充");
    expect(container.textContent).toContain("工具活动");
    expect(container.textContent).toContain("工具调用");
    expect(container.textContent).toContain("队友任务进展");
    expect(container.textContent).toContain("历史正文 3 条");
    expect(container.textContent).toContain("回复");
    expect(container.textContent).toContain(
      "历史正文：已完成差异梳理，并整理出两个未对齐项。",
    );
    expect(container.textContent).toContain("不把队友输出混进主回复");
  });
  it("应在 Team Workbench 中展示 reassignment live board update", () => {
    recordAgentUiProjectionEvents([
      {
        type: "task.changed",
        sourceType: "team_control_projection",
        sequence: 1,
        sessionId: "session-team-1",
        threadId: "thread-1",
        taskId: "work-item-2",
        workItemId: "work-item-2",
        owner: "task",
        scope: "task",
        phase: "routing",
        surface: "work_board",
        persistence: "snapshot",
        control: "assign",
        runtimeEntity: "work_item",
        runtimeStatus: "queued",
        payload: {
          taskEvent: "team_reassignment",
          action: "reassign",
          previousAssigneeId: "researcher",
          nextAssigneeId: "implementer",
          reassignmentReason: "实现阶段需要切换负责人",
        },
      },
    ]);

    const onWorkbenchAction = vi
      .fn()
      .mockReturnValue("work_item_source_located");
    const container = renderPanel({
      currentSessionId: "session-team-1",
      onWorkbenchAction,
    });
    openTechnicalDetails(container);

    expect(container.textContent).toContain("重新指派给 implementer");
    expect(container.textContent).toContain(
      "工作项：work-item-2 / 负责人：researcher → implementer / 原因：实现阶段需要切换负责人",
    );
    expect(container.textContent).toContain("Reassign");
    expect(container.textContent).toContain("researcher → implementer");

    const reassignAction = container.querySelector<HTMLButtonElement>(
      '[data-agentui-action-target="work-item-2"]',
    );
    expect(reassignAction).not.toBeNull();

    act(() => {
      reassignAction?.click();
    });

    expect(onWorkbenchAction).toHaveBeenCalledTimes(1);
    expect(onWorkbenchAction.mock.calls[0]?.[0]).toMatchObject({
      title: "重新指派给 implementer",
      action: {
        control: "assign",
        label: "重新指派",
        targetId: "work-item-2",
      },
      target: {
        workItemId: "work-item-2",
        taskId: "work-item-2",
        threadId: "thread-1",
      },
    });
    expect(container.textContent).toContain("已定位工作台目标");
    expect(container.textContent).toContain("工作项已定位");
    expect(container.textContent).toContain(
      "已定位任务记录；可通过负责人选择器回填更新指令，等待后台确认负责人变化。",
    );
    expect(container.textContent).toContain("重新指派 · work-item-2");
    expect(container.textContent).toContain("任务板");
  });
  it("应为 work_board source fact 提供重指派 selector 并回填 TaskUpdate 指令", async () => {
    recordAgentUiProjectionEvents([
      {
        type: "task.changed",
        sourceType: "item_completed",
        sequence: 1,
        sessionId: "session-team-1",
        threadId: "thread-1",
        taskId: "work-item-2",
        workItemId: "work-item-2",
        owner: "task",
        scope: "task",
        phase: "accepted",
        surface: "work_board",
        persistence: "snapshot",
        control: "assign",
        runtimeEntity: "work_item",
        runtimeStatus: "accepted",
        payload: {
          taskEvent: "team_reassignment",
          action: "reassign",
          previousAssigneeId: "研究员",
          nextAssigneeId: "实现者",
          reassignmentReason: "实现阶段需要切换负责人",
          sourceTaskListId: "task-list-1",
        },
      },
    ]);

    const onWorkbenchReassign = vi
      .fn()
      .mockResolvedValue("seeded_reassignment");
    const container = renderPanel({
      currentSessionId: "session-team-1",
      childSubagentSessions: [
        {
          id: "child-implementer",
          name: "实现者",
          created_at: 1,
          updated_at: 2,
          session_type: "sub_agent",
          runtime_status: "running",
          latest_turn_status: "running",
          role_hint: "executor",
        },
        {
          id: "child-reviewer",
          name: "复核员",
          created_at: 1,
          updated_at: 2,
          session_type: "sub_agent",
          runtime_status: "idle",
          latest_turn_status: "idle",
          role_hint: "reviewer",
        },
      ],
      onWorkbenchAction: vi.fn().mockReturnValue("work_item_source_located"),
      onWorkbenchReassign,
    });
    openTechnicalDetails(container);

    const reassignAction = container.querySelector<HTMLButtonElement>(
      '[data-agentui-action-target="work-item-2"]',
    );
    expect(reassignAction).not.toBeNull();

    act(() => {
      reassignAction?.click();
    });

    const selector = container.querySelector<HTMLSelectElement>(
      "[data-agentui-reassignment-select]",
    );
    expect(selector).not.toBeNull();
    expect(container.textContent).toContain("负责人重指派");
    expect(container.textContent).toContain("负责人更新");
    expect(container.textContent).toContain("以后台返回的负责人变化为准");

    await act(async () => {
      if (!selector) {
        throw new Error("selector 不应为空");
      }
      selector.value = "复核员";
      selector.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const submit = container.querySelector<HTMLButtonElement>(
      "[data-agentui-reassignment-submit]",
    );
    expect(submit).not.toBeNull();

    await act(async () => {
      submit?.click();
      await Promise.resolve();
    });

    expect(onWorkbenchReassign).toHaveBeenCalledTimes(1);
    expect(onWorkbenchReassign.mock.calls[0]?.[0]).toMatchObject({
      title: "重新指派给 实现者",
      target: {
        workItemId: "work-item-2",
        taskId: "work-item-2",
      },
    });
    expect(onWorkbenchReassign.mock.calls[0]?.[1]).toBe("复核员");
    expect(container.textContent).toContain("重指派已回填");
    expect(container.textContent).toContain(
      "负责人更新指令已回填；发送并执行后，以后台返回的负责人变化为准。",
    );
  });
  it("应把 requested fix 的执行结果引用串到 artifact / evidence 追溯链路", () => {
    const resultRef =
      "agent-runtime://session/session-team-1/thread/thread-1/turn/turn-review/item/item-fix-1";
    const artifactPath =
      ".lime/harness/sessions/session-team-1/evidence/runtime.json";

    recordAgentUiProjectionEvents([
      {
        type: "task.changed",
        sourceType: "evidence_projection",
        sequence: 1,
        sessionId: "session-team-1",
        threadId: "thread-1",
        taskId: "review-1:requested-fix:1",
        workItemId: "review-1:requested-fix:1",
        reviewId: "review-1",
        owner: "task",
        scope: "task",
        phase: "completed",
        surface: "work_board",
        persistence: "snapshot",
        control: "open_detail",
        runtimeEntity: "work_item",
        runtimeStatus: "completed",
        payload: {
          taskEvent: "review_requested_fix",
          requestedFix: "补齐 evidence pack 导出记录",
          requestedFixIndex: 1,
          requestedFixCount: 1,
          executionStatus: "completed",
          regressionOutcome: "recovered",
          executionResultRef: resultRef,
          executionArtifactPaths: [artifactPath],
        },
        refs: {
          artifactPaths: [artifactPath],
        },
      },
      {
        type: "artifact.changed",
        sourceType: "artifact_snapshot",
        sequence: 2,
        sessionId: "session-team-1",
        threadId: "thread-1",
        artifactId: "runtime-json",
        owner: "artifact",
        scope: "artifact",
        phase: "completed",
        surface: "artifact_workspace",
        persistence: "artifact_store",
        rawEventRef: resultRef,
        refs: {
          artifactIds: ["runtime-json"],
          artifactPaths: [artifactPath],
          rawEventRef: resultRef,
        },
      },
    ]);

    const onWorkbenchAction = vi.fn().mockReturnValue("unsupported_work_item");
    const container = renderPanel({
      currentSessionId: "session-team-1",
      onWorkbenchAction,
    });
    openTechnicalDetails(container);

    const requestedFixAction = container.querySelector<HTMLButtonElement>(
      '[data-agentui-action-target="review-1:requested-fix:1"]',
    );
    expect(requestedFixAction).not.toBeNull();

    act(() => {
      requestedFixAction?.click();
    });

    expect(onWorkbenchAction).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("已定位工作台目标");
    expect(container.textContent).toContain("工作项未连接");
    expect(container.textContent).toContain(
      "任务记录已定位；后台写回接入前，这里只提供查看。",
    );
    expect(container.textContent).toContain(`结果引用：${resultRef}`);
    expect(container.textContent).toContain(`交付物路径：${artifactPath}`);
    expect(container.textContent).toContain("相关队友链路");
    expect(container.textContent).toContain("交付物引用");
    expect(container.textContent).toContain("交付物工作区");
    expect(container.textContent).toContain("runtime-json");
  });
});
