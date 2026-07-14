import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AgentRuntimeFileCheckpointRestoreResult } from "@/lib/api/agentRuntime/sessionTypes";
import {
  createFileCheckpointDetail,
  createFileCheckpointListResult,
  diffAgentRuntimeFileCheckpointMock,
  flushPromises,
  getAgentRuntimeFileCheckpointMock,
  listAgentRuntimeFileCheckpointsMock,
  renderPanel,
  restoreAgentRuntimeFileCheckpointMock,
} from "./AgentThreadReliabilityPanel.testFixtures";

describe("AgentThreadReliabilityPanel", () => {
  it("应展示最近文件快照摘要", () => {
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-file",
        status: "completed",
        file_checkpoint_summary: {
          count: 2,
          latest_checkpoint: {
            checkpoint_id: "artifact-document:req-1",
            turn_id: "turn-9",
            path: ".lime/artifacts/thread-file/demo.artifact.json",
            source: "artifact_document_service",
            updated_at: "2026-04-15T09:08:00Z",
            version_no: 7,
            version_id: "artifact-document:req-1:v7",
            preview_text: "补充了持久化快照对齐说明",
            validation_issue_count: 0,
            title: "持久化对齐说明",
            status: "ready",
          },
        },
      },
    });

    expect(container.textContent).toContain("最近文件快照");
    expect(container.textContent).toContain(
      ".lime/artifacts/thread-file/demo.artifact.json",
    );
    expect(container.textContent).toContain("共 2 个");
    expect(container.textContent).toContain("v7");
    expect(container.textContent).toContain("补充了持久化快照对齐说明");
  });

  it("应支持打开文件快照详情并拉取 list、detail、diff", async () => {
    const container = renderPanel({
      threadRead: {
        thread_id: "thread-file-1",
        status: "completed",
        file_checkpoint_summary: {
          count: 2,
          latest_checkpoint: createFileCheckpointListResult().checkpoints[0],
        },
      },
      diagnosticRuntimeContext: {
        sessionId: "session-file-1",
        workspaceId: "workspace-file-1",
        workingDir: "/workspace/project-a",
      },
    });

    const openButton = container.querySelector(
      '[data-testid="agent-thread-file-checkpoint-open"]',
    );
    expect(openButton).not.toBeNull();
    expect(openButton?.textContent).toContain("查看快照详情");

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(listAgentRuntimeFileCheckpointsMock).toHaveBeenCalledWith({
      session_id: "session-file-1",
    });
    expect(getAgentRuntimeFileCheckpointMock).toHaveBeenCalledWith({
      session_id: "session-file-1",
      checkpoint_id: "artifact-document:req-2",
    });
    expect(diffAgentRuntimeFileCheckpointMock).toHaveBeenCalledWith({
      session_id: "session-file-1",
      checkpoint_id: "artifact-document:req-2",
    });
    expect(document.body.textContent).toContain("文件变更审阅");
    expect(document.body.textContent).toContain("缺少 reviewer 字段");
    expect(document.body.textContent).toContain("变更对照");
    expect(document.body.textContent).toContain("1 个文件");
    expect(document.body.textContent).toContain("+1 行");
    expect(document.body.textContent).toContain("-1 行");
    expect(document.body.textContent).toContain("文件结构");
    expect(document.body.textContent).toContain("变更前");
    expect(document.body.textContent).toContain("变更后");
    expect(document.body.textContent).toContain("当前文件：");
    expect(document.body.textContent).toContain("快照版本：");
    expect(document.body.textContent).toContain("历史版本：2");
    expect(document.body.textContent).toContain("请求记录：req-2");
    expect(document.body.textContent).toContain(
      "AgentThreadReliabilityPanel.tsx",
    );
    expect(document.body.textContent).toContain('const action = "打开快照";');
    expect(document.body.textContent).toContain(
      'const action = "查看快照详情";',
    );
    expect(document.body.textContent).toContain("artifact-document:req-2:v7");
    expect(document.body.textContent).toContain(
      ".lime/artifacts/thread-file/persistence-map.artifact.json",
    );
    expect(document.body.textContent).not.toContain("live_path");
    expect(document.body.textContent).not.toContain("snapshot_path");
    expect(document.body.textContent).not.toContain("version_history");
    expect(document.body.textContent).not.toContain("request_id");

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const restoreButton = document.body.querySelector(
      '[data-testid="agent-thread-file-checkpoint-restore"]',
    );
    expect(restoreButton).not.toBeNull();

    await act(async () => {
      restoreButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(restoreAgentRuntimeFileCheckpointMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("确认恢复快照");
    expect(document.body.textContent).toContain(
      "目标文件：.lime/artifacts/thread-file/persistence-map.artifact.json",
    );
    expect(document.body.textContent).toContain(
      "恢复会覆盖当前文件内容，请先确认上方 diff 与版本信息。",
    );

    const confirmRestoreButton = document.body.querySelector(
      '[data-testid="agent-thread-file-checkpoint-restore-confirm"]',
    );

    await act(async () => {
      confirmRestoreButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await flushPromises();
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(restoreAgentRuntimeFileCheckpointMock).toHaveBeenCalledWith({
      session_id: "session-file-1",
      checkpoint_id: "artifact-document:req-2",
      confirm_restore: true,
      create_backup: true,
    });
    expect(document.body.textContent).toContain(
      "已恢复 .lime/artifacts/thread-file/persistence-map.artifact.json",
    );
    expect(document.body.textContent).toContain(
      "恢复前备份：.lime/file-checkpoint-backups/20260416T091200Z/.lime/artifacts/thread-file/persistence-map.artifact.json",
    );
    confirmSpy.mockRestore();

    const previousCheckpointButton = document.body.querySelector(
      '[data-testid="agent-thread-file-checkpoint-item-artifact-document:req-1"]',
    );
    expect(previousCheckpointButton).not.toBeNull();

    await act(async () => {
      previousCheckpointButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await flushPromises();
    });

    expect(getAgentRuntimeFileCheckpointMock).toHaveBeenLastCalledWith({
      session_id: "session-file-1",
      checkpoint_id: "artifact-document:req-1",
    });
    expect(diffAgentRuntimeFileCheckpointMock).toHaveBeenLastCalledWith({
      session_id: "session-file-1",
      checkpoint_id: "artifact-document:req-1",
    });
    expect(document.body.textContent).toContain("上一版导出仍使用旧摘要文案");
    expect(document.body.textContent).toContain(
      "summary 从旧结构迁移到 replay 包",
    );
  });

  it("应支持多选文件快照并批量回滚本轮文件变更", async () => {
    restoreAgentRuntimeFileCheckpointMock.mockImplementation(
      async ({ checkpoint_id }: { checkpoint_id: string }) => {
        const detail = createFileCheckpointDetail(checkpoint_id);
        return {
          session_id: "session-file-1",
          thread_id: "thread-file-1",
          checkpoint: detail.checkpoint,
          live_path: detail.live_path,
          snapshot_path: detail.snapshot_path,
          backup_path: `.lime/file-checkpoint-backups/batch/${detail.live_path}`,
          restored_at: "2026-04-16T09:14:00Z",
        } satisfies AgentRuntimeFileCheckpointRestoreResult;
      },
    );

    const container = renderPanel({
      threadRead: {
        thread_id: "thread-file-1",
        status: "completed",
        file_checkpoint_summary: {
          count: 2,
          latest_checkpoint: createFileCheckpointListResult().checkpoints[0],
        },
      },
      diagnosticRuntimeContext: {
        sessionId: "session-file-1",
        workspaceId: "workspace-file-1",
        workingDir: "/workspace/project-a",
      },
    });

    const openButton = container.querySelector(
      '[data-testid="agent-thread-file-checkpoint-open"]',
    );
    expect(openButton).not.toBeNull();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(document.body.textContent).toContain("选择全部快照");
    expect(document.body.textContent).toContain("已选 0 个");

    const selectAllButton = document.body.querySelector(
      '[data-testid="agent-thread-file-checkpoint-select-all"]',
    );
    expect(selectAllButton).not.toBeNull();

    await act(async () => {
      selectAllButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    expect(document.body.textContent).toContain("已选 2 个");

    const batchRestoreButton = document.body.querySelector(
      '[data-testid="agent-thread-file-checkpoint-batch-restore"]',
    );
    expect(batchRestoreButton).not.toBeNull();
    expect(batchRestoreButton?.textContent).toContain("批量回滚 2 个快照");

    await act(async () => {
      batchRestoreButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await flushPromises();
    });

    expect(restoreAgentRuntimeFileCheckpointMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("确认批量回滚");
    expect(document.body.textContent).toContain("将回滚的文件");
    expect(document.body.textContent).toContain(
      ".lime/artifacts/thread-file/persistence-map.artifact.json",
    );
    expect(document.body.textContent).toContain(
      ".lime/artifacts/thread-file/replay.artifact.json",
    );
    expect(document.body.textContent).toContain(
      "批量回滚会覆盖这些文件的当前内容",
    );

    const confirmBatchRestoreButton = document.body.querySelector(
      '[data-testid="agent-thread-file-checkpoint-batch-restore-confirm"]',
    );
    expect(confirmBatchRestoreButton).not.toBeNull();

    await act(async () => {
      confirmBatchRestoreButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await flushPromises(6);
    });

    expect(restoreAgentRuntimeFileCheckpointMock).toHaveBeenCalledTimes(2);
    expect(restoreAgentRuntimeFileCheckpointMock).toHaveBeenCalledWith({
      session_id: "session-file-1",
      checkpoint_id: "artifact-document:req-2",
      confirm_restore: true,
      create_backup: true,
    });
    expect(restoreAgentRuntimeFileCheckpointMock).toHaveBeenCalledWith({
      session_id: "session-file-1",
      checkpoint_id: "artifact-document:req-1",
      confirm_restore: true,
      create_backup: true,
    });
    expect(document.body.textContent).toContain(
      "批量回滚完成：成功 2 个，失败 0 个",
    );
    expect(document.body.textContent).toContain("已回滚");
    expect(document.body.textContent).toContain(
      "恢复前备份：.lime/file-checkpoint-backups/batch/.lime/artifacts/thread-file/replay.artifact.json",
    );
  });

 });
