import { describe, expect, it } from "vitest";

import {
  buildProjection,
  type Message,
} from "./messageListItemProjection.testHarness";

describe("messageListItemProjection timeline flow", () => {
  it("终态 canonical 审批只由 timeline 持有，移除消息侧重复副本", () => {
    const message: Message = {
      id: "assistant-terminal-approval",
      role: "assistant",
      content: "审批已拒绝，继续使用无浏览器路径。",
      timestamp: new Date("2026-07-13T05:00:00.000Z"),
      actionRequests: [
        {
          requestId: "approval-terminal",
          actionType: "tool_confirmation",
          status: "submitted",
          prompt: "允许访问浏览器吗？",
        },
      ],
      contentParts: [
        {
          type: "action_required",
          actionRequired: {
            requestId: "approval-terminal",
            actionType: "tool_confirmation",
            status: "submitted",
            prompt: "允许访问浏览器吗？",
          },
        },
        { type: "text", text: "审批已拒绝，继续使用无浏览器路径。" },
      ],
    };

    const projection = buildProjection(message, [
      {
        id: "canonical-approval-item",
        type: "approval_request",
        turn_id: "turn-terminal-approval",
        sequence: 2,
        request_id: "approval-terminal",
        action_type: "tool_confirmation",
        prompt: "允许访问浏览器吗？",
        response: { decision: "decline" },
        status: "completed",
        started_at: "2026-07-13T04:59:00.000Z",
        completed_at: "2026-07-13T04:59:30.000Z",
        updated_at: "2026-07-13T04:59:30.000Z",
      },
    ] as never);

    const approvalParts = projection.rendererContentParts?.filter(
      (
        part,
      ): part is Extract<
        NonNullable<Message["contentParts"]>[number],
        { type: "action_required" }
      > => part.type === "action_required",
    );
    expect(approvalParts).toHaveLength(1);
    expect(approvalParts?.[0]?.actionRequired.requestId).toBe(
      "approval-terminal",
    );
    expect(projection.rendererActionRequests).toEqual([]);
    expect(projection.primaryActionRequests).toBeUndefined();
    expect(projection.primaryTimeline).toBeNull();
  });

  it("历史 timeline 的审批和问答应按顺序进入交错过程", () => {
    const message: Message = {
      id: "assistant-history-actions",
      role: "assistant",
      content: "最终回答：已按你的选择继续。",
      timestamp: new Date("2026-06-02T10:03:00.000Z"),
    };

    const projection = buildProjection(message, [
      {
        id: "assistant-before-approval",
        type: "agent_message",
        turn_id: "turn-action-history",
        sequence: 1,
        text: "我需要先确认是否允许联网。",
        status: "completed",
        started_at: "2026-06-02T10:02:01.000Z",
        completed_at: "2026-06-02T10:02:02.000Z",
        updated_at: "2026-06-02T10:02:02.000Z",
      },
      {
        id: "approval-search",
        type: "approval_request",
        turn_id: "turn-action-history",
        sequence: 2,
        request_id: "approval-search",
        action_type: "tool_confirmation",
        prompt: "允许联网搜索今天的国际新闻吗？",
        tool_name: "web_search",
        arguments: { query: "today international news" },
        status: "in_progress",
        started_at: "2026-06-02T10:02:03.000Z",
        updated_at: "2026-06-02T10:02:03.000Z",
      },
      {
        id: "assistant-before-format",
        type: "agent_message",
        turn_id: "turn-action-history",
        sequence: 3,
        text: "确认后我再询问输出格式。",
        status: "completed",
        started_at: "2026-06-02T10:02:04.000Z",
        completed_at: "2026-06-02T10:02:05.000Z",
        updated_at: "2026-06-02T10:02:05.000Z",
      },
      {
        id: "ask-format",
        type: "request_user_input",
        turn_id: "turn-action-history",
        sequence: 4,
        request_id: "ask-format",
        action_type: "ask_user",
        prompt: "请选择输出格式",
        questions: [
          {
            question: "请选择输出格式",
            options: [{ label: "简报" }, { label: "时间线" }],
          },
        ],
        response: { answer: "简报" },
        status: "completed",
        started_at: "2026-06-02T10:02:06.000Z",
        completed_at: "2026-06-02T10:02:07.000Z",
        updated_at: "2026-06-02T10:02:07.000Z",
      },
      {
        id: "assistant-action-final",
        type: "agent_message",
        turn_id: "turn-action-history",
        sequence: 5,
        phase: "final_answer",
        text: "最终回答：已按你的选择继续。",
        status: "completed",
        started_at: "2026-06-02T10:02:58.000Z",
        completed_at: "2026-06-02T10:03:00.000Z",
        updated_at: "2026-06-02T10:03:00.000Z",
      },
    ] as never);

    const expectedActionContent = "最终回答：已按你的选择继续。";
    expect(projection.actionContent).toBe(expectedActionContent);
    expect(projection.rendererRawContent).toBe(expectedActionContent);
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "action_required",
      "text",
      "action_required",
      "text",
    ]);
    expect(
      projection.rendererContentParts?.[0]?.type === "text"
        ? projection.rendererContentParts[0].text
        : "",
    ).toBe("我需要先确认是否允许联网。");
    expect(
      projection.rendererContentParts?.[2]?.type === "text"
        ? projection.rendererContentParts[2].text
        : "",
    ).toBe("确认后我再询问输出格式。");

    const actionParts = projection.rendererContentParts?.filter(
      (
        part,
      ): part is Extract<
        NonNullable<Message["contentParts"]>[number],
        { type: "action_required" }
      > => part.type === "action_required",
    );
    expect(actionParts?.map((part) => part.actionRequired.requestId)).toEqual([
      "approval-search",
      "ask-format",
    ]);
    expect(actionParts?.[0]?.actionRequired.status).toBe("pending");
    expect(actionParts?.[1]?.actionRequired.status).toBe("submitted");
  });

  it("历史图片查看工具应保持 timeline 顺序并保留图片 metadata", () => {
    const message: Message = {
      id: "assistant-history-view-image",
      role: "assistant",
      content: "最终观察：截图里有一个仪表盘。",
      timestamp: new Date("2026-06-02T10:04:00.000Z"),
    };

    const projection = buildProjection(message, [
      {
        id: "assistant-before-image",
        type: "agent_message",
        turn_id: "turn-image-history",
        sequence: 1,
        text: "我先查看你给的截图。",
        status: "completed",
        started_at: "2026-06-02T10:03:01.000Z",
        completed_at: "2026-06-02T10:03:02.000Z",
        updated_at: "2026-06-02T10:03:02.000Z",
      },
      {
        id: "tool-view-image-history",
        type: "tool_call",
        turn_id: "turn-image-history",
        sequence: 2,
        tool_name: "ViewImageTool",
        arguments: { path: "/workspace/assets/dashboard.png" },
        output:
          "Viewed image: /workspace/assets/dashboard.png\nFormat: image/png\nImage content is attached to this tool result.",
        metadata: {
          model_visible_image: true,
          image_url: "data:image/png;base64,ZGFzaGJvYXJk",
          mime_type: "image/png",
          path: "/workspace/assets/dashboard.png",
        },
        success: true,
        status: "completed",
        started_at: "2026-06-02T10:03:03.000Z",
        completed_at: "2026-06-02T10:03:04.000Z",
        updated_at: "2026-06-02T10:03:04.000Z",
      },
      {
        id: "assistant-after-image",
        type: "agent_message",
        turn_id: "turn-image-history",
        sequence: 3,
        phase: "final_answer",
        text: "最终观察：截图里有一个仪表盘。",
        status: "completed",
        started_at: "2026-06-02T10:03:58.000Z",
        completed_at: "2026-06-02T10:04:00.000Z",
        updated_at: "2026-06-02T10:04:00.000Z",
      },
    ] as never);

    const expectedActionContent = "最终观察：截图里有一个仪表盘。";
    expect(projection.actionContent).toBe(expectedActionContent);
    expect(projection.rendererRawContent).toBe(expectedActionContent);
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "text",
    ]);
    expect(
      projection.rendererContentParts?.[0]?.type === "text"
        ? projection.rendererContentParts[0].text
        : "",
    ).toBe("我先查看你给的截图。");

    const toolPart = projection.rendererContentParts?.find(
      (
        part,
      ): part is Extract<
        NonNullable<Message["contentParts"]>[number],
        { type: "tool_use" }
      > => part.type === "tool_use",
    );
    expect(toolPart?.toolCall.result?.metadata?.image_url).toBe(
      "data:image/png;base64,ZGFzaGJvYXJk",
    );
  });

  it("历史任务板工具应保持时间线穿插顺序且不把任务 JSON 当正文", () => {
    const message: Message = {
      id: "assistant-task-board-history",
      role: "assistant",
      content: "最终结论：任务板已完成。",
      timestamp: new Date("2026-06-02T10:02:00.000Z"),
    };

    const projection = buildProjection(message, [
      {
        id: "assistant-task-intro",
        type: "agent_message",
        turn_id: "turn-legacy-unphased-final",
        sequence: 1,
        phase: "final_answer",
        text: "我先把工作拆成任务板。",
        status: "completed",
        started_at: "2026-06-02T10:01:00.000Z",
        completed_at: "2026-06-02T10:01:01.000Z",
        updated_at: "2026-06-02T10:01:01.000Z",
      },
      {
        id: "tool-task-create-history",
        type: "tool_call",
        turn_id: "turn-legacy-unphased-final",
        sequence: 2,
        tool_name: "TaskCreateTool",
        arguments: {
          subject: "整理国际新闻",
          description: "按来源交叉验证并输出摘要",
        },
        output: JSON.stringify({
          task: { id: "1", subject: "整理国际新闻" },
        }),
        metadata: {
          task: {
            id: "1",
            subject: "整理国际新闻",
            status: "pending",
          },
          task_list_id: "board-main",
          tasks: [
            {
              id: "1",
              subject: "整理国际新闻",
              status: "pending",
            },
          ],
        },
        success: true,
        status: "completed",
        started_at: "2026-06-02T10:01:02.000Z",
        completed_at: "2026-06-02T10:01:03.000Z",
        updated_at: "2026-06-02T10:01:03.000Z",
      },
      {
        id: "tool-task-get-missing-history",
        type: "tool_call",
        turn_id: "turn-legacy-unphased-final",
        sequence: 3,
        tool_name: "TaskGetTool",
        arguments: { task_id: "missing-task" },
        output: JSON.stringify({ task: null }),
        metadata: {
          task: null,
          task_list_id: "board-main",
          task_list: [],
        },
        success: true,
        status: "completed",
        started_at: "2026-06-02T10:01:04.000Z",
        completed_at: "2026-06-02T10:01:05.000Z",
        updated_at: "2026-06-02T10:01:05.000Z",
      },
      {
        id: "tool-task-update-history",
        type: "tool_call",
        turn_id: "turn-legacy-unphased-final",
        sequence: 4,
        tool_name: "TaskUpdateTool",
        arguments: {
          task_id: "1",
          status: "completed",
          add_blocked_by: ["0"],
        },
        output: JSON.stringify({
          success: true,
          taskId: "1",
          updatedFields: ["status"],
        }),
        metadata: {
          success: true,
          task_id: "1",
          task_list_id: "board-main",
          status_change: {
            from: "pending",
            to: "completed",
          },
        },
        success: true,
        status: "completed",
        started_at: "2026-06-02T10:01:06.000Z",
        completed_at: "2026-06-02T10:01:07.000Z",
        updated_at: "2026-06-02T10:01:07.000Z",
      },
      {
        id: "assistant-task-final",
        type: "agent_message",
        turn_id: "turn-legacy-unphased-final",
        sequence: 5,
        phase: "final_answer",
        text: "最终结论：任务板已完成。",
        status: "completed",
        started_at: "2026-06-02T10:01:58.000Z",
        completed_at: "2026-06-02T10:02:00.000Z",
        updated_at: "2026-06-02T10:02:00.000Z",
      },
    ] as never);

    const expectedActionContent = "最终结论：任务板已完成。";
    expect(projection.actionContent).toBe(expectedActionContent);
    expect(projection.rendererRawContent).toBe(expectedActionContent);
    expect(projection.rendererRawContent).not.toContain("updatedFields");
    expect(projection.rendererRawContent).not.toContain("task_list_id");
    expect(projection.rendererContentParts?.map((part) => part.type)).toEqual([
      "text",
      "tool_use",
      "tool_use",
      "tool_use",
      "text",
    ]);
    expect(
      projection.rendererContentParts?.[0]?.type === "text"
        ? projection.rendererContentParts[0].text
        : "",
    ).toBe("我先把工作拆成任务板。");
    expect(
      projection.rendererContentParts?.filter(
        (part) => part.type === "tool_use",
      ),
    ).toHaveLength(3);
  });
});
