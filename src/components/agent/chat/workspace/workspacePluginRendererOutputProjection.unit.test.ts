import { describe, expect, it } from "vitest";
import { normalizePluginManifest } from "@/features/plugin";
import type { WorkspaceRightSurfacePendingRequest } from "@/lib/api/workspaceRightSurface";
import { buildWorkspaceProductProfileFromPendingRequests } from "./workspaceProductProfileModel";
import { enrichWorkspaceProductProfileRendererOutput } from "./workspacePluginRendererOutputProjection";

const pendingRequest: WorkspaceRightSurfacePendingRequest = {
  requestId: "right_surface_creator_profile_1",
  workspaceId: "workspace-main",
  workspaceRoot: "/workspace/project",
  sessionId: "session-main",
  surfaceKind: "productProfile",
  origin: "runtime",
  priority: "foreground",
  status: "pending",
  reason: "plugin_renderer_output_ready",
  requestedAt: "2026-06-26T00:00:00.000Z",
  metadata: {
    artifact: {
      artifactId: "artifact-workspace-patch-1",
      kind: "creator.workspace_patch",
      title: "创作工作台输出",
    },
    workspacePatch: {
      schemaVersion: "product-workspace.v1",
      appId: "creator-workbench",
      sessionId: "session-main",
      workspaceId: "workspace-main",
      objects: [
        {
          ref: {
            appId: "creator-workbench",
            kind: "articleDraft",
            id: "article-1",
            sessionId: "session-main",
            artifactIds: ["artifact-article-1"],
          },
          title: "文章草稿",
          status: "ready",
          source: {
            taskKind: "creator.article.generate",
          },
        },
      ],
      selectedObjectRef: {
        appId: "creator-workbench",
        kind: "articleDraft",
        id: "article-1",
        sessionId: "session-main",
      },
      layoutState: {
        activePaneKind: "editor",
      },
    },
  },
};

describe("workspacePluginRendererOutputProjection", () => {
  it("应按 pending artifact kind 匹配插件 renderer 输出合同并写入 profile metadata", () => {
    const plugin = normalizePluginManifest({
      id: "creator-workbench",
      displayName: "创作工作台",
      version: "1.0.0",
      artifactRenderers: [
        {
          artifactType: "articleDraft",
          surfaceKind: "documentCanvas",
          paneKind: "editor",
          rendererKind: "app_declared",
          outputArtifactKind: "creator.workspace_patch",
          actionKeys: ["regenerate"],
        },
      ],
    });
    const profile = buildWorkspaceProductProfileFromPendingRequests([
      pendingRequest,
    ]);

    const enriched = enrichWorkspaceProductProfileRendererOutput({
      contracts: [plugin],
      pendingRequests: [pendingRequest],
      profile,
    });

    expect(enriched?.objects[0]?.source).toMatchObject({
      rendererContract: {
        pluginId: "creator-workbench",
        artifactType: "articleDraft",
        surfaceKind: "documentCanvas",
        paneKind: "editor",
        rendererKind: "app_declared",
        outputArtifactKind: "creator.workspace_patch",
        actionKeys: ["regenerate"],
      },
      outputArtifactKind: "creator.workspace_patch",
      artifactType: "articleDraft",
      surfaceKind: "documentCanvas",
      paneKind: "editor",
      rendererKind: "app_declared",
      pluginId: "creator-workbench",
    });
    expect(enriched?.sourceArtifacts?.[0]).toMatchObject({
      requestId: "right_surface_creator_profile_1",
      rendererContract: {
        outputArtifactKind: "creator.workspace_patch",
      },
      outputArtifactKind: "creator.workspace_patch",
      artifactType: "articleDraft",
    });
  });

  it("没有匹配插件 contract 时应保持 profile 原样", () => {
    const profile = buildWorkspaceProductProfileFromPendingRequests([
      pendingRequest,
    ]);

    const enriched = enrichWorkspaceProductProfileRendererOutput({
      contracts: [],
      pendingRequests: [pendingRequest],
      profile,
    });

    expect(enriched).toEqual(profile);
  });
});
