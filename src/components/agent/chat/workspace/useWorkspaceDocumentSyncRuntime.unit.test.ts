import { describe, expect, it } from "vitest";
import type { DocumentCanvasState } from "@/components/workspace/canvas/canvasUtils";
import type { GeneralWorkbenchRunTerminalItem } from "@/lib/api/executionRun";
import type { TopicBranchStatus } from "../hooks/useTopicBranchBoard";
import {
  resolveCanvasContentSyncRequest,
  resolveDocumentVersionStatusMapAfterWorkbenchIdle,
} from "./useWorkspaceDocumentSyncRuntime";

function documentState(
  overrides: Partial<DocumentCanvasState> = {},
): DocumentCanvasState {
  return {
    type: "document",
    content: "当前正文",
    platform: "markdown",
    versions: [
      {
        id: "version-current",
        content: "当前正文",
        createdAt: 1,
      },
      {
        id: "version-terminal",
        content: "终态正文",
        createdAt: 2,
      },
    ],
    currentVersionId: "version-current",
    isEditing: true,
    ...overrides,
  };
}

function terminal(
  status: GeneralWorkbenchRunTerminalItem["status"],
): GeneralWorkbenchRunTerminalItem {
  return {
    run_id: "version-terminal",
    title: "终态版本",
    status,
    source: "chat",
    source_ref: null,
    started_at: "2026-01-01T00:00:00.000Z",
    finished_at: "2026-01-01T00:00:01.000Z",
  };
}

describe("workspace document sync runtime", () => {
  it("workbench idle 后应把成功 terminal 版本标记为 merged", () => {
    const previousStatusMap: Record<string, TopicBranchStatus> = {
      "version-current": "in_progress",
    };

    expect(
      resolveDocumentVersionStatusMapAfterWorkbenchIdle({
        canvasState: documentState(),
        latestTerminal: terminal("success"),
        previousStatusMap,
      }),
    ).toEqual({
      "version-current": "in_progress",
      "version-terminal": "merged",
    });
  });

  it("workbench idle 后应把失败 terminal 版本标记为 candidate", () => {
    expect(
      resolveDocumentVersionStatusMapAfterWorkbenchIdle({
        canvasState: documentState(),
        latestTerminal: terminal("error"),
        previousStatusMap: {},
      }),
    ).toEqual({
      "version-terminal": "candidate",
    });
  });

  it("无 terminal 更新时应把当前 in_progress 版本回落为 pending", () => {
    expect(
      resolveDocumentVersionStatusMapAfterWorkbenchIdle({
        canvasState: documentState(),
        previousStatusMap: {
          "version-current": "in_progress",
        },
      }),
    ).toEqual({
      "version-current": "pending",
    });
  });

  it("状态不需要变化时应复用原 status map 引用", () => {
    const previousStatusMap: Record<string, TopicBranchStatus> = {
      "version-current": "pending",
    };

    expect(
      resolveDocumentVersionStatusMapAfterWorkbenchIdle({
        canvasState: documentState(),
        previousStatusMap,
      }),
    ).toBe(previousStatusMap);
  });

  it("canvas 内容变化时应生成 content sync request", () => {
    expect(
      resolveCanvasContentSyncRequest({
        canvasState: documentState({ content: "新的正文" }),
        contentId: "content-1",
        previousRequest: null,
      }),
    ).toEqual({
      contentId: "content-1",
      body: "新的正文",
    });
  });

  it("空内容或重复内容不应生成 content sync request", () => {
    expect(
      resolveCanvasContentSyncRequest({
        canvasState: documentState({ content: "" }),
        contentId: "content-1",
        previousRequest: null,
      }),
    ).toBeNull();

    expect(
      resolveCanvasContentSyncRequest({
        canvasState: documentState({ content: "已有正文" }),
        contentId: "content-1",
        previousRequest: {
          contentId: "content-1",
          body: "已有正文",
        },
      }),
    ).toBeNull();
  });
});
