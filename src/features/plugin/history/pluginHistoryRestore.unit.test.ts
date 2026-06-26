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
          openedTabs: ["productProfile", "unsupported"],
          pinnedTabs: ["productProfile", "unsupported"],
        },
        layoutState: {
          activeSurfaceKind: "productProfile",
          openSurfaceKinds: ["productProfile", "browser", "unsupported"],
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
      openedTabs: ["productProfile", "browser"],
      pinnedTabs: ["productProfile"],
      activeSurfaceKind: "productProfile",
      activeTabId: "draft-tab",
      actionMode: "interactive",
      fallbackTarget: "none",
      blockerCodes: [],
      activationContext: {
        sessionId: "session-1",
        pluginId: "content-factory",
        activeEntryKey: "content-factory",
        selectedSkillKeys: ["article-writer"],
        openedTabs: ["productProfile", "browser"],
        pinnedTabs: ["productProfile"],
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
