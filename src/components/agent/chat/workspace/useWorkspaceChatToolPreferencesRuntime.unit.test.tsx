import React, { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSessionExecutionRuntime } from "@/lib/api/agentRuntime";
import {
  buildSessionRecentPreferencesBackfillKey,
  resolveFallbackSessionRecentPreferences,
  useWorkspaceChatToolPreferencesRuntime,
} from "./useWorkspaceChatToolPreferencesRuntime";
import type { ChatToolPreferences } from "../utils/chatToolPreferences";

type HookProps = Omit<
  Parameters<typeof useWorkspaceChatToolPreferencesRuntime>[0],
  "chatToolPreferences" | "setChatToolPreferences"
>;

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function runtimeWithPreferences(
  preferences: ChatToolPreferences,
): Pick<
  AgentSessionExecutionRuntime,
  "recent_preferences" | "execution_strategy"
> {
  return {
    recent_preferences: preferences,
    execution_strategy: "react",
  };
}

function renderHook(props?: Partial<HookProps>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latestValue: ChatToolPreferences | null = null;
  let setPreferences: React.Dispatch<
    React.SetStateAction<ChatToolPreferences>
  > | null = null;

  const defaultProps: HookProps = {
    activeTheme: "general",
    executionRuntime: null,
    executionStrategy: "react",
    sessionId: "session-1",
    syncChatToolPreferencesSource: vi.fn(),
    syncSessionRecentPreferences: vi.fn().mockResolvedValue(undefined),
  };

  function Probe(currentProps: HookProps) {
    const [chatToolPreferences, setChatToolPreferences] =
      useState<ChatToolPreferences>({
        task: false,
        subagent: false,
      });
    setPreferences = setChatToolPreferences;
    latestValue = useWorkspaceChatToolPreferencesRuntime({
      ...currentProps,
      chatToolPreferences,
      setChatToolPreferences,
    });
    return null;
  }

  const render = async (nextProps?: Partial<HookProps>) => {
    await act(async () => {
      root.render(<Probe {...defaultProps} {...props} {...nextProps} />);
      await Promise.resolve();
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
    setPreferences: async (
      value: React.SetStateAction<ChatToolPreferences>,
    ) => {
      if (!setPreferences) {
        throw new Error("hook 尚未初始化");
      }
      await act(async () => {
        setPreferences?.(value);
        await Promise.resolve();
      });
    },
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
});

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
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("workspace chat tool preferences runtime", () => {
  it("backfill key 应只由 session 和实际偏好字段组成", () => {
    expect(
      buildSessionRecentPreferencesBackfillKey("session-1", {
        task: true,
        subagent: false,
      }),
    ).toBe("session-1:[true,false]");
  });

  it("fallback recent preferences 应读取主题本地偏好", () => {
    localStorage.setItem(
      "lime.chat.tool_preferences.general.v3",
      JSON.stringify({ task: true, subagent: false }),
    );

    expect(
      resolveFallbackSessionRecentPreferences({
        activeTheme: "general",
        executionStrategy: "react",
      }),
    ).toEqual({ task: true, subagent: false });
  });

  it("有 runtime recent preferences 时应同步来源且不做 fallback backfill", async () => {
    const syncChatToolPreferencesSource = vi.fn();
    const syncSessionRecentPreferences = vi.fn().mockResolvedValue(undefined);
    const { render } = renderHook({
      executionRuntime: runtimeWithPreferences({
        task: true,
        subagent: true,
      }),
      syncChatToolPreferencesSource,
      syncSessionRecentPreferences,
    });

    await render();

    expect(syncChatToolPreferencesSource).toHaveBeenCalledWith("general", {
      task: true,
      subagent: true,
    });
    expect(syncSessionRecentPreferences).not.toHaveBeenCalled();
  });

  it("缺 runtime recent preferences 时应按本地 fallback 后台回填一次", async () => {
    localStorage.setItem(
      "lime.chat.tool_preferences.general.v3",
      JSON.stringify({ task: true, subagent: false }),
    );
    const syncSessionRecentPreferences = vi.fn().mockResolvedValue(undefined);
    const { render } = renderHook({
      syncSessionRecentPreferences,
      sessionId: " session-1 ",
    });

    await render();
    await render();

    expect(syncSessionRecentPreferences).toHaveBeenCalledTimes(1);
    expect(syncSessionRecentPreferences).toHaveBeenCalledWith(
      "session-1",
      {
        task: true,
        subagent: false,
      },
      { priority: "background" },
    );
  });

  it("偏好状态变化后应返回对齐后的 effective preferences", async () => {
    const { render, getValue, setPreferences } = renderHook();

    await render();
    expect(getValue()).toEqual({ task: false, subagent: false });

    await setPreferences({ task: true, subagent: false });

    expect(getValue()).toEqual({ task: true, subagent: false });
  });
});
