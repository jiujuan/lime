import { describe, expect, it } from "vitest";

import {
  FILE_CHANGE_BATCH_FACTS,
  FILE_CHANGE_BATCH_PATHS,
  FILE_CHANGE_BATCH_SCENARIO,
  clickFileChangeApprovalDecision,
  renderFileChangeGateBBackendScript,
  summarizeFileChangeBatches,
  validateExactFileChangeBatch,
  waitForFileChangeApprovalPending,
  waitForFileChangeTerminalGui,
  waitForFileChangeTerminalReadModel,
} from "./code-artifact-file-change-gate-b.mjs";

const THREAD_ID = "thread-file-change-gate-b";
const TURN_ID = "turn-file-change-gate-b";
const ITEM_ID = `code-artifact-file-change-batch:${TURN_ID}`;

function exactRead({
  turnStatus = "completed",
  itemStatus = "completed",
} = {}) {
  return {
    thread: {
      id: THREAD_ID,
      turns: [
        {
          id: TURN_ID,
          status: turnStatus,
          items: [
            {
              id: ITEM_ID,
              type: "fileChange",
              status: itemStatus,
              changes: FILE_CHANGE_BATCH_FACTS.map(({ path, kind, diff }) => ({
                path,
                kind: { ...kind },
                diff,
              })),
            },
          ],
        },
      ],
    },
  };
}

describe("code artifact FileChange Gate B helpers", () => {
  it("defines one exact Add/Delete/Update/Move batch", () => {
    expect(FILE_CHANGE_BATCH_SCENARIO).toBe("file-change-batch");
    expect(FILE_CHANGE_BATCH_FACTS).toHaveLength(4);
    expect(FILE_CHANGE_BATCH_FACTS.map((fact) => fact.operation)).toEqual([
      "add",
      "delete",
      "update",
      "move",
    ]);
    expect(FILE_CHANGE_BATCH_FACTS.map((fact) => fact.path)).toEqual([
      FILE_CHANGE_BATCH_PATHS.added,
      FILE_CHANGE_BATCH_PATHS.deleted,
      FILE_CHANGE_BATCH_PATHS.updated,
      FILE_CHANGE_BATCH_PATHS.moveSource,
    ]);
    expect(FILE_CHANGE_BATCH_FACTS[3].kind).toEqual({
      type: "update",
      move_path: FILE_CHANGE_BATCH_PATHS.moveDestination,
    });
    expect(FILE_CHANGE_BATCH_FACTS.every((fact) => fact.diff.length > 0)).toBe(
      true,
    );
  });

  it("renders pending, resolved, applied, decline and cancel backend branches", () => {
    const script = renderFileChangeGateBBackendScript();

    expect(script).toContain('input.kind === "turnStart"');
    expect(script).toContain('input.kind === "actionRespond"');
    expect(script).toContain('type: "action.required"');
    expect(script).toContain(
      'type: canceled ? "action.canceled" : "action.resolved"',
    );
    expect(script).toContain('type: "patch.started"');
    expect(script).toContain('type: "patch.applied"');
    expect(script).toContain('type: "patch.declined"');
    expect(script).not.toContain('type: "patch.failed"');
    expect(script).toContain('name: "apply_patch"');
    expect(script).toContain("value: JSON.stringify(fileChangeGateBChanges)");
    expect(script).toContain("fileChangeGateBFileItem(");
    expect(script).toContain('fileChangeGateBFileItem(itemId, "proposed", 2)');
    expect(script).toContain('allowed ? "applied" : "rejected"');
    expect(script).toContain('kind: "file"');
    expect(script).toContain('type: "file"');
    expect(script).toContain('fileStatus !== "proposed"');
    expect(script).toContain('status: terminal ? "completed" : "inProgress"');
    expect(script).toContain("fileChangeGateBToolItem");
    expect(script).toContain('kind: "tool"');
    expect(script).toContain(
      'canceled ? "cancelled" : allowed ? "completed" : "failed"',
    );
    expect(script).toContain('type: "turn.completed"');
    expect(script).toContain('type: "turn.canceled"');
    expect(script).toContain('type: "message.delta"');
    expect(script).toContain('phase: "final_answer"');
    expect(script).toContain('toolName: "apply_patch"');
    expect(script).not.toContain('failureCategory: "user_cancelled"');
    expect(script).toContain(JSON.stringify(FILE_CHANGE_BATCH_PATHS.added));
    expect(script).toContain(
      JSON.stringify(FILE_CHANGE_BATCH_PATHS.moveDestination),
    );
    expect(script).not.toContain("claw-chat-current-fixture-constants");
  });

  it("summarizes and validates the exact canonical batch", () => {
    const read = exactRead();
    expect(summarizeFileChangeBatches(read)).toEqual([
      expect.objectContaining({
        threadId: THREAD_ID,
        turnId: TURN_ID,
        itemId: ITEM_ID,
        status: "completed",
      }),
    ]);
    expect(
      validateExactFileChangeBatch(read, {
        threadId: THREAD_ID,
        turnId: TURN_ID,
        itemId: ITEM_ID,
        status: "completed",
      }),
    ).toMatchObject({ valid: true, errors: [], candidateCount: 1 });
  });

  it("rejects reordered or duplicated batches", () => {
    const reordered = exactRead();
    reordered.thread.turns[0].items[0].changes.reverse();
    const reorderedResult = validateExactFileChangeBatch(reordered, {
      turnId: TURN_ID,
      itemId: ITEM_ID,
    });
    expect(reorderedResult.valid).toBe(false);
    expect(reorderedResult.errors).toContain("change[0].path mismatch");

    const duplicated = exactRead();
    duplicated.thread.turns[0].items.push({
      ...duplicated.thread.turns[0].items[0],
    });
    const duplicatedResult = validateExactFileChangeBatch(duplicated, {
      turnId: TURN_ID,
      itemId: ITEM_ID,
    });
    expect(duplicatedResult.valid).toBe(false);
    expect(duplicatedResult.candidateCount).toBe(2);
  });

  it("waits for the matching approval and clicks an exact decision selector", async () => {
    const calls = [];
    const page = {
      evaluate: async (_pageFunction, arg) => {
        calls.push(arg);
        if (Object.hasOwn(arg, "promptText")) {
          return {
            visible: true,
            requestId: ITEM_ID,
            identityMatched: true,
            summaryText: "Apply the exact batch?",
            promptMatched: true,
            textareaVisible: false,
            buttons: {
              decline: { visible: true, disabled: false },
              cancel: { visible: true, disabled: false },
            },
          };
        }
        return {
          clicked: true,
          requestId: ITEM_ID,
          identityMatched: true,
          decision: arg.decision,
        };
      },
    };

    await expect(
      waitForFileChangeApprovalPending(
        page,
        { timeoutMs: 20, intervalMs: 0 },
        { itemId: ITEM_ID, prompt: "exact batch" },
      ),
    ).resolves.toMatchObject({ visible: true, requestId: ITEM_ID });
    await expect(
      clickFileChangeApprovalDecision(
        page,
        { timeoutMs: 20, intervalMs: 0 },
        "decline",
        { itemId: ITEM_ID },
      ),
    ).resolves.toMatchObject({ clicked: true, decision: "decline" });
    expect(calls.at(-1)).toEqual({
      decision: "decline",
      requestIds: [ITEM_ID],
    });
  });

  it.each([
    ["decline", "completed", "declined"],
    ["cancel", "interrupted", "inProgress"],
  ])(
    "waits for %s terminal identity and exact batch",
    async (decision, turnStatus, itemStatus) => {
      let invocationCount = 0;
      const invokeThreadRead = async (_page, params) => {
        invocationCount += 1;
        expect(params).toEqual({ threadId: THREAD_ID, includeTurns: true });
        if (invocationCount === 1) {
          return exactRead({
            turnStatus: "inProgress",
            itemStatus: "inProgress",
          });
        }
        return { result: exactRead({ turnStatus, itemStatus }) };
      };

      await expect(
        waitForFileChangeTerminalReadModel(
          {},
          { timeoutMs: 100, intervalMs: 1 },
          {
            threadId: THREAD_ID,
            turnId: TURN_ID,
            itemId: ITEM_ID,
            decision,
            invokeThreadRead,
          },
        ),
      ).resolves.toMatchObject({
        threadId: THREAD_ID,
        turnId: TURN_ID,
        turnStatus,
        itemId: ITEM_ID,
        expectedStatus: itemStatus,
        pendingItemIds: decision === "cancel" ? [ITEM_ID] : [],
        unexpectedPendingItemIds: [],
        validation: { valid: true },
      });
      expect(invocationCount).toBe(2);
    },
  );

  it("waits for one exact terminal GUI card", async () => {
    const page = {
      evaluate: async (_pageFunction, arg) => ({
        found: true,
        status: arg.expectedStatus,
        rowCount: 4,
        rowStatuses: Array(4).fill(arg.expectedStatus),
        rowTexts: arg.expectedPaths,
        expectedPathsPresent: true,
      }),
    };
    await expect(
      waitForFileChangeTerminalGui(
        page,
        { timeoutMs: 20, intervalMs: 0 },
        { status: "declined" },
      ),
    ).resolves.toMatchObject({
      found: true,
      status: "declined",
      rowCount: 4,
      expectedPathsPresent: true,
    });
  });

  it("reports actual card statuses when terminal GUI status does not match", async () => {
    const page = {
      evaluate: async () => ({
        found: false,
        status: "declined",
        cardCount: 1,
        cardStatuses: ["completed"],
        rowStatuses: [["completed"]],
      }),
    };
    await expect(
      waitForFileChangeTerminalGui(
        page,
        { timeoutMs: 1, intervalMs: 0 },
        { status: "declined" },
      ),
    ).rejects.toThrow('"cardStatuses":["completed"]');
  });

  it("fails fast for unsupported UI decisions", async () => {
    await expect(
      clickFileChangeApprovalDecision(
        {},
        { timeoutMs: 20, intervalMs: 0 },
        "approve-everything",
        { itemId: ITEM_ID },
      ),
    ).rejects.toThrow("Unsupported FileChange approval decision");
  });
});
