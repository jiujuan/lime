import { describe, expect, it, vi } from "vitest";
import { submitWorkspaceProductProfileActionIntent } from "./workspaceProductProfileActionDispatch";
import type { WorkspaceProductProfileActionIntent } from "./workspaceProductProfileModel";

const intent: WorkspaceProductProfileActionIntent = {
  action: {
    key: "regenerate",
    intent: "regenerate",
    risk: "write",
    taskKind: "content.image.generate",
    labelKey: "workspace.productProfile.action.regenerate",
    promptKey: "workspace.productProfile.actionPrompt.regenerate",
  },
  object: {
    ref: {
      appId: "content-factory-app",
      kind: "imageGenerationSet",
      id: "image-set-1",
      sessionId: "session-main",
      artifactIds: ["artifact-image-1"],
    },
    title: "配图组",
    status: "needs_review",
    summary: "等待选择主图",
  },
  profile: {
    schemaVersion: "product-workspace.v1",
    appId: "content-factory-app",
    sessionId: "session-main",
    workspaceId: "workspace-main",
    source: "threadRead",
    objectCount: 1,
    actionHistory: [],
    objects: [],
  },
  prompt: "请重新生成「配图组」",
};

describe("workspaceProductProfileActionDispatch", () => {
  it("应通过 Claw turn submit 发送 Product Profile action metadata", async () => {
    const submit = vi.fn(async () => true);
    const restoreInput = vi.fn();

    await expect(
      submitWorkspaceProductProfileActionIntent({
        intent,
        restoreInput,
        submit,
      }),
    ).resolves.toBe(true);

    expect(submit).toHaveBeenCalledWith(
      "请重新生成「配图组」",
      expect.objectContaining({
        displayContent: "请重新生成「配图组」",
        skipSceneCommandRouting: true,
        requestMetadata: expect.objectContaining({
          agent_app: expect.objectContaining({
            source: "right_surface_product_profile",
            app_id: "content-factory-app",
            product_profile_action: expect.objectContaining({
              key: "regenerate",
              task_kind: "content.image.generate",
            }),
          }),
        }),
      }),
    );
    expect(restoreInput).not.toHaveBeenCalled();
  });

  it("发送失败时应把 prompt 恢复到 Claw 输入框", async () => {
    const submit = vi.fn(async () => false);
    const restoreInput = vi.fn();

    await expect(
      submitWorkspaceProductProfileActionIntent({
        intent,
        restoreInput,
        submit,
      }),
    ).resolves.toBe(false);

    expect(restoreInput).toHaveBeenCalledWith("请重新生成「配图组」");
  });
});
