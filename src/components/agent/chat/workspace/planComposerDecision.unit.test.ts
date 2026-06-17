import { describe, expect, it } from "vitest";

import type { ActionRequired } from "../types";
import {
  filterPlanComposerDecisionFromPendingActions,
  isPlanComposerDecision,
  selectLatestPlanComposerDecision,
} from "./planComposerDecision";

function createAction(
  overrides: Partial<ActionRequired> = {},
): ActionRequired {
  return {
    requestId: "request-1",
    actionType: "ask_user",
    status: "pending",
    questions: [{ question: "Proceed with the plan?" }],
    ...overrides,
  };
}

describe("planComposerDecision", () => {
  it("应识别 Codex plan approval 的 request_user_input 文案", () => {
    expect(isPlanComposerDecision(createAction())).toBe(true);
  });

  it("应识别计划审批 metadata", () => {
    expect(
      isPlanComposerDecision(
        createAction({
          prompt: "Please confirm",
          questions: [{ question: "Continue?" }],
          arguments: {
            proposed_plan: "# Plan\n- Step",
          },
        }),
      ),
    ).toBe(true);
  });

  it("已提交的计划确认不应继续附着到输入框", () => {
    expect(
      isPlanComposerDecision(
        createAction({
          status: "submitted",
        }),
      ),
    ).toBe(false);
  });

  it("工具确认不应被当成 plan composer 决策", () => {
    expect(
      isPlanComposerDecision(
        createAction({
          actionType: "tool_confirmation",
          toolName: "Bash",
          prompt: "Proceed with the plan?",
        }),
      ),
    ).toBe(false);
  });

  it("普通 ask_user 不应被挪到输入框区域", () => {
    expect(
      isPlanComposerDecision(
        createAction({
          prompt: "请选择执行环境",
          questions: [{ question: "请选择部署环境" }],
        }),
      ),
    ).toBe(false);
  });

  it("应选择最新的 plan composer 决策", () => {
    const first = createAction({ requestId: "plan-1" });
    const second = createAction({
      requestId: "plan-2",
      questions: [{ question: "实施此计划？" }],
    });

    expect(selectLatestPlanComposerDecision([first, second])).toBe(second);
  });

  it("过滤 pendingActions 时只移除被选中的计划确认", () => {
    const plan = createAction({ requestId: "plan-1" });
    const other = createAction({
      requestId: "ask-1",
      prompt: "请选择环境",
      questions: [{ question: "部署到哪里？" }],
    });

    expect(
      filterPlanComposerDecisionFromPendingActions([plan, other], plan),
    ).toEqual([other]);
  });
});
