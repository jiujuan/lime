import { describe, expect, it } from "vitest";
import { projectCodingWorkbenchViewFromEvents } from "@limecloud/agent-runtime-projection";
import { buildCodingSessionOverviewActivities } from "./codingSessionOverviewProjection";

describe("codingSessionOverviewProjection", () => {
  it("应从 current CodingWorkbenchView 构造 session overview 展示项", () => {
    const codingView = projectCodingWorkbenchViewFromEvents({
      executionEvents: [
        {
          id: "evt-diagnostic",
          kind: "diagnostic",
          status: "failed",
          eventClass: "sandbox.blocked",
          title: "Sandbox blocked",
          createdAt: "2026-06-15T00:00:00.000Z",
          turnId: "turn-1",
          payload: {},
        },
      ],
      codingReadModel: {
        thread_id: "thread-1",
        active_turn_id: "turn-1",
        change_summary: {
          changed_file_count: 1,
          changed_files: ["src/App.tsx"],
          patch_count: 1,
          applied_patch_count: 1,
          failed_patch_count: 0,
          running_patch_count: 0,
        },
        commands: [
          {
            command_id: "command-test",
            status: "running",
            command: "npm test",
            cwd: "app",
            output_preview: "running tests",
          },
        ],
        tests: [
          {
            test_run_id: "test-unit",
            status: "failed",
            suite: "unit",
            passed: 3,
            failed: 1,
            failure_category: "assertion",
          },
        ],
        pending_requests: [
          {
            id: "approve-command",
            turn_id: "turn-1",
            request_type: "approval",
            status: "pending",
            title: "确认执行命令",
          },
        ],
        artifacts: [
          {
            artifactRef: "artifact-src-app",
            eventId: "evt-file-app",
            sequence: 1,
            turnId: "turn-1",
            path: "src/App.tsx",
            kind: "code_file",
            status: "completed",
          },
        ],
      },
    });

    expect(
      buildCodingSessionOverviewActivities(codingView, {
        failedCount: (count) => `${count} 失败`,
        filesChanged: (count) => `${count} 个文件已变更`,
        passedCount: (count) => `${count} 通过`,
        patchCount: (count) => `${count} 个补丁`,
        preparingResult: "正在准备结果",
      }),
    ).toMatchObject([
      {
        id: "coding-change-summary",
        status: "completed",
        title: "1 个文件已变更",
        summary: "src/App.tsx",
        icon: "fileText",
      },
      {
        id: "coding-command-command-test",
        status: "in_progress",
        title: "npm test",
        summary: "running tests",
        icon: "listChecks",
      },
      {
        id: "coding-test-test-unit",
        status: "failed",
        title: "unit",
        summary: "unit / 3 通过 / 1 失败",
        icon: "sparkles",
      },
      {
        id: "coding-file-evt-file-app",
        status: "completed",
        title: "src/App.tsx",
        icon: "fileText",
      },
      {
        id: "coding-action-approve-command",
        status: "in_progress",
        title: "确认执行命令",
        summary: "coding-workbench",
        icon: "shieldAlert",
      },
      {
        id: "coding-diagnostic-evt-diagnostic",
        status: "failed",
        title: "Sandbox blocked",
        summary: "Sandbox blocked",
        icon: "alertTriangle",
      },
    ]);
  });
});
