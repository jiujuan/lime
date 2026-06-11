import { describe, expect, it } from "vitest";
import type { AgentUiProjectionEvent } from "./agentUiEventProjection";
import { buildAgentUiSubagentsViewModel } from "./agentUiSubagentsViewModel";

describe("agentUiSubagentsViewModel", () => {
  it("应按 v0.6 surface 顺序构建可交互工作台 section", () => {
    const events: AgentUiProjectionEvent[] = [
      {
        type: "agent.changed",
        sourceType: "team_formation_projection",
        sequence: 1,
        sessionId: "session-team-1",
        agentId: "member-1",
        agentName: "实现手",
        owner: "agent",
        scope: "agent",
        phase: "accepted",
        surface: "team_roster",
        persistence: "snapshot",
        control: "assign",
        runtimeEntity: "subagent_turn",
      },
      {
        type: "task.changed",
        sourceType: "team_formation_projection",
        sequence: 2,
        sessionId: "session-team-1",
        taskId: "work-1",
        workItemId: "work-1",
        owner: "task",
        scope: "task",
        phase: "acting",
        surface: "work_board",
        persistence: "snapshot",
        control: "assign",
        runtimeEntity: "work_item",
      },
      {
        type: "review.requested",
        sourceType: "team_control_projection",
        sequence: 3,
        sessionId: "session-team-1",
        taskId: "review-1",
        workItemId: "review-1",
        reviewId: "review-1",
        owner: "task",
        scope: "task",
        phase: "reviewing",
        surface: "review_lane",
        persistence: "snapshot",
        control: "request_review",
        runtimeEntity: "work_item",
        payload: {
          decisionStatus: "pending_review",
          riskLevel: "high",
        },
      },
      {
        type: "agent.changed",
        sourceType: "remote_task_projection",
        sequence: 4,
        sessionId: "session-team-1",
        taskId: "remote-task-1",
        agentId: "remote-agent-1",
        agentName: "Remote Reviewer",
        owner: "agent",
        scope: "agent",
        phase: "waiting",
        surface: "remote_teammate",
        persistence: "snapshot",
        control: "answer",
        runtimeEntity: "external_task",
        runtimeStatus: "needs_input",
        payload: {
          remoteTaskId: "remote-task-1",
          agentCardProvider: "limecloud",
        },
      },
      {
        type: "tool.started",
        sourceType: "tool_start",
        sequence: 5,
        sessionId: "session-team-1",
        owner: "tool",
        scope: "tool_call",
        phase: "acting",
        surface: "tool_ui",
        persistence: "transcript",
      },
    ];

    const model = buildAgentUiSubagentsViewModel(events, {
      latestLimit: 2,
    });

    expect(model.total).toBe(4);
    expect(model.attentionCount).toBe(2);
    expect(model.sections.map((section) => section.surface)).toEqual([
      "team_roster",
      "work_board",
      "review_lane",
      "remote_teammate",
    ]);
    expect(
      model.sections.find((section) => section.surface === "team_roster")
        ?.primaryItem,
    ).toMatchObject({
      title: "实现手",
      action: { control: "assign", label: "指派", targetId: "member-1" },
    });
  });

  it("应保留 review / remote 的操作目标与注意力状态", () => {
    const model = buildAgentUiSubagentsViewModel([
      {
        type: "review.requested",
        sourceType: "team_control_projection",
        sequence: 1,
        sessionId: "session-team-1",
        threadId: "thread-1",
        taskId: "review-1",
        workItemId: "review-1",
        reviewId: "review-1",
        owner: "task",
        scope: "task",
        phase: "reviewing",
        surface: "review_lane",
        persistence: "snapshot",
        control: "request_review",
        runtimeEntity: "work_item",
        payload: {
          decisionStatus: "pending_review",
          riskLevel: "medium",
          requestedFixes: ["补证据"],
        },
      },
      {
        type: "agent.changed",
        sourceType: "remote_task_projection",
        sequence: 2,
        sessionId: "session-team-1",
        threadId: "thread-1",
        taskId: "remote-task-1",
        agentId: "remote-agent-1",
        agentName: "远端审校员",
        owner: "agent",
        scope: "agent",
        phase: "waiting",
        surface: "remote_teammate",
        persistence: "snapshot",
        control: "answer",
        topology: "remote_teammate",
        runtimeEntity: "external_task",
        runtimeStatus: "needs_input",
        payload: {
          remoteTaskId: "remote-task-1",
          inputSummary: "需要授权 token",
          agentCardProvider: "limecloud",
          artifactCount: 1,
          primaryArtifactId: "remote-artifact-1",
          primaryArtifactContentRef: "remote-blob://artifact-1",
          primaryArtifactMimeType: "text/markdown",
          primaryArtifactDigest: "sha256:remote-artifact-1",
          primaryArtifactPreview: "远端交付物预览",
        },
      },
    ]);

    const review = model.sections.find(
      (section) => section.surface === "review_lane",
    )?.primaryItem;
    const remote = model.sections.find(
      (section) => section.surface === "remote_teammate",
    )?.primaryItem;

    expect(review).toMatchObject({
      attention: true,
      action: {
        control: "request_review",
        label: "请求审核",
        targetId: "review-1",
      },
      target: {
        reviewId: "review-1",
        workItemId: "review-1",
        threadId: "thread-1",
      },
    });
    expect(review?.chips).toEqual(
      expect.arrayContaining([
        "Review 请求",
        "评审中",
        "work_item",
        "请求审核",
        "pending_review",
        "medium",
      ]),
    );
    expect(remote).toMatchObject({
      title: "远端审校员",
      subtitle:
        "远端任务：remote-task-1 / 来源：limecloud / 输入：需要授权 token / Artifact：1 / 交付物：remote-artifact-1 / 内容：remote-blob://artifact-1 / 类型：text/markdown / 校验：sha256:remote-artifact-1 / 预览：远端交付物预览",
      attention: true,
      action: {
        control: "answer",
        label: "补充输入",
        targetId: "remote-task-1",
      },
      target: { remoteTaskId: "remote-task-1", taskId: "remote-task-1" },
    });
    expect(remote?.chips).toEqual(
      expect.arrayContaining([
        "Agent 状态",
        "等待中",
        "external_task",
        "needs_input",
        "补充输入",
        "limecloud",
        "Artifact 1",
        "远端内容",
        "text/markdown",
      ]),
    );
  });

  it("应把 teammate transcript ref 暴露为 open_detail 操作目标", () => {
    const model = buildAgentUiSubagentsViewModel([
      {
        type: "agent.changed",
        sourceType: "subagent_status_changed",
        sequence: 1,
        sessionId: "session-team-1",
        taskId: "child-1",
        agentId: "child-1",
        owner: "agent",
        scope: "agent",
        phase: "acting",
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

    expect(
      model.sections.find(
        (section) => section.surface === "teammate_transcript",
      )?.primaryItem,
    ).toMatchObject({
      title: "child-1:turn-child-1",
      action: {
        control: "open_detail",
        label: "打开详情",
        targetId: "child-1:turn-child-1",
      },
      target: {
        taskId: "child-1",
        agentId: "child-1",
        transcriptRef: "child-1:turn-child-1",
      },
    });
  });

  it("应展示 specialist handoff 的结构化状态与恢复目标", () => {
    const model = buildAgentUiSubagentsViewModel([
      {
        type: "agent.handoff",
        sourceType: "evidence_projection",
        sequence: 1,
        sessionId: "session-team-1",
        threadId: "thread-1",
        handoffId: "handoff-1",
        owner: "agent",
        scope: "agent",
        phase: "accepted",
        surface: "handoff_lane",
        persistence: "evidence_pack",
        topology: "specialist_handoff",
        payload: {
          handoffEvent: "specialist_handoff",
          status: "accepted",
          from: "coordinator",
          to: "specialist",
          resumeTarget: "agent-runtime://session/session-specialist",
          contextBoundary: "workspace_root",
          summaryPreview: "已交给 specialist 继续处理。",
        },
      },
    ]);

    const item = model.sections.find(
      (section) => section.surface === "handoff_lane",
    )?.primaryItem;

    expect(item).toMatchObject({
      title: "handoff-1",
      subtitle:
        "状态：accepted / 交接：coordinator → specialist / 恢复：agent-runtime://session/session-specialist / 边界：workspace_root / 摘要：已交给 specialist 继续处理。",
      target: {
        handoffId: "handoff-1",
        threadId: "thread-1",
      },
    });
    expect(item?.chips).toEqual(
      expect.arrayContaining([
        "Agent 交接",
        "已接受",
        "accepted",
        "specialist_handoff",
        "coordinator → specialist",
      ]),
    );
  });

  it("应把 review requested fix work item 展示为可指派的修复项", () => {
    const model = buildAgentUiSubagentsViewModel([
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
        phase: "waiting",
        surface: "work_board",
        persistence: "snapshot",
        control: "assign",
        topology: "review_team",
        runtimeEntity: "work_item",
        runtimeStatus: "queued",
        payload: {
          taskEvent: "review_requested_fix",
          requestedFix: "补齐 evidence pack 导出记录",
          requestedFixIndex: 1,
          requestedFixCount: 2,
          executionStatus: "pending",
          regressionOutcome: "recovered",
        },
      },
    ]);

    const item = model.sections.find(
      (section) => section.surface === "work_board",
    )?.primaryItem;

    expect(item).toMatchObject({
      title: "补齐 evidence pack 导出记录",
      subtitle:
        "Review：review-1 / 修复项 1/2 / 状态：pending / 回归：recovered",
      attention: true,
      action: {
        control: "assign",
        label: "指派修复",
        targetId: "review-1:requested-fix:1",
      },
      target: {
        reviewId: "review-1",
        workItemId: "review-1:requested-fix:1",
        threadId: "thread-1",
      },
    });
    expect(item?.chips).toEqual(
      expect.arrayContaining([
        "Task",
        "等待中",
        "work_item",
        "queued",
        "Review fix",
        "指派",
        "待执行修复",
        "pending",
        "recovered",
      ]),
    );
  });

  it("应把结构化 reassignment 展示为 live work board update", () => {
    const model = buildAgentUiSubagentsViewModel([
      {
        type: "task.changed",
        sourceType: "team_control_projection",
        sequence: 1,
        sessionId: "session-team-1",
        threadId: "thread-1",
        taskId: "work-item-1",
        workItemId: "work-item-1",
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

    const item = model.sections.find(
      (section) => section.surface === "work_board",
    )?.primaryItem;

    expect(item).toMatchObject({
      title: "重新指派给 implementer",
      subtitle:
        "工作项：work-item-1 / 负责人：researcher → implementer / 原因：实现阶段需要切换负责人",
      action: {
        control: "assign",
        label: "重新指派",
        targetId: "work-item-1",
      },
      target: {
        workItemId: "work-item-1",
        taskId: "work-item-1",
        threadId: "thread-1",
      },
    });
    expect(item?.chips).toEqual(
      expect.arrayContaining([
        "Task",
        "路由中",
        "work_item",
        "queued",
        "指派",
        "Reassign",
        "researcher → implementer",
      ]),
    );
  });

  it("应展示 requested fix 的真实执行结果引用", () => {
    const resultRef =
      "agent-runtime://session/session-team-1/thread/thread-1/turn/turn-review/item/item-fix-1";
    const model = buildAgentUiSubagentsViewModel([
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
        topology: "review_team",
        runtimeEntity: "work_item",
        runtimeStatus: "completed",
        payload: {
          taskEvent: "review_requested_fix",
          requestedFix: "补齐 evidence pack 导出记录",
          requestedFixIndex: 1,
          requestedFixCount: 1,
          executionStatus: "completed",
          regressionOutcome: "recovered",
          executionSummaryPreview: "已重新导出 evidence pack。",
          executionResultRef: resultRef,
          executionArtifactPaths: [
            ".lime/harness/sessions/session-team-1/evidence/runtime.json",
          ],
        },
        refs: {
          artifactPaths: [
            ".lime/harness/sessions/session-team-1/evidence/runtime.json",
          ],
        },
      },
    ]);

    const item = model.sections.find(
      (section) => section.surface === "work_board",
    )?.primaryItem;

    expect(item).toMatchObject({
      subtitle: `Review：review-1 / 修复项 1/1 / 状态：completed / 回归：recovered / 结果：已重新导出 evidence pack。 / 引用：${resultRef}`,
      action: {
        control: "open_detail",
        label: "查看修复结果",
        targetId: "review-1:requested-fix:1",
      },
      target: {
        evidenceId: undefined,
        resultRef,
        artifactPaths: [
          ".lime/harness/sessions/session-team-1/evidence/runtime.json",
        ],
      },
    });
    expect(item?.chips).toEqual(
      expect.arrayContaining([
        "修复完成",
        "completed",
        "recovered",
        "有执行引用",
      ]),
    );
  });

  it("应展示 worker notification 的 usage、时长、工具数和结果引用", () => {
    const model = buildAgentUiSubagentsViewModel([
      {
        type: "worker.notification",
        sourceType: "subagent_status_changed",
        sequence: 1,
        sessionId: "session-team-1",
        taskId: "child-1",
        agentId: "child-1",
        workerNotificationId: "child-1:completed",
        transcriptRef: "child-1:turn-child-done",
        owner: "agent",
        scope: "agent",
        phase: "completed",
        surface: "worker_notifications",
        persistence: "archive",
        runtimeEntity: "subagent_turn",
        runtimeStatus: "completed",
        workerUsage: {
          inputTokens: 120,
          outputTokens: 32,
          cachedInputTokens: 5,
          cacheCreationInputTokens: 7,
          totalTokens: 152,
        },
        payload: {
          notificationKind: "worker_completed",
          transcriptRef: "child-1:turn-child-done",
          workerUsage: {
            inputTokens: 120,
            outputTokens: 32,
            cachedInputTokens: 5,
            cacheCreationInputTokens: 7,
            totalTokens: 152,
          },
          durationMs: 12345,
          toolCount: 4,
          resultRef: "artifact://worker-result-1",
        },
      },
    ]);

    const item = model.sections.find(
      (section) => section.surface === "worker_notifications",
    )?.primaryItem;

    expect(item).toMatchObject({
      title: "child-1:completed",
      subtitle:
        "Transcript：child-1:turn-child-done / Tokens：152 / 输入：120 / 输出：32 / 缓存读：5 / 缓存写：7 / 时长：12345ms / 工具：4 / 结果：artifact://worker-result-1",
      target: {
        taskId: "child-1",
        agentId: "child-1",
        workerNotificationId: "child-1:completed",
        transcriptRef: "child-1:turn-child-done",
        resultRef: "artifact://worker-result-1",
      },
    });
    expect(item?.chips).toEqual(
      expect.arrayContaining([
        "Worker 通知",
        "已完成",
        "subagent_turn",
        "completed",
        "Tokens 152",
        "工具 4",
        "有结果引用",
      ]),
    );
  });

  it("可为后续 UI 保留空 section，但不把非 workbench event 计入总数", () => {
    const model = buildAgentUiSubagentsViewModel(
      [
        {
          type: "tool.started",
          sourceType: "tool_start",
          sequence: 1,
          sessionId: "session-team-1",
          owner: "tool",
          scope: "tool_call",
          phase: "acting",
          surface: "tool_ui",
          persistence: "transcript",
        },
      ],
      { includeEmptySections: true },
    );

    expect(model.total).toBe(0);
    expect(model.sections).toHaveLength(10);
    expect(
      model.sections.every((section) => section.latestItems.length === 0),
    ).toBe(true);
  });

  it("可通过 key-based presentation mapper 本地化 event/phase/control/surface 文案", () => {
    const t = (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        "agentChat.agentUiProjection.control.assign": "Assign",
        "agentChat.agentUiProjection.eventType.task.changed": "Task update",
        "agentChat.agentUiProjection.phase.acting": "Acting",
        "agentChat.agentUiProjection.surface.work_board.label": "Work board",
        "agentChat.agentUiProjection.surface.work_board.description":
          "Localized work board",
      };
      return translations[key] ?? `${options?.defaultValue ?? key}`;
    };

    const model = buildAgentUiSubagentsViewModel(
      [
        {
          type: "task.changed",
          sourceType: "team_formation_projection",
          sequence: 1,
          sessionId: "session-team-1",
          taskId: "work-1",
          workItemId: "work-1",
          owner: "task",
          scope: "task",
          phase: "acting",
          surface: "work_board",
          persistence: "snapshot",
          control: "assign",
          runtimeEntity: "work_item",
        },
      ],
      { t },
    );

    const section = model.sections[0];
    const item = section?.primaryItem;
    expect(section).toMatchObject({
      label: "Work board",
      description: "Localized work board",
    });
    expect(item).toMatchObject({
      phaseLabel: "Acting",
      action: { label: "Assign" },
    });
    expect(item?.chips).toEqual(
      expect.arrayContaining(["Task update", "Acting", "Assign"]),
    );
  });
});
