#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function runVitest(label, args) {
  console.log(`\n[smoke:agent-service-skill-entry] > ${label}`);
  const result = spawnSync(
    npmCommand,
    ["exec", "--", "vitest", "run", ...args],
    {
      cwd: rootDir,
      stdio: "inherit",
      env: process.env,
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    const error = new Error(
      `[smoke:agent-service-skill-entry] ${label} 失败`,
    );
    error.exitCode = result.status;
    throw error;
  }
}

function runCargoTest(label, args) {
  console.log(`\n[smoke:agent-service-skill-entry] > ${label}`);
  const result = spawnSync("cargo", ["test", ...args], {
    cwd: path.join(rootDir, "src-tauri"),
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    const error = new Error(
      `[smoke:agent-service-skill-entry] ${label} 失败`,
    );
    error.exitCode = result.status;
    throw error;
  }
}

function main() {
  runVitest("Skill Forge 前端 metadata 与工作台显式启用链路", [
    "src/lib/api/capabilityDrafts.test.ts",
    "src/lib/api/agentRuntime/inventoryClient.test.ts",
    "src/components/agent/chat/utils/workspaceSkillBindingsMetadata.test.ts",
    "src/components/agent/chat/utils/harnessRequestMetadata.test.ts",
    "src/features/capability-drafts/workspaceSkillAgentAutomationDraft.test.ts",
  ]);

  [
    "register_capability_draft_persists_readonly_http_preflight_provenance",
    "registered_skill_becomes_ready_for_manual_enable_binding_candidate",
    "explicit_runtime_enable_projects_ready_binding_allowlist",
    "registered_skill_without_verification_provenance_is_blocked",
    "execute_capability_draft_controlled_get_returns_evidence_without_persisting_inputs",
    "should_project_workspace_skill_runtime_enable_as_callable_scope",
    "allowlisted_session_should_preserve_workspace_skill_source_metadata",
    "disabled_session_should_fail_execute",
  ].forEach((testName) => {
    runCargoTest(`Skill Forge Rust 定向测试: ${testName}`, [
      "--manifest-path",
      "Cargo.toml",
      testName,
      "--",
      "--exact",
    ]);
  });

  runVitest("服务技能入口路由与挂起参数", [
    "src/components/skills/SkillsWorkspacePage.test.tsx",
    "src/components/agent/chat/workspace/useWorkspaceServiceSkillEntryActions.test.tsx",
    "src/components/agent/chat/index.shell-routing.test.tsx",
    "src/components/AppPageContent.test.tsx",
  ]);

  runVitest("Agent 对话内 A2UI 挂起主链", [
    "src/components/agent/chat/index.test.tsx",
    "--hookTimeout=180000",
    "-t",
    "AgentChatPage 服务技能 A2UI|AgentChatPage 当前 A2UI 事实源",
  ]);

  console.log("\n[smoke:agent-service-skill-entry] 通过");
}

main();
