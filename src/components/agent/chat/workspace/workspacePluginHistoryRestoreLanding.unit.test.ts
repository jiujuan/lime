import { describe, expect, it } from "vitest";
import type { PluginHistoryRestoreProjection } from "@/features/plugin";
import { buildWorkspacePluginHistoryRestoreLandingModel } from "./workspacePluginHistoryRestoreLanding";

function projection(
  overrides: Partial<PluginHistoryRestoreProjection> = {},
): PluginHistoryRestoreProjection {
  return {
    status: "restored",
    sessionId: "session-1",
    pluginId: "creator-workbench",
    activeAgentAppId: "creator-workbench",
    activeEntryKey: "creator",
    selectedSkillKeys: ["article-draft"],
    primaryObjectRef: {
      pluginId: "creator-workbench",
      objectKind: "articleDraft",
      objectId: "draft-1",
    },
    selectedObjectRef: {
      pluginId: "creator-workbench",
      objectKind: "articleDraft",
      objectId: "draft-1",
    },
    artifactRefs: ["artifact-1"],
    openedTabs: ["productProfile", "appSurface"],
    pinnedTabs: ["productProfile"],
    actionMode: "interactive",
    fallbackTarget: "none",
    blockerCodes: [],
    ...overrides,
  };
}

describe("workspacePluginHistoryRestoreLanding", () => {
  it("没有恢复投影时不显示落页", () => {
    expect(
      buildWorkspacePluginHistoryRestoreLandingModel({ projection: null }),
    ).toBeNull();
  });

  it("可交互恢复应提示继续处理当前对象", () => {
    expect(
      buildWorkspacePluginHistoryRestoreLandingModel({
        projection: projection(),
        contracts: [
          {
            id: "creator-workbench",
            displayName: "创作工作台",
          } as any,
        ],
      }),
    ).toMatchObject({
      mode: "interactive",
      tone: "success",
      titleKey: "pluginHistory.title.restored",
      statusKey: "pluginHistory.status.interactive",
      pluginLabel: "创作工作台",
      objectLabel: "articleDraft / draft-1",
      artifactCount: 1,
      openedTabCount: 2,
    });
  });

  it("只读恢复应保留阻塞原因并降级提示", () => {
    expect(
      buildWorkspacePluginHistoryRestoreLandingModel({
        projection: projection({
          actionMode: "read_only",
          blockerCodes: ["PLUGIN_HISTORY_READ_ONLY"],
        }),
      }),
    ).toMatchObject({
      mode: "read_only",
      tone: "warning",
      statusKey: "pluginHistory.status.readOnly",
      blockerCodes: ["PLUGIN_HISTORY_READ_ONLY"],
    });
  });

  it("产物预览回退应显示预览模式", () => {
    expect(
      buildWorkspacePluginHistoryRestoreLandingModel({
        projection: projection({
          status: "artifact_preview",
          actionMode: "chat_only",
          fallbackTarget: "artifactPreview",
          openedTabs: [],
          selectedObjectRef: undefined,
          primaryObjectRef: undefined,
          blockerCodes: ["PLUGIN_CONTRACT_MISSING"],
        }),
      }),
    ).toMatchObject({
      mode: "artifact_preview",
      tone: "info",
      titleKey: "pluginHistory.title.artifactPreview",
      statusKey: "pluginHistory.status.artifactPreview",
      objectLabel: undefined,
      artifactCount: 1,
      openedTabCount: 0,
    });
  });

  it("纯对话回退应显示对话模式", () => {
    expect(
      buildWorkspacePluginHistoryRestoreLandingModel({
        projection: projection({
          status: "chat_only",
          actionMode: "chat_only",
          fallbackTarget: "chatOnly",
          artifactRefs: [],
          openedTabs: [],
          blockerCodes: ["PLUGIN_HISTORY_WORKSPACE_MISSING"],
        }),
      }),
    ).toMatchObject({
      mode: "chat_only",
      tone: "warning",
      titleKey: "pluginHistory.title.chatOnly",
      statusKey: "pluginHistory.status.chatOnly",
      artifactCount: 0,
      openedTabCount: 0,
    });
  });
});
