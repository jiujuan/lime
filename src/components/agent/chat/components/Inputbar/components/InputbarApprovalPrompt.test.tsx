import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { ActionRequired } from "../../../types";
import { InputbarApprovalPrompt } from "./InputbarApprovalPrompt";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
});

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      continue;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
  await changeLimeLocale("en-US");
});

function renderPrompt(
  request: ActionRequired,
  onSubmit = vi.fn().mockResolvedValue(undefined),
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <InputbarApprovalPrompt request={request} onSubmit={onSubmit} />,
    );
  });

  mountedRoots.push({ root, container });
  return { container, onSubmit };
}

describe("InputbarApprovalPrompt", () => {
  it("应只渲染一行摘要和决策，不展示风险、参数块或详情", () => {
    const { container } = renderPrompt({
      requestId: "approval-compact-1",
      actionType: "tool_confirmation",
      status: "pending",
      toolName: "functions.exec_command",
      prompt: "允许执行当前命令？",
      arguments: {
        command: "npm test -- --runInBand",
        cwd: "/tmp/project-1",
        risk: "high",
      },
      availableDecisions: ["decline", "allow_once"],
    });

    expect(
      container.querySelector('[data-testid="inputbar-approval-summary"]')
        ?.textContent,
    ).toBe("允许执行当前命令？");
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector("pre")).toBeNull();
    expect(container.textContent).not.toContain("高风险");
    expect(container.textContent).not.toContain("functions.exec_command");
    expect(container.textContent).not.toContain("npm test -- --runInBand");
    expect(container.textContent).not.toContain("/tmp/project-1");
  });

  it("应只展示后端声明的决策并提交 decision-based response", async () => {
    const { container, onSubmit } = renderPrompt({
      requestId: "approval-session-1",
      actionType: "tool_confirmation",
      status: "pending",
      prompt: "允许访问浏览器？",
      availableDecisions: ["allow_for_session", "cancel"],
    });

    expect(
      container.querySelector('button[data-decision="allow_once"]'),
    ).toBeNull();
    expect(
      container.querySelector('button[data-decision="decline"]'),
    ).toBeNull();
    const allowForSession = container.querySelector(
      'button[data-decision="allow_for_session"]',
    ) as HTMLButtonElement | null;
    expect(allowForSession).not.toBeNull();

    await act(async () => {
      allowForSession?.click();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledWith({
      requestId: "approval-session-1",
      decision: "allow_for_session",
      response: "本会话允许此类工具操作",
      actionType: "tool_confirmation",
    });
  });
});
