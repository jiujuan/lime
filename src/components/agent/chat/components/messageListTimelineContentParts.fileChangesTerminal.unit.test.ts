import { describe, expect, it } from "vitest";

import { buildTimelineInlineContentParts } from "./messageListTimelineContentParts";
import { buildThreadItems } from "./messageListTimelineContentParts.testHarness";

const runningFileChangePart = {
  type: "file_changes_batch" as const,
  aggregate: {
    files: [
      {
        path: "src/App.tsx",
        fileStatus: "inProgress" as const,
        kind: "update" as const,
        linesAdded: 1,
        linesRemoved: 0,
        diff: [{ kind: "add" as const, value: "stale" }],
        truncated: false,
        source: "backend" as const,
        status: "running" as const,
      },
    ],
    totalAdded: 1,
    totalRemoved: 0,
    fileCount: 1,
  },
};

describe("messageListTimelineContentParts FileChange terminal merge", () => {
  it("同一 thread item 的 terminal FileChange 应替换旧 inProgress 卡", () => {
    const contentParts = buildTimelineInlineContentParts({
      displayContent: "",
      existingContentParts: [
        {
          ...runningFileChangePart,
          metadata: {
            source: "thread_item_patch",
            threadItemIds: ["patch-app"],
          },
        },
      ],
      items: buildThreadItems([
        {
          id: "patch-app",
          type: "patch",
          turn_id: "turn-decline",
          sequence: 1,
          text: "File changes declined",
          changes: [
            {
              path: "src/App.tsx",
              kind: { type: "update" },
              diff: "+terminal",
            },
          ],
          paths: ["src/App.tsx"],
          success: false,
          file_status: "declined",
          status: "completed",
          started_at: "2026-07-21T04:00:00.000Z",
          completed_at: "2026-07-21T04:00:01.000Z",
          updated_at: "2026-07-21T04:00:01.000Z",
        },
      ]),
    });

    const fileChangeParts = (contentParts || []).filter(
      (part) => part.type === "file_changes_batch",
    );
    expect(fileChangeParts).toHaveLength(1);
    expect(fileChangeParts[0]).toMatchObject({
      metadata: { threadItemId: "patch-app" },
      aggregate: {
        files: [
          expect.objectContaining({
            path: "src/App.tsx",
            fileStatus: "declined",
          }),
        ],
      },
    });
  });

  it("无法关联 identity 的历史 FileChange 卡应继续保留", () => {
    const contentParts = buildTimelineInlineContentParts({
      displayContent: "",
      existingContentParts: [runningFileChangePart],
      items: buildThreadItems([
        {
          id: "patch-other",
          type: "patch",
          turn_id: "turn-other",
          sequence: 1,
          text: "Other file changes completed",
          changes: [
            {
              path: "src/Other.tsx",
              kind: { type: "update" },
              diff: "+done",
            },
          ],
          paths: ["src/Other.tsx"],
          success: true,
          file_status: "completed",
          status: "completed",
          started_at: "2026-07-21T04:01:00.000Z",
          completed_at: "2026-07-21T04:01:01.000Z",
          updated_at: "2026-07-21T04:01:01.000Z",
        },
      ]),
    });

    expect(
      (contentParts || []).filter((part) => part.type === "file_changes_batch"),
    ).toHaveLength(2);
  });
});
