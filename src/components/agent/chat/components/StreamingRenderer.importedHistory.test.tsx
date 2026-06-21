import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  installStreamingRendererTestHarness,
  renderStreamingRendererHarness as renderHarness,
} from "./StreamingRenderer.testHarness";

installStreamingRendererTestHarness();

describe("StreamingRenderer imported history", () => {
  it("本地历史导入命令记录应展示友好只读摘要而不是原始命令", () => {
    const { container } = renderHarness({
      content: "导入完成",
      toolCalls: [
        {
          id: "local-history-imported-command",
          name: "command_execution",
          arguments: JSON.stringify({ command: "npm test" }),
          status: "completed",
          result: {
            success: true,
            output: "ok",
            metadata: {
              imported: true,
              source_client: "local_history",
              exit_code: 0,
              stdout_text: "ok",
            },
          },
          startTime: new Date("2026-06-17T10:00:00.000Z"),
          endTime: new Date("2026-06-17T10:00:01.000Z"),
        },
      ],
    });

    expect(container.textContent).toContain("导入的命令记录");
    expect(container.textContent).toContain("不会重新执行");
    expect(container.textContent).not.toContain("npm test");
    expect(container.textContent).not.toContain("stdout");
    expect(container.textContent).not.toContain("ok");
    expect(
      container.querySelector('[data-testid="tool-call-command-summary"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="tool-call-command-output-streams"]',
      ),
    ).toBeNull();
  });

  it("续聊后的本地历史导入过程应保留命令记录并单独展示搜索摘要", () => {
    const importedMetadata = {
      imported: true,
      imported_synthetic: true,
      source_client: "local_history",
    };
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "tool_use",
          toolCall: {
            id: "local-history-imported-command-hydrated",
            name: "Bash",
            arguments: JSON.stringify({
              command: "npm test",
              cwd: "/workspace/imported-local-history",
            }),
            status: "completed",
            result: {
              success: true,
              output: "ok",
              metadata: importedMetadata,
            },
            startTime: new Date("2026-06-17T10:00:00.000Z"),
            endTime: new Date("2026-06-17T10:00:01.000Z"),
          },
        },
        {
          type: "tool_use",
          toolCall: {
            id: "local-history-imported-search-hydrated",
            name: "web_search",
            arguments: JSON.stringify({
              action: {
                type: "search_query",
                query: "Lime history import",
              },
            }),
            status: "completed",
            result: {
              success: true,
              output: '"search_query"',
              metadata: importedMetadata,
            },
            startTime: new Date("2026-06-17T10:00:02.000Z"),
            endTime: new Date("2026-06-17T10:00:03.000Z"),
          },
        },
        {
          type: "action_required",
          actionRequired: {
            requestId: "local-history-imported-approval-hydrated",
            actionType: "tool_confirmation",
            status: "submitted",
            prompt: "Approve imported command",
            submittedResponse: JSON.stringify({
              decision: "imported_read_only",
              imported_read_only: true,
            }),
          },
        },
        {
          type: "text",
          text: "已完成修复。",
        },
      ],
      isStreaming: false,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    const processGroupButtons = container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] > button',
    );
    expect(processGroupButtons).toHaveLength(2);
    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("导入的命令记录");
    expect(processGroupButton?.textContent).not.toContain("已完成 2 个步骤");
    expect(processGroupButtons[1]?.textContent).toContain(
      "已搜索网页：Lime history import",
    );
    expect(processGroupButtons[1]?.textContent).not.toContain(
      "导入的命令记录",
    );
    expect(container.textContent).toContain("已完成修复。");
    expect(container.textContent).not.toContain("imported_read_only");
    expect(container.textContent).not.toContain("npm test");
  });

  it("其他本地历史来源的导入过程也应复用只读命令记录展示", () => {
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "tool_use",
          toolCall: {
            id: "other-imported-command-hydrated",
            name: "Bash",
            arguments: JSON.stringify({
              command: "npm test",
              cwd: "/workspace/imported-history",
            }),
            status: "completed",
            result: {
              success: true,
              output: "ok",
              metadata: {
                source_client: "claude_code",
              },
            },
            startTime: new Date("2026-06-17T10:00:00.000Z"),
            endTime: new Date("2026-06-17T10:00:01.000Z"),
          },
        },
        {
          type: "text",
          text: "已完成修复。",
        },
      ],
      isStreaming: false,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("true");
    expect(processGroupButton?.textContent).toContain("导入的命令记录");
    expect(container.textContent).toContain("不会重新执行");
    expect(container.textContent).not.toContain("npm test");
    expect(container.textContent).not.toContain("claude_code");
  });

  it("本地历史导入思考应默认展开并排在命令记录之前", () => {
    const importedMetadata = {
      imported: true,
      imported_synthetic: true,
      source_client: "local_history",
    };
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "I need to inspect the test failure first.",
          metadata: importedMetadata,
        },
        {
          type: "tool_use",
          toolCall: {
            id: "local-history-imported-command-after-thinking",
            name: "Bash",
            arguments: JSON.stringify({
              command: "npm test",
              cwd: "/workspace/imported-local-history",
            }),
            status: "completed",
            result: {
              success: true,
              output: "ok",
              metadata: importedMetadata,
            },
            startTime: new Date("2026-06-17T10:00:00.000Z"),
            endTime: new Date("2026-06-17T10:00:01.000Z"),
          },
        },
        {
          type: "text",
          text: "已完成修复。",
        },
      ],
      isStreaming: false,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("true");

    const thinkingBlock = container.querySelector(
      '[data-testid="thinking-block"]',
    );
    const commandRecord = container.querySelector(
      '[data-testid="inline-tool-process-step"]',
    );
    expect(thinkingBlock).not.toBeNull();
    expect(commandRecord).not.toBeNull();
    expect(
      thinkingBlock!.compareDocumentPosition(commandRecord!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.textContent).toContain(
      "I need to inspect the test failure first.",
    );
    expect(container.textContent).toContain("已完成修复。");
    expect(container.textContent).not.toContain("npm test");
  });

  it("导入工具轨同组的思考即使缺少来源 metadata 也应还原原文", () => {
    const importedMetadata = {
      imported: true,
      imported_synthetic: true,
      source_client: "local_history",
    };
    const importedPath =
      "/workspace/imported-local-history/docs/imported-preview.md";
    const onFileClick = vi.fn();
    const { container } = renderHarness({
      content: "",
      contentParts: [
        {
          type: "thinking",
          text: "I need to inspect the test failure first.",
        },
        {
          type: "tool_use",
          toolCall: {
            id: "imported-read-file-after-thinking",
            name: "read_file",
            arguments: JSON.stringify({
              path: importedPath,
            }),
            status: "completed",
            result: {
              success: true,
              output: "导入会话 Markdown 预览内容",
              metadata: importedMetadata,
            },
            startTime: new Date("2026-06-17T10:00:00.000Z"),
            endTime: new Date("2026-06-17T10:00:01.000Z"),
          },
        },
        {
          type: "text",
          text: "已完成修复。",
        },
      ],
      isStreaming: false,
      onFileClick,
    });

    const processGroupButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="streaming-process-group"] button',
    );
    expect(processGroupButton?.getAttribute("aria-expanded")).toBe("true");
    expect(processGroupButton?.textContent).toContain("导入的命令记录");
    expect(processGroupButton?.textContent).toContain("已完成思考");
    expect(container.textContent).toContain(
      "I need to inspect the test failure first.",
    );
    expect(
      container
        .querySelector('[data-testid="thinking-block"]')
        ?.getAttribute("data-visual-style"),
    ).toBe("grouped-inline");

    const openFileButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="inline-tool-open-file"]',
    );
    expect(openFileButton?.getAttribute("data-file-path")).toBe(importedPath);

    act(() => {
      openFileButton?.click();
    });

    expect(onFileClick).toHaveBeenCalledWith(
      importedPath,
      "导入会话 Markdown 预览内容",
    );
  });
});
