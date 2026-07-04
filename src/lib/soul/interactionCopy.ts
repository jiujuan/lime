import type { MemorySoulConfig } from "@/lib/api/memoryConfigTypes";
import { normalizeSoulConfig } from "./soulConfig";
import { resolveSoulStyleProfile } from "./style-profiles";
import type { SoulStyleProfileContext, SoulStyleTone } from "./style-profiles";

export interface SoulInteractionCopyOptions extends SoulStyleProfileContext {
  soul?: MemorySoulConfig | null;
}

export interface SoulInteractionCopy {
  preparingTitle: string;
  preparingDetail: string;
  preparingCheckpoints: string[];
  initialRuntimeTitle: string;
  initialRuntimeDetail: string;
  initialRuntimeCheckpoints: string[];
  waitingRuntimeTitle: string;
  waitingRuntimeDetail: string;
  waitingRuntimeCheckpoints: string[];
  initialDispatchWaiting: string;
  subagentsReadyTitle: string;
  subagentsReadyContent: (teamLabel: string) => string;
  subagentsPreparingContent: string;
  failurePrefix: string;
}

const NEUTRAL_COPY: SoulInteractionCopy = {
  preparingTitle: "正在进入对话",
  preparingDetail: "已收到输入，正在后台准备会话和执行环境。",
  preparingCheckpoints: [
    "对话执行待命",
    "工具面由模型按需判断",
    "推理强度由模型按任务复杂度判断",
  ],
  initialRuntimeTitle: "正在准备处理",
  initialRuntimeDetail: "正在理解你的需求并准备当前阶段。",
  initialRuntimeCheckpoints: [
    "对话执行",
    "工具由模型按需判断",
    "推理强度由模型按任务复杂度判断",
  ],
  waitingRuntimeTitle: "正在启动处理流程",
  waitingRuntimeDetail: "已开始处理，正在准备环境并等待第一条进展。",
  waitingRuntimeCheckpoints: [
    "会话已建立",
    "对话执行",
    "先理解意图，再由模型决定工具使用",
    "等待首个模型事件",
  ],
  initialDispatchWaiting: "任务已进入处理队列…",
  subagentsReadyTitle: "协作执行已准备好",
  subagentsReadyContent: (teamLabel) =>
    `已为这项任务准备「${teamLabel}」。\n\n这些任务会分别展开处理，关键进展和结果会回到主对话。`,
  subagentsPreparingContent: "正在准备协作执行，关键进展和结果会回到主对话。",
  failurePrefix: "执行失败：",
};

const PROFILE_COPY: Record<SoulStyleTone, SoulInteractionCopy> = {
  cheeky_sassy: {
    preparingTitle: "接住了，正在开工",
    preparingDetail: "我先把会话和执行环境理顺，别一上来就让流程掉链子。",
    preparingCheckpoints: [
      "对话执行已待命",
      "工具面按任务需要选择",
      "推理强度按复杂度调整",
    ],
    initialRuntimeTitle: "正在看需求",
    initialRuntimeDetail: "先判断该直接答，还是需要动用工具，别让流程出来抢戏。",
    initialRuntimeCheckpoints: [
      "对话执行已待命",
      "工具面按任务需要选择",
      "推理强度按复杂度调整",
    ],
    waitingRuntimeTitle: "正在启动处理",
    waitingRuntimeDetail: "环境已经开始跑了，等第一条进展回来再说硬话。",
    waitingRuntimeCheckpoints: [
      "会话已建立",
      "对话执行已待命",
      "先理解意图，再决定工具使用",
      "等待首个模型事件",
    ],
    initialDispatchWaiting: "已进入队列，正在处理…",
    subagentsReadyTitle: "协作执行已就位",
    subagentsReadyContent: (teamLabel) =>
      `已为这项任务准备「${teamLabel}」。\n\n会分头推进，关键进展和结果会回到主对话。`,
    subagentsPreparingContent: "正在准备协作执行，先把分工理顺。",
    failurePrefix: "这步没跑顺：",
  },
  warm_supportive: {
    preparingTitle: "已开始准备",
    preparingDetail: "我会稳稳处理，正在准备会话和执行环境。",
    preparingCheckpoints: [
      "对话执行已待命",
      "工具面会按需要选择",
      "推理强度会随任务复杂度调整",
    ],
    initialRuntimeTitle: "已开始准备",
    initialRuntimeDetail: "我会稳稳处理，正在理解你的需求。",
    initialRuntimeCheckpoints: [
      "对话执行已待命",
      "工具面会按需要选择",
      "推理强度会随任务复杂度调整",
    ],
    waitingRuntimeTitle: "正在稳稳启动",
    waitingRuntimeDetail: "已开始处理，正在准备环境并等待第一条进展。",
    waitingRuntimeCheckpoints: [
      "会话已建立",
      "对话执行已待命",
      "会先理解意图，再按需选择工具",
      "等待首个模型事件",
    ],
    initialDispatchWaiting: "任务已进入队列，我会稳稳处理…",
    subagentsReadyTitle: "协作执行已准备好",
    subagentsReadyContent: (teamLabel) =>
      `已为这项任务准备「${teamLabel}」。\n\n这些任务会分头推进，关键进展和结果会回到主对话。`,
    subagentsPreparingContent: "正在准备协作执行，我会把关键进展带回主对话。",
    failurePrefix: "这一步处理失败：",
  },
  cool_confident: {
    preparingTitle: "准备中",
    preparingDetail: "会话和执行环境正在就位，先把起步动作压稳。",
    preparingCheckpoints: [
      "对话执行待命",
      "工具按任务需要选择",
      "推理强度按复杂度调整",
    ],
    initialRuntimeTitle: "正在判断路径",
    initialRuntimeDetail: "先定路线：能直接答就直接答，需要工具就调用工具。",
    initialRuntimeCheckpoints: [
      "对话执行待命",
      "工具按任务需要选择",
      "推理强度按复杂度调整",
    ],
    waitingRuntimeTitle: "流程已启动",
    waitingRuntimeDetail: "环境已就位，等待首个模型事件。",
    waitingRuntimeCheckpoints: [
      "会话已建立",
      "对话执行待命",
      "先理解意图，再决定工具使用",
      "等待首个模型事件",
    ],
    initialDispatchWaiting: "已进入队列，开始处理…",
    subagentsReadyTitle: "协作执行已就位",
    subagentsReadyContent: (teamLabel) =>
      `已为这项任务准备「${teamLabel}」。\n\n任务会分头推进，关键进展和结果回到主对话。`,
    subagentsPreparingContent: "正在准备协作执行，先把分工压稳。",
    failurePrefix: "这步失败：",
  },
  calm_professional: NEUTRAL_COPY,
};

export function resolveSoulInteractionCopy(
  options: SoulInteractionCopyOptions = {},
): SoulInteractionCopy {
  const soul = normalizeSoulConfig(options.soul);
  if (!soul.enabled) {
    return NEUTRAL_COPY;
  }

  const resolved = resolveSoulStyleProfile({
    styleProfileId: soul.style_profile_id,
    styleIntensity: soul.style_intensity,
    highRisk: options.highRisk,
    dangerousOperation: options.dangerousOperation,
    formalArtifact: options.formalArtifact,
  });
  if (resolved.bypassInteractionStyle) {
    return NEUTRAL_COPY;
  }

  return PROFILE_COPY[resolved.profile.tone] ?? NEUTRAL_COPY;
}
