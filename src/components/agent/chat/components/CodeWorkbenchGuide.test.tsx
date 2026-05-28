import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { changeLimeLocale } from "@/i18n/createI18n";
import {
  CodeWorkbenchGuide,
  type CodeWorkbenchGuideTarget,
} from "./CodeWorkbenchGuide";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderGuide(
  overrides: Partial<ComponentProps<typeof CodeWorkbenchGuide>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onOpenSection = vi.fn<(target: CodeWorkbenchGuideTarget) => void>();

  act(() => {
    root.render(
      <CodeWorkbenchGuide
        pendingApprovalsCount={0}
        activeWriteCount={0}
        outputSignalCount={0}
        failedOutputSignalCount={0}
        pendingFileChangeCount={0}
        totalFileChangeCount={0}
        latestFileName={null}
        hasRuntimeStatus={true}
        hasFileCheckpoints={false}
        onOpenSection={onOpenSection}
        {...overrides}
      />,
    );
  });

  mountedRoots.push({ root, container });
  return { container, onOpenSection };
}

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
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  await changeLimeLocale("en-US");
});

describe("CodeWorkbenchGuide", () => {
  it("应优先引导用户处理权限确认", () => {
    const { container, onOpenSection } = renderGuide({
      pendingApprovalsCount: 1,
      activeWriteCount: 1,
      outputSignalCount: 1,
      pendingFileChangeCount: 1,
      totalFileChangeCount: 1,
      latestFileName: "ImageCard.test.tsx",
      hasFileCheckpoints: true,
    });

    const guide = container.querySelector(
      '[data-testid="code-workbench-guide"]',
    ) as HTMLElement | null;
    const action = container.querySelector(
      '[data-testid="code-workbench-guide-primary-action"]',
    ) as HTMLButtonElement | null;

    expect(guide?.getAttribute("data-stage")).toBe("approval");
    expect(guide?.textContent).toContain("编程工作台");
    expect(guide?.textContent).toContain("先处理权限确认");
    expect(guide?.textContent).toContain("还有 1 个操作等待确认");
    expect(guide?.textContent).toContain("允许后本轮会继续执行");
    expect(guide?.textContent).toContain("拒绝后会停在当前步骤");
    expect(guide?.textContent).toContain("确认 1");
    expect(guide?.textContent).toContain("写入 1");
    expect(guide?.textContent).toContain("输出 1");
    expect(guide?.textContent).toContain("变更 1/1");
    expect(guide?.textContent).not.toContain("快照可回滚");

    act(() => {
      action?.click();
    });
    expect(onOpenSection).toHaveBeenCalledWith("approvals");
  });

  it("无权限阻塞时应引导处理文件变更", () => {
    const { container, onOpenSection } = renderGuide({
      outputSignalCount: 1,
      pendingFileChangeCount: 2,
      totalFileChangeCount: 3,
      latestFileName: "src/main.ts",
    });

    const guide = container.querySelector(
      '[data-testid="code-workbench-guide"]',
    ) as HTMLElement | null;
    const action = container.querySelector(
      '[data-testid="code-workbench-guide-primary-action"]',
    ) as HTMLButtonElement | null;

    expect(guide?.getAttribute("data-stage")).toBe("review");
    expect(guide?.textContent).toContain("文件变更待处理");
    expect(guide?.textContent).toContain("2 / 3 个文件变更待处理");
    expect(action?.textContent).toContain("处理变更");

    act(() => {
      action?.click();
    });
    expect(onOpenSection).toHaveBeenCalledWith("file_review");
  });

  it("测试或工具输出失败时应优先引导查看输出", () => {
    const { container, onOpenSection } = renderGuide({
      outputSignalCount: 2,
      failedOutputSignalCount: 1,
      pendingFileChangeCount: 2,
      totalFileChangeCount: 2,
      latestFileName: "src/main.ts",
      hasFileCheckpoints: true,
    });

    const guide = container.querySelector(
      '[data-testid="code-workbench-guide"]',
    ) as HTMLElement | null;
    const action = container.querySelector(
      '[data-testid="code-workbench-guide-primary-action"]',
    ) as HTMLButtonElement | null;
    const outputMetric = container.querySelector(
      '[data-testid="code-workbench-guide-metric-outputs"]',
    ) as HTMLElement | null;

    expect(guide?.getAttribute("data-stage")).toBe("failed_output");
    expect(guide?.textContent).toContain("先查看失败输出");
    expect(guide?.textContent).toContain("1 条输出需要处理");
    expect(guide?.textContent).toContain("失败输出 1");
    expect(guide?.textContent).toContain("快照可回滚");
    expect(action?.textContent).toContain("查看失败输出");
    expect(outputMetric?.getAttribute("data-tone")).toBe("danger");

    act(() => {
      action?.click();
    });
    expect(onOpenSection).toHaveBeenCalledWith("outputs");
  });

  it("英文界面应使用 agent namespace 文案并只在复核阶段显示快照提示", async () => {
    await changeLimeLocale("en-US");

    const { container } = renderGuide({
      pendingFileChangeCount: 2,
      totalFileChangeCount: 3,
      latestFileName: "src/main.ts",
      hasFileCheckpoints: true,
    });

    const guide = container.querySelector(
      '[data-testid="code-workbench-guide"]',
    ) as HTMLElement | null;

    expect(guide?.getAttribute("data-stage")).toBe("review");
    expect(guide?.textContent).toContain("Coding workbench");
    expect(guide?.textContent).toContain("File changes need review");
    expect(guide?.textContent).toContain("2 / 3 file changes need review");
    expect(guide?.textContent).toContain("Changes 2/3");
    expect(guide?.textContent).toContain("Snapshots available");
  });
});
