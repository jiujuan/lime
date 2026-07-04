import type { AsterExecutionStrategy } from "@/lib/api/agentRuntime";
import type {
  AgentContextTraceStep as ContextTraceStep,
  AgentRuntimeStatusMetadata,
} from "@/lib/api/agentProtocol";
import type { AgentRuntimeStatus } from "../types";
import { resolveAgentRuntimeErrorPresentation } from "./agentRuntimeErrorPresentation";
import type { SoulInteractionCopy } from "@/lib/soul/interactionCopy";
import { resolveSoulInteractionCopy } from "@/lib/soul/interactionCopy";

export function buildDiagnosticsRuntimeStatusMetadata(
  extra?: AgentRuntimeStatusMetadata,
): AgentRuntimeStatusMetadata {
  return {
    sourceType: "runtime_status",
    source: "runtime_status",
    surface: "runtime_status",
    visibility: "diagnostics",
    persistence: "transient",
    agentui: {
      eventClass: "run.status",
      surface: "runtime_status",
      visibility: "diagnostics",
    },
    ...extra,
  };
}

function normalizeRuntimeErrorDetail(errorMessage: string): string {
  return resolveAgentRuntimeErrorPresentation(errorMessage).displayMessage;
}

export function buildInitialAgentRuntimeStatus(options: {
  executionStrategy: AsterExecutionStrategy;
  skipUserMessage?: boolean;
  soulCopy?: SoulInteractionCopy;
}): AgentRuntimeStatus {
  const copy = options.soulCopy ?? resolveSoulInteractionCopy();
  const checkpoints = [
    ...copy.initialRuntimeCheckpoints,
    options.skipUserMessage ? "系统引导请求" : "用户请求已入队",
  ];

  return {
    phase: "preparing",
    title: copy.initialRuntimeTitle,
    detail: copy.initialRuntimeDetail,
    checkpoints,
    metadata: buildDiagnosticsRuntimeStatusMetadata(),
  };
}

export function buildWaitingAgentRuntimeStatus(options: {
  executionStrategy: AsterExecutionStrategy;
  soulCopy?: SoulInteractionCopy;
}): AgentRuntimeStatus {
  void options.executionStrategy;
  const copy = options.soulCopy ?? resolveSoulInteractionCopy();

  return {
    phase: "routing",
    title: copy.waitingRuntimeTitle,
    detail: copy.waitingRuntimeDetail,
    checkpoints: copy.waitingRuntimeCheckpoints,
    metadata: buildDiagnosticsRuntimeStatusMetadata(),
  };
}

export function buildContextRuntimeStatus(
  steps: ContextTraceStep[],
): AgentRuntimeStatus {
  const latestStep = steps[steps.length - 1];
  const checkpoints = steps
    .slice(-3)
    .map((step) => `${step.stage} · ${step.detail}`);

  return {
    phase: "context",
    title: "正在整理相关信息",
    detail: latestStep
      ? `${latestStep.stage}：${latestStep.detail}`
      : "正在整理相关信息，以便给出更准确的结果。",
    checkpoints,
  };
}

export function buildActionResumeRuntimeStatus(): AgentRuntimeStatus {
  return {
    phase: "routing",
    title: "已收到补充信息，继续处理中",
    detail: "补充信息已加入当前流程，正在继续后续步骤。",
    checkpoints: ["补充信息已确认", "已恢复当前流程", "等待下一条进展"],
  };
}

export function buildFailedAgentRuntimeStatus(
  errorMessage: string,
): AgentRuntimeStatus {
  return {
    phase: "failed",
    title: "当前处理失败",
    detail: normalizeRuntimeErrorDetail(errorMessage),
    checkpoints: [
      "已保留当前阶段记录",
      "可修正问题后重试",
      "如需继续可补充更明确的输入",
    ],
  };
}

export function buildFailedAgentMessageContent(
  errorMessage: string,
  partialContent?: string,
  soulCopy: SoulInteractionCopy = resolveSoulInteractionCopy(),
): string {
  const failureText = `${soulCopy.failurePrefix}${normalizeRuntimeErrorDetail(errorMessage)}`;
  const trimmedPartialContent = partialContent?.trim();
  return trimmedPartialContent
    ? `${trimmedPartialContent}\n\n${failureText}`
    : failureText;
}

export function formatAgentRuntimeStatusSummary(
  status?: AgentRuntimeStatus | null,
): string {
  if (!status?.title) {
    return "正在准备处理";
  }

  const lines = [status.title.trim()];
  if (status.detail?.trim()) {
    lines.push(status.detail.trim());
  }

  return lines.join("\n\n");
}
