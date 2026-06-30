import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AgentUiProjectionEvent } from "./agentUiEventProjection";
import {
  clearAgentUiProjectionEvents,
  recordAgentUiProjectionEvents,
} from "./conversationProjectionStore";
import { useAgentUiProjectionSummary } from "./useConversationProjectionStore";

const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];

const eventFixture: AgentUiProjectionEvent = {
  type: "tool.result",
  sourceType: "item_completed",
  sequence: 1,
  sessionId: "session-a",
  threadId: "thread-a",
  turnId: "turn-a",
  toolCallId: "tool-a",
  owner: "tool",
  scope: "tool_call",
  phase: "completed",
  surface: "tool_ui",
  persistence: "archive",
};

function renderSummaryHook(props?: { enabled?: boolean }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latestValue: ReturnType<typeof useAgentUiProjectionSummary> | null = null;
  let renderCount = 0;

  function Probe(currentProps: { enabled?: boolean }) {
    renderCount += 1;
    latestValue = useAgentUiProjectionSummary(
      { sessionId: "session-a" },
      { enabled: currentProps.enabled },
    );
    return null;
  }

  const render = async (nextProps?: { enabled?: boolean }) => {
    await act(async () => {
      root.render(<Probe enabled={props?.enabled} {...nextProps} />);
      await Promise.resolve();
    });
  };

  mountedRoots.push({ container, root });

  return {
    render,
    getValue: () => {
      if (!latestValue) {
        throw new Error("hook 尚未初始化");
      }
      return latestValue;
    },
    getRenderCount: () => renderCount,
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  clearAgentUiProjectionEvents();
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
  clearAgentUiProjectionEvents();
});

describe("useConversationProjectionStore", () => {
  it("Agent UI projection 关闭时不应订阅 store 更新", async () => {
    const hook = renderSummaryHook({ enabled: false });

    await hook.render();
    expect(hook.getValue().total).toBe(0);
    expect(hook.getRenderCount()).toBe(1);

    await act(async () => {
      recordAgentUiProjectionEvents([eventFixture]);
      await Promise.resolve();
    });

    expect(hook.getValue().total).toBe(0);
    expect(hook.getRenderCount()).toBe(1);
  });

  it("Agent UI projection 启用时应响应 store 更新", async () => {
    const hook = renderSummaryHook({ enabled: true });

    await hook.render();
    expect(hook.getValue().total).toBe(0);

    await act(async () => {
      recordAgentUiProjectionEvents([eventFixture]);
      await Promise.resolve();
    });

    expect(hook.getValue().total).toBe(1);
    expect(hook.getRenderCount()).toBe(2);
  });
});
