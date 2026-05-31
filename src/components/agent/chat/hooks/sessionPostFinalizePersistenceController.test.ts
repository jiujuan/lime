import { describe, expect, it } from "vitest";
import {
  applyRuntimeTopicWorkspaceIdToTopics,
  buildSessionPostFinalizePersistenceApplyPlan,
  buildSessionPostFinalizePersistencePlan,
  resolvePersistedSessionWorkspaceId,
  resolveSessionDetailTopicWorkspaceId,
} from "./sessionPostFinalizePersistenceController";

describe("sessionPostFinalizePersistenceController", () => {
  it("topic workspace 应按 runtime / known / resolved 顺序恢复", () => {
    expect(
      resolveSessionDetailTopicWorkspaceId({
        runtimeWorkspaceId: "runtime-workspace",
        knownWorkspaceId: "known-workspace",
        resolvedWorkspaceId: "resolved-workspace",
      }),
    ).toBe("runtime-workspace");

    expect(
      resolveSessionDetailTopicWorkspaceId({
        runtimeWorkspaceId: null,
        knownWorkspaceId: "known-workspace",
        resolvedWorkspaceId: "resolved-workspace",
      }),
    ).toBe("known-workspace");

    expect(
      resolveSessionDetailTopicWorkspaceId({
        runtimeWorkspaceId: null,
        knownWorkspaceId: null,
        resolvedWorkspaceId: "resolved-workspace",
      }),
    ).toBe("resolved-workspace");
  });

  it("持久化 workspace 只应使用 runtime workspace 或当前 resolved workspace", () => {
    expect(
      resolvePersistedSessionWorkspaceId({
        runtimeWorkspaceId: "runtime-workspace",
        resolvedWorkspaceId: "resolved-workspace",
      }),
    ).toBe("runtime-workspace");

    expect(
      resolvePersistedSessionWorkspaceId({
        runtimeWorkspaceId: null,
        resolvedWorkspaceId: "resolved-workspace",
      }),
    ).toBe("resolved-workspace");

    expect(
      resolvePersistedSessionWorkspaceId({
        runtimeWorkspaceId: null,
        resolvedWorkspaceId: null,
      }),
    ).toBeNull();
  });

  it("应构造 finalize 后 workspace 与 provider 持久化计划", () => {
    expect(
      buildSessionPostFinalizePersistencePlan({
        runtimeWorkspaceId: "runtime-workspace",
        knownWorkspaceId: "known-workspace",
        resolvedWorkspaceId: "resolved-workspace",
        providerPreferenceToApply: {
          providerType: "deepseek",
          model: "deepseek-chat",
        },
      }),
    ).toEqual({
      persistedWorkspaceId: "runtime-workspace",
      providerPreferenceToApply: {
        providerType: "deepseek",
        model: "deepseek-chat",
      },
      runtimeTopicWorkspaceIdToApply: "runtime-workspace",
      topicWorkspaceId: "runtime-workspace",
    });
  });

  it("应构造 finalize 后副作用应用计划", () => {
    const providerPreferenceToApply = {
      providerType: "deepseek",
      model: "deepseek-chat",
    };
    expect(
      buildSessionPostFinalizePersistenceApplyPlan({
        persistedWorkspaceId: "runtime-workspace",
        providerPreferenceToApply,
        runtimeTopicWorkspaceIdToApply: "runtime-workspace",
        topicWorkspaceId: "runtime-workspace",
      }),
    ).toEqual({
      providerPreferenceToApply,
      runtimeTopicWorkspaceIdToApply: "runtime-workspace",
      sessionWorkspaceIdToPersist: "runtime-workspace",
    });
  });

  it("应把 runtime workspace 回填到目标 topic", () => {
    const topics = [
      { id: "topic-a", workspaceId: "workspace-a", name: "A" },
      { id: "topic-b", workspaceId: "workspace-b", name: "B" },
    ];

    expect(
      applyRuntimeTopicWorkspaceIdToTopics(topics, {
        topicId: "topic-b",
        runtimeTopicWorkspaceIdToApply: "runtime-workspace",
      }),
    ).toEqual([
      { id: "topic-a", workspaceId: "workspace-a", name: "A" },
      { id: "topic-b", workspaceId: "runtime-workspace", name: "B" },
    ]);

    expect(
      applyRuntimeTopicWorkspaceIdToTopics(topics, {
        topicId: "topic-b",
        runtimeTopicWorkspaceIdToApply: null,
      }),
    ).toBe(topics);
  });
});
