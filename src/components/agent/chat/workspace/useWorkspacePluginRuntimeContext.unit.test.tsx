import { act, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InstalledPluginState } from "@/features/plugin/types";
import { PLUGINS_CHANGED_EVENT } from "@/lib/api/plugins";
import {
  cleanupMountedRoots,
  flushEffects,
  mountHarness,
  setupReactActEnvironment,
  type MountedRoot,
} from "@/components/workspace/hooks/testUtils";
import {
  mergePluginActivationSendOptions,
  resolveWorkspacePluginActivation,
} from "./workspacePluginActivation";
import {
  useWorkspacePluginRuntimeContext,
  type UseWorkspacePluginRuntimeContextOptions,
  type UseWorkspacePluginRuntimeContextResult,
} from "./useWorkspacePluginRuntimeContext";

interface HookHarnessProps {
  options: UseWorkspacePluginRuntimeContextOptions;
  onReady: (value: UseWorkspacePluginRuntimeContextResult) => void;
}

const mountedRoots: MountedRoot[] = [];

function HookHarness({ options, onReady }: HookHarnessProps) {
  const value = useWorkspacePluginRuntimeContext(options);

  useEffect(() => {
    onReady(value);
  }, [onReady, value]);

  return null;
}

function createInstalledPluginBackedApp(
  overrides: Partial<InstalledPluginState> = {},
): InstalledPluginState {
  return {
    appId: "creator-workbench",
    disabled: false,
    readiness: {
      appId: "creator-workbench",
      status: "ready",
      checkedAt: "2026-06-25T00:00:00.000Z",
      blockers: [],
      warnings: [],
      supportedCapabilities: [],
      missingCapabilities: [],
      entryReadiness: [],
      installModes: [],
    },
    manifest: {
      appId: "creator-workbench",
      displayName: "创作工作台",
      manifestVersion: "0.11",
      version: "1.0.0",
      status: "ready",
      appType: "plugin",
      description: "创作业务应用",
      runtimeTargets: ["local"],
      requires: {
        appRuntime: "0.11",
        capabilities: {},
      },
      runtimePackage: {
        worker: {
          entrypoint: "worker.js",
          outputArtifactKind: "creator.workspace_patch",
        },
      },
      permissions: [],
      entries: [
        {
          key: "creator",
          kind: "workflow",
          title: "创作工作台",
          requiredCapabilities: [],
          permissions: [],
          enabledByDefault: true,
        },
      ],
      knowledgeTemplates: [],
      artifacts: [],
      policies: [],
      services: [],
      workflows: [],
      skillRefs: [{ id: "article-draft", required: false }],
      toolRefs: [],
      evals: [],
      events: [],
      secrets: [],
      overlayTemplates: [],
      lifecycle: {},
      install: {
        modes: ["in_lime"],
        branding: {},
      },
      profiles: ["workbench"],
      agentRuntime: {
        tasks: [{ kind: "creator.generate" }],
      },
      workbench: {
        profile: "production",
        articleWorkspace: {
          primaryObjectKinds: ["articleDraft"],
        },
        productionObjects: [
          {
            kind: "articleDraft",
            title: "文章草稿",
            artifactKind: "creator.article_draft",
            defaultSurface: "artifact",
            primary: true,
          },
        ],
        objectSurfaces: [
          {
            objectKind: "articleDraft",
            surfaceKind: "artifact",
            renderer: "host_builtin",
          },
        ],
      },
    },
    identity: {
      sourceKind: "fixture",
      sourceUri: "fixture:creator-workbench",
      appId: "creator-workbench",
      appVersion: "1.0.0",
      packageHash: "package-hash",
      manifestHash: "manifest-hash",
      loadedAt: "2026-06-25T00:00:00.000Z",
    },
    projection: {} as InstalledPluginState["projection"],
    installMode: "in_lime",
    runtimeProfileSummary:
      {} as InstalledPluginState["runtimeProfileSummary"],
    setup: {} as InstalledPluginState["setup"],
    installedAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
    ...overrides,
  } as InstalledPluginState;
}

function pluginActivationRequestMetadata(
  installedPlugins: readonly InstalledPluginState[],
) {
  const resolution = resolveWorkspacePluginActivation({
    text: "@创作工作台 写一篇公众号文章",
    sessionId: "session-1",
    installedPlugins,
  });

  return mergePluginActivationSendOptions({
    resolution: resolution!,
  })?.requestMetadata;
}

function renderHook(
  options: UseWorkspacePluginRuntimeContextOptions,
  onReady: (value: UseWorkspacePluginRuntimeContextResult) => void,
) {
  const mounted = mountHarness(HookHarness, { options, onReady }, mountedRoots);
  return mounted;
}

describe("useWorkspacePluginRuntimeContext", () => {
  let latestValue: UseWorkspacePluginRuntimeContextResult | null = null;

  beforeEach(() => {
    setupReactActEnvironment();
    latestValue = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
  });

  function getLatestValue(): UseWorkspacePluginRuntimeContextResult {
    expect(latestValue).not.toBeNull();
    return latestValue as UseWorkspacePluginRuntimeContextResult;
  }

  it("没有显式插件激活 metadata 时默认不读取已安装状态", async () => {
    const listInstalled = vi.fn(async () => ({
      states: [createInstalledPluginBackedApp()],
    }));

    renderHook(
      {
        listInstalled,
      },
      (value) => {
        latestValue = value;
      },
    );
    await flushEffects(4);

    expect(listInstalled).not.toHaveBeenCalled();
    expect(getLatestValue().context).toMatchObject({
      status: "inactive",
      activationContext: null,
      contracts: [],
      registry: [],
      blockerCodes: [],
    });
  });

  it("插件候选被显式请求后才读取已安装状态", async () => {
    const listInstalled = vi.fn(async () => ({
      states: [createInstalledPluginBackedApp()],
    }));

    renderHook(
      {
        enabled: true,
        listInstalled,
      },
      (value) => {
        latestValue = value;
      },
    );
    await flushEffects(4);

    expect(listInstalled).toHaveBeenCalledTimes(1);
    expect(getLatestValue().context).toMatchObject({
      status: "inactive",
      activationContext: null,
      contracts: [expect.objectContaining({ id: "creator-workbench" })],
      registry: [expect.objectContaining({ pluginId: "creator-workbench" })],
      blockerCodes: [],
    });
  });

  it("有显式插件激活 metadata 时应读取 installed registry 并输出 active 上下文", async () => {
    const installed = [createInstalledPluginBackedApp()];
    const listInstalled = vi.fn(async () => ({ states: installed }));

    renderHook(
      {
        requestMetadata: pluginActivationRequestMetadata(installed),
        listInstalled,
      },
      (value) => {
        latestValue = value;
      },
    );
    await flushEffects(8);

    expect(listInstalled).toHaveBeenCalledTimes(1);
    expect(getLatestValue()).toMatchObject({
      loading: false,
      error: null,
      context: {
        status: "active",
        activationContext: {
          pluginId: "creator-workbench",
          activeEntryKey: "creator",
        },
        blockerCodes: [],
      },
    });
    expect(getLatestValue().context.contracts[0]).toMatchObject({
      id: "creator-workbench",
    });
  });

  it("读取失败时应 fail closed 为 blocked", async () => {
    const installed = [createInstalledPluginBackedApp()];
    const listInstalled = vi.fn(async () => {
      throw new Error("installed state unavailable");
    });

    renderHook(
      {
        requestMetadata: pluginActivationRequestMetadata(installed),
        listInstalled,
      },
      (value) => {
        latestValue = value;
      },
    );
    await flushEffects(8);

    expect(getLatestValue().error?.message).toBe(
      "installed state unavailable",
    );
    expect(getLatestValue().context).toMatchObject({
      status: "blocked",
      activationContext: {
        pluginId: "creator-workbench",
      },
      blockerCodes: ["PLUGIN_REGISTRY_ITEM_MISSING"],
    });
  });

  it("已安装状态变化事件应刷新插件运行上下文", async () => {
    const installed = [createInstalledPluginBackedApp()];
    const listInstalled = vi
      .fn()
      .mockResolvedValueOnce({ states: installed })
      .mockResolvedValueOnce({
        states: [createInstalledPluginBackedApp({ disabled: true })],
      });

    renderHook(
      {
        requestMetadata: pluginActivationRequestMetadata(installed),
        listInstalled,
      },
      (value) => {
        latestValue = value;
      },
    );
    await flushEffects(8);

    expect(getLatestValue().context.status).toBe("active");

    act(() => {
      window.dispatchEvent(new Event(PLUGINS_CHANGED_EVENT));
    });
    await flushEffects(8);

    expect(listInstalled).toHaveBeenCalledTimes(2);
    expect(getLatestValue().context).toMatchObject({
      status: "blocked",
      blockerCodes: expect.arrayContaining(["PLUGIN_DISABLED"]),
    });
  });
});
