import { describe, expect, it } from "vitest";
import {
  applyModelChangeExecutionRuntime,
  applyTurnContextExecutionRuntime,
} from "./sessionExecutionRuntimeProjection";

describe("sessionExecutionRuntimeProjection", () => {
  it("缺少 session_id 时不应产生 execution runtime", () => {
    const runtime = applyTurnContextExecutionRuntime(null, {
      type: "turn_context",
      session_id: "",
      thread_id: "thread-1",
      turn_id: "turn-1",
      output_schema_runtime: {
        source: "turn",
        strategy: "native",
        providerName: "openai",
        modelName: "gpt-5.4",
      },
    });

    expect(runtime).toBeNull();
  });

  it("应从 turn_context 投影当前 Turn 的模型、schema 与运行状态", () => {
    const runtime = applyTurnContextExecutionRuntime(null, {
      type: "turn_context",
      session_id: "session-1",
      thread_id: "thread-1",
      turn_id: "turn-1",
      execution_strategy: "code_orchestrated" as never,
      output_schema_runtime: {
        source: "turn",
        strategy: "native",
        providerName: "openai",
        modelName: "gpt-5.4",
      },
    });

    expect(runtime).toMatchObject({
      session_id: "session-1",
      source: "turn_context",
      provider_name: "openai",
      model_name: "gpt-5.4",
      execution_strategy: "react",
      latest_turn_id: "turn-1",
      latest_turn_status: "running",
    });
  });

  it("应在 model_change 后保留 Turn schema 并更新模型", () => {
    const fromTurnContext = applyTurnContextExecutionRuntime(null, {
      type: "turn_context",
      session_id: "session-2",
      thread_id: "thread-2",
      turn_id: "turn-2",
      output_schema_runtime: {
        source: "session",
        strategy: "final_output_tool",
        providerName: "openai",
        modelName: "gpt-5.4",
      },
    });

    const runtime = applyModelChangeExecutionRuntime(fromTurnContext, {
      type: "model_change",
      model: "gpt-5.4-mini",
      mode: "responses",
    });

    expect(runtime).toMatchObject({
      session_id: "session-2",
      source: "model_change",
      provider_name: "openai",
      model_name: "gpt-5.4-mini",
      mode: "responses",
      latest_turn_id: "turn-2",
      latest_turn_status: "running",
    });
    expect(runtime?.output_schema_runtime?.strategy).toBe("final_output_tool");
  });
});
