import { describe, expect, it } from "vitest";
import type { PluginHistoryRestoreProjection } from "@/features/plugin";
import { appServerArtifactReadParamsFromArtifactPreview } from "@/lib/api/agentRuntime/appServerArtifactClient";
import {
  buildWorkspacePluginHistoryRestoreArtifactPreviewArtifact,
  buildWorkspacePluginHistoryRestoreArtifactPreviewItems,
} from "./workspacePluginHistoryRestoreArtifacts";

function projection(
  overrides: Partial<PluginHistoryRestoreProjection> = {},
): PluginHistoryRestoreProjection {
  return {
    status: "restored",
    sessionId: "session-1",
    pluginId: "creator-workbench",
    activePluginUiId: "creator-workbench",
    activeEntryKey: "creator",
    selectedSkillKeys: ["article-draft"],
    artifactRefs: ["artifact-1", "artifact-1", "reports/final.md"],
    openedTabs: [],
    pinnedTabs: [],
    actionMode: "interactive",
    fallbackTarget: "none",
    blockerCodes: [],
    ...overrides,
  };
}

describe("workspacePluginHistoryRestoreArtifacts", () => {
  it("应从历史恢复投影生成去重后的交付内容预览项", () => {
    expect(
      buildWorkspacePluginHistoryRestoreArtifactPreviewItems({
        projection: projection(),
      }),
    ).toEqual([
      {
        key: "session-1:artifact-1",
        artifactRef: "artifact-1",
        index: 0,
        displayIndex: 1,
      },
      {
        key: "session-1:reports/final.md",
        artifactRef: "reports/final.md",
        index: 1,
        displayIndex: 2,
      },
    ]);
  });

  it("应限制预览项数量", () => {
    expect(
      buildWorkspacePluginHistoryRestoreArtifactPreviewItems({
        projection: projection(),
        maxItems: 1,
      }),
    ).toHaveLength(1);
  });

  it("应构造可走 artifact/read 的 source-backed 预览 artifact", () => {
    const item = buildWorkspacePluginHistoryRestoreArtifactPreviewItems({
      projection: projection(),
    })[0];
    const artifact = buildWorkspacePluginHistoryRestoreArtifactPreviewArtifact({
      projection: projection(),
      item,
      title: "交付内容 1",
      now: 1_780_000_000_000,
    });

    expect(artifact).toMatchObject({
      title: "交付内容 1",
      content: "",
      status: "complete",
      meta: {
        previewArtifact: true,
        isSourceBacked: true,
        source: "artifact",
        sessionId: "session-1",
        appServerSessionId: "session-1",
        appServerArtifactSessionId: "session-1",
        artifactRef: "artifact-1",
        appServerArtifactRef: "artifact-1",
        artifactId: "artifact-1",
        pluginHistoryRestore: {
          sessionId: "session-1",
          pluginId: "creator-workbench",
          artifactRef: "artifact-1",
        },
      },
      createdAt: 1_780_000_000_000,
    });
    expect(
      appServerArtifactReadParamsFromArtifactPreview(
        artifact!,
        String(artifact?.meta.filePath ?? ""),
      ),
    ).toEqual({
      sessionId: "session-1",
      artifactRef: "artifact-1",
      includeContent: true,
      limit: 1,
    });
  });

  it("缺少 session 或交付引用时不构造预览 artifact", () => {
    const item = {
      key: "empty",
      artifactRef: " ",
      index: 0,
      displayIndex: 1,
    };

    expect(
      buildWorkspacePluginHistoryRestoreArtifactPreviewArtifact({
        projection: projection({ sessionId: "" }),
        item,
        title: "交付内容",
      }),
    ).toBeNull();
  });
});
