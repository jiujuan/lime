import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppServerServerRequestHandler } from "./appServerServerRequest";
import {
  AgentApprovalServerRequestController,
  METHOD_ITEM_COMMAND_EXECUTION_REQUEST_APPROVAL,
  METHOD_ITEM_FILE_CHANGE_REQUEST_APPROVAL,
} from "./agentApprovalServerRequest";

function createHarness() {
  const handlers = new Map<
    string,
    AppServerServerRequestHandler<Record<string, unknown>, unknown>
  >();
  const dispatcher = {
    register: vi.fn(
      (
        method: string,
        next: AppServerServerRequestHandler<unknown, unknown>,
      ) => {
        handlers.set(
          method,
          next as AppServerServerRequestHandler<
            Record<string, unknown>,
            unknown
          >,
        );
        return () => {
          handlers.delete(method);
        };
      },
    ),
  };
  return {
    controller: new AgentApprovalServerRequestController(dispatcher),
    dispatcher,
    getHandler: (method: string) => handlers.get(method),
  };
}

describe("AgentApprovalServerRequestController", () => {
  afterEach(() => vi.restoreAllMocks());

  it("将 Codex command approval request 投影为现有 ActionRequired", async () => {
    const harness = createHarness();
    const detach = harness.controller.attach();
    const request = {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-command-1",
      approvalId: "approval-1",
      startedAtMs: 1_783_860_000_000,
      command: "npm test",
      reason: "需要执行测试",
      availableDecisions: ["accept", "acceptForSession", "decline", "cancel"],
    } as const;
    const promise = harness.getHandler(
      METHOD_ITEM_COMMAND_EXECUTION_REQUEST_APPROVAL,
    )?.(
      request,
      { id: "outer-1", method: METHOD_ITEM_COMMAND_EXECUTION_REQUEST_APPROVAL },
      new AbortController().signal,
    );

    expect(harness.controller.getSnapshot()).toEqual([
      expect.objectContaining({
        requestId: "approval-1",
        actionType: "tool_confirmation",
        toolName: "exec_command",
        prompt: "需要执行测试",
        arguments: { command: "npm test" },
        availableDecisions: [
          "allow_once",
          "allow_for_session",
          "decline",
          "cancel",
        ],
      }),
    ]);

    expect(
      harness.controller.respond({
        requestId: "approval-1",
        actionType: "tool_confirmation",
        confirmed: true,
        decision: "allow_for_session",
      }),
    ).toBe(true);
    await expect(promise).resolves.toEqual({ decision: "acceptForSession" });
    expect(harness.controller.getSnapshot()).toEqual([]);
    detach();
  });

  it("请求中止时 fail closed 为 Cancel 并清理 pending", async () => {
    const harness = createHarness();
    const detach = harness.controller.attach();
    const abort = new AbortController();
    const promise = harness.getHandler(
      METHOD_ITEM_COMMAND_EXECUTION_REQUEST_APPROVAL,
    )?.(
      {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-command-1",
        startedAtMs: 1,
      },
      { id: "outer-2", method: METHOD_ITEM_COMMAND_EXECUTION_REQUEST_APPROVAL },
      abort.signal,
    );

    abort.abort();
    await expect(promise).resolves.toEqual({ decision: "cancel" });
    expect(harness.controller.getSnapshot()).toEqual([]);
    detach();
  });

  it("将 Codex file change approval 绑定到 apply_patch item", async () => {
    const harness = createHarness();
    const detach = harness.controller.attach();
    const promise = harness.getHandler(
      METHOD_ITEM_FILE_CHANGE_REQUEST_APPROVAL,
    )?.(
      {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-file-1",
        startedAtMs: 1,
        reason: "允许修改文件？",
        grantRoot: null,
      },
      { id: "outer-file", method: METHOD_ITEM_FILE_CHANGE_REQUEST_APPROVAL },
      new AbortController().signal,
    );

    expect(harness.controller.getSnapshot()).toEqual([
      expect.objectContaining({
        requestId: "item-file-1",
        actionType: "tool_confirmation",
        toolName: "apply_patch",
        prompt: "允许修改文件？",
      }),
    ]);
    expect(
      harness.controller.respond({
        requestId: "item-file-1",
        actionType: "tool_confirmation",
        decision: "allow_once",
      }),
    ).toBe(true);
    await expect(promise).resolves.toEqual({ decision: "accept" });
    detach();
  });
});
