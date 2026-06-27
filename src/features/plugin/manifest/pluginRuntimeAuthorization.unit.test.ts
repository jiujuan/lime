import { describe, expect, it } from "vitest";
import {
  resolvePluginRemoteRuntimePolicy,
  resolvePluginRuntimeAuthorization,
} from "./pluginRuntimeAuthorization";

describe("Plugin runtime authorization", () => {
  it("远端运行策略在第一轮骨架中固定为 fail closed", () => {
    expect(resolvePluginRemoteRuntimePolicy()).toEqual({
      status: "disabled",
      clientBehavior: "fail_closed",
      serviceBoundary: "marketplace_control_plane_only",
      reasonCode: "remote_plugin_runtime_disabled",
    });
  });

  it("只允许内容工厂 workspace patch 走本地 worker", () => {
    expect(
      resolvePluginRuntimeAuthorization({
        pluginId: "content-factory-app",
        outputArtifactKind: "content_factory.workspace_patch",
        rendererKind: "host_builtin",
      }),
    ).toMatchObject({
      status: "allowed",
      executionMode: "local_agent_app_worker",
      runtimeBoundary: "local_worker_allowlist",
      remoteRuntimePolicy: {
        status: "disabled",
        clientBehavior: "fail_closed",
        serviceBoundary: "marketplace_control_plane_only",
      },
      reasonCode: "local_worker_output_allowed",
      requestedOutputArtifactKind: "content_factory.workspace_patch",
      allowedOutputArtifactKinds: ["content_factory.workspace_patch"],
    });
  });

  it("拒绝内容工厂以外的本地 worker 执行", () => {
    expect(
      resolvePluginRuntimeAuthorization({
        pluginId: "creator-pack",
        outputArtifactKind: "creator.workspace_patch",
        rendererKind: "host_builtin",
      }),
    ).toMatchObject({
      status: "denied",
      executionMode: "none",
      runtimeBoundary: "remote_runtime_disabled",
      remoteRuntimePolicy: {
        status: "disabled",
        reasonCode: "remote_plugin_runtime_disabled",
      },
      reasonCode: "remote_plugin_runtime_disabled",
      requestedOutputArtifactKind: "creator.workspace_patch",
    });
  });

  it("声明型 renderer 只能进入宿主占位", () => {
    expect(
      resolvePluginRuntimeAuthorization({
        pluginId: "creator-pack",
        outputArtifactKind: "creator.workspace_patch",
        rendererKind: "app_declared",
      }),
    ).toMatchObject({
      status: "placeholder_only",
      executionMode: "host_placeholder",
      runtimeBoundary: "host_placeholder_only",
      remoteRuntimePolicy: {
        status: "disabled",
        reasonCode: "remote_plugin_runtime_disabled",
      },
      reasonCode: "app_declared_renderer_placeholder_only",
    });
  });

  it("缺少输出 artifact kind 时 fail closed", () => {
    expect(
      resolvePluginRuntimeAuthorization({
        pluginId: "content-factory-app",
        outputArtifactKind: " ",
        rendererKind: "host_builtin",
      }),
    ).toMatchObject({
      status: "denied",
      executionMode: "none",
      runtimeBoundary: "output_kind_missing",
      reasonCode: "plugin_runtime_output_kind_missing",
      requestedOutputArtifactKind: null,
    });
  });

  it("本地 allowlist 插件请求不支持的输出类型时不回退远端运行", () => {
    expect(
      resolvePluginRuntimeAuthorization({
        pluginId: "content-factory-app",
        outputArtifactKind: "creator.workspace_patch",
        rendererKind: "host_builtin",
      }),
    ).toMatchObject({
      status: "denied",
      executionMode: "none",
      runtimeBoundary: "output_kind_unsupported",
      reasonCode: "plugin_runtime_output_kind_unsupported",
      remoteRuntimePolicy: {
        status: "disabled",
        clientBehavior: "fail_closed",
      },
    });
  });
});
