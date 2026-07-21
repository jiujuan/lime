import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentThreadItem, AgentThreadTurn, Message } from "../types";
import { useSessionRuntimeProjectionDeferral } from "./useSessionRuntimeProjectionDeferral";

type HookProps = Parameters<typeof useSessionRuntimeProjectionDeferral>[0];

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function buildHeavyRuntimeFixture(seed: string) {
  const messages: Message[] = Array.from({ length: 24 }, (_, index) => ({
    id: `${seed}-message-${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    content: `${seed} 消息 ${index}`,
    timestamp: new Date(2026, 5, 16, 10, index),
  }));
  const turns: AgentThreadTurn[] = Array.from({ length: 6 }, (_, index) => ({
    id: `${seed}-turn-${index}`,
    thread_id: `${seed}-thread`,
    prompt_text: `${seed} 任务 ${index}`,
    status: "completed",
    started_at: `2026-06-16T10:0${index}:00.000Z`,
    created_at: `2026-06-16T10:0${index}:00.000Z`,
    updated_at: `2026-06-16T10:0${index}:01.000Z`,
  }));
  const threadItems: AgentThreadItem[] = Array.from(
    { length: 24 },
    (_, index) => ({
      id: `${seed}-item-${index}`,
      thread_id: `${seed}-thread`,
      turn_id: `${seed}-turn-${Math.min(5, Math.floor(index / 4))}`,
      sequence: index + 1,
      status: "completed",
      type: "tool_call",
      tool_name: "Read",
      started_at: `2026-06-16T10:00:${String(index).padStart(2, "0")}.000Z`,
      updated_at: `2026-06-16T10:00:${String(index).padStart(2, "0")}.500Z`,
    }),
  );

  return { messages, turns, threadItems };
}

function createBaseProps(overrides: Partial<HookProps> = {}): HookProps {
  const fixture = buildHeavyRuntimeFixture("restore");

  return {
    sessionId: "session-1",
    messages: fixture.messages,
    turns: fixture.turns,
    threadItems: fixture.threadItems,
    currentTurnId: "restore-turn-5",
    threadRead: null,
    pendingActions: [
      {
        requestId: "approval-1",
        actionType: "tool_confirmation",
      },
    ],
    submittedActionsInFlight: [],
    isRestoringSession: true,
    isSending: false,
    focusedTimelineItemId: null,
    pendingA2UIForm: null,
    ...overrides,
  };
}

function renderHook(initialProps?: Partial<HookProps>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latestValue: ReturnType<
    typeof useSessionRuntimeProjectionDeferral
  > | null = null;
  const defaultProps = createBaseProps(initialProps);

  function Probe(props: HookProps) {
    latestValue = useSessionRuntimeProjectionDeferral(props);
    return null;
  }

  const render = (nextProps?: Partial<HookProps>) => {
    act(() => {
      root.render(<Probe {...defaultProps} {...nextProps} />);
    });
  };

  mountedRoots.push({ root, container });

  return {
    render,
    getValue: () => {
      if (!latestValue) {
        throw new Error("hook 尚未初始化");
      }
      return latestValue;
    },
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.useRealTimers();
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
});

describe("useSessionRuntimeProjectionDeferral", () => {
  it("恢复重会话首帧应隐藏运行投影并在延迟后恢复", () => {
    vi.useFakeTimers();
    const { render, getValue } = renderHook();

    render();

    expect(getValue().turns).toEqual([]);
    expect(getValue().threadItems).toEqual([]);
    expect(getValue().currentTurnId).toBeNull();
    expect(getValue().pendingActions).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(getValue().turns).toHaveLength(6);
    expect(getValue().threadItems).toHaveLength(24);
    expect(getValue().currentTurnId).toBe("restore-turn-5");
    expect(getValue().pendingActions).toHaveLength(1);
  });

  it("发送中或聚焦运行轨迹时不应延迟投影", () => {
    const sendingHarness = renderHook({ isSending: true });
    sendingHarness.render();

    expect(sendingHarness.getValue().turns).toHaveLength(6);
    expect(sendingHarness.getValue().threadItems).toHaveLength(24);
    expect(sendingHarness.getValue().currentTurnId).toBe("restore-turn-5");

    const focusedHarness = renderHook({
      focusedTimelineItemId: "restore-item-1",
    });
    focusedHarness.render();

    expect(focusedHarness.getValue().turns).toHaveLength(6);
    expect(focusedHarness.getValue().threadItems).toHaveLength(24);
  });

  it("切换到另一条旧会话时应重新进入延迟投影", () => {
    vi.useFakeTimers();
    const sessionB = buildHeavyRuntimeFixture("session-b");
    const { render, getValue } = renderHook();

    render();
    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(getValue().turns).toHaveLength(6);

    render({
      sessionId: "session-b",
      messages: sessionB.messages,
      turns: sessionB.turns,
      threadItems: sessionB.threadItems,
      currentTurnId: "session-b-turn-5",
    });

    expect(getValue().turns).toEqual([]);
    expect(getValue().threadItems).toEqual([]);
    expect(getValue().currentTurnId).toBeNull();

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(getValue().turns).toBe(sessionB.turns);
    expect(getValue().threadItems).toBe(sessionB.threadItems);
    expect(getValue().currentTurnId).toBe("session-b-turn-5");
  });
});
