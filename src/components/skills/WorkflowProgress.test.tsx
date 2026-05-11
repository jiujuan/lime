import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import {
  WorkflowProgress,
  type WorkflowProgressProps,
} from "./WorkflowProgress";

interface MountedRoot {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedRoot[] = [];

function renderWorkflow(overrides: Partial<WorkflowProgressProps> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <WorkflowProgress
        steps={[
          { id: "step-1", name: "准备输入", dependencies: [] },
          { id: "step-2", name: "执行生成", dependencies: ["step-1"] },
        ]}
        currentStepId="step-2"
        completedSteps={[
          {
            step_id: "step-1",
            step_name: "准备输入",
            success: true,
            output: "ok",
          },
        ]}
        error="执行失败，请稍后重试"
        {...overrides}
      />,
    );
  });

  mountedRoots.push({ container, root });
  return container;
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("en-US");
});

afterEach(async () => {
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
  await changeLimeLocale("zh-CN");
});

describe("WorkflowProgress", () => {
  it("运行中步骤和全局错误应保持浅色主题表面", () => {
    const container = renderWorkflow();
    const runningStep = Array.from(container.querySelectorAll("div")).find(
      (element) =>
        element.textContent?.includes("执行生成") &&
        element.className.includes("bg-emerald-50"),
    );
    const errorBanner = Array.from(container.querySelectorAll("div")).find(
      (element) =>
        element.textContent?.includes("执行失败，请稍后重试") &&
        element.className.includes("bg-red-50"),
    );

    expect(runningStep).toBeTruthy();
    expect(errorBanner).toBeTruthy();
    expect(container.textContent).toContain("Completed: 1/2");
    expect(container.textContent).not.toContain("已完成");
    expect(runningStep?.className).toContain("bg-emerald-50");
    expect(runningStep?.className).not.toContain("dark:bg-emerald-950/30");
    expect(errorBanner?.className).toContain("bg-red-50");
    expect(errorBanner?.className).not.toContain("dark:bg-red-950/30");
  });

  it("空步骤应通过 agent namespace 渲染空态", () => {
    const container = renderWorkflow({
      steps: [],
      completedSteps: [],
      currentStepId: null,
      error: null,
    });

    expect(container.textContent).toContain("No workflow steps yet");
    expect(container.textContent).not.toContain("暂无工作流步骤");
  });

  it("重试状态应通过 agent namespace 渲染提示", () => {
    const container = renderWorkflow({
      isRetrying: true,
      error: null,
    });

    expect(container.textContent).toContain("Retrying...");
    expect(container.textContent).not.toContain("正在重试");
  });
});
