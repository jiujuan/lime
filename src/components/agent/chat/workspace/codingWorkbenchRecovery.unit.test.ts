import { describe, expect, it } from "vitest";
import type { CodingWorkbenchView } from "@limecloud/agent-runtime-projection";
import { buildCodingWorkbenchRecoveryView } from "./codingWorkbenchRecovery";

const copy = {
  intro: "请继续修复本轮编程任务中的失败输出。",
  requirements:
    "请先定位根因，只修改必要文件，运行相关验证，并在完成后说明改动与验证结果。",
  failedCommand: "失败命令",
  failedTest: "失败测试",
  failedPatch: "失败补丁",
  diagnostic: "诊断",
  preview: "失败片段",
  relatedFiles: "相关文件",
  latestCheckpoint: "最近文件快照",
};

function createCodingView(
  overrides: Partial<CodingWorkbenchView> = {},
): CodingWorkbenchView {
  return {
    runtime: { status: "completed" },
    mainObject: {
      id: "turn-1",
      title: "Coding Workbench",
      status: "failed",
    },
    files: [],
    changes: [],
    patches: [],
    commands: [],
    tests: [],
    actions: [],
    artifacts: [],
    evidence: [],
    diagnostics: [],
    ui: {
      preferredTab: "outputs",
      stale: false,
    },
    ...overrides,
  };
}

describe("codingWorkbenchRecovery", () => {
  it("应从失败命令、测试、补丁和诊断生成继续修复 prompt", () => {
    const recoveryView = buildCodingWorkbenchRecoveryView({
      codingView: createCodingView({
        changes: [
          {
            id: "change-1",
            path: "src/App.tsx",
            status: "completed",
            artifactRefs: [],
            sourceEventId: "event-change-1",
          },
        ],
        patches: [
          {
            patchId: "patch-1",
            status: "failed",
            title: "apply patch",
            path: "src/App.tsx",
            toolCallId: "tool-patch-1",
            diffRef: "diff://patch-1",
            failureCategory: "patch_failed",
            sourceEventIds: ["event-patch-1"],
          },
        ],
        commands: [
          {
            commandId: "command-1",
            status: "completed",
            title: "npm test",
            command: "npm test",
            exitCode: 1,
            outputRefs: ["output://command-1"],
            preview: "App.test.tsx failed",
            sourceEventIds: ["event-command-1"],
          },
        ],
        tests: [
          {
            testRunId: "test-1",
            status: "completed",
            title: "unit",
            suite: "unit",
            result: "failed",
            passed: 3,
            failed: 1,
            outputRefs: [],
            failureCategory: "assertion_failed",
            sourceEventIds: ["event-test-1"],
          },
        ],
        diagnostics: [
          {
            id: "diagnostic-1",
            sourceEventId: "event-command-1",
            title: "命令失败",
            detail: "exit=1",
            status: "failed",
          },
        ],
      }),
      fileCheckpointSummary: {
        count: 1,
        latest_checkpoint: {
          checkpoint_id: "checkpoint-1",
          turn_id: "turn-1",
          path: "src/App.tsx",
          source: "runtime",
          updated_at: "2026-06-14T00:00:00.000Z",
          validation_issue_count: 0,
        },
      },
      copy,
    });

    expect(recoveryView?.signals.map((signal) => signal.kind)).toEqual([
      "command",
      "test",
      "patch",
      "diagnostic",
    ]);
    expect(recoveryView?.relatedFiles).toEqual(["src/App.tsx"]);
    expect(recoveryView?.prompt).toContain("- 失败命令: npm test");
    expect(recoveryView?.prompt).toContain("- 失败测试: unit");
    expect(recoveryView?.prompt).toContain("- 失败补丁: src/App.tsx");
    expect(recoveryView?.prompt).toContain("- 诊断: 命令失败");
    expect(recoveryView?.prompt).toContain("App.test.tsx failed");
    expect(recoveryView?.prompt).toContain("相关文件: src/App.tsx");
    expect(recoveryView?.prompt).toContain("最近文件快照: src/App.tsx");
  });

  it("没有失败事实时返回 null", () => {
    const recoveryView = buildCodingWorkbenchRecoveryView({
      codingView: createCodingView({
        commands: [
          {
            commandId: "command-1",
            status: "completed",
            title: "npm test",
            command: "npm test",
            exitCode: 0,
            outputRefs: [],
            sourceEventIds: ["event-command-1"],
          },
        ],
      }),
      copy,
    });

    expect(recoveryView).toBeNull();
  });
});
