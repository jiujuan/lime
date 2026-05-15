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
        retiredMessage="This ongoing flow uses a retired practice."
        {...props}
      />,
    );
  });

  return container;
}

describe("AutomationJobFocusStrip", () => {
  it("旧 SceneApp 持续流程只展示下线提示", async () => {
    await renderStrip();

    const text = document.body.textContent ?? "";
    expect(text).toContain("Continue this one first");
    expect(text).toContain("This ongoing flow uses a retired practice.");
    expect(text).not.toContain("Story video kit");
    expect(text).not.toContain("现在先继续这条");
    expect(text).not.toContain("settings.automation.focus");
  });

  it("没有下线提示时不渲染旧运行详情占位", async () => {
    await renderStrip({
      retiredMessage: null,
    });

    expect(document.body.textContent).toContain("Continue this one first");
    expect(document.body.textContent).not.toContain("retired practice");
  });
});
