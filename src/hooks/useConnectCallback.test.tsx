import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendConnectCallback } from "@/lib/api/connect";
import { safeInvoke } from "@/lib/dev-bridge";
import { useConnectCallback } from "./useConnectCallback";

const { mockSendConnectCallback } = vi.hoisted(() => ({
  mockSendConnectCallback: vi.fn(),
}));

vi.mock("@/lib/api/connect", () => ({
  sendConnectCallback: mockSendConnectCallback,
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function mountHook() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let hookValue: ReturnType<typeof useConnectCallback> | null = null;

  function Probe() {
    hookValue = useConnectCallback();
    return null;
  }

  act(() => {
    root.render(<Probe />);
  });

  mountedRoots.push({ root, container });

  return {
    getValue() {
      if (!hookValue) {
        throw new Error("hook 尚未初始化");
      }
      return hookValue;
    },
  };
}

describe("useConnectCallback", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.mocked(sendConnectCallback).mockReset();
    vi.mocked(safeInvoke).mockReset();
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
    vi.clearAllMocks();
  });

  it("成功回调应通过 App Server Connect 网关发送", async () => {
    mockSendConnectCallback.mockResolvedValueOnce(true);
    const harness = mountHook();

    let result = false;
    await act(async () => {
      result = await harness
        .getValue()
        .sendSuccessCallback("relay-one", "sk-relay-key", "ref-001");
    });

    expect(result).toBe(true);
    expect(mockSendConnectCallback).toHaveBeenCalledWith({
      relayId: "relay-one",
      apiKey: "sk-relay-key",
      status: "success",
      refCode: "ref-001",
      errorCode: undefined,
      errorMessage: undefined,
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("回调发送失败不应阻塞主流程", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSendConnectCallback.mockRejectedValueOnce(
      new Error("callback endpoint unavailable"),
    );
    const harness = mountHook();

    let result = true;
    await act(async () => {
      result = await harness
        .getValue()
        .sendErrorCallback(
          "relay-one",
          "sk-relay-key",
          "save_failed",
          "保存失败",
          "ref-001",
        );
    });

    expect(result).toBe(false);
    expect(mockSendConnectCallback).toHaveBeenCalledWith({
      relayId: "relay-one",
      apiKey: "sk-relay-key",
      status: "error",
      refCode: "ref-001",
      errorCode: "save_failed",
      errorMessage: "保存失败",
    });
    expect(safeInvoke).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
