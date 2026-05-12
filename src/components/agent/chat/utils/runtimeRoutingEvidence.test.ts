import { describe, expect, it } from "vitest";

import type { AgentRuntimeThreadReadModel } from "@/lib/api/agentRuntime";
import {
  buildRuntimeRoutingEvidenceLines,
  formatDiagnosticDurationMs,
  resolveRuntimeRoutingEvidence,
  type RuntimeRoutingEvidenceLineText,
} from "./runtimeRoutingEvidence";

const EN_LINE_TEXT: RuntimeRoutingEvidenceLineText = {
  decisionReason: "Decision reason",
  decisionSource: "Decision source",
  durationUnknown: "Duration unknown",
  evidenceSource: "Evidence source",
  fallbackChain: "Fallback chain",
  firstText: "First text",
  firstThinking: "First thinking",
  firstTokenMetrics: "First-token metrics",
  firstVisible: "First visible",
  none: "None",
  requestedModel: "Requested model",
  run: "Run",
  runUnknown: "Run unknown",
  selectedModel: "Response model",
  serviceModelSlot: "Service slot",
  settingsSource: "Settings source",
  unknown: "Unknown",
  unset: "Unset",
};

function threadRead(
  value: Partial<AgentRuntimeThreadReadModel>,
): AgentRuntimeThreadReadModel {
  return value as AgentRuntimeThreadReadModel;
}

describe("runtimeRoutingEvidence", () => {
  it("应从 latestModelDeltaTiming.routing 读取自动回退原因", () => {
    const evidence = resolveRuntimeRoutingEvidence(
      threadRead({
        model_routing: {
          latestModelDeltaTiming: {
            source: "agent_runs.metadata",
            runStatus: "success",
            durationMs: 1300,
            firstVisibleDeltaMs: "842",
            firstThinkingDeltaMs: 842,
            firstTextDeltaMs: 1299,
            routing: {
              decisionSource: "responsive_chat_auto",
              decisionReason:
                "service_models.responsive_chat 历史样本不满足低延迟目标。",
              fallbackChain: [
                "deepseek:deepseek-v4-pro",
                "deepseek:deepseek-v4-flash",
              ],
              serviceModelSlot: "responsive_chat",
              selectedProvider: "deepseek",
              selectedModel: "deepseek-v4-flash",
            },
          },
        },
      }),
    );

    expect(evidence).toMatchObject({
      shouldRender: true,
      decisionSource: "responsive_chat_auto",
      serviceModelSlot: "responsive_chat",
      selectedProvider: "deepseek",
      selectedModel: "deepseek-v4-flash",
      firstVisibleDeltaMs: 842,
      firstThinkingDeltaMs: 842,
      firstTextDeltaMs: 1299,
      runDurationMs: 1300,
      runStatus: "success",
      timingSource: "agent_runs.metadata",
    });
    expect(evidence.decisionReason).toContain("低延迟目标");
    expect(evidence.fallbackChain).toEqual([
      "deepseek:deepseek-v4-pro",
      "deepseek:deepseek-v4-flash",
    ]);
  });

  it("应优先使用 thread_read 顶层路由事实并生成复制文本", () => {
    const evidence = resolveRuntimeRoutingEvidence(
      threadRead({
        decision_source: "session_default",
        service_model_slot: "responsive_chat",
        model_routing: {
          decisionSource: "responsive_chat_auto",
          selectedProvider: "deepseek",
          selectedModel: "deepseek-v4-flash",
          latestModelDeltaTiming: {
            source: "agent_runs.metadata",
            firstTextDeltaMs: 1377,
            routing: {
              decisionSource: "request_override",
              selectedProvider: "other",
              selectedModel: "slow-model",
            },
          },
        },
      }),
    );

    expect(evidence.decisionSource).toBe("responsive_chat_auto");
    expect(evidence.serviceModelSlot).toBe("responsive_chat");
    expect(evidence.selectedProvider).toBe("deepseek");
    expect(evidence.selectedModel).toBe("deepseek-v4-flash");

    const lines = buildRuntimeRoutingEvidenceLines(evidence, EN_LINE_TEXT);
    expect(lines.join("\n")).toContain("Decision source: responsive_chat_auto");
    expect(lines.join("\n")).toContain(
      "Response model: deepseek/deepseek-v4-flash",
    );
    expect(lines.join("\n")).toContain("First text=1.38s");
    expect(lines.join("\n")).toContain("Evidence source: agent_runs.metadata");
  });

  it("应格式化毫秒和秒级耗时", () => {
    expect(formatDiagnosticDurationMs(842)).toBe("842ms");
    expect(formatDiagnosticDurationMs(1377)).toBe("1.38s");
    expect(formatDiagnosticDurationMs(12_345)).toBe("12.3s");
    expect(formatDiagnosticDurationMs(null)).toBeNull();
  });
});
