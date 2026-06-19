import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { ActionRequired, ConfirmResponse } from "../types";
import { PlanComposerDecisionPanel } from "./PlanComposerDecisionPanel";

interface MountedPanel {
  container: HTMLDivElement;
  root: Root;
  onSubmit: ReturnType<
    typeof vi.fn<(response: ConfirmResponse) => void | Promise<void>>
  >;
}

const mountedPanels: MountedPanel[] = [];

function createRequest(overrides: Partial<ActionRequired> = {}): ActionRequired {
  return {
    requestId: "plan-request-1",
    actionType: "ask_user",
    status: "pending",
    questions: [
      {
        question: "Proceed with the plan?",
        options: [
          {
            label: "Proceed",
            description: "Continue the current plan.",
          },
          {
            label: "Revise",
            description: "Ask for changes first.",
          },
        ],
      },
    ],
    ...overrides,
  };
}

function renderPanel(request: ActionRequired = createRequest()): MountedPanel {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onSubmit = vi.fn<(response: ConfirmResponse) => void | Promise<void>>();

  act(() => {
    root.render(<PlanComposerDecisionPanel request={request} onSubmit={onSubmit} />);
  });

  const mounted = { container, root, onSubmit };
  mountedPanels.push(mounted);
  return mounted;
}

function clickButton(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((node) =>
    node.textContent?.includes(label),
  );
  expect(button).toBeTruthy();
  act(() => {
    button?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function changeInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function getAdjustmentInput(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>(
    '[data-testid="plan-composer-adjust-input"]',
  );
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
});

afterEach(() => {
  while (mountedPanels.length > 0) {
    const mounted = mountedPanels.pop();
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
});

describe("PlanComposerDecisionPanel", () => {
  it("应渲染标题、编号选项和自由调整输入", () => {
    const { container } = renderPanel();
    const panel = container.querySelector(
      '[data-testid="plan-composer-decision-panel"]',
    );

    expect(panel).toBeTruthy();
    expect(panel?.getAttribute("data-layout")).toBe("composer-drawer");
    expect(container.textContent).toContain("Proceed with the plan?");
    expect(container.textContent).toContain("1");
    expect(container.textContent).toContain("Proceed");
    expect(container.textContent).toContain("Continue the current plan.");
    expect(container.textContent).not.toContain("Revise");
    expect(getAdjustmentInput(container)?.type).toBe("text");
    expect(getAdjustmentInput(container)?.getAttribute("placeholder")).toBe(
      "否，请告诉我如何调整",
    );
  });

  it("默认提交第一个选项", () => {
    const { container, onSubmit } = renderPanel();

    clickButton(container, "提交");

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "plan-request-1",
        confirmed: true,
        actionType: "ask_user",
        userData: { answer: "Proceed" },
      }),
    );
  });

  it("填写调整要求后应提交调整文本", () => {
    const { container, onSubmit } = renderPanel();
    const input = getAdjustmentInput(container);
    expect(input?.getAttribute("placeholder")).toBe(
      "否，请告诉我如何调整",
    );

    changeInputValue(input!, "先补一条 E2E 验证");
    clickButton(container, "提交");

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmed: true,
        userData: { answer: "先补一条 E2E 验证" },
      }),
    );
  });

  it("忽略时应提交 confirmed=false", () => {
    const { container, onSubmit } = renderPanel();

    clickButton(container, "忽略");

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "plan-request-1",
        confirmed: false,
        response: "暂不执行此计划",
        actionType: "ask_user",
      }),
    );
  });

  it("忽略时应通知外部关闭本地抽屉", () => {
    const onDismiss = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const request = createRequest();

    act(() => {
      root.render(
        <PlanComposerDecisionPanel
          request={request}
          onSubmit={vi.fn()}
          onDismiss={onDismiss}
        />,
      );
    });

    clickButton(container, "忽略");

    expect(onDismiss).toHaveBeenCalledWith(request.requestId);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("缺少选项时应使用计划确认 fallback 选项", () => {
    const { container } = renderPanel(
      createRequest({
        questions: [{ question: "实施此计划？" }],
      }),
    );
    const optionButtons = Array.from(container.querySelectorAll("button"))
      .map((button) => button.textContent?.trim() || "")
      .filter((text) => /^\d/.test(text));

    expect(container.textContent).toContain("是，实施此计划");
    expect(optionButtons).toEqual(["1是，实施此计划"]);
    expect(getAdjustmentInput(container)?.getAttribute("placeholder")).toBe(
      "否，请告诉我如何调整",
    );
  });
});
