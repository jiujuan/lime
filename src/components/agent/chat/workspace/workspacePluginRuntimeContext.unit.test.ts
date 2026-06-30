import { describe, expect, it } from "vitest";

import type { InstalledAgentAppState } from "@/features/agent-app/types";
import {
  mergePluginActivationSendOptions,
  resolveWorkspacePluginActivation,
} from "./workspacePluginActivation";
import { buildWorkspacePluginRuntimeContext } from "./workspacePluginRuntimeContext";

function createInstalledPluginBackedApp(
  overrides: Partial<InstalledAgentAppState> = {},
): InstalledAgentAppState {
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
      appType: "agent-app",
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
    projection: {} as InstalledAgentAppState["projection"],
    installMode: "in_lime",
    runtimeProfileSummary:
      {} as InstalledAgentAppState["runtimeProfileSummary"],
    setup: {} as InstalledAgentAppState["setup"],
    installedAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
    ...overrides,
  } as InstalledAgentAppState;
}

function pluginActivationRequestMetadata(
  installedAgentApps: readonly InstalledAgentAppState[],
) {
  const resolution = resolveWorkspacePluginActivation({
    text: "@创作工作台 写一篇公众号文章",
    sessionId: "session-1",
    installedAgentApps,
  });

  return mergePluginActivationSendOptions({
    resolution: resolution!,
  })?.requestMetadata;
}

describe("workspacePluginRuntimeContext", () => {
  it("无 plugin_activation metadata 时应返回 inactive 但保留 installed registry", () => {
    const context = buildWorkspacePluginRuntimeContext({
      installedAgentApps: [createInstalledPluginBackedApp()],
    });

    expect(context).toMatchObject({
      status: "inactive",
      activationContext: null,
      skippedAppIds: [],
      blockerCodes: [],
    });
    expect(context.contracts).toHaveLength(1);
    expect(context.registry[0]).toMatchObject({
      pluginId: "creator-workbench",
      activationState: "activatable",
    });
  });

  it("应组合 request metadata 与 installed registry 成 active 插件运行上下文", () => {
    const installed = [createInstalledPluginBackedApp()];
    const context = buildWorkspacePluginRuntimeContext({
      installedAgentApps: installed,
      requestMetadata: pluginActivationRequestMetadata(installed),
    });

    expect(context).toMatchObject({
      status: "active",
      activationContext: {
        sessionId: "session-1",
        pluginId: "creator-workbench",
        activeEntryKey: "creator",
        selectedObjectRef: {
          pluginId: "creator-workbench",
          objectKind: "articleDraft",
          objectId: "pending",
        },
        openedTabs: ["articleWorkspace"],
      },
      skippedAppIds: [],
      blockerCodes: [],
    });
    expect(context.contracts[0]).toMatchObject({
      id: "creator-workbench",
    });
  });

  it("metadata 指向未安装插件时应 fail closed 为 blocked", () => {
    const context = buildWorkspacePluginRuntimeContext({
      installedAgentApps: [],
      requestMetadata: {
        harness: {
          plugin_activation: {
            source: "plugin_explicit_mention",
            trigger: "@Missing",
            session_id: "session-1",
            plugin_id: "missing-plugin",
            context_source: "user",
          },
        },
      },
    });

    expect(context).toMatchObject({
      status: "blocked",
      activationContext: {
        pluginId: "missing-plugin",
      },
      blockerCodes: ["PLUGIN_REGISTRY_ITEM_MISSING"],
    });
  });

  it("metadata 指向禁用插件时应保留上下文但阻断后续接线", () => {
    const installed = [createInstalledPluginBackedApp({ disabled: true })];
    const context = buildWorkspacePluginRuntimeContext({
      installedAgentApps: installed,
      requestMetadata: {
        harness: {
          plugin_activation: {
            source: "plugin_explicit_mention",
            trigger: "@创作工作台",
            session_id: "session-1",
            plugin_id: "creator-workbench",
            context_source: "user",
          },
        },
      },
    });

    expect(context).toMatchObject({
      status: "blocked",
      activationContext: {
        pluginId: "creator-workbench",
      },
      blockerCodes: expect.arrayContaining(["PLUGIN_DISABLED"]),
    });
  });
});
