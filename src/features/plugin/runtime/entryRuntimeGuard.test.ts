import { describe, expect, it } from "vitest";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import { buildPluginPackageCacheEntry } from "../install/packageCache";
import { currentPluginHostRuntimeVersion } from "../readiness/hostCapabilityProfile";
import { buildContentFactoryUiRuntimeTestManifest } from "../testing/contentFactoryTestManifest";
import type { PluginSetupState, InstalledAppPreview } from "../types";
import { buildLimeRuntimeProfileFromHostProfile } from "../runtime-profile";
import { buildWorkflowRuntimeCapabilityProfile } from "../testing/workflowRuntimeCapabilityProfile";
import { loadRuntimePackageDescriptor } from "./runtimePackageLoader";
import { evaluatePluginEntryRuntimeGuard } from "./entryRuntimeGuard";

const now = "2026-05-15T00:00:00.000Z";

const resolvedSetup: PluginSetupState = {
  knowledgeBindings: { project_knowledge: true },
  skills: { "article-writer": true },
  tools: { document_parser: true },
  artifactTypes: {
    content_table: true,
    scene_table: true,
    content_batch: true,
    script_batch: true,
  },
  evals: { fact_grounding: true },
  services: { content_worker: true },
  workflows: { content_scenario_planning: true },
};

function buildPreview(setup?: PluginSetupState): InstalledAppPreview {
  return buildInstalledAppPreview({
    fixture: buildContentFactoryUiRuntimeTestManifest(),
    setup,
    profile: buildWorkflowRuntimeCapabilityProfile({
      realAdapterEnabled: true,
      uiRuntimeEnabled: true,
      workerRuntimeEnabled: true,
    }),
    loadedAt: now,
    checkedAt: now,
    generatedAt: now,
  });
}

function buildRuntimeProfile(
  preview: InstalledAppPreview,
  installMode: "in_lime" | "standalone" = "in_lime",
) {
  return buildLimeRuntimeProfileFromHostProfile({
    appId: preview.identity.appId,
    installMode,
    hostProfile: buildWorkflowRuntimeCapabilityProfile({
      realAdapterEnabled: true,
      uiRuntimeEnabled: true,
      workerRuntimeEnabled: true,
    }),
  });
}

function buildFlags() {
  return buildWorkflowRuntimeCapabilityProfile({
    realAdapterEnabled: true,
    uiRuntimeEnabled: true,
    workerRuntimeEnabled: true,
  }).featureFlags;
}

function loadRuntime(preview: InstalledAppPreview, actualPackageHash?: string) {
  const cacheEntry = buildPluginPackageCacheEntry({
    identity: preview.identity,
    manifestSnapshot: preview.manifest,
    actualPackageHash: actualPackageHash ?? preview.identity.packageHash,
    actualManifestHash: preview.identity.manifestHash,
    cachedAt: now,
  });
  return loadRuntimePackageDescriptor({
    cacheEntry,
    identity: preview.identity,
    projection: preview.projection,
  });
}

describe("EntryRuntimeGuard P14", () => {
  it("setup、package、runtime policy 均满足时允许 UI entry 继续 mount", () => {
    const preview = buildPreview(resolvedSetup);
    const runtimePackageLoad = loadRuntime(preview);
    const result = evaluatePluginEntryRuntimeGuard({
      preview,
      entryKey: "dashboard",
      flags: buildFlags(),
      operation: "mount-ui",
      runtimePackageLoad,
      permissionDecision: "accepted",
      runtimeProfile: buildRuntimeProfile(preview),
    });

    expect(result.status).toBe("allow");
    expect(result.prompt).toMatchObject({
      appId: "content-factory-app",
      entryKey: "dashboard",
      decision: "accepted",
      policySummary: {
        rawWorkerAllowed: false,
        networkAllowed: false,
        fileSystemAllowed: false,
        rawHostApiAllowed: false,
        nodeApiAllowed: false,
      },
      runtimeProfile: {
        runtimeId: `content-factory-app:in_lime:${currentPluginHostRuntimeVersion}`,
        runtimeVersion: currentPluginHostRuntimeVersion,
        shellKind: "desktop",
        installMode: "in_lime",
      },
    });
    expect(result.prompt?.requestedCapabilities.map((item) => item.capability)).toEqual(
      expect.arrayContaining(["lime.ui", "lime.storage", "lime.agent"]),
    );
  });

  it("install mode 与 Runtime Profile 匹配时，guard 只读 profile 而不依赖 shell class", () => {
    const preview = buildPreview(resolvedSetup);
    const runtimePackageLoad = loadRuntime(preview);
    const runtimeProfile = buildRuntimeProfile(preview);
    const result = evaluatePluginEntryRuntimeGuard({
      preview,
      entryKey: "dashboard",
      flags: buildFlags(),
      operation: "mount-ui",
      runtimePackageLoad,
      permissionDecision: "accepted",
      installMode: "in_lime",
      runtimeProfile,
    });

    expect(result.status).toBe("allow");
    expect(result.prompt?.runtimeProfile).toMatchObject({
      runtimeId: runtimeProfile.runtimeId,
      runtimeVersion: runtimeProfile.runtimeVersion,
      shellKind: "desktop",
      installMode: "in_lime",
    });
  });

  it("standalone 启动缺少 Runtime Profile 时会被隔离阻断", () => {
    const preview = buildPreview(resolvedSetup);
    const runtimePackageLoad = loadRuntime(preview);
    const result = evaluatePluginEntryRuntimeGuard({
      preview,
      entryKey: "dashboard",
      flags: buildFlags(),
      operation: "mount-ui",
      runtimePackageLoad,
      permissionDecision: "accepted",
      installMode: "standalone",
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        code: "RUNTIME_PROFILE_MISSING",
        kind: "install-mode",
        key: "standalone",
      }),
    );
  });

  it("Runtime Profile 与选定 install mode 不一致时，不能绕过 guard", () => {
    const preview = buildPreview(resolvedSetup);
    const runtimePackageLoad = loadRuntime(preview);
    const result = evaluatePluginEntryRuntimeGuard({
      preview,
      entryKey: "dashboard",
      flags: buildFlags(),
      operation: "mount-ui",
      runtimePackageLoad,
      permissionDecision: "accepted",
      installMode: "standalone",
      runtimeProfile: buildRuntimeProfile(preview, "in_lime"),
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        code: "RUNTIME_PROFILE_MISSING",
        key: "standalone",
      }),
    );
    expect(result.prompt?.runtimeProfile).toMatchObject({
      installMode: "in_lime",
      shellKind: "desktop",
    });
  });

  it("UI page entry 可在非本入口的 app-level blocker 下打开并展示降级警告", () => {
    const preview = buildPreview(resolvedSetup);
    preview.readiness = {
      ...preview.readiness,
      status: "blocked",
      blockers: [
        {
          code: "CAPABILITY_MISSING",
          severity: "blocker",
          message: "lime.secrets is declared but not enabled in this host.",
          capability: "lime.secrets",
        },
      ],
    };
    const runtimePackageLoad = loadRuntime(preview);
    const result = evaluatePluginEntryRuntimeGuard({
      preview,
      entryKey: "dashboard",
      flags: buildFlags(),
      operation: "mount-ui",
      runtimePackageLoad,
      permissionDecision: "accepted",
    });

    expect(result.status).toBe("allow");
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "CAPABILITY_MISSING",
        capability: "lime.secrets",
        severity: "warning",
      }),
    );
  });

  it("required setup 未解决时输出 needs-setup 且不允许继续运行", () => {
    const preview = buildPreview();
    const runtimePackageLoad = loadRuntime(preview);
    const result = evaluatePluginEntryRuntimeGuard({
      preview,
      entryKey: "content_scenario_planning",
      flags: buildFlags(),
      operation: "run-entry",
      runtimePackageLoad,
    });

    expect(result.status).toBe("needs-setup");
    expect(result.blockers).toEqual([]);
    expect(result.prompt?.setupSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "knowledge", key: "project_knowledge", required: true }),
        expect.objectContaining({ kind: "skill", key: "article-writer", required: true }),
        expect.objectContaining({ kind: "tool", key: "document_parser", required: true }),
      ]),
    );
  });

  it("hash mismatch 的 package 优先 blocked，不能靠权限确认绕过", () => {
    const preview = buildPreview(resolvedSetup);
    const runtimePackageLoad = loadRuntime(preview, "package-fnv1a-badbad00");
    const result = evaluatePluginEntryRuntimeGuard({
      preview,
      entryKey: "dashboard",
      flags: buildFlags(),
      operation: "mount-ui",
      runtimePackageLoad,
      permissionDecision: "accepted",
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["PACKAGE_HASH_MISMATCH", "PACKAGE_NOT_VERIFIED"]),
    );
  });

  it("lifecycle disabled 会在 guard 内部阻断，不能只依赖页面按钮状态", () => {
    const preview = buildPreview(resolvedSetup);
    const runtimePackageLoad = loadRuntime(preview);
    const result = evaluatePluginEntryRuntimeGuard({
      preview,
      entryKey: "dashboard",
      flags: buildFlags(),
      operation: "mount-ui",
      runtimePackageLoad,
      permissionDecision: "accepted",
      lifecycle: {
        disabled: true,
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "PLUGIN_DISABLED" }),
    );
  });

  it("cleanup-blocked lifecycle 状态会阻断 runtime guard", () => {
    const preview = buildPreview(resolvedSetup);
    const runtimePackageLoad = loadRuntime(preview);
    const result = evaluatePluginEntryRuntimeGuard({
      preview,
      entryKey: "dashboard",
      flags: buildFlags(),
      operation: "mount-ui",
      runtimePackageLoad,
      permissionDecision: "accepted",
      lifecycle: {
        cleanupStatus: "blocked",
        cleanupBlockerCodes: ["OUT_OF_SCOPE"],
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        code: "CLEANUP_BLOCKED",
        message: expect.stringContaining("OUT_OF_SCOPE"),
      }),
    );
  });

  it("用户拒绝必要授权时输出 denied", () => {
    const preview = buildPreview(resolvedSetup);
    const runtimePackageLoad = loadRuntime(preview);
    const result = evaluatePluginEntryRuntimeGuard({
      preview,
      entryKey: "dashboard",
      flags: buildFlags(),
      operation: "mount-ui",
      runtimePackageLoad,
      permissionDecision: "denied",
    });

    expect(result.status).toBe("denied");
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "PERMISSION_DENIED", entryKey: "dashboard" }),
    );
    expect(result.prompt?.decision).toBe("denied");
  });

  it("非 UI entry 不能通过 mount-ui guard", () => {
    const preview = buildPreview(resolvedSetup);
    const runtimePackageLoad = loadRuntime(preview);
    const result = evaluatePluginEntryRuntimeGuard({
      preview,
      entryKey: "content_scenario_planning",
      flags: buildFlags(),
      operation: "mount-ui",
      runtimePackageLoad,
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "UI_ENTRY_UNSUPPORTED" }),
    );
  });
});
