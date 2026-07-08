import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import {
  resolveSoulInteractionCopy,
  resolveSoulInteractionCopyDescriptors,
  type SoulCopyDescriptor,
  type SoulInteractionCopyDescriptors,
} from "./interactionCopy";

const LOCALES = ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"] as const;
const REQUIRED_COPY_KEYS = [
  "agentChat.soulInteraction.neutral.preparing.title",
  "agentChat.soulInteraction.neutral.preparing.detail",
  "agentChat.soulInteraction.neutral.preparing.checkpoints.0",
  "agentChat.soulInteraction.neutral.preparing.checkpoints.1",
  "agentChat.soulInteraction.neutral.preparing.checkpoints.2",
  "agentChat.soulInteraction.neutral.initialRuntime.title",
  "agentChat.soulInteraction.neutral.initialRuntime.detail",
  "agentChat.soulInteraction.neutral.initialRuntime.checkpoints.0",
  "agentChat.soulInteraction.neutral.initialRuntime.checkpoints.1",
  "agentChat.soulInteraction.neutral.initialRuntime.checkpoints.2",
  "agentChat.soulInteraction.neutral.waitingRuntime.title",
  "agentChat.soulInteraction.neutral.waitingRuntime.detail",
  "agentChat.soulInteraction.neutral.waitingRuntime.checkpoints.0",
  "agentChat.soulInteraction.neutral.waitingRuntime.checkpoints.1",
  "agentChat.soulInteraction.neutral.waitingRuntime.checkpoints.2",
  "agentChat.soulInteraction.neutral.waitingRuntime.checkpoints.3",
  "agentChat.soulInteraction.neutral.initialDispatch.waiting",
  "agentChat.collaboration.runtime.readyTitle",
  "agentChat.collaboration.runtime.readyContent",
  "agentChat.collaboration.runtime.preparingContent",
  "agentChat.collaboration.runtime.defaultTeamLabel",
  "agentChat.collaboration.runtime.memberFallbackLabel",
  "agentChat.collaboration.runtime.memberFallbackSummary",
  "agentChat.collaboration.runtime.memberOverflow",
  "agentChat.collaboration.runtime.memberPlanLine",
  "agentChat.collaboration.runtime.readyLeadFallback",
  "agentChat.collaboration.runtime.readyTailFallback",
  "agentChat.collaboration.runtime.summaryLine",
  "agentChat.collaboration.runtime.planIntro",
  "agentChat.collaboration.runtime.readyDetailFallback",
  "agentChat.collaboration.runtime.readyCheckpoint.currentConfig",
  "agentChat.collaboration.runtime.readyCheckpoint.assignedCount",
  "agentChat.collaboration.runtime.readyCheckpoint.syncProgress",
  "agentChat.collaboration.runtime.waitingTitle",
  "agentChat.collaboration.runtime.waitingDetailFallback",
  "agentChat.collaboration.runtime.waitingCheckpoint.firstPlanFallback",
  "agentChat.collaboration.runtime.waitingCheckpoint.starting",
  "agentChat.collaboration.runtime.failedTitle",
  "agentChat.collaboration.runtime.failedDetailFallback",
  "agentChat.collaboration.runtime.failedContent",
  "agentChat.collaboration.runtime.formingTitle",
  "agentChat.collaboration.runtime.formingDetail",
  "agentChat.collaboration.runtime.formingCheckpoint.intent",
  "agentChat.collaboration.runtime.formingCheckpoint.prepare",
  "agentChat.collaboration.runtime.formingCheckpoint.waiting",
  "agentChat.runtime.failure.prefix",
] as const;

function allDescriptors(
  descriptors: SoulInteractionCopyDescriptors,
): SoulCopyDescriptor[] {
  return [
    descriptors.preparingTitle,
    descriptors.preparingDetail,
    ...descriptors.preparingCheckpoints,
    descriptors.initialRuntimeTitle,
    descriptors.initialRuntimeDetail,
    ...descriptors.initialRuntimeCheckpoints,
    descriptors.waitingRuntimeTitle,
    descriptors.waitingRuntimeDetail,
    ...descriptors.waitingRuntimeCheckpoints,
    descriptors.initialDispatchWaiting,
    descriptors.subagentsReadyTitle,
    descriptors.subagentsReadyContent("内容团队"),
    descriptors.subagentsPreparingContent,
    descriptors.failurePrefix,
  ];
}

describe("resolveSoulInteractionCopy", () => {
  it("未启用 memory.soul 时保持中性本地交互文案", () => {
    const copy = resolveSoulInteractionCopy();

    expect(copy.preparingTitle).toBe("正在进入对话");
    expect(copy.initialDispatchWaiting).toBe("任务已进入处理队列…");
    expect(copy.descriptors.preparingTitle).toMatchObject({
      key: "soulInteraction.neutral.preparing.title",
      toneVariant: "neutral",
      riskLevel: "normal",
      styleLevel: "L1",
    });
  });

  it("启用贱兮兮风格时本地文案仍保持中性，只通过 descriptor 传递风格元数据", () => {
    const copy = resolveSoulInteractionCopy({
      soul: {
        enabled: true,
        style_profile_id: "cheeky_sassy_executor",
        style_intensity: "low",
      },
    });

    expect(copy.preparingTitle).toBe("正在进入对话");
    expect(copy.preparingDetail).toBe(
      "已收到输入，正在后台准备会话和执行环境。",
    );
    expect(copy.failurePrefix).toBe("执行失败：");
    expect(copy.descriptors.preparingTitle).toMatchObject({
      key: "soulInteraction.neutral.preparing.title",
      toneVariant: "cheeky_sassy",
      profileId: "cheeky_sassy_executor",
      packId: "com.lime.soul.cheeky-sassy-executor",
      riskLevel: "normal",
      styleLevel: "L1",
    });
  });

  it("高风险边界应回落到专业元数据和 L4 失败恢复", () => {
    const copy = resolveSoulInteractionCopy({
      highRisk: true,
      soul: {
        enabled: true,
        style_profile_id: "cheeky_sassy_executor",
        style_intensity: "high",
      },
    });

    expect(copy.preparingTitle).toBe("正在进入对话");
    expect(copy.descriptors.preparingTitle).toMatchObject({
      key: "soulInteraction.neutral.preparing.title",
      toneVariant: "neutral",
      profileId: "calm_professional_partner",
      riskLevel: "high",
    });
    expect(copy.descriptors.failurePrefix).toMatchObject({
      key: "runtime.failure.prefix",
      toneVariant: "neutral",
      profileId: "calm_professional_partner",
      riskLevel: "high",
      styleLevel: "L4",
    });
  });

  it("descriptor 不应回退到按风格分叉的本地句库 key", () => {
    const descriptors = resolveSoulInteractionCopyDescriptors({
      soul: {
        enabled: true,
        style_profile_id: "cool_confident_operator",
        style_intensity: "low",
      },
    });

    expect(allDescriptors(descriptors).map((item) => item.key)).toEqual(
      expect.arrayContaining([
        "soulInteraction.neutral.preparing.title",
        "soulInteraction.neutral.waitingRuntime.title",
        "collaboration.runtime.readyContent",
        "runtime.failure.prefix",
      ]),
    );
    expect(
      allDescriptors(descriptors).filter((item) =>
        item.key.startsWith("soulInteraction."),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "soulInteraction.neutral.preparing.title",
        }),
      ]),
    );
    expect(descriptors.waitingRuntimeTitle).toMatchObject({
      toneVariant: "cool_confident",
      profileId: "cool_confident_operator",
    });
  });

  it("协作执行内容应保留插值 facts 和风格元数据", () => {
    const copy = resolveSoulInteractionCopy({
      soul: {
        enabled: true,
        style_profile_id: "warm_supportive_companion",
        style_intensity: "medium",
      },
    });

    expect(copy.subagentsReadyContent("内容团队")).toContain("内容团队");
    expect(copy.descriptors.subagentsReadyContent("内容团队")).toMatchObject({
      key: "collaboration.runtime.readyContent",
      values: { teamLabel: "内容团队" },
      toneVariant: "warm_supportive",
      profileId: "warm_supportive_companion",
      surface: "collaboration_runtime",
      phase: "collaboration_ready",
    });
  });

  it("五语言资源只保留 neutral key，不引入 profile 句库", () => {
    const styleKeyPattern =
      /^agentChat\.soulInteraction\.(cheeky_sassy|warm_supportive|cool_confident|calm_professional)\./u;

    for (const locale of LOCALES) {
      const resource = JSON.parse(
        readFileSync(
          join(cwd(), "src/i18n/resources", locale, "agent.json"),
          "utf8",
        ),
      ) as Record<string, unknown>;
      for (const key of REQUIRED_COPY_KEYS) {
        expect(resource[key], `${locale} missing ${key}`).toBeTypeOf("string");
      }
      expect(
        Object.keys(resource).filter((key) => styleKeyPattern.test(key)),
      ).toEqual([]);
    }
  });
});
