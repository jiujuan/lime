import { describe, expect, it } from "vitest";
import { resolveSoulInteractionCopy } from "@/lib/soul/interactionCopy";
import {
  buildFailedAgentMessageContent,
  buildInitialAgentRuntimeStatus,
  buildWaitingAgentRuntimeStatus,
} from "./agentRuntimeStatus";

describe("agentRuntimeStatus", () => {
  it("默认失败恢复文案保持中性前缀", () => {
    expect(buildFailedAgentMessageContent("provider failed")).toBe(
      "执行失败：provider failed",
    );
  });

  it("失败恢复文案可应用 memory.soul 当前交互口吻", () => {
    const copy = resolveSoulInteractionCopy({
      soul: {
        enabled: true,
        style_profile_id: "cheeky_sassy_executor",
        style_intensity: "low",
      },
    });

    expect(
      buildFailedAgentMessageContent("provider failed", undefined, copy),
    ).toBe("这步没跑顺：provider failed");
  });

  it("初始和等待运行态可应用 memory.soul 当前交互口吻", () => {
    const copy = resolveSoulInteractionCopy({
      soul: {
        enabled: true,
        style_profile_id: "cheeky_sassy_executor",
        style_intensity: "low",
      },
    });

    expect(
      buildInitialAgentRuntimeStatus({
        executionStrategy: "react",
        soulCopy: copy,
      }),
    ).toMatchObject({
      title: "正在看需求",
      detail: expect.stringMatching(/别让流程.*抢戏/u),
    });
    expect(
      buildWaitingAgentRuntimeStatus({
        executionStrategy: "react",
        soulCopy: copy,
      }),
    ).toMatchObject({
      title: "正在启动处理",
      detail: expect.stringContaining("进展"),
    });
  });
});
