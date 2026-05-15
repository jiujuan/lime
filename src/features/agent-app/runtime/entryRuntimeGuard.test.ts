import { describe, expect, it } from "vitest";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import { buildAgentAppPackageCacheEntry } from "../install/packageCache";
import type { AgentAppSetupState, InstalledAppPreview } from "../types";
import { buildUiRuntimeCapabilityProfile } from "./uiRuntimeCapabilityProfile";
import { loadRuntimePackageDescriptor } from "./runtimePackageLoader";
import { evaluateAgentAppEntryRuntimeGuard } from "./entryRuntimeGuard";

const now = "2026-05-15T00:00:00.000Z";

const resolvedSetup: AgentAppSetupState = {
  knowledgeBindings: { project_knowledge: true },
  skills: { "article-writer": true },
  tools: { document_parser: true },
  artifactTypes: { content_table: true },
  evals: { fact_grounding: true },
  services: { content_worker: true },
  workflows: { content_scenario_planning: true },
};

function buildPreview(setup?: AgentAppSetupState): InstalledAppPreview {
  return buildInstalledAppPreview({
    setup,
    profile: buildUiRuntimeCapabilityProfile({
      realAdapterEnabled: true,
      uiRuntimeEnabled: true,
    }),
    loadedAt: now,
    checkedAt: now,
    generatedAt: now,
  });
}

function loadRuntime(preview: InstalledAppPreview, actualPackageHash?: string) {
  const cacheEntry = buildAgentAppPackageCacheEntry({
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
    const result = evaluateAgentAppEntryRuntimeGuard({
      preview,
      entryKey: "dashboard",
      flags: buildUiRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
      }).featureFlags,
      operation: "mount-ui",
      runtimePackageLoad,
      permissionDecision: "accepted",
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
        rawTauriAllowed: false,
        nodeApiAllowed: false,
      },
    });
    expect(result.prompt?.requestedCapabilities.map((item) => item.capability)).toEqual(
      expect.arrayContaining(["lime.ui", "lime.storage", "lime.agent"]),
    );
  });

  it("required setup 未解决时输出 needs-setup 且不允许继续运行", () => {
    const preview = buildPreview();
    const runtimePackageLoad = loadRuntime(preview);
    const result = evaluateAgentAppEntryRuntimeGuard({
      preview,
      entryKey: "content_scenario_planning",
      flags: buildUiRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
      }).featureFlags,
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
    const result = evaluateAgentAppEntryRuntimeGuard({
      preview,
      entryKey: "dashboard",
      flags: buildUiRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
      }).featureFlags,
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
    const result = evaluateAgentAppEntryRuntimeGuard({
      preview,
      entryKey: "dashboard",
      flags: buildUiRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
      }).featureFlags,
      operation: "mount-ui",
      runtimePackageLoad,
      permissionDecision: "accepted",
      lifecycle: {
        disabled: true,
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "AGENT_APP_DISABLED" }),
    );
  });

  it("cleanup-blocked lifecycle 状态会阻断 runtime guard", () => {
    const preview = buildPreview(resolvedSetup);
    const runtimePackageLoad = loadRuntime(preview);
    const result = evaluateAgentAppEntryRuntimeGuard({
      preview,
      entryKey: "dashboard",
      flags: buildUiRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
      }).featureFlags,
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
    const result = evaluateAgentAppEntryRuntimeGuard({
      preview,
      entryKey: "dashboard",
      flags: buildUiRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
      }).featureFlags,
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
    const result = evaluateAgentAppEntryRuntimeGuard({
      preview,
      entryKey: "content_scenario_planning",
      flags: buildUiRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
      }).featureFlags,
      operation: "mount-ui",
      runtimePackageLoad,
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "UI_ENTRY_UNSUPPORTED" }),
    );
  });
});
