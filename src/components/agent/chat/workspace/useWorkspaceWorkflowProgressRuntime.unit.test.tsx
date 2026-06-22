import { describe, expect, it } from "vitest";
import {
  buildWorkspaceWorkflowProgressSignature,
  buildWorkspaceWorkflowProgressSnapshot,
  shouldEnableWorkspaceWorkflowProgress,
} from "./useWorkspaceWorkflowProgressRuntime";

const steps = [
  { id: "draft", title: "起草", status: "completed" as const },
  { id: "review", title: "审核", status: "active" as const },
];

describe("workspaceWorkflowProgressRuntime", () => {
  it("只有 specialized theme、有消息且存在步骤时才启用进度回调", () => {
    expect(
      shouldEnableWorkspaceWorkflowProgress({
        hasMessages: true,
        isSpecializedThemeMode: true,
        steps,
      }),
    ).toBe(true);

    expect(
      shouldEnableWorkspaceWorkflowProgress({
        hasMessages: false,
        isSpecializedThemeMode: true,
        steps,
      }),
    ).toBe(false);
    expect(
      shouldEnableWorkspaceWorkflowProgress({
        hasMessages: true,
        isSpecializedThemeMode: false,
        steps,
      }),
    ).toBe(false);
    expect(
      shouldEnableWorkspaceWorkflowProgress({
        hasMessages: true,
        isSpecializedThemeMode: true,
        steps: [],
      }),
    ).toBe(false);
  });

  it("禁用时应返回 null snapshot 和 hidden signature", () => {
    const snapshot = buildWorkspaceWorkflowProgressSnapshot({
      currentStepIndex: 0,
      enabled: false,
      steps,
    });

    expect(snapshot).toBeNull();
    expect(buildWorkspaceWorkflowProgressSignature(snapshot)).toBe("hidden");
  });

  it("启用时应投影 progress snapshot 并生成稳定签名", () => {
    const snapshot = buildWorkspaceWorkflowProgressSnapshot({
      currentStepIndex: 1,
      enabled: true,
      steps,
    });

    expect(snapshot).toEqual({
      currentIndex: 1,
      steps,
    });
    expect(buildWorkspaceWorkflowProgressSignature(snapshot)).toBe(
      "1:draft:completed:起草|review:active:审核",
    );
  });
});
