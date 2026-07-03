import { act, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupMountedRoots,
  flushEffects,
  mountHarness,
  setupReactActEnvironment,
  type MountedRenderResult,
  type MountedRoot,
} from "@/components/workspace/hooks/testUtils";
import { OemCloudControlPlaneError } from "@/lib/api/oemCloudControlPlane";
import type { PluginRegistryItem } from "../manifest/types";
import type { PluginMarketplaceRegistrySnapshot } from "./marketplaceRegistryLoader";
import type { PluginMarketplaceItem } from "./types";
import {
  usePluginMarketplaceRegistry,
  type UsePluginMarketplaceRegistryOptions,
  type UsePluginMarketplaceRegistryResult,
} from "./usePluginMarketplaceRegistry";

type HookValue = UsePluginMarketplaceRegistryResult;

interface HarnessProps {
  options: UsePluginMarketplaceRegistryOptions;
  onReady: (value: HookValue) => void;
}

function HookHarness({ options, onReady }: HarnessProps) {
  const value = usePluginMarketplaceRegistry(options);

  useEffect(() => {
    onReady(value);
  }, [onReady, value]);

  return null;
}

const mountedRoots: MountedRoot[] = [];

function marketplaceItem(
  pluginKey: string,
  overrides: Partial<PluginMarketplaceItem> = {},
): PluginMarketplaceItem {
  const pluginName = pluginKey.split("@")[0] ?? pluginKey;
  return {
    pluginKey,
    pluginName,
    marketplaceName: "limecloud",
    displayName: overrides.displayName ?? pluginName,
    description: `${pluginName} plugin`,
    version: "1.0.0",
    category: "research",
    sourceKind: "plugin_catalog",
    appId: pluginName,
    enabled: true,
    installState: "available",
    activationState: "activatable",
    policy: {
      installation: "AVAILABLE",
      authentication: "ON_USE",
    },
    ...overrides,
  };
}

function registryItem(
  pluginId: string,
  overrides: Partial<PluginRegistryItem> = {},
): PluginRegistryItem {
  return {
    pluginId,
    displayName: overrides.displayName ?? pluginId,
    version: "1.0.0",
    installed: true,
    enabled: true,
    capabilityStates: ["activatable"],
    activationState: "activatable",
    rendererState: "missing_renderer",
    historyState: "read_write",
    blockerCodes: ["PLUGIN_RENDERER_UNAVAILABLE"],
    ...overrides,
  };
}

function snapshot(
  generatedAt: string,
  entries: Array<{
    item: PluginMarketplaceItem;
    registry: PluginRegistryItem;
  }>,
): PluginMarketplaceRegistrySnapshot {
  return {
    marketplace: {
      schemaVersion: "plugin-marketplace/v1",
      tenantId: "tenant-0001",
      generatedAt,
      marketplaceName: "limecloud",
      items: entries.map((entry) => entry.item),
    },
    installed: {
      states: [],
      issues: [],
    },
    projectionInputs: [],
    registry: entries.map((entry) => entry.registry),
  };
}

function researchSnapshot(generatedAt = "2026-06-25T00:00:00.000Z") {
  return snapshot(generatedAt, [
    {
      item: marketplaceItem("research-kit@limecloud", {
        displayName: "Research Kit",
        category: "research",
      }),
      registry: registryItem("research-kit@limecloud", {
        displayName: "Research Kit",
      }),
    },
  ]);
}

async function renderHook(
  options: UsePluginMarketplaceRegistryOptions,
  onReady: (value: HookValue) => void,
): Promise<MountedRenderResult<HarnessProps>> {
  const mounted = mountHarness(HookHarness, { options, onReady }, mountedRoots);
  await flushEffects(8);
  return mounted;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("usePluginMarketplaceRegistry", () => {
  let latestValue: HookValue | null = null;

  beforeEach(() => {
    setupReactActEnvironment();
    latestValue = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
  });

  function getLatestValue(): HookValue {
    expect(latestValue).not.toBeNull();
    return latestValue as HookValue;
  }

  it("autoLoad=true 时应自动加载 registry snapshot 并建立只读 view model", async () => {
    const loader = vi.fn(async () => researchSnapshot());

    await renderHook(
      {
        tenantId: " tenant-0001 ",
        marketplaceQuery: { query: " research ", category: " research " },
        loader,
      },
      (value) => {
        latestValue = value;
      },
    );

    expect(loader).toHaveBeenCalledWith(
      "tenant-0001",
      { query: "research", category: "research", sort: undefined },
      undefined,
    );
    expect(getLatestValue().loading).toBe(false);
    expect(getLatestValue().error).toBeNull();
    expect(getLatestValue().snapshot?.marketplace.items).toHaveLength(1);
    expect(getLatestValue().model?.items).toEqual([
      expect.objectContaining({
        pluginId: "research-kit@limecloud",
        displayName: "Research Kit",
        primaryAction: expect.objectContaining({
          kind: "open",
        }),
      }),
    ]);
  });

  it("refresh 应重新调用 loader 并更新 snapshot", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce(researchSnapshot("2026-06-25T00:00:00.000Z"))
      .mockResolvedValueOnce(researchSnapshot("2026-06-25T00:01:00.000Z"));

    await renderHook(
      {
        tenantId: "tenant-0001",
        autoLoad: false,
        loader,
      },
      (value) => {
        latestValue = value;
      },
    );

    expect(getLatestValue().snapshot).toBeNull();

    await act(async () => {
      await getLatestValue().refresh();
    });
    await flushEffects(4);

    expect(getLatestValue().snapshot?.marketplace.generatedAt).toBe(
      "2026-06-25T00:00:00.000Z",
    );

    await act(async () => {
      await getLatestValue().refresh();
    });
    await flushEffects(4);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(getLatestValue().snapshot?.marketplace.generatedAt).toBe(
      "2026-06-25T00:01:00.000Z",
    );
  });

  it("loader 失败时应暴露错误并让 refresh 调用方感知失败", async () => {
    const loader = vi.fn(async () => {
      throw new Error("marketplace down");
    });

    await renderHook(
      {
        tenantId: "tenant-0001",
        autoLoad: false,
        loader,
      },
      (value) => {
        latestValue = value;
      },
    );

    let refreshError: unknown;
    await act(async () => {
      try {
        await getLatestValue().refresh();
      } catch (error) {
        refreshError = error;
      }
    });
    await flushEffects(4);

    expect(refreshError).toBeInstanceOf(Error);
    expect((refreshError as Error).message).toBe("marketplace down");
    expect(getLatestValue().loading).toBe(false);
    expect(getLatestValue().error).toBe("marketplace down");
    expect(getLatestValue().snapshot).toBeNull();
    expect(getLatestValue().model).toBeNull();
  });

  it("认证失败时应标记需要重新连接云端账号且不暴露为加载错误", async () => {
    const loader = vi.fn(async () => {
      throw new OemCloudControlPlaneError("invalid auth token", {
        status: 401,
      });
    });

    await renderHook(
      {
        tenantId: "tenant-0001",
        autoLoad: false,
        loader,
      },
      (value) => {
        latestValue = value;
      },
    );

    let refreshError: unknown;
    await act(async () => {
      try {
        await getLatestValue().refresh();
      } catch (error) {
        refreshError = error;
      }
    });
    await flushEffects(4);

    expect(refreshError).toBeInstanceOf(OemCloudControlPlaneError);
    expect(getLatestValue().loading).toBe(false);
    expect(getLatestValue().authRequired).toBe(true);
    expect(getLatestValue().error).toBeNull();
    expect(getLatestValue().snapshot).toBeNull();
    expect(getLatestValue().model).toBeNull();
  });

  it("view options 更新时应复用现有 snapshot 重建模型，不应重复加载", async () => {
    const loader = vi.fn(async () =>
      snapshot("2026-06-25T00:00:00.000Z", [
        {
          item: marketplaceItem("research-kit@limecloud", {
            displayName: "Research Kit",
            category: "research",
          }),
          registry: registryItem("research-kit@limecloud", {
            displayName: "Research Kit",
          }),
        },
        {
          item: marketplaceItem("notes-kit@limecloud", {
            displayName: "Notes Kit",
            category: "writing",
          }),
          registry: registryItem("notes-kit@limecloud", {
            displayName: "Notes Kit",
          }),
        },
      ]),
    );

    const mounted = await renderHook(
      {
        tenantId: "tenant-0001",
        loader,
      },
      (value) => {
        latestValue = value;
      },
    );

    expect(getLatestValue().model?.items.map((item) => item.pluginId)).toEqual([
      "notes-kit@limecloud",
      "research-kit@limecloud",
    ]);

    mounted.rerender({
      options: {
        tenantId: "tenant-0001",
        loader,
        viewOptions: {
          category: "writing",
        },
      },
      onReady: (value) => {
        latestValue = value;
      },
    });
    await flushEffects(4);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(getLatestValue().model?.items.map((item) => item.pluginId)).toEqual([
      "notes-kit@limecloud",
    ]);
  });

  it("较旧的异步结果不应覆盖后发起的 marketplace refresh", async () => {
    const firstLoad = deferred<PluginMarketplaceRegistrySnapshot>();
    const secondLoad = deferred<PluginMarketplaceRegistrySnapshot>();
    const loader = vi
      .fn()
      .mockReturnValueOnce(firstLoad.promise)
      .mockReturnValueOnce(secondLoad.promise);

    const mounted = await renderHook(
      {
        tenantId: "tenant-0001",
        marketplaceQuery: {
          query: "first",
        },
        loader,
      },
      (value) => {
        latestValue = value;
      },
    );

    mounted.rerender({
      options: {
        tenantId: "tenant-0001",
        marketplaceQuery: {
          query: "second",
        },
        loader,
      },
      onReady: (value) => {
        latestValue = value;
      },
    });
    await flushEffects(2);

    await act(async () => {
      secondLoad.resolve(researchSnapshot("2026-06-25T00:02:00.000Z"));
      await Promise.resolve();
    });
    await flushEffects(4);

    expect(getLatestValue().snapshot?.marketplace.generatedAt).toBe(
      "2026-06-25T00:02:00.000Z",
    );

    await act(async () => {
      firstLoad.resolve(researchSnapshot("2026-06-25T00:01:00.000Z"));
      await Promise.resolve();
    });
    await flushEffects(4);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(getLatestValue().snapshot?.marketplace.generatedAt).toBe(
      "2026-06-25T00:02:00.000Z",
    );
  });
});
