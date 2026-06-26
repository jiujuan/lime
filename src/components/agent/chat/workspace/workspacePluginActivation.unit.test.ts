import { describe, expect, it } from "vitest";
import type { InstalledAgentAppState } from "@/features/agent-app/types";
import {
  extractWorkspacePluginActivationFromRequestMetadata,
  mergePluginActivationSendOptions,
  resolveWorkspacePluginActivation,
} from "./workspacePluginActivation";

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
      skillRefs: [
        {
          id: "article-draft",
          required: false,
        },
      ],
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
        productWorkspace: {
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
    ...overrides,
  } as InstalledAgentAppState;
}

describe("workspacePluginActivation", () => {
  it("应从已安装 Agent App manifest 投影插件显式 @ 激活", () => {
    const resolution = resolveWorkspacePluginActivation({
      text: "@创作工作台 写一篇公众号文章",
      sessionId: "session-1",
      installedAgentApps: [createInstalledPluginBackedApp()],
    });

    expect(resolution).toMatchObject({
      status: "matched",
      trigger: "@创作工作台",
      body: "写一篇公众号文章",
      context: {
        sessionId: "session-1",
        pluginId: "creator-workbench",
        activeEntryKey: "creator",
        selectedObjectRef: {
          pluginId: "creator-workbench",
          objectKind: "articleDraft",
          objectId: "pending",
        },
      },
    });
  });

  it("禁用插件被显式 @ 时应 fail closed 返回 blocked", () => {
    const resolution = resolveWorkspacePluginActivation({
      text: "@创作工作台 写一篇公众号文章",
      sessionId: "session-1",
      installedAgentApps: [
        createInstalledPluginBackedApp({
          disabled: true,
        }),
      ],
    });

    expect(resolution).toMatchObject({
      status: "blocked",
      trigger: "@创作工作台",
      blockerCodes: expect.arrayContaining(["PLUGIN_DISABLED"]),
    });
  });

  it("应合并 plugin_activation harness metadata 并保留已有字段", () => {
    const resolution = resolveWorkspacePluginActivation({
      text: "@创作工作台 写一篇公众号文章",
      sessionId: "session-1",
      installedAgentApps: [createInstalledPluginBackedApp()],
    });

    const sendOptions = mergePluginActivationSendOptions({
      sendOptions: {
        requestMetadata: {
          harness: {
            theme: "general",
          },
        },
      },
      resolution: resolution!,
    });

    expect(sendOptions?.requestMetadata).toMatchObject({
      harness: {
        theme: "general",
        plugin_activation: {
          source: "plugin_explicit_mention",
          trigger: "@创作工作台",
          body: "写一篇公众号文章",
          session_id: "session-1",
          plugin_id: "creator-workbench",
          active_entry_key: "creator",
          selected_object_ref: {
            plugin_id: "creator-workbench",
            object_kind: "articleDraft",
            object_id: "pending",
          },
          opened_tabs: ["productProfile"],
          context_source: "user",
        },
      },
    });
  });

  it("应从 plugin_activation request metadata 反投影回插件激活上下文", () => {
    const resolution = resolveWorkspacePluginActivation({
      text: "@创作工作台:article-draft 写一篇公众号文章",
      sessionId: "session-1",
      installedAgentApps: [createInstalledPluginBackedApp()],
    });

    const sendOptions = mergePluginActivationSendOptions({
      sendOptions: {
        requestMetadata: {
          harness: {
            theme: "general",
          },
        },
      },
      resolution: resolution!,
    });

    expect(
      extractWorkspacePluginActivationFromRequestMetadata(
        sendOptions?.requestMetadata,
      ),
    ).toMatchObject({
      source: "plugin_explicit_mention",
      trigger: "@创作工作台:article-draft",
      body: "写一篇公众号文章",
      context: {
        sessionId: "session-1",
        pluginId: "creator-workbench",
        activeEntryKey: "creator",
        selectedSkillKeys: ["article-draft"],
        selectedObjectRef: {
          pluginId: "creator-workbench",
          objectKind: "articleDraft",
          objectId: "pending",
        },
        openedTabs: ["productProfile"],
        source: "user",
      },
    });
  });

  it("应兼容 camelCase pluginActivation metadata", () => {
    expect(
      extractWorkspacePluginActivationFromRequestMetadata({
        harness: {
          pluginActivation: {
            source: "plugin_explicit_mention",
            trigger: "@Creator",
            body: "continue",
            sessionId: "session-2",
            pluginId: "creator-workbench",
            activeEntryKey: "creator",
            selectedSkillKeys: ["article-draft", "article-draft"],
            selectedObjectRef: {
              pluginId: "creator-workbench",
              objectKind: "articleDraft",
              objectId: "draft-1",
              artifactIds: ["artifact-1"],
              sourceTurnId: "turn-1",
            },
            openedTabs: ["productProfile", "productProfile"],
            pinnedTabs: ["productProfile"],
            contextSource: "history",
          },
        },
      }),
    ).toMatchObject({
      source: "plugin_explicit_mention",
      trigger: "@Creator",
      body: "continue",
      context: {
        sessionId: "session-2",
        pluginId: "creator-workbench",
        activeEntryKey: "creator",
        selectedSkillKeys: ["article-draft"],
        selectedObjectRef: {
          pluginId: "creator-workbench",
          objectKind: "articleDraft",
          objectId: "draft-1",
          artifactIds: ["artifact-1"],
          sourceTurnId: "turn-1",
        },
        openedTabs: ["productProfile"],
        pinnedTabs: ["productProfile"],
        source: "history",
      },
    });
  });

  it("plugin_activation 字段不完整时不构造激活上下文", () => {
    expect(
      extractWorkspacePluginActivationFromRequestMetadata({
        harness: {
          plugin_activation: {
            trigger: "@创作工作台",
          },
        },
      }),
    ).toBeNull();
  });
});
