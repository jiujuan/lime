import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FileChangesUndoError,
  restoreFileChangesFromCheckpoints,
} from "./fileChangesUndo";
import type { FileChangesAggregate } from "./fileChangeSummary";

const listAgentRuntimeFileCheckpointsMock = vi.fn();
const restoreAgentRuntimeFileCheckpointMock = vi.fn();

vi.mock("@/lib/api/agentRuntime", () => ({
  listAgentRuntimeFileCheckpoints: (...args: unknown[]) =>
    listAgentRuntimeFileCheckpointsMock(...args),
  restoreAgentRuntimeFileCheckpoint: (...args: unknown[]) =>
    restoreAgentRuntimeFileCheckpointMock(...args),
}));

function createAggregate(path = "src/greeting.ts"): FileChangesAggregate {
  return {
    fileCount: 1,
    totalAdded: 3,
    totalRemoved: 1,
    files: [
      {
        path,
        kind: "update",
        linesAdded: 3,
        linesRemoved: 1,
        diff: [],
        truncated: false,
        source: "backend",
        status: "completed",
      },
    ],
  };
}

beforeEach(() => {
  listAgentRuntimeFileCheckpointsMock.mockReset();
  restoreAgentRuntimeFileCheckpointMock.mockReset();
});

describe("fileChangesUndo", () => {
  it("应忽略不可恢复的裸 tool_result checkpoint 并调用真实恢复命令", async () => {
    const rawToolResultPath =
      "workspace/projects/code-runtime-fixture/src/greeting.ts";
    listAgentRuntimeFileCheckpointsMock.mockResolvedValue({
      session_id: "session-1",
      thread_id: "thread-1",
      checkpoint_count: 2,
      checkpoints: [
        {
          checkpoint_id: "checkpoint-restorable",
          turn_id: "turn-1",
          path: ".lime/qc/code-runtime-fixture/src/greeting.ts",
          kind: "code_file",
          version_no: 2,
          source: "artifact_snapshot",
          updated_at: "2026-06-02T10:00:00.000Z",
          validation_issue_count: 0,
        },
        {
          checkpoint_id: "checkpoint-raw-tool-result",
          turn_id: "turn-1",
          path: rawToolResultPath,
          snapshot_path: rawToolResultPath,
          source: "tool_result",
          updated_at: "2026-06-02T10:01:00.000Z",
          validation_issue_count: 0,
        },
      ],
    });
    restoreAgentRuntimeFileCheckpointMock.mockResolvedValue({
      session_id: "session-1",
      thread_id: "thread-1",
      checkpoint: { checkpoint_id: "checkpoint-restorable" },
      live_path: "src/greeting.ts",
      snapshot_path: ".lime/checkpoints/greeting.ts",
      backup_path: ".lime/file-checkpoint-backups/greeting.ts",
      restored_at: "2026-06-02T10:02:00.000Z",
    });

    const result = await restoreFileChangesFromCheckpoints({
      aggregate: createAggregate(
        ".lime/qc/code-runtime-fixture/src/greeting.ts",
      ),
      sessionId: "session-1",
    });

    expect(listAgentRuntimeFileCheckpointsMock).toHaveBeenCalledWith({
      session_id: "session-1",
    });
    expect(restoreAgentRuntimeFileCheckpointMock).toHaveBeenCalledWith({
      session_id: "session-1",
      checkpoint_id: "checkpoint-restorable",
      confirm_restore: true,
      create_backup: true,
    });
    expect(result.restoredCount).toBe(1);
    expect(result.checkpointIds).toEqual(["checkpoint-restorable"]);
  });

  it("缺少 session 或匹配 checkpoint 时应返回可翻译错误码", async () => {
    await expect(
      restoreFileChangesFromCheckpoints({
        aggregate: createAggregate(),
        sessionId: null,
      }),
    ).rejects.toMatchObject({
      code: "missingSession",
    } satisfies Partial<FileChangesUndoError>);

    listAgentRuntimeFileCheckpointsMock.mockResolvedValue({
      session_id: "session-1",
      thread_id: "thread-1",
      checkpoint_count: 0,
      checkpoints: [],
    });

    await expect(
      restoreFileChangesFromCheckpoints({
        aggregate: createAggregate(),
        sessionId: "session-1",
      }),
    ).rejects.toMatchObject({
      code: "noMatchingCheckpoints",
    } satisfies Partial<FileChangesUndoError>);
  });
});
