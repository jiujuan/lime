import { describe, expect, it } from "vitest";
import {
  buildCrossWorkspaceSessionRestoreContext,
  buildSessionFinalizeSuccessStatePlan,
  buildSessionWorkspaceRestorePlan,
  isCrossWorkspaceSessionDetail,
  resolveSessionExecutionStrategyOverride,
  resolveSessionKnownWorkspaceId,
  resolveShadowSessionExecutionStrategyFallback,
} from "./sessionFinalizeController";

describe("sessionFinalizeController", () => {
  it("应按 runtime / topic / shadow 顺序解析会话已知 workspace", () => {
    expect(
      resolveSessionKnownWorkspaceId({
        runtimeWorkspaceId: "runtime-workspace",
        topicWorkspaceId: "topic-workspace",
        shadowWorkspaceId: "shadow-workspace",
      }),
    ).toBe("runtime-workspace");

    expect(
      resolveSessionKnownWorkspaceId({
        runtimeWorkspaceId: null,
        topicWorkspaceId: "topic-workspace",
        shadowWorkspaceId: "shadow-workspace",
      }),
    ).toBe("topic-workspace");

    expect(
      resolveSessionKnownWorkspaceId({
        runtimeWorkspaceId: null,
        topicWorkspaceId: null,
        shadowWorkspaceId: "shadow-workspace",
      }),
    ).toBe("shadow-workspace");

    expect(
      resolveSessionKnownWorkspaceId({
        runtimeWorkspaceId: null,
        topicWorkspaceId: null,
        shadowWorkspaceId: null,
      }),
    ).toBeNull();
  });

  it("只有当前 workspace 与已知 workspace 同时存在且不一致时才拒绝恢复", () => {
    expect(
      isCrossWorkspaceSessionDetail({
        resolvedWorkspaceId: "workspace-a",
        knownWorkspaceId: "workspace-b",
      }),
    ).toBe(true);

    expect(
      isCrossWorkspaceSessionDetail({
        resolvedWorkspaceId: "workspace-a",
        knownWorkspaceId: "workspace-a",
      }),
    ).toBe(false);

    expect(
      isCrossWorkspaceSessionDetail({
        resolvedWorkspaceId: null,
        knownWorkspaceId: "workspace-a",
      }),
    ).toBe(false);
  });

  it("应构造跨 workspace 恢复拒绝上下文", () => {
    expect(
      buildCrossWorkspaceSessionRestoreContext({
        topicId: "topic-a",
        resolvedWorkspaceId: "workspace-a",
        knownWorkspaceId: "workspace-b",
      }),
    ).toEqual({
      currentWorkspaceId: "workspace-a",
      knownWorkspaceId: "workspace-b",
      topicId: "topic-a",
    });

    expect(
      buildSessionWorkspaceRestorePlan({
        topicId: "topic-a",
        resolvedWorkspaceId: "workspace-a",
        runtimeWorkspaceId: null,
        topicWorkspaceId: "workspace-b",
        shadowWorkspaceId: "workspace-c",
      }),
    ).toEqual({
      crossWorkspaceContext: {
        currentWorkspaceId: "workspace-a",
        knownWorkspaceId: "workspace-b",
        topicId: "topic-a",
      },
      knownWorkspaceId: "workspace-b",
      shouldReject: true,
    });
  });

  it("runtime 或 topic 已有执行策略时不使用 shadow fallback", () => {
    expect(
      resolveShadowSessionExecutionStrategyFallback({
        runtimeExecutionStrategy: "react",
        topicExecutionStrategy: null,
        persistedExecutionStrategy: "react",
      }),
    ).toBeNull();

    expect(
      resolveShadowSessionExecutionStrategyFallback({
        runtimeExecutionStrategy: null,
        topicExecutionStrategy: "react",
        persistedExecutionStrategy: "react",
      }),
    ).toBeNull();
  });

  it("应按 runtime / topic / shadow / 默认值顺序解析并归一最终执行策略", () => {
    expect(
      resolveSessionExecutionStrategyOverride({
        runtimeExecutionStrategy: "react",
        topicExecutionStrategy: "react",
        shadowExecutionStrategyFallback: "react",
      }),
    ).toBe("react");

    expect(
      resolveSessionExecutionStrategyOverride({
        runtimeExecutionStrategy: null,
        topicExecutionStrategy: "react",
        shadowExecutionStrategyFallback: "react",
      }),
    ).toBe("react");

    expect(
      resolveSessionExecutionStrategyOverride({
        runtimeExecutionStrategy: null,
        topicExecutionStrategy: null,
        shadowExecutionStrategyFallback: "react",
      }),
    ).toBe("react");

    expect(
      resolveSessionExecutionStrategyOverride({
        runtimeExecutionStrategy: null,
        topicExecutionStrategy: null,
        shadowExecutionStrategyFallback: null,
      }),
    ).toBe("react");
  });

  it("应构造 finalize 成功后的状态收尾计划", () => {
    expect(buildSessionFinalizeSuccessStatePlan()).toEqual({
      shouldClearAutoRestoringSession: true,
      shouldResetSessionHydrating: true,
    });
  });
});
