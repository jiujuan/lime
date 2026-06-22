#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runVitestSmoke } from "../lib/vitest-smoke-runner.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const LOG_PREFIX = "smoke:agent-runtime-current-fixture";

function runVitest(label, args) {
  return runVitestSmoke({
    rootDir,
    label,
    args,
    logPrefix: LOG_PREFIX,
    env: {
      LIME_ALLOW_LIVE_PROVIDER_SMOKE: "0",
      LIME_REAL_API_TEST: "0",
    },
  });
}

function runNodeSmoke(label, args) {
  const startedAt = Date.now();

  console.log(`\n[${LOG_PREFIX}] > ${label}`);
  const result = spawnSync(process.execPath, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      LIME_ALLOW_LIVE_PROVIDER_SMOKE: "0",
      LIME_REAL_API_TEST: "0",
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    const error = new Error(`[${LOG_PREFIX}] ${label} 失败`);
    error.exitCode = result.status;
    throw error;
  }

  return {
    label,
    status: "pass",
    durationMs: Date.now() - startedAt,
    args,
  };
}

function main() {
  runVitest("Agent 历史/缓存终态恢复", [
    "src/components/agent/chat/hooks/agentChatHistory.test.ts",
    "src/components/agent/chat/hooks/agentSessionScopedStorage.test.ts",
  ]);

  runVitest("Agent 流式完成与运行态收尾", [
    "src/components/agent/chat/hooks/agentStreamCompletionController.test.ts",
    "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts",
    "-t",
    "final_done|usage|工具",
  ]);

  runVitest("Claw 消息列表终态 UI", [
    "src/components/agent/chat/components/MessageList.test.tsx",
    "-t",
    "远端 failed runtimeStatus|完成态 assistant 有正文|assistant 已有正文且仍在发送时",
  ]);

  runVitest("Electron/App Server fixture smoke guard", [
    "scripts/electron/session-history-fixture-smoke.test.mjs",
    "scripts/electron/code-artifact-workbench-fixture-smoke.test.mjs",
    "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs",
  ]);

  runNodeSmoke("Coding Workbench Electron fixture", [
    "scripts/electron/code-artifact-workbench-fixture-smoke.mjs",
    "--scenario",
    "gui-coding-input",
    "--prefix",
    "code-artifact-workbench-gui-coding-input-regression",
    "--timeout-ms",
    "180000",
  ]);

  runNodeSmoke("Claw 停止后同会话继续输出 Electron fixture", [
    "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs",
    "--scenario",
    "cancel-then-continue",
    "--prefix",
    "claw-chat-current-fixture-cancel-then-continue-regression",
    "--timeout-ms",
    "180000",
  ]);

  runNodeSmoke("Claw Skills Runtime natural + explicit $skill + Skills workspace try Electron fixture", [
    "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs",
    "--scenario",
    "skills-runtime",
    "--prefix",
    "claw-chat-current-fixture-skills-runtime-regression",
    "--timeout-ms",
    "180000",
  ]);

  runNodeSmoke("Claw MCP structuredContent Agent Chat GUI Electron fixture", [
    "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs",
    "--scenario",
    "mcp-structured-content",
    "--prefix",
    "claw-chat-current-fixture-mcp-structured-content-regression",
    "--timeout-ms",
    "180000",
  ]);

  runNodeSmoke("Claw Expert Skills Runtime declared + selected + invoked Electron fixture", [
    "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs",
    "--scenario",
    "expert-skills-runtime",
    "--prefix",
    "claw-chat-current-fixture-expert-skills-runtime-regression",
    "--timeout-ms",
    "180000",
  ]);

  runNodeSmoke("Claw Expert Plaza Skills Runtime click-through Electron fixture", [
    "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs",
    "--scenario",
    "expert-plaza-skills-runtime",
    "--prefix",
    "claw-chat-current-fixture-expert-plaza-skills-runtime-regression",
    "--timeout-ms",
    "180000",
  ]);

  runNodeSmoke("Claw Expert Panel Skills Runtime override Electron fixture", [
    "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs",
    "--scenario",
    "expert-panel-skills-runtime",
    "--prefix",
    "claw-chat-current-fixture-expert-panel-skills-runtime-regression",
    "--timeout-ms",
    "180000",
  ]);

  console.log(
    `[${LOG_PREFIX}] summary: current Agent Runtime fixture regression 已覆盖 history/cache hydration、final_done 工具收尾、failed read model、Claw 终态 UI、Electron fixture guard、真实 GUI coding 输入到 Coding Workbench Electron fixture、Claw GUI current fixture guard、停止后同会话继续输出 Electron fixture、Skills Runtime natural + 显式 $skill + 技能中心试用入口三入口按需加载 Electron fixture、MCP structuredContent 到 Agent Chat GUI 可见 Electron fixture、Expert Skills Runtime declared + selected + invoked Electron fixture、Expert Plaza 点击专家卡片进入同一 Skills Runtime 闭环 Electron fixture、ExpertInfoPanel 调整 skillRefs 后下一轮继承同一 Skills Runtime 闭环并展示 Evidence Pack 复盘 Electron fixture；liveProviderUsed=false`,
  );
  console.log(`\n[${LOG_PREFIX}] 通过`);
}

main();
