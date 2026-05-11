import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { AutomationJobFocusStrip } from "./AutomationJobFocusStrip";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

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
  vi.clearAllMocks();
  await changeLimeLocale("zh-CN");
});

async function renderStrip(
  props: Partial<ComponentProps<typeof AutomationJobFocusStrip>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });

  await act(async () => {
    root.render(
      <AutomationJobFocusStrip
        jobId="job-sceneapp-1"
        summaryCard={
          {
            title: "Story video kit",
            businessLabel: "Multimodal bundle",
            statusLabel: "Collect result materials first",
            summary: "This ongoing flow already has results worth continuing.",
            scorecardAggregate: {
              summary: "This run is close to reusable.",
              nextAction: "Complete the structured result pack first.",
            },
          } as any
        }
        runDetailView={
          {
            statusLabel: "Succeeded",
            deliveryCompletionLabel: "Full result pack generated",
          } as any
        }
        {...props}
      />,
    );
  });

  return container;
}

describe("AutomationJobFocusStrip", () => {
  it("应展示当前经营焦点摘要", async () => {
    await renderStrip();

    const text = document.body.textContent ?? "";
    expect(text).toContain("Continue this one first");
    expect(text).toContain("Story video kit");
    expect(text).not.toContain("Multimodal bundle");
    expect(text).toContain("This run: This run is close to reusable.");
    expect(text).toContain(
      "Recent result: Succeeded · Full result pack generated",
    );
    expect(text).toContain(
      "Do first: Complete the structured result pack first.",
    );
    expect(text).not.toContain("现在先继续这条");
    expect(text).not.toContain("settings.automation.focus");
  });

  it("应支持继续看结果与打开最近结果动作", async () => {
    const onReviewCurrentProject = vi.fn();
    const onOpenSceneAppGovernance = vi.fn();

    await renderStrip({
      onReviewCurrentProject,
      onOpenSceneAppGovernance,
    });

    const reviewButton = document.body.querySelector(
      "[data-testid='automation-job-focus-review-job-sceneapp-1']",
    ) as HTMLButtonElement | null;
    const governanceButton = document.body.querySelector(
      "[data-testid='automation-job-focus-governance-job-sceneapp-1']",
    ) as HTMLButtonElement | null;

    expect(reviewButton?.textContent).toContain("Review result");
    expect(governanceButton?.textContent).toContain("View recent results");

    await act(async () => {
      reviewButton?.click();
      governanceButton?.click();
      await Promise.resolve();
    });

    expect(onReviewCurrentProject).toHaveBeenCalledTimes(1);
    expect(onOpenSceneAppGovernance).toHaveBeenCalledTimes(1);
  });

  it("加载中且缺少摘要时应展示轻量占位", async () => {
    await renderStrip({
      summaryCard: null,
      runDetailView: null,
      loading: true,
    });

    expect(document.body.textContent).toContain(
      "Organizing the latest result and next step for this practice",
    );
  });
});
