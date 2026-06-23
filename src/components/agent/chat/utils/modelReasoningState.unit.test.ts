import { describe, expect, it } from "vitest";
import type { AgentThreadItem } from "@/lib/api/agentProtocol";

import {
  buildModelReasoningState,
  hydrateAgentReasoningState,
  hydrateAgentReasoningStateFromThreadItems,
} from "./modelReasoningState";

describe("modelReasoningState", () => {
  it("应从 model.effective payload 归一模型和推理档位", () => {
    expect(
      buildModelReasoningState({
        model: {
          providerId: "openai",
          modelId: "gpt-codex",
          variant: "high",
        },
        reasoning: {
          supported: true,
          requestedLevel: "high",
          effectiveLevel: "high",
        },
      }),
    ).toEqual({
      model: {
        providerId: "openai",
        modelId: "gpt-codex",
        variant: "high",
      },
      reasoning: {
        supported: true,
        requestedLevel: "high",
        effectiveLevel: "high",
        downgradeReason: undefined,
      },
    });
  });

  it("不支持 reasoning 时不伪造 effective level", () => {
    expect(
      buildModelReasoningState({
        model: {
          provider_id: "local",
          model_id: "plain-chat",
        },
        reasoning: {
          supported: false,
          requested_level: "high",
          downgrade_reason: "selected model does not support reasoning",
        },
      }),
    ).toEqual({
      model: {
        providerId: "local",
        modelId: "plain-chat",
      },
      reasoning: {
        supported: false,
        requestedLevel: "high",
        effectiveLevel: undefined,
        downgradeReason: "selected model does not support reasoning",
      },
    });
  });

  it("应覆盖多模型 reasoning 能力 payload fixture", () => {
    const fixtures = [
      {
        label: "Codex/OpenAI",
        providerId: "openai",
        modelId: "gpt-codex",
        level: "high",
      },
      {
        label: "Anthropic",
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5",
        level: "high",
      },
      {
        label: "Gemini",
        providerId: "google",
        modelId: "gemini-2.5-pro",
        level: "medium",
      },
      {
        label: "OpenAI-compatible",
        providerId: "openai-compatible",
        modelId: "o3-mini",
        level: "xhigh",
      },
    ] as const;

    for (const fixture of fixtures) {
      expect(
        buildModelReasoningState({
          modelRef: {
            provider_id: fixture.providerId,
            model_id: fixture.modelId,
          },
          reasoning: {
            supported: true,
            requested_level: fixture.level,
            effective_level: fixture.level,
          },
        }),
        fixture.label,
      ).toEqual({
        model: {
          providerId: fixture.providerId,
          modelId: fixture.modelId,
        },
        reasoning: {
          supported: true,
          requestedLevel: fixture.level,
          effectiveLevel: fixture.level,
          downgradeReason: undefined,
        },
      });
    }
  });

  it("应从 model.effective 顶层字段归一模型引用", () => {
    expect(
      buildModelReasoningState({
        provider: "anthropic",
        modelName: "claude-opus",
        requestedReasoningEffort: "x-high",
        reasoning: {
          supported: true,
          effective_level: "x_high",
        },
      }),
    ).toMatchObject({
      model: {
        providerId: "anthropic",
        modelId: "claude-opus",
      },
      reasoning: {
        supported: true,
        requestedLevel: "xhigh",
        effectiveLevel: "xhigh",
      },
    });
  });

  it("应从历史 reasoning thread item 水合完成态", () => {
    const items: AgentThreadItem[] = [
      {
        id: "reasoning-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 1,
        status: "completed",
        started_at: "2026-06-23T00:00:00.000Z",
        completed_at: "2026-06-23T00:00:01.000Z",
        updated_at: "2026-06-23T00:00:01.000Z",
        type: "reasoning",
        text: "先理解目标。",
        metadata: {
          provider_metadata: {
            backend: "codex",
            signature: "thinking-signature",
          },
        },
      },
    ];

    expect(hydrateAgentReasoningStateFromThreadItems(items)).toEqual({
      reasoning: {
        supported: true,
        status: "completed",
        reasoningId: "reasoning-1",
        text: "先理解目标。",
      },
    });
  });

  it("历史 reasoning provider metadata 不应改变 reasoning 运行态", () => {
    const items: AgentThreadItem[] = [
      {
        id: "reasoning-active",
        thread_id: "thread-1",
        turn_id: "turn-1",
        sequence: 1,
        status: "in_progress",
        started_at: "2026-06-23T00:00:00.000Z",
        updated_at: "2026-06-23T00:00:01.000Z",
        type: "reasoning",
        text: "正在压缩上下文。",
        metadata: {
          provider_metadata: {
            backend: "anthropic",
            signature: "provider-thinking-signature",
          },
        },
      },
    ];

    expect(hydrateAgentReasoningStateFromThreadItems(items)).toEqual({
      reasoning: {
        supported: true,
        status: "running",
        reasoningId: "reasoning-active",
        text: "正在压缩上下文。",
      },
    });
  });

  it("model.effective 不应单独伪造 reasoning 运行态", () => {
    expect(
      hydrateAgentReasoningState({
        events: [
          {
            type: "model_effective",
            provider: "openai-compatible",
            modelName: "gpt-4o-mini",
            requestedReasoningEffort: "high",
            reasoning: {
              supported: false,
              requestedLevel: "high",
              downgradeReason: "selected model does not support reasoning",
            },
          },
        ],
      }),
    ).toEqual({
      model: {
        providerId: "openai-compatible",
        modelId: "gpt-4o-mini",
      },
      reasoning: {
        supported: false,
        requestedLevel: "high",
        effectiveLevel: undefined,
        downgradeReason: "selected model does not support reasoning",
        status: "idle",
        reasoningId: undefined,
        text: undefined,
      },
    });
  });

  it("应把 model.effective 与 reasoning lifecycle event 水合为同一个状态", () => {
    expect(
      hydrateAgentReasoningState({
        events: [
          {
            type: "model_effective",
            provider: "openai",
            modelName: "gpt-codex",
            requestedReasoningEffort: "high",
            reasoning: {
              supported: true,
              requestedLevel: "high",
              effectiveLevel: "high",
            },
          },
          {
            type: "reasoning_started",
            reasoningId: "runtime-thinking",
          },
          {
            type: "reasoning_delta",
            reasoningId: "runtime-thinking",
            text: "先理解",
          },
          {
            type: "reasoning_delta",
            reasoningId: "runtime-thinking",
            text: "理解目标",
          },
          {
            type: "reasoning_final",
            reasoningId: "runtime-thinking",
            text: "先理解目标",
          },
          {
            type: "reasoning_ended",
            reasoningId: "runtime-thinking",
            status: "completed",
          },
        ],
      }),
    ).toEqual({
      model: {
        providerId: "openai",
        modelId: "gpt-codex",
      },
      reasoning: {
        supported: true,
        status: "completed",
        requestedLevel: "high",
        effectiveLevel: "high",
        downgradeReason: undefined,
        reasoningId: "runtime-thinking",
        text: "先理解目标",
      },
    });
  });
});
