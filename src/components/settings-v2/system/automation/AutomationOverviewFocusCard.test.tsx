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
        retiredMessage="This ongoing flow uses a retired practice."
        {...props}
      />,
    );
  });

  return container;
}

describe("AutomationOverviewFocusCard", () => {
  it("旧 SceneApp 焦点任务只展示下线提示", async () => {
    await renderCard();

    const text = document.body.textContent ?? "";
    expect(text).toContain("Continue this one first");
    expect(text).toContain("Short video always-on campaign");
    expect(text).toContain("This ongoing flow uses a retired practice.");
    expect(text).not.toContain("Story video kit");
    expect(text).not.toContain("Recent result");
    expect(text).not.toContain("现在先继续这条");
    expect(text).not.toContain("settings.automation.focus");
  });

  it("只保留自动化任务详情动作", async () => {
    const onOpenJobDetails = vi.fn();

    await renderCard({
      onOpenJobDetails,
    });

    const jobDetailsButton = document.body.querySelector(
      "[data-testid='automation-overview-open-job-details']",
    ) as HTMLButtonElement | null;

    expect(
      document.body.querySelector(
        "[data-testid='automation-overview-review-current-project']",
      ),
    ).toBeNull();
    expect(
      document.body.querySelector("[data-testid='automation-overview-open-detail']"),
    ).toBeNull();
    expect(jobDetailsButton?.textContent).toContain("View details");

    await act(async () => {
      jobDetailsButton?.click();
      await Promise.resolve();
    });

    expect(onOpenJobDetails).toHaveBeenCalledTimes(1);
  });

  it("没有焦点任务时应展示空态", async () => {
    await renderCard({
      job: null,
      workspaceName: null,
      retiredMessage: null,
    });

    expect(document.body.textContent).toContain(
      "No ongoing practice is ready to continue yet",
    );
  });
});
