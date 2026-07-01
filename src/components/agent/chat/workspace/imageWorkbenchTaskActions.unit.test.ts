import { describe, expect, it } from "vitest";
import {
  matchesTaskActionContext,
  readTaskPayloadStringArray,
  readTaskPayloadTitleGenerationResult,
  resolvePendingImageTaskId,
  resolveReplayMode,
  resolveReplayTarget,
  resolveTaskRecordAnchorHint,
  resolveTaskRecordAnchorSectionTitle,
  resolveTaskRecordAnchorText,
  resolveTaskRecordSlotId,
  resolveTrackedTaskReplayTarget,
  resolveTrackedTaskReplayUsage,
} from "./imageWorkbenchTaskActions";
import { createInitialSessionImageWorkbenchState } from "./imageWorkbenchHelpers";

describe("imageWorkbenchTaskActions", () => {
  it("应从任务 record 中恢复 slot、anchor 和标题生成结果", () => {
    const record = {
      relationships: {
        slot_id: "slot-1",
      },
      payload: {
        anchor_hint: "section_end",
        anchor_section_title: "技术亮点",
        anchor_text: "这里是技术亮点段落。",
        title_generation_result: {
          title: "城市夜景主视觉",
          session_id: "title-session-1",
          execution_runtime: {
            route: "auxiliary.generate_title",
          },
        },
      },
    };

    expect(resolveTaskRecordSlotId(record as never)).toBe("slot-1");
    expect(resolveTaskRecordAnchorHint(record as never)).toBe("section_end");
    expect(resolveTaskRecordAnchorSectionTitle(record as never)).toBe(
      "技术亮点",
    );
    expect(resolveTaskRecordAnchorText(record as never)).toBe(
      "这里是技术亮点段落。",
    );
    expect(readTaskPayloadTitleGenerationResult(record.payload)).toEqual({
      title: "城市夜景主视觉",
      sessionId: "title-session-1",
      executionRuntime: {
        route: "auxiliary.generate_title",
      },
      usedFallback: false,
      fallbackReason: null,
    });
  });

  it("应规范化重试模式、目标、usage 和 reference images", () => {
    expect(resolveReplayMode("variant")).toBe("variation");
    expect(resolveReplayMode("edit")).toBe("edit");
    expect(resolveReplayMode("unknown")).toBe("generate");
    expect(resolveReplayTarget("cover")).toBe("cover");
    expect(resolveReplayTarget("generate")).toBe("generate");
    expect(
      readTaskPayloadStringArray(
        { reference_images: [" img-1 ", "img-1", "", "img-2", 1] },
        ["reference_images"],
      ),
    ).toEqual(["img-1", "img-2"]);

    expect(
      resolveTrackedTaskReplayUsage({
        applyTarget: {
          kind: "canvas-insert",
        },
      } as never),
    ).toBe("document-inline");
    expect(
      resolveTrackedTaskReplayUsage({
        applyTarget: {
          kind: "document-cover",
        },
      } as never),
    ).toBe("cover");
    expect(resolveTrackedTaskReplayTarget({ applyTarget: null } as never)).toBe(
      "generate",
    );
  });

  it("应选择最新仍在运行的任务，并按项目 / 内容上下文过滤外部事件", () => {
    const state = {
      ...createInitialSessionImageWorkbenchState(),
      tasks: [
        {
          id: "task-error",
          status: "error",
          createdAt: 400,
        },
        {
          id: "task-running-old",
          status: "running",
          createdAt: 100,
        },
        {
          id: "task-queued-new",
          status: "queued",
          createdAt: 300,
        },
      ],
    };

    expect(resolvePendingImageTaskId(state.tasks as never)).toBe(
      "task-queued-new",
    );
    expect(
      matchesTaskActionContext({
        detailProjectId: "project-1",
        projectId: "project-1",
        detailContentId: "content-1",
        contentId: "content-1",
      }),
    ).toBe(true);
    expect(
      matchesTaskActionContext({
        detailProjectId: "project-2",
        projectId: "project-1",
      }),
    ).toBe(false);
    expect(
      matchesTaskActionContext({
        detailProjectId: null,
        projectId: "project-1",
      }),
    ).toBe(true);
  });
});
