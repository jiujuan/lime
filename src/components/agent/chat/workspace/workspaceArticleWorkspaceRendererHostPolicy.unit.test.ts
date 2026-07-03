import { describe, expect, it } from "vitest";
import { buildWorkspaceArticleWorkspaceRendererHostPolicy } from "./workspaceArticleWorkspaceRendererHostPolicy";

describe("workspaceArticleWorkspaceRendererHostPolicy", () => {
  it("应把 app-declared runtime authorization 投影成宿主占位策略", () => {
    expect(
      buildWorkspaceArticleWorkspaceRendererHostPolicy({
        status: "placeholder_only",
        executionMode: "host_placeholder",
        reasonCode: "app_declared_renderer_placeholder_only",
        requestedOutputArtifactKind: "creator.workspace_patch",
        allowedOutputArtifactKinds: ["content_factory.workspace_patch"],
      }),
    ).toEqual({
      status: "placeholder",
      executionMode: "host_placeholder",
      rendererExecutionModel: "host_placeholder_only",
      entryLoadPolicy: "not_loaded",
      canLoadEntry: false,
      reasonCode: "app_declared_renderer_placeholder_only",
      requestedOutputArtifactKind: "creator.workspace_patch",
      allowedOutputArtifactKinds: ["content_factory.workspace_patch"],
    });
  });

  it("应兼容 snake_case metadata 并把 denied 标为 blocked", () => {
    expect(
      buildWorkspaceArticleWorkspaceRendererHostPolicy({
        status: "denied",
        execution_mode: "none",
        reason_code: "remote_plugin_runtime_disabled",
        requested_output_artifact_kind: "other.workspace_patch",
        allowed_output_artifact_kinds: ["content_factory.workspace_patch"],
      }),
    ).toMatchObject({
      status: "blocked",
      executionMode: "none",
      rendererExecutionModel: "host_placeholder_only",
      entryLoadPolicy: "not_loaded",
      canLoadEntry: false,
      reasonCode: "remote_plugin_runtime_disabled",
      requestedOutputArtifactKind: "other.workspace_patch",
    });
  });

  it("即使 action runtime 被允许，renderer entry 仍只停在宿主占位", () => {
    expect(
      buildWorkspaceArticleWorkspaceRendererHostPolicy({
        status: "allowed",
        executionMode: "local_plugin_worker",
        reasonCode: "local_worker_output_allowed",
        requestedOutputArtifactKind: "content_factory.workspace_patch",
        allowedOutputArtifactKinds: ["content_factory.workspace_patch"],
      }),
    ).toMatchObject({
      status: "placeholder",
      executionMode: "local_plugin_worker",
      rendererExecutionModel: "host_placeholder_only",
      entryLoadPolicy: "not_loaded",
      canLoadEntry: false,
    });
  });

  it("缺少授权字段时默认停在宿主占位", () => {
    expect(buildWorkspaceArticleWorkspaceRendererHostPolicy(null)).toMatchObject({
      status: "placeholder",
      executionMode: "host_placeholder",
      rendererExecutionModel: "host_placeholder_only",
      entryLoadPolicy: "not_loaded",
      canLoadEntry: false,
      reasonCode: "app_declared_renderer_placeholder_only",
    });
  });
});
