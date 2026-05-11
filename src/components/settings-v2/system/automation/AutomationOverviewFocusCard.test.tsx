import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { AutomationOverviewFocusCard } from "./AutomationOverviewFocusCard";

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

async function renderCard(
  props: Partial<ComponentProps<typeof AutomationOverviewFocusCard>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });

  await act(async () => {
    root.render(
      <AutomationOverviewFocusCard
        job={
          {
            id: "job-sceneapp-overview-1",
            name: "Short video always-on campaign",
            workspace_id: "workspace-default",
          } as any
        }
        workspaceName="Default workspace"
        summaryCard={
          {
            sceneappId: "story-video-suite",
            title: "Story video kit",
            businessLabel: "Multimodal bundle",
            typeLabel: "Workflow pattern",
            patternSummary: "Step chain",
            status: "watch",
            statusLabel: "Collect result materials first",
            summary: "This ongoing flow already has results worth continuing.",
            nextAction: "Archive this run before scaling it.",
            destinations: [
              {
                key: "task-center",
                label: "Generate",
                description: "Return to generation with materials.",
              },
            ],
            scorecardAggregate: {
              status: "watch",
              statusLabel: "Collect result materials first",
              summary: "This run is close to reusable.",
              nextAction: "Complete the structured result pack first.",
              actionLabel: "Keep improving",
              topFailureSignalLabel: "Incomplete result materials",
              metricKeys: [],
              failureSignals: [],
              observedFailureSignals: [],
              destinations: [
                {
                  key: "task-center",
                  label: "Generate",
                  description: "Return to generation with materials.",
                },
              ],
            },
            automationSummary: "1 always-on flow · 1 enabled · no active risks",
            latestAutomationLabel: "Latest run: short video campaign · success",
          } as any
        }
        runDetailView={
          {
            runId: "run-sceneapp-overview-1",
            status: "success",
            statusLabel: "Succeeded",
            stageLabel: "Results synced",
            summary: "The latest run synced back with result materials.",
            nextAction: "Review this run.",
            deliveryCompletionLabel: "Full result pack generated",
          } as any
        }
        {...props}
      />,
    );
  });

  return container;
}

describe("AutomationOverviewFocusCard", () => {
  it("应展示当前经营焦点摘要", async () => {
    await renderCard();

    const text = document.body.textContent ?? "";
    expect(text).toContain("Continue this one first");
    expect(text).toContain("Short video always-on campaign");
    expect(text).toContain("Story video kit");
    expect(text).toContain("This run is close to reusable.");
    expect(text).toContain(
      "Do first: Complete the structured result pack first.",
    );
    expect(text).toContain("Recent result");
    expect(text).not.toContain("现在先继续这条");
    expect(text).not.toContain("settings.automation.focus");
  });

  it("应支持继续复盘与打开详情动作", async () => {
    const onReviewCurrentProject = vi.fn();
    const onOpenSceneAppGovernance = vi.fn();
    const onOpenSceneAppDetail = vi.fn();
    const onOpenJobDetails = vi.fn();

    await renderCard({
      onReviewCurrentProject,
      onOpenSceneAppGovernance,
      onOpenSceneAppDetail,
      onOpenJobDetails,
    });

    const reviewButton = document.body.querySelector(
      "[data-testid='automation-overview-review-current-project']",
    ) as HTMLButtonElement | null;
    const governanceButton = document.body.querySelector(
      "[data-testid='automation-overview-open-governance']",
    ) as HTMLButtonElement | null;
    const detailButton = document.body.querySelector(
      "[data-testid='automation-overview-open-detail']",
    ) as HTMLButtonElement | null;
    const jobDetailsButton = document.body.querySelector(
      "[data-testid='automation-overview-open-job-details']",
    ) as HTMLButtonElement | null;

    expect(reviewButton?.textContent).toContain("Review this run");
    expect(governanceButton?.textContent).toContain("View recent results");
    expect(detailButton?.textContent).toContain("Fill in this run");
    expect(jobDetailsButton?.textContent).toContain("View details");

    await act(async () => {
      reviewButton?.click();
      governanceButton?.click();
      detailButton?.click();
      jobDetailsButton?.click();
      await Promise.resolve();
    });

    expect(onReviewCurrentProject).toHaveBeenCalledTimes(1);
    expect(onOpenSceneAppGovernance).toHaveBeenCalledTimes(1);
    expect(onOpenSceneAppDetail).toHaveBeenCalledTimes(1);
    expect(onOpenJobDetails).toHaveBeenCalledTimes(1);
  });

  it("没有焦点任务时应展示空态", async () => {
    await renderCard({
      job: null,
      workspaceName: null,
      summaryCard: null,
      runDetailView: null,
    });

    expect(document.body.textContent).toContain(
      "No ongoing practice is ready to continue yet",
    );
  });
});
