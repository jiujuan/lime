import { describe, expect, it } from "vitest";

import {
  isGuiCanceledSnapshotReady,
  shouldExpandCompactApprovalTimeline,
} from "./claw-chat-current-fixture-gui-completion-waits.mjs";

const BASE_CANCELED_SNAPSHOT = {
  hasPrompt: true,
  hasStoppedCopy: false,
  hasPartialText: false,
  textareaVisible: true,
  textareaDisabled: false,
  stopButtonVisible: false,
  approvalRecordShape: {
    recordCount: 0,
  },
  compactTimelinePreviewCount: 0,
};

describe("claw chat GUI canceled waits", () => {
  it("普通 cancel 必须等到停止文案出现", () => {
    expect(isGuiCanceledSnapshotReady(BASE_CANCELED_SNAPSHOT)).toBe(false);
    expect(
      isGuiCanceledSnapshotReady({
        ...BASE_CANCELED_SNAPSHOT,
        hasStoppedCopy: true,
      }),
    ).toBe(true);
  });

  it("terminal / reopen cancel 可用 partial text 证明 GUI 已保留输出", () => {
    expect(
      isGuiCanceledSnapshotReady(BASE_CANCELED_SNAPSHOT, {
        partialText: "partial answer",
      }),
    ).toBe(false);
    expect(
      isGuiCanceledSnapshotReady(
        {
          ...BASE_CANCELED_SNAPSHOT,
          hasPartialText: true,
        },
        {
          partialText: "partial answer",
        },
      ),
    ).toBe(true);
  });

  it("approval cancel 必须等到 current approval record 投影出现", () => {
    expect(
      isGuiCanceledSnapshotReady(BASE_CANCELED_SNAPSHOT, {
        requireApprovalRecord: true,
      }),
    ).toBe(false);
    expect(
      isGuiCanceledSnapshotReady(
        {
          ...BASE_CANCELED_SNAPSHOT,
          approvalRecordShape: {
            recordCount: 1,
          },
        },
        {
          requireApprovalRecord: true,
        },
      ),
    ).toBe(true);
  });

  it("terminal approval 折叠后应先展开 current timeline 再等待只读记录", () => {
    expect(
      shouldExpandCompactApprovalTimeline(BASE_CANCELED_SNAPSHOT, {
        requireApprovalRecord: true,
      }),
    ).toBe(false);
    expect(
      shouldExpandCompactApprovalTimeline(
        {
          ...BASE_CANCELED_SNAPSHOT,
          compactTimelinePreviewCount: 1,
        },
        { requireApprovalRecord: true },
      ),
    ).toBe(true);
    expect(
      shouldExpandCompactApprovalTimeline(
        {
          ...BASE_CANCELED_SNAPSHOT,
          compactTimelinePreviewCount: 1,
        },
        { requireApprovalRecord: false },
      ),
    ).toBe(false);
  });
});
