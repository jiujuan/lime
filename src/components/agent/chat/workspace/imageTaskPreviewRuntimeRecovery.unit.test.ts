import { describe, expect, it, vi } from "vitest";
import { listDirectory } from "@/lib/api/fileBrowser";
import type { Message } from "../types";
import {
  createInitialSessionImageWorkbenchState,
  type ImageWorkbenchTask,
} from "./imageWorkbenchHelpers";
import type { ParsedImageTaskSnapshot } from "./imageTaskPreviewRuntimeSnapshot";
import {
  collectImageTaskCandidatePaths,
  isImageWorkbenchTaskSatisfiedByCache,
  matchesRuntimeEventContext,
  normalizeTaskFamily,
  shouldPreferLoadedImageTaskSnapshot,
  shouldRestoreImageTaskRecord,
  shouldRestoreLoadedImageTaskSnapshot,
  type LoadedImageTaskSnapshot,
} from "./imageTaskPreviewRuntimeRecovery";

vi.mock("@/lib/api/fileBrowser", () => ({
  listDirectory: vi.fn(),
}));

const NOW = Date.parse("2026-07-02T00:00:00.000Z");

function createTask(
  overrides: Partial<ImageWorkbenchTask>,
): ImageWorkbenchTask {
  return {
    id: "task-1",
    sessionId: "session-1",
    mode: "generate",
    status: "running",
    prompt: "春日咖啡馆插画",
    rawText: "@配图 春日咖啡馆插画",
    expectedCount: 1,
    outputIds: [],
    hookImageIds: [],
    applyTarget: null,
    createdAt: NOW,
    ...overrides,
  };
}

function createSnapshot(
  overrides: Partial<ParsedImageTaskSnapshot> = {},
): ParsedImageTaskSnapshot {
  return {
    taskId: "task-1",
    terminal: false,
    outputs: [],
    updatedAt: NOW,
    task: createTask({}),
    message: {
      id: "assistant-1",
      role: "assistant",
      content: "",
      timestamp: new Date(NOW),
    } satisfies Message,
    ...overrides,
  };
}

function createLoadedSnapshot(
  overrides: Omit<Partial<LoadedImageTaskSnapshot>, "snapshot"> & {
    snapshot?: Partial<ParsedImageTaskSnapshot>;
    taskRecord?: Record<string, unknown>;
  } = {},
): LoadedImageTaskSnapshot {
  return {
    snapshot: createSnapshot(overrides.snapshot),
    taskRecord: {
      task_type: "image_generate",
      normalized_status: "running",
      updated_at: new Date(NOW).toISOString(),
      ...overrides.taskRecord,
    },
  };
}

function createTaskRecord(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    task_id: "task-1",
    task_type: "image_generate",
    task_family: "image",
    normalized_status: "completed",
    updated_at: new Date(NOW).toISOString(),
    payload: {
      session_id: "session-1",
      project_id: "project-1",
      content_id: "content-1",
    },
    ...overrides,
  };
}

describe("imageTaskPreviewRuntimeRecovery", () => {
  it("应按 terminal、输出数量和更新时间选择更完整 snapshot", () => {
    const current = createLoadedSnapshot({
      snapshot: {
        terminal: false,
        outputs: [],
        updatedAt: NOW,
      },
    });

    expect(
      shouldPreferLoadedImageTaskSnapshot(
        current,
        createLoadedSnapshot({
          snapshot: {
            terminal: true,
            outputs: [],
            updatedAt: NOW - 1,
          },
        }),
      ),
    ).toBe(true);
    expect(
      shouldPreferLoadedImageTaskSnapshot(
        current,
        createLoadedSnapshot({
          snapshot: {
            terminal: false,
            outputs: [
              {
                id: "output-1",
                taskId: "task-1",
                refId: "output-1",
                hookImageId: "hook-output-1",
                url: "https://cdn.example.com/output-1.png",
                prompt: "结果图",
                createdAt: NOW,
                applyTarget: null,
              },
            ],
            updatedAt: NOW - 1,
          },
        }),
      ),
    ).toBe(true);
    expect(
      shouldPreferLoadedImageTaskSnapshot(
        current,
        createLoadedSnapshot({
          snapshot: {
            terminal: false,
            outputs: [],
            updatedAt: NOW + 1,
          },
        }),
      ),
    ).toBe(true);
    expect(shouldPreferLoadedImageTaskSnapshot(current, null)).toBe(false);
  });

  it("应判断 workbench cache 是否已经满足任务恢复", () => {
    expect(
      isImageWorkbenchTaskSatisfiedByCache({
        imageWorkbenchState: createInitialSessionImageWorkbenchState(),
        taskId: "task-1",
      }),
    ).toBe(false);

    expect(
      isImageWorkbenchTaskSatisfiedByCache({
        imageWorkbenchState: {
          ...createInitialSessionImageWorkbenchState(),
          tasks: [createTask({ status: "running" })],
          outputs: [
            {
              id: "output-1",
              taskId: "task-1",
              refId: "output-1",
              hookImageId: "hook-output-1",
              url: "https://cdn.example.com/output-1.png",
              prompt: "结果图",
              createdAt: NOW,
              applyTarget: null,
            },
          ],
        },
        taskId: "task-1",
      }),
    ).toBe(true);

    expect(
      isImageWorkbenchTaskSatisfiedByCache({
        imageWorkbenchState: {
          ...createInitialSessionImageWorkbenchState(),
          tasks: [createTask({ status: "error" })],
        },
        taskId: "task-1",
      }),
    ).toBe(true);
  });

  it("应按图片任务 family、上下文和活跃窗口筛选可恢复记录", () => {
    expect(normalizeTaskFamily("cover_generate")).toBe("image");
    expect(normalizeTaskFamily("video_generate")).toBe("video");
    expect(
      shouldRestoreImageTaskRecord({
        taskRecord: createTaskRecord({
          task_type: "video_generate",
          task_family: "video",
        }),
        sessionId: "session-1",
        contentId: "content-1",
        now: NOW,
      }),
    ).toBe(false);
    expect(
      shouldRestoreImageTaskRecord({
        taskRecord: createTaskRecord({
          payload: {
            session_id: "other-session",
            content_id: "content-1",
          },
        }),
        sessionId: "session-1",
        contentId: "content-1",
        now: NOW,
      }),
    ).toBe(false);
    expect(
      shouldRestoreImageTaskRecord({
        taskRecord: createTaskRecord({
          normalized_status: "running",
          updated_at: new Date(NOW - 31 * 60 * 1000).toISOString(),
        }),
        sessionId: "session-1",
        contentId: "content-1",
        now: NOW,
      }),
    ).toBe(false);
    expect(
      shouldRestoreImageTaskRecord({
        taskRecord: createTaskRecord({ normalized_status: "completed" }),
        sessionId: "session-1",
        contentId: "content-1",
        now: NOW,
      }),
    ).toBe(true);
    expect(
      shouldRestoreImageTaskRecord({
        taskRecord: createTaskRecord({
          normalized_status: "completed",
          updated_at: new Date(NOW - 25 * 60 * 60 * 1000).toISOString(),
          payload: {},
        }),
        now: NOW,
      }),
    ).toBe(false);
  });

  it("应按 runtime event session/content scope 过滤跨会话事件", () => {
    expect(
      matchesRuntimeEventContext({
        payload: {
          session_id: "session-1",
          content_id: "content-1",
        },
        sessionId: "session-1",
        contentId: "content-1",
      }),
    ).toBe(true);
    expect(
      matchesRuntimeEventContext({
        payload: {
          session_id: "other-session",
          content_id: "content-1",
        },
        sessionId: "session-1",
        contentId: "content-1",
      }),
    ).toBe(false);
    expect(
      matchesRuntimeEventContext({
        payload: {
          content_id: "content-1",
        },
        sessionId: "session-1",
        contentId: "content-1",
      }),
    ).toBe(true);
  });

  it("应只恢复 terminal 或仍处于活跃窗口内的 loaded snapshot", () => {
    expect(
      shouldRestoreLoadedImageTaskSnapshot(
        createLoadedSnapshot({
          snapshot: { terminal: true },
          taskRecord: {
            updated_at: new Date(NOW - 48 * 60 * 60 * 1000).toISOString(),
          },
        }),
        NOW,
      ),
    ).toBe(true);
    expect(
      shouldRestoreLoadedImageTaskSnapshot(
        createLoadedSnapshot({
          snapshot: { terminal: false },
          taskRecord: {
            updated_at: new Date(NOW - 31 * 60 * 1000).toISOString(),
          },
        }),
        NOW,
      ),
    ).toBe(false);
  });

  it("应从 workspace .lime/tasks 下扫描 json 候选文件", async () => {
    const mockedListDirectory = vi.mocked(listDirectory);
    mockedListDirectory.mockImplementation(async (path) => {
      if (path.endsWith("/.lime/tasks")) {
        return {
          entries: [
            {
              name: "image",
              path: `${path}/image`,
              isDir: true,
            },
            {
              name: "ignore.txt",
              path: `${path}/ignore.txt`,
              isDir: false,
            },
          ],
        } as Awaited<ReturnType<typeof listDirectory>>;
      }
      if (path.endsWith("/.lime/tasks/image")) {
        return {
          entries: [
            {
              name: "task-1.json",
              path: `${path}/task-1.json`,
              isDir: false,
            },
          ],
        } as Awaited<ReturnType<typeof listDirectory>>;
      }
      return {
        entries: [],
      } as unknown as Awaited<ReturnType<typeof listDirectory>>;
    });

    await expect(collectImageTaskCandidatePaths("/workspace")).resolves.toEqual(
      ["/workspace/.lime/tasks/image/task-1.json"],
    );
  });
});
