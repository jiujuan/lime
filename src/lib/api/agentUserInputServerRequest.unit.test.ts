import { describe, expect, it, vi } from "vitest";
import type { AppServerServerRequestHandler } from "./appServerServerRequest";
import {
  AgentUserInputServerRequestController,
  METHOD_ITEM_TOOL_REQUEST_USER_INPUT,
} from "./agentUserInputServerRequest";

function createHarness() {
  let handler:
    | AppServerServerRequestHandler<Record<string, unknown>, unknown>
    | undefined;
  const dispatcher = {
    register: vi.fn(
      (
        _method: string,
        next: AppServerServerRequestHandler<unknown, unknown>,
      ) => {
        handler = next as AppServerServerRequestHandler<
          Record<string, unknown>,
          unknown
        >;
        return () => {
          handler = undefined;
        };
      },
    ),
  };
  return {
    controller: new AgentUserInputServerRequestController(dispatcher),
    getHandler: () => handler,
  };
}

describe("AgentUserInputServerRequestController", () => {
  it("将 Codex requestUserInput 投影到现有问答 UI 并按 question id 回包", async () => {
    const harness = createHarness();
    const detach = harness.controller.attach();
    const promise = harness.getHandler()?.(
      {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-ask-1",
        questions: [
          {
            id: "mode",
            header: "模式",
            question: "请选择执行模式",
            isOther: false,
            isSecret: false,
            options: [
              { label: "自动", description: "直接继续" },
              { label: "确认", description: "再次确认" },
            ],
          },
        ],
        autoResolutionMs: null,
      },
      { id: "outer-1", method: METHOD_ITEM_TOOL_REQUEST_USER_INPUT },
      new AbortController().signal,
    );

    expect(harness.controller.getSnapshot()).toEqual([
      expect.objectContaining({
        requestId: "item-ask-1",
        actionType: "ask_user",
        prompt: "请选择执行模式",
      }),
    ]);
    expect(
      harness.controller.respond({
        requestId: "item-ask-1",
        actionType: "ask_user",
        confirmed: true,
        userData: { 请选择执行模式: "确认" },
      }),
    ).toBe(true);
    await expect(promise).resolves.toEqual({
      answers: { mode: { answers: ["确认"] } },
    });
    detach();
  });

  it("中止请求时以空 answers fail closed", async () => {
    const harness = createHarness();
    const detach = harness.controller.attach();
    const abort = new AbortController();
    const promise = harness.getHandler()?.(
      {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-ask-1",
        questions: [],
        autoResolutionMs: null,
      },
      { id: "outer-2", method: METHOD_ITEM_TOOL_REQUEST_USER_INPUT },
      abort.signal,
    );
    abort.abort();
    await expect(promise).resolves.toEqual({ answers: {} });
    expect(harness.controller.getSnapshot()).toEqual([]);
    detach();
  });
});
