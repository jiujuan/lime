import { describe, expect, it } from "vitest";

import {
  extractLatestProposedPlanItems,
  parseProposedPlanItems,
  splitProposedPlanSegments,
  stripProposedPlanBlocks,
} from "./proposedPlan";

describe("proposedPlan", () => {
  it("应提取计划块并保留前后文本顺序", () => {
    expect(
      splitProposedPlanSegments(
        "前言\n<proposed_plan>\n- 第一步\n- 第二步\n</proposed_plan>\n结尾",
      ),
    ).toEqual([
      { type: "text", content: "前言\n" },
      {
        type: "plan",
        content: "- 第一步\n- 第二步",
        isComplete: true,
      },
      { type: "text", content: "\n结尾" },
    ]);
  });

  it("未闭合的计划块应视为流式中的进行中计划", () => {
    expect(
      splitProposedPlanSegments("开始\n<proposed_plan>\n- 调研\n- 整理"),
    ).toEqual([
      { type: "text", content: "开始\n" },
      {
        type: "plan",
        content: "- 调研\n- 整理",
        isComplete: false,
      },
    ]);
  });

  it("应能移除计划块得到可见正文", () => {
    expect(
      stripProposedPlanBlocks(
        "before\n<proposed_plan>\n- step\n</proposed_plan>\nafter",
      ),
    ).toBe("before\nafter");
  });

  it("应把 proposed_plan markdown 拆成结构化计划项", () => {
    expect(parseProposedPlanItems("- 调研现状\n- 接入前端\n- 跑通 E2E")).toEqual([
      { text: "调研现状", status: "in_progress" },
      { text: "接入前端", status: "pending" },
      { text: "跑通 E2E", status: "pending" },
    ]);
  });

  it("应按 markdown checklist 恢复计划项状态", () => {
    expect(
      parseProposedPlanItems("- [x] 读取任务区域\n- [ ] 恢复运行计划\n- [-] 执行验证"),
    ).toEqual([
      { text: "读取任务区域", status: "completed" },
      { text: "恢复运行计划", status: "pending" },
      { text: "执行验证", status: "in_progress" },
    ]);
  });

  it("应兼容历史 fixture 中的字面换行", () => {
    expect(
      extractLatestProposedPlanItems(
        "说明\n<proposed_plan>确认计划模式请求进入 App Server\\n- 输出结构化 proposed_plan\\n- 验证右侧计划轨显示</proposed_plan>",
      ),
    ).toEqual([
      { text: "确认计划模式请求进入 App Server", status: "in_progress" },
      { text: "输出结构化 proposed_plan", status: "pending" },
      { text: "验证右侧计划轨显示", status: "pending" },
    ]);
  });
});
