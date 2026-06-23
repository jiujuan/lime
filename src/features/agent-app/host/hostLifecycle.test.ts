import { describe, expect, it } from "vitest";

import { normalizeManifest } from "../manifest/normalizeManifest";
import type { AppManifest, ReadinessResult } from "../types";
import {
  buildAgentAppHostLifecycleSnapshot,
  buildAgentAppRightSurfaceContract,
} from "./hostLifecycle";

function readyReadiness(appId: string): ReadinessResult {
  return {
    appId,
    status: "ready",
    checkedAt: "2026-06-23T00:00:00.000Z",
    blockers: [],
    warnings: [],
    supportedCapabilities: [],
    missingCapabilities: [],
    entryReadiness: [],
    installModes: [],
  };
}

function buildContentFactoryManifest(overrides: Partial<AppManifest> = {}) {
  return normalizeManifest({
    manifestVersion: "0.11.0",
    name: "content-factory-app",
    displayName: "内容工厂",
    version: "1.0.0",
    status: "ready",
    appType: "domain-app",
    runtimeTargets: ["local"],
    profiles: ["workbench"],
    distribution: {
      primaryInstallSurface: "lime-app-center",
    },
    requires: {
      lime: {
        appRuntime: ">=0.11.0 <1.0.0",
      },
      capabilities: {
        "lime.agent": "^0.11.0",
        "lime.artifacts": "^0.11.0",
        "lime.evidence": "^0.11.0",
      },
    },
    entries: [
      {
        key: "content_factory",
        kind: "workflow",
        title: "内容工厂",
      },
    ],
    runtimePackage: {
      worker: {
        entrypoint: "./src/runtime/content-factory-worker.mjs",
        contract: "./app.runtime.yaml",
        sampleRequest: "./examples/runtime-request.sample.json",
        outputArtifactKind: "content_factory.workspace_patch",
      },
    },
    agentRuntime: {
      bridge: {
        kind: "app-server-json-rpc",
        required: true,
      },
      worker: {
        entrypoint: "./src/runtime/content-factory-worker.mjs",
        directProviderAccess: false,
        directFilesystemAccess: false,
      },
      tasks: [
        {
          kind: "content.factory.generate",
        },
        {
          kind: "content.article.generate",
        },
      ],
    },
    workbench: {
      profile: "production",
      productWorkspace: {
        scope: "session",
        primaryObjectKinds: ["articleDraft", "imageGenerationSet"],
      },
      productionObjects: [
        {
          kind: "articleDraft",
          title: "文章草稿",
          artifactKind: "markdown_document",
          defaultSurface: "documentCanvas",
          primary: true,
        },
        {
          kind: "imageGenerationSet",
          title: "图片生成组",
          artifactKind: "image_set",
          defaultSurface: "imageGrid",
        },
      ],
      objectSurfaces: [
        {
          objectKind: "articleDraft",
          surfaceKind: "documentCanvas",
          renderer: "host_builtin",
        },
        {
          objectKind: "imageGenerationSet",
          surfaceKind: "imageGrid",
          renderer: "host_builtin",
        },
      ],
      historyRestore: {
        defaultSurface: "selectedObject",
        restoreSelection: true,
        restoreLayout: true,
        fallback: "artifactPreview",
      },
    },
    ...overrides,
  });
}

describe("Agent App Host v3 lifecycle skeleton", () => {
  it("把 Workbench App 投影到唯一右侧 dock 和 productProfile tab", () => {
    const manifest = buildContentFactoryManifest();
    const contract = buildAgentAppRightSurfaceContract(manifest);

    expect(contract.physicalDockCount).toBe(1);
    expect(contract.defaultActiveTab).toBe("productProfile");
    expect(contract.supportedTabs).toEqual([
      "productProfile",
      "file",
      "evidence",
      "terminal",
      "browser",
      "sideChat",
    ]);
    expect(contract.productProfile.objects).toEqual([
      expect.objectContaining({
        kind: "articleDraft",
        defaultPane: "documentCanvas",
        primary: true,
      }),
      expect.objectContaining({
        kind: "imageGenerationSet",
        defaultPane: "imageGrid",
      }),
    ]);
    expect(contract.productProfile.panes).toEqual(
      expect.arrayContaining(["documentCanvas", "imageGrid", "expertInfo"]),
    );
    expect(contract.historyRestore).toEqual(
      expect.objectContaining({
        enabled: true,
        defaultTab: "productProfile",
        defaultPane: "documentCanvas",
        restoreSelection: true,
        restoreLayout: true,
      }),
    );
  });

  it("生成宿主生命周期 snapshot，先保留骨架后续再接 Electron / App Server 深实现", () => {
    const manifest = buildContentFactoryManifest();
    const snapshot = buildAgentAppHostLifecycleSnapshot({
      manifest,
      readiness: readyReadiness(manifest.appId),
      generatedAt: "2026-06-23T00:00:00.000Z",
    });

    expect(snapshot.appCenterStatus).toBe("ready");
    expect(snapshot.profiles).toEqual(["workbench"]);
    expect(snapshot.taskRuntime).toEqual(
      expect.objectContaining({
        enabled: true,
        workerEntrypoint: "./src/runtime/content-factory-worker.mjs",
        contractPath: "./app.runtime.yaml",
        sampleRequestPath: "./examples/runtime-request.sample.json",
        outputArtifactKind: "content_factory.workspace_patch",
        taskKinds: ["content.factory.generate", "content.article.generate"],
        directProviderAccess: false,
        directFilesystemAccess: false,
        blockers: [],
      }),
    );
    expect(snapshot.functions.map((item) => item.key)).toEqual([
      "appCenterPublishing",
      "packageInspection",
      "installReview",
      "readinessGate",
      "capabilitySdk",
      "appServerBridge",
      "uiRuntime",
      "agentRuntime",
      "rightSurfaceDock",
      "productProfile",
      "historyRestore",
      "uninstall",
    ]);
    expect(snapshot.functions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "rightSurfaceDock",
          status: "ready",
          currentOwner: "claw",
        }),
        expect.objectContaining({
          key: "productProfile",
          status: "ready",
          currentOwner: "claw",
        }),
        expect.objectContaining({
          key: "agentRuntime",
          status: "ready",
          currentOwner: "app-server",
        }),
      ]),
    );
    expect(snapshot.blockers).toEqual([]);
  });

  it("缺少 worker entrypoint 时阻断 Agent runtime 但不新增内容工厂垂直命令", () => {
    const manifest = buildContentFactoryManifest({
      runtimePackage: {
        worker: {
          contract: "./app.runtime.yaml",
        },
      },
      agentRuntime: {
        tasks: [{ kind: "content.factory.generate" }],
      },
    });
    const snapshot = buildAgentAppHostLifecycleSnapshot({
      manifest,
      readiness: readyReadiness(manifest.appId),
      generatedAt: "2026-06-23T00:00:00.000Z",
    });

    expect(snapshot.taskRuntime.blockers).toEqual([
      "TASK_RUNTIME_WORKER_ENTRYPOINT_MISSING",
    ]);
    expect(snapshot.functions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "agentRuntime",
          status: "blocked",
          blockers: ["TASK_RUNTIME_WORKER_ENTRYPOINT_MISSING"],
        }),
      ]),
    );
  });

  it("旧 Tauri / iframe-only 主路径不能进入用户可见应用中心", () => {
    const manifest = buildContentFactoryManifest({
      boundary: {
        legacyRuntime: "requires src-tauri and iframe-only runtime",
      },
    });
    const snapshot = buildAgentAppHostLifecycleSnapshot({
      manifest,
      readiness: readyReadiness(manifest.appId),
      generatedAt: "2026-06-23T00:00:00.000Z",
    });

    expect(snapshot.appCenterStatus).toBe("delisted");
    expect(snapshot.functions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "appCenterPublishing",
          status: "delisted",
          blockers: ["LEGACY_OR_DEPRECATED_APP"],
        }),
      ]),
    );
  });
});
