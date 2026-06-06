import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanionEntryEnabled } from "./useCompanionEntryEnabled";

const { mockGetConfig, mockSubscribeAppConfigChanged } = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockSubscribeAppConfigChanged: vi.fn(),
}));

vi.mock("@/lib/api/appConfig", () => ({
  getConfig: mockGetConfig,
  subscribeAppConfigChanged: mockSubscribeAppConfigChanged,
}));

function createConfig(enabledItems: string[] = [], schemaVersion = 3) {
  return {
    navigation: {
      schema_version: schemaVersion,
      enabled_items: enabledItems,
    },
  };
}

describe("useCompanionEntryEnabled", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latestEnabled = false;

  function Probe() {
    const enabled = useCompanionEntryEnabled();

    useEffect(() => {
      latestEnabled = enabled;
    }, [enabled]);

    return null;
  }

  async function renderProbe() {
    await act(async () => {
      root.render(<Probe />);
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    latestEnabled = false;
    mockSubscribeAppConfigChanged.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it("无显式配置时默认不开启桌宠入口", async () => {
    mockGetConfig.mockResolvedValue(createConfig());

    await renderProbe();

    expect(latestEnabled).toBe(false);
  });

  it("旧 schema 即使包含 companion 也不应开启桌宠入口", async () => {
    mockGetConfig.mockResolvedValue(createConfig(["companion"], 2));

    await renderProbe();

    expect(latestEnabled).toBe(false);
  });

  it("current schema 显式开启 companion 时才开启桌宠入口", async () => {
    mockGetConfig.mockResolvedValue(createConfig(["companion"], 3));

    await renderProbe();

    expect(latestEnabled).toBe(true);
  });
});
