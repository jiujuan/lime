import { describe, expect, it } from "vitest";
import { buildWorkspaceProductProfileSelectionUpdateRequest } from "./workspaceProductProfileSelectionWriteback";
import type { WorkspaceProductProfile } from "./workspaceProductProfileModel";

const profile: WorkspaceProductProfile = {
  schemaVersion: "product-workspace.v1",
  appId: "content-factory-app",
  sessionId: " session-main ",
  workspaceId: "workspace-main",
  source: "threadRead",
  objectCount: 1,
  actionHistory: [],
  objects: [
    {
      ref: {
        appId: "content-factory-app",
        kind: "imageGenerationSet",
        id: "image-set-1",
        sessionId: "session-main",
        version: "v2",
        artifactIds: ["artifact-image-1"],
        sourceTurnId: "turn-1",
      },
      title: "配图组",
      status: "needs_review",
    },
  ],
};

describe("workspaceProductProfileSelectionWriteback", () => {
  it("应把右侧选中对象投影为 agentSession/update request", () => {
    const object = profile.objects[0];
    if (!object) {
      throw new Error("missing product object fixture");
    }
    const request = buildWorkspaceProductProfileSelectionUpdateRequest({
      profile,
      object,
    });

    expect(request).toEqual({
      session_id: "session-main",
      product_workspace_selected_object_ref: {
        appId: "content-factory-app",
        kind: "imageGenerationSet",
        id: "image-set-1",
        sessionId: "session-main",
        version: "v2",
        artifactIds: ["artifact-image-1"],
        sourceTurnId: "turn-1",
      },
    });
  });

  it("缺少 sessionId 时不产生写回 request", () => {
    const object = profile.objects[0];
    if (!object) {
      throw new Error("missing product object fixture");
    }
    const request = buildWorkspaceProductProfileSelectionUpdateRequest({
      profile: {
        ...profile,
        sessionId: " ",
      },
      object,
    });

    expect(request).toBeNull();
  });
});
