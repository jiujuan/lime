import { describe, expect, it, vi } from "vitest";
import {
  buildWorkspaceProductProfileActionSystemPrompt,
  submitWorkspaceProductProfileActionIntent,
} from "./workspaceProductProfileActionDispatch";
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
    source: {
      outputArtifactKind: "content_factory.workspace_patch",
    },
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
        searchMode: "disabled",
        explicitToolPreferences: true,
        systemPromptOverride: expect.stringContaining(
          "right_surface_product_profile",
        ),
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
    const [, sendOptions] = submit.mock.calls[0] ?? [];
    expect(sendOptions?.systemPromptOverride).toContain(
      "content.image.generate",
    );
    expect(sendOptions?.systemPromptOverride).toContain(
      "content_factory.workspace_patch",
    );
    expect(sendOptions?.systemPromptOverride).toContain(
      "imageGenerationSet/image-set-1",
    );
    expect(sendOptions?.systemPromptOverride).toContain("artifact-image-1");
    expect(sendOptions?.systemPromptOverride).toContain("artifact.snapshot");
    expect(restoreInput).not.toHaveBeenCalled();
  });

  it("应从 Product Profile action intent 生成 runtime 指令", () => {
    const systemPrompt = buildWorkspaceProductProfileActionSystemPrompt(intent);

    expect(systemPrompt).toContain("Product Profile action");
    expect(systemPrompt).toContain("right_surface_product_profile");
    expect(systemPrompt).toContain("content-factory-app");
    expect(systemPrompt).toContain("workspace-main");
    expect(systemPrompt).toContain("imageGenerationSet/image-set-1");
    expect(systemPrompt).toContain("regenerate");
    expect(systemPrompt).toContain("content.image.generate");
    expect(systemPrompt).toContain("content_factory.workspace_patch");
    expect(systemPrompt).toContain("workspace patch");
    expect(systemPrompt).toContain("skill_search");
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

  it("空 prompt 不应发送 action", async () => {
    const submit = vi.fn(async () => true);
    const restoreInput = vi.fn();

    await expect(
      submitWorkspaceProductProfileActionIntent({
        intent: {
          ...intent,
          prompt: "   ",
        },
        restoreInput,
        submit,
      }),
    ).resolves.toBe(false);

    expect(submit).not.toHaveBeenCalled();
    expect(restoreInput).not.toHaveBeenCalled();
  });
});
