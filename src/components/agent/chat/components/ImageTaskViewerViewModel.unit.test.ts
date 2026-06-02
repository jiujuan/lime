import { beforeEach, describe, expect, it } from "vitest";

import { changeLimeLocale, getLimeI18n } from "@/i18n/createI18n";

import {
  buildFollowUpCommand,
  orderTaskOutputsByTaskOutputIds,
  resolveEmptyStateDescription,
  resolveFollowUpLabel,
  resolveImageUnavailableDescription,
  resolveImageUnavailableTitle,
  resolveLayoutLabel,
  resolveModeEyebrow,
  resolveOutputDisplayIndexForLabel,
  resolveOutputGridClassName,
  resolveOutputTileAspectClass,
  resolveRuntimeContractBadge,
  resolveRuntimeContractPolicyLabel,
  resolveRuntimeContractRegistryLabel,
  resolveSelectedOutputLabel,
  resolveSelectedStoryboardSlot,
  resolveSourceLabel,
  resolveSourcePlaceholderLabel,
  resolveStatusLabel,
  resolveStatusTone,
  resolveStoryboardSlotLabel,
} from "./ImageTaskViewerViewModel";

describe("ImageTaskViewerViewModel", () => {
  beforeEach(async () => {
    await changeLimeLocale("zh-CN");
  });

  it("应在中文 locale 下输出稳定文案", () => {
    const i18n = getLimeI18n();
    const t = i18n.getFixedT(null, "agent");

    expect(resolveModeEyebrow("variation", t)).toBe("图片重绘");
    expect(resolveSourceLabel("variation", t)).toBe("参考图");
  });

  it("应按任务 outputIds 归并输出并保留剩余项", () => {
    const outputs = [
      { id: "output-3", taskId: "task-1" },
      { id: "output-2", taskId: "task-1" },
      { id: "output-1", taskId: "task-1" },
      { id: "output-x", taskId: "task-1" },
    ] as never;

    const ordered = orderTaskOutputsByTaskOutputIds(
      { outputIds: ["output-1", "output-2"] } as never,
      outputs,
    );

    expect(ordered.map((item) => item.id)).toEqual([
      "output-1",
      "output-2",
      "output-3",
      "output-x",
    ]);
  });

  it("应收敛 mode / status / 槽位与布局展示决策", () => {
    const i18n = getLimeI18n();
    const t = i18n.getFixedT(null, "agent");

    expect(resolveFollowUpLabel("edit", t)).toBe(
      "继续修图",
    );
    expect(resolveLayoutLabel("storyboard_3x3", t)).toBe(
      "3x3 分镜",
    );
    expect(
      resolveOutputGridClassName({
        layoutHint: "storyboard_3x3",
        outputCount: 9,
      }),
    ).toBe("grid-cols-3");
    expect(resolveOutputTileAspectClass("storyboard_3x3")).toBe(
      "aspect-square",
    );
    expect(
      resolveSelectedOutputLabel({
        selectedIndex: 2,
        outputCount: 3,
        layoutHint: "storyboard_3x3",
        t,
      }),
    ).toBe("已选第 3 格");
    expect(
      resolveStoryboardSlotLabel({
        layoutHint: "storyboard_3x3",
        outputIndex: 1,
        slotIndex: 2,
        slotLabel: "",
        taskSlotLabel: "第 2 格",
        t,
      }),
    ).toBe("第 2 格");
    expect(resolveOutputDisplayIndexForLabel(0, 3)).toBe(3);
    expect(resolveStatusLabel("running", "variation", t)).toBe(
      "重绘中",
    );
    expect(resolveStatusTone("error")).toContain("rose");
    expect(resolveEmptyStateDescription("queued", "", "generate", t)).toBe(
      "图片任务已经提交，正在等待服务分配执行槽位。",
    );
    expect(resolveImageUnavailableTitle("complete", "generate", t)).toBe(
      "图片暂时无法显示",
    );
    expect(resolveImageUnavailableDescription("edit", t)).toBe(
      "修图结果已经返回，但当前预览地址暂时无法加载。",
    );
    expect(resolveSourcePlaceholderLabel("variation", "error", t)).toBe(
      "参考图暂时无法显示",
    );
  });

  it("应收敛运行合同、策略标签和 follow up 命令", () => {
    const i18n = getLimeI18n();
    const t = i18n.getFixedT(null, "agent");

    expect(
      resolveRuntimeContractBadge(
        {
          contractKey: "image_generation",
          routingOutcome: "blocked",
          failureCode: "image_generation_model_capability_gap",
        } as never,
        t,
      ),
    ).toMatchObject({
      label: "运行合同阻止 · image_generation_model_capability_gap",
      tone: "border-amber-200 bg-amber-50 text-amber-800",
    });
    expect(
      resolveRuntimeContractRegistryLabel(
        {
          modelCapabilityAssessmentSource: "model_registry",
          modelSupportsImageGeneration: false,
        } as never,
        t,
      ),
    ).toBe("模型能力来自 model_registry · 不支持图片生成");
    expect(
      resolveRuntimeContractPolicyLabel({
        limecorePolicyEvaluationStatus: "input_gap",
        limecorePolicyEvaluationDecision: "ask",
        limecorePolicyEvaluationPendingRefs: ["model_catalog"],
      } as never),
    ).toBe("LimeCore 策略输入待命中: 1");
    expect(
      buildFollowUpCommand({
        mode: "edit",
        outputRef: "img-1",
        prompt: "去掉背景里的路人",
      }),
    ).toBe("@修图 #img-1 去掉背景里的路人");
  });

  it("应为选中分镜生成稳定的 storyboard 选择信息", () => {
    const i18n = getLimeI18n();
    const t = i18n.getFixedT(null, "agent");

    const selected = resolveSelectedStoryboardSlot({
      task: {
        layoutHint: "storyboard_3x3",
        storyboardSlots: [
          {
            slotId: "slot-1",
            slotIndex: 1,
            label: "第 1 格",
            prompt: "开场",
          },
        ],
      } as never,
      output: {
        slotIndex: 1,
        slotLabel: "",
        slotPrompt: "",
      } as never,
      outputIndex: 0,
      t,
    });

    expect(selected).toEqual({
      slotIndex: 1,
      label: "第 1 格",
      prompt: "开场",
    });
  });
});
