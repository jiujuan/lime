import { act } from "react";
import { describe, expect, it } from "vitest";
import type { AgentThreadItem } from "../types";
import { at, createBaseItem, renderTimeline } from "./AgentThreadTimeline.testFixtures";
import { changeLimeLocale } from "@/i18n/createI18n";

describe("AgentThreadTimeline", () => {
  it("应按真实发生顺序渲染思考与工具块", () => {
    const items: AgentThreadItem[] = [
      {
        ...createBaseItem("browser-1", 1),
        type: "tool_call",
        tool_name: "browser_navigate",
        arguments: { url: "https://example.com" },
      },
      {
        ...createBaseItem("summary-1", 2),
        type: "turn_summary",
        text: "页面已打开",
      },
      {
        ...createBaseItem("search-1", 3),
        type: "web_search",
        action: "web_search",
        query: "封面尺寸",
      },
    ];

    const container = renderTimeline(items);
    const blockIds = Array.from(
      container.querySelectorAll<HTMLElement>(
        "[data-testid^='agent-thread-block:']",
      ),
    )
      .map((node) => node.dataset.testid)
      .filter((value): value is string => Boolean(value))
      .filter(
        (value) => !value.endsWith(":shell") && !value.endsWith(":details"),
      );

    expect(blockIds).toEqual(["agent-thread-block:1:process"]);
  });
  it("同类多工具步骤应显示批次数量并切成轻量子行", () => {
    const items: AgentThreadItem[] = [
      {
        ...createBaseItem("browser-1", 1),
        type: "tool_call",
        tool_name: "browser_navigate",
        arguments: { url: "https://example.com" },
      },
      {
        ...createBaseItem("browser-2", 2),
        type: "tool_call",
        tool_name: "browser_click",
        arguments: { selector: "#publish" },
      },
    ];

    const container = renderTimeline(items, {
      turn: {
        status: "completed",
      },
    });

    const block = container.querySelector<HTMLDetailsElement>(
      '[data-testid="agent-thread-block:1:process"]',
    );
    const summary = block?.querySelector("summary");

    expect(summary?.textContent).toContain("2 步");
    expect(summary?.textContent).toContain("2 个工具步骤");
    expect(
      container.querySelectorAll('[data-testid="tool-call-item"]'),
    ).toHaveLength(0);

    act(() => {
      summary?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const toolRows = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid="tool-call-item"]'),
    );

    expect(toolRows).toHaveLength(2);
    expect(toolRows[0]?.dataset.grouped).toBe("yes");
    expect(toolRows[0]?.dataset.groupMarker).toBe("└");
    expect(toolRows[1]?.dataset.grouped).toBe("yes");
    expect(toolRows[1]?.dataset.groupMarker).toBe("·");
  });
  it("历史非活跃过程即使残留运行中状态也应默认折叠明细", () => {
    const container = renderTimeline(
      [
        {
          ...createBaseItem("browser-1", 1),
          status: "in_progress",
          completed_at: undefined,
          type: "tool_call",
          tool_name: "browser_navigate",
          arguments: { url: "https://example.com" },
        },
        {
          ...createBaseItem("browser-2", 2),
          status: "in_progress",
          completed_at: undefined,
          type: "tool_call",
          tool_name: "browser_click",
          arguments: { selector: "#publish" },
        },
      ],
      {
        turn: {
          status: "completed",
        },
        collapseInactiveDetails: true,
      },
    );

    const block = container.querySelector<HTMLDetailsElement>(
      '[data-testid="agent-thread-block:1:process"]',
    );

    expect(block?.open).toBe(false);
    expect(block?.querySelector("summary")?.textContent).toContain("2 步");
    expect(
      container.querySelectorAll('[data-testid="tool-call-item"]'),
    ).toHaveLength(0);
  });

  it("本地历史导入过程应在完成态历史中默认展开工具细节", () => {
    const container = renderTimeline(
      [
        {
          ...createBaseItem("command-imported", 1),
          type: "command_execution",
          command: "npm test",
          cwd: "/workspace/imported-codex",
          aggregated_output: "Exit code: 0\nOutput:\nok",
          exit_code: 0,
          metadata: {
            imported: true,
            source_client: "codex",
          },
        },
        {
          ...createBaseItem("search-imported", 2),
          type: "web_search",
          action: "search_query",
          query: "Lime history import",
          output: "search result summary",
          metadata: {
            imported: true,
            source_client: "codex",
          },
        },
      ] as AgentThreadItem[],
      {
        turn: {
          status: "completed",
        },
        collapseInactiveDetails: true,
      },
    );

    const block = container.querySelector<HTMLDetailsElement>(
      '[data-testid="agent-thread-block:1:process"]',
    );

    expect(block?.open).toBe(true);
    expect(container.textContent).toContain("npm test");
    expect(container.textContent).toContain("Lime history import");
    expect(
      container.querySelectorAll('[data-testid="tool-call-item"]'),
    ).toHaveLength(2);
  });

  it("本地历史导入过程摘要应跟随当前语言资源", async () => {
    await changeLimeLocale("en-US");
    const container = renderTimeline(
      [
        {
          ...createBaseItem("command-imported", 1),
          type: "command_execution",
          command: "npm test",
          cwd: "/workspace/imported-codex",
          aggregated_output: "Exit code: 0\nOutput:\nok",
          exit_code: 0,
          metadata: {
            imported: true,
            source_client: "codex",
          },
        },
        {
          ...createBaseItem("search-imported", 2),
          type: "web_search",
          action: "search_query",
          query: "Lime history import",
          output: "search result summary",
          metadata: {
            imported: true,
            source_client: "codex",
          },
        },
      ] as AgentThreadItem[],
      {
        turn: {
          status: "completed",
        },
        collapseInactiveDetails: true,
      },
    );

    const summaryText =
      container
        .querySelector<HTMLDetailsElement>(
          '[data-testid="agent-thread-block:1:process"]',
        )
        ?.querySelector("summary")?.textContent ?? "";

    expect(summaryText).toContain("Imported command record");
    expect(summaryText).toContain("1 command records");
    expect(summaryText).toContain("1 search records");
    expect(summaryText).not.toContain("导入的命令记录");
    expect(summaryText).not.toContain("搜索记录");
  });

  it("子任务协作卡片应跟随 collaboration copy 资源", async () => {
    await changeLimeLocale("en-US");
    const container = renderTimeline(
      [
        {
          ...createBaseItem("subagent-1", 1),
          type: "subagent_activity",
          title: "Review",
          summary: "Checking edge cases",
          status: "in_progress",
          status_label: "queued",
          completed_at: undefined,
          session_id: "child-session-1",
        } as AgentThreadItem,
      ],
      {
        turn: {
          status: "running",
        },
        onOpenSubagentSession: () => undefined,
      },
    );

    expect(container.textContent).toContain("Subtask: Review");
    expect(container.textContent).toContain("Queued");
    expect(container.textContent).toContain("View subtask details");
    expect(container.textContent).not.toContain("查看子任务详情");
  });

  it("连续执行流里有运行中步骤时，应聚合为一个高亮过程块", () => {
    const items: AgentThreadItem[] = [
      {
        ...createBaseItem("browser-1", 1),
        type: "tool_call",
        tool_name: "browser_navigate",
        arguments: { url: "https://example.com" },
      },
      {
        ...createBaseItem("search-1", 2),
        status: "in_progress",
        completed_at: undefined,
        updated_at: at(2),
        type: "web_search",
        action: "web_search",
        query: "Mac mini 最新价格",
      },
      {
        ...createBaseItem("other-1", 3),
        type: "tool_call",
        tool_name: "workspace_sync",
      },
    ];

    const container = renderTimeline(items, { isCurrentTurn: true });
    const processBlock = container.querySelector<HTMLDetailsElement>(
      '[data-testid="agent-thread-block:1:process"]',
    );

    expect(processBlock?.dataset.emphasis).toBe("active");
    expect(container.textContent).toContain("Mac mini 最新价格");
    expect(processBlock?.open).toBe(true);
  });
  it("当前回合的思考和搜索过程应在运行中展开", () => {
    const items: AgentThreadItem[] = [
      {
        ...createBaseItem("reasoning-1", 1),
        status: "in_progress",
        completed_at: undefined,
        type: "reasoning",
        text: "用户\n\n搜索结果",
      },
      {
        ...createBaseItem("search-1", 2),
        status: "in_progress",
        completed_at: undefined,
        type: "web_search",
        action: "web_search",
        query: "国际新闻 2026年5月9日",
      },
    ];

    const container = renderTimeline(items, {
      isCurrentTurn: true,
      turn: {
        status: "running",
      },
    });

    const processBlock = container.querySelector<HTMLDetailsElement>(
      '[data-testid="agent-thread-block:1:process"]',
    );

    expect(processBlock).not.toBeNull();
    expect(processBlock?.open).toBe(true);
    expect(processBlock?.querySelector("summary")?.textContent).toContain(
      "国际新闻 2026年5月9日",
    );
    expect(container.textContent).toContain("搜索结果");
    expect(
      container.querySelector('[data-testid="tool-call-item"]'),
    ).not.toBeNull();
  });
  it("存在待处理请求时应显示轻量待处理提示", () => {
    const items: AgentThreadItem[] = [
      {
        ...createBaseItem("action-1", 1),
        type: "tool_call",
        tool_name: "write_file",
        arguments: { path: "publish.md" },
      },
    ];

    const container = renderTimeline(items, {
      turn: {
        status: "aborted",
      },
      actionRequests: [
        {
          requestId: "req-title",
          actionType: "ask_user",
          status: "pending",
          prompt: "请先确认文章标题。",
          questions: [{ question: "这篇文章的最终标题是什么？" }],
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-inline-status"]')
        ?.textContent,
    ).toContain("待处理");
    expect(container.textContent).toContain("确认文章标题");
    expect(container.textContent).not.toContain("已中断");
  });
  it("运行时权限确认等待不应渲染为失败或暴露内部字段", () => {
    const internalError =
      "运行时权限声明需要真实确认，当前 turn 已在模型执行前等待用户确认：confirmationStatus=not_requested，askProfileKeys=web_search, write_artifacts。已创建真实权限确认请求；请确认后重试或恢复本轮执行。";
    const items: AgentThreadItem[] = [
      {
        ...createBaseItem("permission-request-1", 1),
        status: "in_progress",
        completed_at: undefined,
        type: "request_user_input",
        request_id: "runtime_permission_confirmation:turn-1",
        action_type: "elicitation",
        prompt:
          "当前执行需要确认运行时权限：web_search, write_artifacts。确认后才允许继续模型执行；拒绝会保持阻断。",
        questions: [
          {
            header: "运行时权限确认",
            question:
              "当前执行需要确认运行时权限：web_search, write_artifacts。确认后才允许继续模型执行；拒绝会保持阻断。",
            options: [{ label: "允许本次执行" }, { label: "拒绝" }],
          },
        ],
      },
      {
        ...createBaseItem("permission-error-1", 2),
        type: "error",
        message: internalError,
      },
    ];

    const container = renderTimeline(items, {
      turn: {
        status: "failed",
        error_message: internalError,
      },
    });

    expect(
      container.querySelector('[data-testid="agent-thread-inline-status"]')
        ?.textContent,
    ).toContain("待处理");
    expect(container.textContent).toContain("当前执行需要确认运行时权限");
    expect(container.textContent).toContain("运行时权限确认");
    expect(container.textContent).not.toContain("碰到错误");
    expect(container.textContent).not.toContain("失败");
    expect(container.textContent).not.toContain("confirmationStatus");
    expect(container.textContent).not.toContain("askProfileKeys");
  });
  it("运行时权限确认提交后仍不应重新暴露内部等待错误", () => {
    const internalError =
      "运行时权限声明需要真实确认，当前 turn 已在模型执行前等待用户确认：confirmationStatus=confirmed，askProfileKeys=web_search。已创建真实权限确认请求；请确认后重试或恢复本轮执行。";
    const items: AgentThreadItem[] = [
      {
        ...createBaseItem("permission-request-1", 1),
        type: "request_user_input",
        request_id: "runtime_permission_confirmation:turn-1",
        action_type: "elicitation",
        status: "completed",
        prompt:
          "当前执行需要确认运行时权限：web_search。确认后才允许继续模型执行；拒绝会保持阻断。",
        response: { answer: "允许本次执行" },
      },
      {
        ...createBaseItem("permission-error-1", 2),
        type: "error",
        message: internalError,
      },
    ];

    const container = renderTimeline(items, {
      turn: {
        status: "failed",
        error_message: internalError,
      },
      actionRequests: [
        {
          requestId: "runtime_permission_confirmation:turn-1",
          actionType: "elicitation",
          prompt:
            "当前执行需要确认运行时权限：web_search。确认后才允许继续模型执行；拒绝会保持阻断。",
          status: "submitted",
          submittedUserData: { answer: "允许本次执行" },
        },
      ],
    });

    expect(
      container.querySelector('[data-testid="agent-thread-inline-status"]')
        ?.textContent,
    ).toContain("已确认");
    expect(container.textContent).toContain("继续处理当前任务");
    expect(container.textContent).not.toContain("碰到错误");
    expect(container.textContent).not.toContain("失败");
    expect(container.textContent).not.toContain("confirmationStatus");
    expect(container.textContent).not.toContain("askProfileKeys");
  });
  it("Provider 402 失败不应在普通时间线暴露原始错误", () => {
    const rawProviderError =
      "Agent provider execution failed: Request failed with status 402 Payment Required: Insufficient Balance";
    const items: AgentThreadItem[] = [
      {
        ...createBaseItem("provider-error-1", 1),
        type: "error",
        message: rawProviderError,
      },
    ];

    const container = renderTimeline(items, {
      turn: {
        status: "failed",
        error_message: rawProviderError,
      },
    });

    expect(container.textContent).toContain("碰到错误");
    expect(container.textContent).toContain(
      "当前模型通道返回了计费或额度类错误",
    );
    expect(container.textContent).not.toContain(
      "Agent provider execution failed",
    );
    expect(container.textContent).not.toContain("Payment Required");
    expect(container.textContent).not.toContain("Insufficient Balance");
  });
  it("普通 aborted 回合应显示已暂停提示", () => {
    const items: AgentThreadItem[] = [
      {
        ...createBaseItem("other-1", 1),
        type: "tool_call",
        tool_name: "workspace_sync",
      },
    ];

    const container = renderTimeline(items, {
      turn: {
        status: "aborted",
      },
    });

    expect(
      container.querySelector('[data-testid="agent-thread-inline-status"]')
        ?.textContent,
    ).toContain("已暂停");
    expect(container.textContent).not.toContain("已中断");
  });
});
