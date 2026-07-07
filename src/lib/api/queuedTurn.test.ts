import { describe, expect, it } from "vitest";
import {
  normalizeQueuedTurnSnapshot,
  normalizeQueuedTurnSnapshots,
} from "./queuedTurn";

describe("normalizeQueuedTurnSnapshot", () => {
  it("保留 pending steer 富输入结构，避免退化成普通字符串", () => {
    const snapshot = normalizeQueuedTurnSnapshot({
      queuedTurnId: "queued-rich",
      messageText: "请结合截图、路径和技能继续",
      createdAt: 7,
      imageCount: 1,
      position: 2,
      inputAttachments: [
        {
          kind: "image",
          uri: "file://queued.png",
          metadata: { mediaType: "image/png" },
        },
      ],
      pathReferences: [
        {
          path: "/project/report.md",
          name: "report.md",
          isDir: false,
          source: "file_manager",
        },
      ],
      textElements: [{ type: "text", text: "请结合截图、路径和技能继续" }],
      inputCapabilityRoute: {
        kind: "installed_skill",
        skillKey: "code-review",
        skillName: "Code Review",
      },
    });

    expect(snapshot).toMatchObject({
      queued_turn_id: "queued-rich",
      message_text: "请结合截图、路径和技能继续",
      image_count: 1,
      attachments: [
        {
          kind: "image",
          uri: "file://queued.png",
        },
      ],
      path_references: [
        {
          path: "/project/report.md",
          name: "report.md",
        },
      ],
      text_elements: [{ type: "text", text: "请结合截图、路径和技能继续" }],
      input_capability_route: {
        kind: "installed_skill",
        skillKey: "code-review",
        skillName: "Code Review",
      },
    });
    expect(snapshot?.inputAttachments).toBe(snapshot?.attachments);
    expect(snapshot?.pathReferences).toBe(snapshot?.path_references);
    expect(snapshot?.textElements).toBe(snapshot?.text_elements);
    expect(snapshot?.inputCapabilityRoute).toBe(
      snapshot?.input_capability_route,
    );
  });
});

describe("normalizeQueuedTurnSnapshots", () => {
  it("按 current read model position 恢复 pending steer 队列顺序", () => {
    const snapshots = normalizeQueuedTurnSnapshots([
      {
        queuedTurnId: "queued-third",
        messageText: "third",
        createdAt: 3,
        position: 2,
      },
      {
        queuedTurnId: "queued-first",
        messageText: "first",
        createdAt: 1,
        position: 0,
      },
      {
        queuedTurnId: "queued-second",
        messageText: "second",
        createdAt: 2,
        position: 1,
      },
    ]);

    expect(snapshots.map((snapshot) => snapshot.queued_turn_id)).toEqual([
      "queued-first",
      "queued-second",
      "queued-third",
    ]);
  });

  it("同 position 和 legacy 缺 position 时保持输入稳定顺序", () => {
    const samePosition = normalizeQueuedTurnSnapshots([
      {
        queuedTurnId: "queued-a",
        messageText: "A",
        position: 1,
      },
      {
        queuedTurnId: "queued-b",
        messageText: "B",
        position: 1,
      },
    ]);
    const legacyWithoutPosition = normalizeQueuedTurnSnapshots([
      {
        queuedTurnId: "legacy-first",
        messageText: "first",
      },
      {
        queuedTurnId: "legacy-second",
        messageText: "second",
        position: 0,
      },
    ]);

    expect(samePosition.map((snapshot) => snapshot.queued_turn_id)).toEqual([
      "queued-a",
      "queued-b",
    ]);
    expect(
      legacyWithoutPosition.map((snapshot) => snapshot.queued_turn_id),
    ).toEqual(["legacy-first", "legacy-second"]);
  });
});
