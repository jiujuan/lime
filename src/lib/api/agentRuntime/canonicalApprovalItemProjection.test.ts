import { describe, expect, it } from "vitest";
import { projectCanonicalApprovalItem } from "./canonicalApprovalItemProjection";

describe("projectCanonicalApprovalItem", () => {
  const approvalItem = (overrides: Record<string, unknown> = {}) => ({
    sessionId: "session-1",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item_approval-1",
    ordinal: 3,
    sequence: 3,
    kind: "approval",
    status: "completed",
    payload: {
      type: "approval",
      request_id: "approval-1",
      action: {
        kind: "tool_confirmation",
        description: "允许执行浏览器工具？",
      },
      scope: "session",
      decision: "approvedForSession",
      available_decisions: [
        "approved",
        "approvedForSession",
        "denied",
        "abort",
      ],
      requested_at_ms: 1783860000000,
      resolved_at_ms: 1783860001000,
    },
    createdAtMs: 1783860000000,
    updatedAtMs: 1783860001000,
    completedAtMs: 1783860001000,
    ...overrides,
  });

  it("将 canonical session approval 投影为单一 GUI approval record", () => {
    expect(projectCanonicalApprovalItem(approvalItem())).toMatchObject({
      id: "item_approval-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      type: "approval_request",
      status: "completed",
      request_id: "approval-1",
      action_type: "tool_confirmation",
      prompt: "允许执行浏览器工具？",
      available_decisions: [
        "allow_once",
        "allow_for_session",
        "decline",
        "cancel",
      ],
      response: {
        decision: "approvedForSession",
        decision_scope: "session",
        reason_code: null,
      },
    });
  });

  it("pending approval 不生成 response，也不会进入已解决投影", () => {
    const pending = approvalItem({
      status: "pending",
      completedAtMs: null,
      payload: {
        type: "approval",
        request_id: "approval-1",
        action: {
          kind: "tool_confirmation",
          description: "允许执行浏览器工具？",
        },
        scope: "once",
        available_decisions: ["approved", "denied", "abort"],
        requested_at_ms: 1783860000000,
      },
    });

    expect(projectCanonicalApprovalItem(pending)).toMatchObject({
      status: "in_progress",
      available_decisions: ["allow_once", "decline", "cancel"],
      response: undefined,
    });
  });

  it.each(["approved", "approvedForSession", "denied", "abort", "timedOut"])(
    "保留 canonical decision %s 供 GUI 边界显式映射",
    (decision) => {
      const item = approvalItem({
        payload: {
          ...approvalItem().payload,
          decision,
        },
      });
      expect(projectCanonicalApprovalItem(item)?.response).toMatchObject({
        decision,
      });
    },
  );

  it.each([
    { itemId: "" },
    { status: "unknown" },
    { updatedAtMs: Number.NaN },
    { completedAtMs: Number.POSITIVE_INFINITY },
    { payload: { type: "approval" } },
    {
      payload: {
        type: "approval",
        request_id: "approval-1",
        action: null,
      },
    },
    {
      payload: {
        ...approvalItem().payload,
        available_decisions: ["allow_for_session"],
      },
    },
  ])("畸形 canonical approval fail closed: %o", (override) => {
    expect(projectCanonicalApprovalItem(approvalItem(override))).toBeNull();
  });

  it("忽略非 approval canonical item", () => {
    expect(
      projectCanonicalApprovalItem({
        itemId: "item-tool",
        payload: { type: "tool" },
      }),
    ).toBeNull();
  });
});
