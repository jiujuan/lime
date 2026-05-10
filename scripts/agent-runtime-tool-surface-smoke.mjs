#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runVitestSmoke } from "./lib/vitest-smoke-runner.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function runVitest(label, args) {
  return runVitestSmoke({
    rootDir,
    label,
    args,
    logPrefix: "smoke:agent-runtime-tool-surface",
  });
}

function main() {
  runVitest("runtime tool surface 派生与应用层透传", [
    "src/components/agent/chat/utils/runtimeToolAvailability.test.ts",
    "src/components/agent/chat/components/AgentRuntimeStrip.test.tsx",
    "src/components/agent/chat/components/EmptyState.test.tsx",
    "src/components/agent/chat/components/HarnessStatusPanel.test.tsx",
    "--hookTimeout=60000",
    "-t",
    "runtime tool surface",
  ]);

  runVitest("runtime inventory 主链透传", [
    "src/components/agent/chat/workspace/useWorkspaceHarnessInventoryRuntime.test.tsx",
    "src/components/agent/chat/components/EmptyStateComposerPanel.test.tsx",
    "src/components/agent/chat/workspace/useWorkspaceConversationSceneRuntime.test.ts",
  ]);

  console.log(
    '[smoke:agent-runtime-tool-surface] surface.summary: runtime inventory/strip/harness inventory 已一致透传；unsafeToolExposed=false; sources=runtime_tools|persisted_tools|default_policy',
  );
  console.log("\n[smoke:agent-runtime-tool-surface] 通过");
}

main();
