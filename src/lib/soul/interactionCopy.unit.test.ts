import { describe, expect, it } from "vitest";
import { resolveSoulInteractionCopy } from "./interactionCopy";

describe("resolveSoulInteractionCopy", () => {
  it("未启用 memory.soul 时保持中性本地交互文案", () => {
    const copy = resolveSoulInteractionCopy();

    expect(copy.preparingTitle).toBe("正在进入对话");
    expect(copy.initialDispatchWaiting).toBe("任务已进入处理队列…");
  });

  it("贱兮兮风格应影响本地等待态但不能复读固定口头禅", () => {
    const copy = resolveSoulInteractionCopy({
      soul: {
        enabled: true,
        style_profile_id: "cheeky_sassy_executor",
        style_intensity: "low",
      },
    });

    expect(copy.preparingTitle).toBe("接住了，正在开工");
    expect(copy.preparingDetail).toContain("掉链子");
    expect(copy.initialRuntimeDetail).toMatch(/别让流程.*抢戏/u);
    expect(copy.waitingRuntimeDetail).toContain("进展");
    expect(copy.initialDispatchWaiting).toBe("已进入队列，正在处理…");
    expect(copy.subagentsPreparingContent).toContain("分工理顺");
    expect(copy.failurePrefix).toBe("这步没跑顺：");

    const joined = [
      copy.preparingTitle,
      copy.preparingDetail,
      copy.initialRuntimeTitle,
      copy.initialRuntimeDetail,
      copy.waitingRuntimeTitle,
      copy.waitingRuntimeDetail,
      copy.initialDispatchWaiting,
      copy.subagentsPreparingContent,
      copy.failurePrefix,
    ].join("\n");
    expect(joined).not.toMatch(/小活儿|活儿|小队|Subagents|安排|别急|翻车/u);
  });

  it("高风险边界应回落到专业风格", () => {
    const copy = resolveSoulInteractionCopy({
      highRisk: true,
      soul: {
        enabled: true,
        style_profile_id: "cheeky_sassy_executor",
        style_intensity: "high",
      },
    });

    expect(copy.preparingTitle).toBe("正在进入对话");
    expect(copy.preparingDetail).not.toContain("安排");
  });

  it("拽酷风格应提供克制推进感的本地等待态", () => {
    const copy = resolveSoulInteractionCopy({
      soul: {
        enabled: true,
        style_profile_id: "cool_confident_operator",
        style_intensity: "low",
      },
    });

    expect(copy.preparingTitle).toBe("准备中");
    expect(copy.initialRuntimeDetail).toContain("先定路线");
    expect(copy.waitingRuntimeDetail).toContain("等待首个模型事件");
    expect(copy.subagentsPreparingContent).toContain("分工压稳");
    expect(copy.failurePrefix).toBe("这步失败：");
  });
});
