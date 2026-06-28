import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentThreadReliabilityPanelHeader } from "./AgentThreadReliabilityPanelHeader";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
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
});

function mount(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(node);
  });

  mountedRoots.push({ root, container });
  return container;
}

describe("AgentThreadReliabilityPanelHeader", () => {
  it("应在窄容器下保留主信息可读宽度，并让操作区整块换行", () => {
    const onCopyDiagnostic = vi.fn();
    const onCopyRawJson = vi.fn();
    const container = mount(
      <AgentThreadReliabilityPanelHeader
        activeTurnLabel={null}
        copyDiagnosticLabel="快速复制给 AI"
        copyJsonDebugLabel="复制原始 JSON（debug）"
        interruptStateLabel={null}
        lastUpdatedLabel="最近刷新 06/28 01:49"
        quickDiagnosticLabel="线程级快速诊断"
        statusLabel="执行失败"
        statusTone="failed"
        summary="最近一次回合执行失败"
        title="线程可靠性"
        onCopyDiagnostic={onCopyDiagnostic}
        onCopyRawJson={onCopyRawJson}
      />,
    );

    const headerMain = container.querySelector(
      '[data-testid="agent-thread-reliability-header-main"]',
    );
    const headerActions = container.querySelector(
      '[data-testid="agent-thread-reliability-header-actions"]',
    );
    const copyButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="agent-thread-reliability-copy"]',
    );
    const copyJsonButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="agent-thread-reliability-copy-json"]',
    );

    expect(headerMain?.className).toContain("min-w-[min(100%,18rem)]");
    expect(headerMain?.className).toContain("flex-[1_1_24rem]");
    expect(headerActions?.className).toContain("w-full");
    expect(headerActions?.className).toContain("lg:w-auto");
    expect(copyButton?.className).toContain("whitespace-nowrap");
    expect(copyJsonButton?.className).toContain("whitespace-nowrap");

    act(() => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      copyJsonButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(onCopyDiagnostic).toHaveBeenCalledTimes(1);
    expect(onCopyRawJson).toHaveBeenCalledTimes(1);
  });
});
