import type { AsterExecutionStrategy } from "@/lib/api/agentRuntime";
import type {
  AgentContextTraceStep as ContextTraceStep,
  AgentRuntimeStatusMetadata,
} from "@/lib/api/agentProtocol";
import type { AgentRuntimeStatus } from "../types";
import { resolveAgentRuntimeErrorPresentation } from "./agentRuntimeErrorPresentation";

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

function buildExecutionLabel(strategy: AsterExecutionStrategy): string {
  void strategy;
  return "对话执行";
}

function normalizeRuntimeErrorDetail(errorMessage: string): string {
  return resolveAgentRuntimeErrorPresentation(errorMessage).displayMessage;
}

export function buildInitialAgentRuntimeStatus(options: {
  executionStrategy: AsterExecutionStrategy;
  skipUserMessage?: boolean;
}): AgentRuntimeStatus {
  const checkpoints = [
    buildExecutionLabel(options.executionStrategy),
    "工具由模型按需判断",
    "推理强度由模型按任务复杂度判断",
    options.skipUserMessage ? "系统引导请求" : "用户请求已入队",
  ];

  return {
    phase: "preparing",
    title: "正在准备处理",
    detail: "正在理解你的需求并准备当前阶段。",
    checkpoints,
    metadata: buildDiagnosticsRuntimeStatusMetadata(),
  };
}

export function buildWaitingAgentRuntimeStatus(options: {
  executionStrategy: AsterExecutionStrategy;
}): AgentRuntimeStatus {
  const checkpoints = [
    "会话已建立",
    buildExecutionLabel(options.executionStrategy),
    "先理解意图，再由模型决定工具使用",
    "等待首个模型事件",
  ];

  return {
    phase: "routing",
    title: "正在启动处理流程",
    detail: "已开始处理，正在准备环境并等待第一条进展。",
    checkpoints,
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
): string {
  const failureText = `执行失败：${normalizeRuntimeErrorDetail(errorMessage)}`;
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
