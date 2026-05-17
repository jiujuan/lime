import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageRuntimeStatusPill } from "./MessageListRuntimeStatus";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
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
});

function renderRuntimeStatusPill() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <MessageRuntimeStatusPill
        status={{
          phase: "routing",
          title: "处理中",
          detail:
            "若回复加入团队将带来巨大技术突破，请补充目标、边界、风险和最终交付口径。",
          checkpoints: ["确认当前任务目标", "等待下一条进展"],
        }}
      />,
    );
  });

  mountedRoots.push({ root, container });
  return container;
}

describe("MessageRuntimeStatusPill", () => {
  it("运行状态说明不应生成原生 title 浮窗", () => {
    const container = renderRuntimeStatusPill();
    const pill = container.querySelector(
      '[data-testid="message-runtime-status-pill"]',
    );

    expect(pill).not.toBeNull();
    expect(pill?.getAttribute("title")).toBeNull();
    expect(pill?.getAttribute("aria-label")).toContain("处理中");
    expect(pill?.getAttribute("aria-label")).toContain("等待下一条进展");
  });
});
