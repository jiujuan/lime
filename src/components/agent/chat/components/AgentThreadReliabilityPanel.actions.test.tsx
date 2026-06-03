import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderPanel } from "./AgentThreadReliabilityPanel.testFixtures";

describe("AgentThreadReliabilityPanel", () => {
  it("中断进行中时，面板应展示中断中的瞬时状态", async () => {
    let resolveInterrupt: (() => void) | null = null;
    const onInterruptCurrentTurn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveInterrupt = resolve;
        }),
    );
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-1",
        status: "running",
        active_turn_id: "turn-1",
        pending_requests: [],
        incidents: [],
      },
      turns: [
        {
          id: "turn-1",
          thread_id: "thread-1",
          prompt_text: "继续整理发布说明",
          status: "running",
          started_at: "2026-03-23T09:00:00Z",
          created_at: "2026-03-23T09:00:00Z",
          updated_at: "2026-03-23T09:00:05Z",
        },
      ],
      currentTurnId: "turn-1",
      canInterrupt: true,
      onInterruptCurrentTurn,
    });

    const button = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent?.includes("停止当前执行"),
    );
    expect(button).toBeDefined();

    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("中断中");
    expect(container.textContent).toContain("正在请求停止当前执行");
    expect(container.textContent).toContain("正在停止");

    await act(async () => {
      resolveInterrupt?.();
      await Promise.resolve();
    });
  });

  it("应展示最近刷新时间、运行时中断态，并支持跳转待处理请求与恢复排队回合", async () => {
    const onLocatePendingRequest = vi.fn();
    const onResumeThread = vi.fn().mockResolvedValue(true);
    const onPromoteQueuedTurn = vi.fn().mockResolvedValue(true);
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-1",
        status: "aborted",
        active_turn_id: "turn-1",
        pending_requests: [
          {
            id: "req-1",
            thread_id: "thread-1",
            turn_id: "turn-1",
            request_type: "ask_user",
            status: "pending",
            title: "请确认是否继续发布",
            created_at: "2026-03-23T09:00:00Z",
          },
        ],
        queued_turns: [
          {
            queued_turn_id: "queued-1",
            message_preview: "继续执行排队任务",
            message_text: "继续执行排队任务正文",
            created_at: 1711184400,
            image_count: 0,
            position: 1,
          },
        ],
        interrupt_state: "interrupted",
        updated_at: "2026-03-23T09:00:20Z",
        incidents: [],
      },
      onResumeThread,
      onLocatePendingRequest,
      onPromoteQueuedTurn,
    });

    expect(container.textContent).toContain("最近刷新");
    expect(container.textContent).toContain("运行时已确认中断");
    expect(container.textContent).toContain("前往待处理请求");
    expect(container.textContent).toContain("恢复执行");
    expect(container.textContent).toContain("优先执行 队列第 1 位");

    const buttons = Array.from(container.querySelectorAll("button"));
    const locateButton = buttons.find((node) =>
      node.textContent?.includes("前往待处理请求"),
    );
    const resumeButton = buttons.find((node) =>
      node.textContent?.includes("恢复执行"),
    );
    const promoteButton = buttons.find((node) =>
      node.textContent?.includes("优先执行 队列第 1 位"),
    );

    act(() => {
      locateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onLocatePendingRequest).toHaveBeenCalledWith("req-1");

    await act(async () => {
      resumeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(onResumeThread).toHaveBeenCalledTimes(1);

    await act(async () => {
      promoteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(onPromoteQueuedTurn).toHaveBeenCalledWith("queued-1");
  });

  it("请求已提交待回填时，应压住旧 pending 并展示继续处理中", () => {
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-1",
        status: "waiting_request",
        active_turn_id: "turn-1",
        pending_requests: [
          {
            id: "req-1",
            thread_id: "thread-1",
            turn_id: "turn-1",
            request_type: "ask_user",
            status: "pending",
            title: "请确认是否继续发布",
            created_at: "2026-03-23T09:00:00Z",
          },
        ],
        incidents: [
          {
            id: "incident-req-1",
            thread_id: "thread-1",
            turn_id: "turn-1",
            incident_type: "waiting_user_input",
            severity: "medium",
            status: "active",
            title: "线程正在等待人工处理",
          },
        ],
      },
      submittedActionsInFlight: [
        {
          requestId: "req-1",
          actionType: "ask_user",
          prompt: "请确认是否继续发布",
          status: "submitted",
          submittedResponse: '{"answer":"继续"}',
          submittedUserData: { answer: "继续" },
        },
      ],
      turns: [
        {
          id: "turn-1",
          thread_id: "thread-1",
          prompt_text: "继续发布",
          status: "running",
          started_at: "2026-03-23T09:00:00Z",
          created_at: "2026-03-23T09:00:00Z",
          updated_at: "2026-03-23T09:00:10Z",
        },
      ],
      currentTurnId: "turn-1",
    });

    expect(container.textContent).toContain("处理中");
    expect(container.textContent).toContain("已提交响应，等待线程继续执行");
    expect(container.textContent).toContain("已提交响应：请确认是否继续发布");
    expect(container.textContent).not.toContain("当前最需要处理的请求");
  });

  it("运行回合卡住时，应展示主动恢复建议", () => {
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-1",
        status: "running",
        active_turn_id: "turn-stuck",
        pending_requests: [],
        incidents: [
          {
            id: "incident-stuck",
            thread_id: "thread-1",
            turn_id: "turn-stuck",
            incident_type: "turn_stuck",
            severity: "high",
            status: "active",
            title: "当前回合长时间无进展",
            details: "最近 3 分钟内没有新的线程更新，可尝试停止后恢复执行。",
          },
        ],
      },
      turns: [
        {
          id: "turn-stuck",
          thread_id: "thread-1",
          prompt_text: "继续回填发布摘要",
          status: "running",
          started_at: "2026-03-23T09:55:00Z",
          created_at: "2026-03-23T09:55:00Z",
          updated_at: "2026-03-23T09:56:00Z",
        },
      ],
      currentTurnId: "turn-stuck",
      canInterrupt: true,
      onInterruptCurrentTurn: vi.fn().mockResolvedValue(undefined),
    });

    expect(container.textContent).toContain("当前回合长时间无进展");
    expect(container.textContent).toContain(
      "当前回合长时间无进展，建议停止后恢复执行",
    );
  });

  it("存在待处理请求时应支持重新拉起请求", async () => {
    const onReplayPendingRequest = vi.fn().mockResolvedValue(true);
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-1",
        status: "waiting_request",
        pending_requests: [
          {
            id: "req-replay-1",
            thread_id: "thread-1",
            turn_id: "turn-1",
            request_type: "ask_user",
            status: "pending",
            title: "请重新确认执行模式",
            created_at: "2026-03-23T09:00:00Z",
          },
        ],
        incidents: [],
      },
      onReplayPendingRequest,
    });

    const replayButton = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent?.includes("重新拉起请求"),
    );
    expect(replayButton).toBeDefined();

    await act(async () => {
      replayButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onReplayPendingRequest).toHaveBeenCalledWith("req-replay-1");
  });

 });
