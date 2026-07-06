/* global process */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

const VENDOR_CONTEXT_MGMT_PATH =
  "lime-rs/vendor/aster-rust/crates/aster/src/context_mgmt/mod.rs";
const VENDOR_AGENT_PATH =
  "lime-rs/vendor/aster-rust/crates/aster/src/agents/agent.rs";
const CURRENT_CONTEXT_PROJECTION_PATH =
  "lime-rs/crates/agent/src/protocol_context_projection.rs";
const CURRENT_MODEL_POLICY_PATH =
  "lime-rs/crates/agent/src/model_request_policy.rs";
const APP_SERVER_TURN_CONTEXT_PATH =
  "lime-rs/crates/app-server/src/runtime_backend/request_context/turn_context.rs";
const APP_SERVER_MEMORY_PROMPT_PATH =
  "lime-rs/crates/app-server/src/runtime/memory_prompt.rs";
const APP_SERVER_AUTO_COMPACTION_PATH =
  "lime-rs/crates/app-server/src/runtime/context_auto_compaction.rs";

const VENDOR_CONTEXT_POLICY_FORBIDDEN_SNIPPETS = [
  "auto_compact_token_limit",
  "autoCompactTokenLimit",
  "active_context_tokens",
  "activeContextTokens",
  "model_context_window",
  "modelContextWindow",
  "context_policy",
  "contextPolicy",
  "context_usage",
  "contextUsage",
  "history_usage",
  "historyUsage",
  "token_usage",
  "tokenUsage",
  "auto_compact_due",
  "autoCompactDue",
  "tokens_until_compaction",
  "context_window_token_status",
  "check_auto_compaction_status",
  "AutoCompactionStatus",
  "AutoCompactionTrigger",
  "ModelAutoCompactTokenLimit",
];

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("Aster context policy migration boundary", () => {
  it("context / auto-compact budget owner 必须在 Lime current 主链", () => {
    const contextProjectionSource = readRepoFile(
      CURRENT_CONTEXT_PROJECTION_PATH,
    );
    const modelPolicySource = readRepoFile(CURRENT_MODEL_POLICY_PATH);
    const appServerTurnContextSource = readRepoFile(
      APP_SERVER_TURN_CONTEXT_PATH,
    );
    const appServerMemoryPromptSource = readRepoFile(
      APP_SERVER_MEMORY_PROMPT_PATH,
    );
    const appServerAutoCompactionSource = readRepoFile(
      APP_SERVER_AUTO_COMPACTION_PATH,
    );

    expect(modelPolicySource).toContain(
      "pub struct ModelContextPolicySnapshot",
    );
    expect(modelPolicySource).toContain("auto_compact_token_limit");
    expect(modelPolicySource).toContain("model_context_window");
    expect(appServerTurnContextSource).toContain(
      "LIME_RUNTIME_CONTEXT_POLICY_KEY",
    );
    expect(appServerTurnContextSource).toContain(
      "lime_runtime_context_policy_from_metadata",
    );
    expect(appServerMemoryPromptSource).toContain(
      "prompt_context_budget_policy_from_metadata",
    );
    expect(appServerAutoCompactionSource).toContain(
      "maybe_auto_compact_before_turn",
    );
    expect(appServerAutoCompactionSource).toContain("auto_context_limit");
    expect(appServerAutoCompactionSource).toContain("activeContextTokens");
    expect(appServerAutoCompactionSource).toContain(
      "latest_usage_after_latest_compaction",
    );
    expect(contextProjectionSource).toContain(
      "build_context_budget_from_lime_runtime",
    );
    expect(contextProjectionSource).toContain(
      "project_turn_context_summary_with_active_context_tokens",
    );
    expect(contextProjectionSource).toContain("auto_compact_token_limit");
    expect(contextProjectionSource).toContain("context_usage");
    expect(contextProjectionSource).toContain("auto_compact_due");
    expect(contextProjectionSource).toContain("model_context_window");
    expect(contextProjectionSource).not.toContain(
      "fn is_turn_auto_compact_due",
    );
  });

  it("vendor Aster 不得重新承接 selected model context policy / token-limit 规则", () => {
    const vendorContextSource = readRepoFile(VENDOR_CONTEXT_MGMT_PATH);
    const vendorAgentSource = readRepoFile(VENDOR_AGENT_PATH);
    const vendorContextLeaks = VENDOR_CONTEXT_POLICY_FORBIDDEN_SNIPPETS.filter(
      (snippet) => vendorContextSource.includes(snippet),
    ).map((snippet) => `${VENDOR_CONTEXT_MGMT_PATH}: ${snippet}`);
    const vendorAgentLeaks = VENDOR_CONTEXT_POLICY_FORBIDDEN_SNIPPETS.filter(
      (snippet) => vendorAgentSource.includes(snippet),
    ).map((snippet) => `${VENDOR_AGENT_PATH}: ${snippet}`);

    expect(
      vendorContextLeaks,
      "context / auto-compact token-limit 新规则必须归属 Lime current owner；vendor Aster context_mgmt 只能保留迁移期旧 threshold 行为，不得解析 selected model context_policy",
    ).toEqual([]);
    expect(
      vendorAgentLeaks,
      "Aster Agent 只能作为兼容执行器；不得在 provider loop 中重新实现 selected model context / auto-compact policy",
    ).toEqual([]);
  });
});
