import { describe, expect, it } from "vitest";

import { normalizePluginManifest } from "../manifest/pluginContract";
import { projectPluginRegistryItem } from "../manifest/pluginRegistry";
import { buildPluginHistoryRestoreProjection } from "./pluginHistoryRestore";

function buildContentPlugin() {
  return normalizePluginManifest({
    id: "content-factory",
    displayName: "内容工厂",
    version: "1.0.0",
    artifactRenderers: [
      {
        artifactType: "articleDraft",
        surfaceKind: "documentCanvas",
        rendererKind: "host_builtin",
      },
    ],
  });
}

describe("Plugin history restore projection", () => {
  it("应从历史 workspace 恢复插件上下文、选中对象和布局", () => {
    const contract = buildContentPlugin();
    const registryItem = projectPluginRegistryItem({
      contract,
      installed: true,
      enabled: true,
      readinessStatus: "ready",
      hasHistoryWorkspace: true,
    });

    const projection = buildPluginHistoryRestoreProjection({
      contracts: [contract],
      registryItems: [registryItem],
      snapshot: {
        sessionId: "session-1",
        pluginId: "content-factory",
        activeEntryKey: "content-factory",
        selectedSkillKeys: ["article-writer"],
        pluginWorkspace: {
          pluginId: "content-factory",
          objects: [
            {
              ref: {
                pluginId: "content-factory",
                objectKind: "articleDraft",
                objectId: "draft-1",
                artifactIds: ["artifact-1"],
              },
              title: "公众号草稿",
            },
          ],
          primaryObjectRef: {
            pluginId: "content-factory",
            objectKind: "articleDraft",
            objectId: "draft-1",
          },
          selectedObjectRef: {
            pluginId: "content-factory",
            objectKind: "articleDraft",
            objectId: "draft-1",
          },
          openedTabs: ["articleWorkspace", "unsupported"],
          pinnedTabs: ["articleWorkspace", "unsupported"],
        },
        layoutState: {
          activeSurfaceKind: "articleWorkspace",
          openSurfaceKinds: ["articleWorkspace", "browser", "unsupported"],
          activeTabId: "draft-tab",
        },
        artifactRefs: ["artifact-1"],
      },
    });

    expect(projection).toMatchObject({
      status: "restored",
      sessionId: "session-1",
      pluginId: "content-factory",
      activeEntryKey: "content-factory",
      selectedSkillKeys: ["article-writer"],
      selectedObjectRef: {
        pluginId: "content-factory",
        objectKind: "articleDraft",
        objectId: "draft-1",
      },
      openedTabs: ["articleWorkspace", "browser"],
      pinnedTabs: ["articleWorkspace"],
      activeSurfaceKind: "articleWorkspace",
      activeTabId: "draft-tab",
      actionMode: "interactive",
      fallbackTarget: "none",
      blockerCodes: [],
      activationContext: {
        sessionId: "session-1",
        pluginId: "content-factory",
        activeEntryKey: "content-factory",
        selectedSkillKeys: ["article-writer"],
        openedTabs: ["articleWorkspace", "browser"],
        pinnedTabs: ["articleWorkspace"],
        source: "history",
      },
    });
  });

  it("插件已禁用时应恢复只读历史，不自动恢复交互 action", () => {
    const contract = buildContentPlugin();
    const registryItem = projectPluginRegistryItem({
      contract,
      installed: true,
      enabled: false,
      readinessStatus: "ready",
      hasHistoryWorkspace: true,
    });

    const projection = buildPluginHistoryRestoreProjection({
      contracts: [contract],
      registryItems: [registryItem],
      snapshot: {
        sessionId: "session-2",
        pluginWorkspace: {
          pluginId: "content-factory",
          objects: [
            {
              ref: {
                pluginId: "content-factory",
                objectKind: "articleDraft",
                objectId: "draft-2",
              },
            },
          ],
        },
      },
    });

    expect(projection.status).toBe("restored");
    expect(projection.actionMode).toBe("read_only");
    expect(projection.blockerCodes).toEqual(
      expect.arrayContaining(["PLUGIN_HISTORY_READ_ONLY", "PLUGIN_DISABLED"]),
    );
    expect(projection.activationContext).toMatchObject({
      source: "history",
      selectedObjectRef: {
        pluginId: "content-factory",
        objectKind: "articleDraft",
        objectId: "draft-2",
      },
    });
  });

  it("缺少 workspace 时应按 contract 降级为 artifact preview", () => {
    const contract = buildContentPlugin();

    const projection = buildPluginHistoryRestoreProjection({
      contracts: [contract],
      snapshot: {
        sessionId: "session-3",
        pluginId: "content-factory",
        artifactRefs: ["artifact-3"],
      },
    });

    expect(projection).toMatchObject({
      status: "artifact_preview",
      sessionId: "session-3",
      pluginId: "content-factory",
      artifactRefs: ["artifact-3"],
      actionMode: "chat_only",
      fallbackTarget: "artifactPreview",
      blockerCodes: ["PLUGIN_HISTORY_WORKSPACE_MISSING"],
    });
    expect(projection.activationContext).toBeUndefined();
  });

  it("同时没有 plugin workspace 和 artifact 时才回退纯聊天", () => {
    const contract = buildContentPlugin();

    const projection = buildPluginHistoryRestoreProjection({
      contracts: [contract],
      snapshot: {
        sessionId: "session-3a",
        pluginId: "content-factory",
      },
    });

    expect(projection).toMatchObject({
      status: "chat_only",
      artifactRefs: [],
      fallbackTarget: "chatOnly",
      blockerCodes: ["PLUGIN_HISTORY_WORKSPACE_MISSING"],
    });
  });

  it("缺少顶层 artifactRefs 时应从 workspace object 收集产物引用，避免误回退纯聊天", () => {
    const contract = buildContentPlugin();

    const projection = buildPluginHistoryRestoreProjection({
      contracts: [contract],
      snapshot: {
        sessionId: "session-3b",
        pluginId: "content-factory",
        pluginWorkspace: {
          pluginId: "content-factory",
          objects: [
            {
              ref: {
                pluginId: "content-factory",
                objectKind: "articleDraft",
                objectId: "draft-3b",
                artifactIds: ["artifact-from-ref"],
              },
              artifactIds: ["artifact-from-object"],
            },
          ],
        },
      },
    });

    expect(projection).toMatchObject({
      status: "restored",
      artifactRefs: ["artifact-from-object", "artifact-from-ref"],
      fallbackTarget: "none",
    });
  });

  it("没有 workspace 对象但顶层对象引用携带产物时仍应恢复对象，而不是纯聊天", () => {
    const contract = buildContentPlugin();

    const projection = buildPluginHistoryRestoreProjection({
      contracts: [contract],
      snapshot: {
        sessionId: "session-3c",
        pluginId: "content-factory",
        selectedObjectRef: {
          pluginId: "content-factory",
          objectKind: "articleDraft",
          objectId: "draft-3c",
          artifactIds: ["artifact-from-selected-ref"],
        },
      },
    });

    expect(projection).toMatchObject({
      status: "restored",
      artifactRefs: ["artifact-from-selected-ref"],
      selectedObjectRef: {
        pluginId: "content-factory",
        objectKind: "articleDraft",
        objectId: "draft-3c",
      },
      fallbackTarget: "none",
    });
  });

  it("缺少插件标识时不猜测插件，只回退到历史 artifact 或聊天", () => {
    const projection = buildPluginHistoryRestoreProjection({
      contracts: [buildContentPlugin()],
      snapshot: {
        sessionId: "session-4",
        artifactRefs: ["artifact-4"],
      },
    });

    expect(projection).toMatchObject({
      status: "artifact_preview",
      pluginId: undefined,
      fallbackTarget: "artifactPreview",
      blockerCodes: ["PLUGIN_HISTORY_PLUGIN_MISSING"],
    });
  });
});
