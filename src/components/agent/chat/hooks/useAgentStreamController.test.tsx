import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { useAgentStreamController } from "./useAgentStreamController";

interface ControllerHarness {
  getValue: () => ReturnType<typeof useAgentStreamController>;
  getRefs: () => {
    assistantMsgId: string | null;
    eventName: string | null;
    sessionId: string | null;
  };
  unmount: () => void;
}

function mountHook(): ControllerHarness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let hookValue: ReturnType<typeof useAgentStreamController> | null = null;
  let refs = {
    assistantMsgId: null as string | null,
    eventName: null as string | null,
    sessionId: null as string | null,
  };

  function TestComponent() {
    const currentAssistantMsgIdRef = useRef<string | null>(null);
    const currentStreamingSessionIdRef = useRef<string | null>(null);
    const currentStreamingEventNameRef = useRef<string | null>(null);

    hookValue = useAgentStreamController({
      currentAssistantMsgIdRef,
      currentStreamingSessionIdRef,
      currentStreamingEventNameRef,
    });

    refs = {
      assistantMsgId: currentAssistantMsgIdRef.current,
      eventName: currentStreamingEventNameRef.current,
      sessionId: currentStreamingSessionIdRef.current,
    };
    return null;
  }

  act(() => {
    root.render(<TestComponent />);
  });

  return {
    getValue: () => {
      if (!hookValue) {
        throw new Error("hook 尚未初始化");
      }
      return hookValue;
    },
    getRefs: () => refs,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("useAgentStreamController", () => {
  it("应同步 active stream 到 ref 并更新发送状态", () => {
    const harness = mountHook();

    try {
      act(() => {
        harness.getValue().setActiveStream({
          assistantMsgId: "assistant-1",
          eventName: "stream-1",
          sessionId: "session-1",
        });
      });

      expect(harness.getValue().activeStreamRef.current).toEqual({
        assistantMsgId: "assistant-1",
        eventName: "stream-1",
        sessionId: "session-1",
      });
      expect(harness.getValue().isSending).toBe(true);
      expect(harness.getRefs()).toEqual({
        assistantMsgId: "assistant-1",
        eventName: "stream-1",
        sessionId: "session-1",
      });

      act(() => {
        harness.getValue().clearActiveStreamIfMatch("stream-1");
      });

      expect(harness.getValue().activeStreamRef.current).toBeNull();
      expect(harness.getValue().isSending).toBe(false);
      expect(harness.getRefs()).toEqual({
        assistantMsgId: null,
        eventName: null,
        sessionId: null,
      });
    } finally {
      harness.unmount();
    }
  });

  it("应替换并移除同 eventName 的 listener", () => {
    const harness = mountHook();
    const first = vi.fn();
    const second = vi.fn();

    try {
      act(() => {
        harness.getValue().replaceStreamListener("stream-1", first);
      });
      expect(harness.getValue().listenerMapRef.current.get("stream-1")).toBe(
        first,
      );

      act(() => {
        harness.getValue().replaceStreamListener("stream-1", second);
      });
      expect(first).toHaveBeenCalledTimes(1);
      expect(harness.getValue().listenerMapRef.current.get("stream-1")).toBe(
        second,
      );

      act(() => {
        const removed = harness.getValue().removeStreamListener("stream-1");
        expect(removed).toBe(true);
      });
      expect(second).toHaveBeenCalledTimes(1);
      expect(harness.getValue().listenerMapRef.current.size).toBe(0);
    } finally {
      harness.unmount();
    }
  });

  it("切换会话时应清空剩余 listener 与 active stream 绑定", () => {
    const harness = mountHook();
    const first = vi.fn();
    const second = vi.fn();

    try {
      act(() => {
        harness.getValue().setActiveStream({
          assistantMsgId: "assistant-2",
          eventName: "stream-2",
          sessionId: "session-2",
        });
        harness.getValue().replaceStreamListener("stream-2", first);
        harness.getValue().replaceStreamListener("stream-3", second);
      });

      act(() => {
        harness.getValue().clearStreamBindings();
      });

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
      expect(harness.getValue().listenerMapRef.current.size).toBe(0);
      expect(harness.getValue().activeStreamRef.current).toBeNull();
      expect(harness.getValue().isSending).toBe(false);
      expect(harness.getRefs()).toEqual({
        assistantMsgId: null,
        eventName: null,
        sessionId: null,
      });
    } finally {
      harness.unmount();
    }
  });

  it("卸载时应清理剩余 listener", () => {
    const harness = mountHook();
    const unlisten = vi.fn();

    act(() => {
      harness.getValue().replaceStreamListener("stream-1", unlisten);
    });

    harness.unmount();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
