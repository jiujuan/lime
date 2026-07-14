import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const PLUGIN_HISTORY_RESTORE_SOURCES = [
  "src/components/agent/chat/workspace/workspacePluginHistoryRestoreRuntime.ts",
  "src/components/agent/chat/workspace/workspacePluginHistoryRestoreRuntime.unit.test.ts",
  "src/components/agent/chat/workspace/useWorkspacePluginHistoryRestoreRuntime.test.tsx",
  "src/components/agent/chat/workspace/useWorkspacePluginHistoryRestoreRuntime.tsx",
] as const;

function readSource(relativePath: string): string {
  return readFileSync(join(cwd(), relativePath), "utf8");
}

describe("workspace plugin history restore current owner boundary", () => {
  it("Plugin History Restore 不得回绕 agentRuntime compat 根 barrel", () => {
    for (const relativePath of PLUGIN_HISTORY_RESTORE_SOURCES) {
      expect(readSource(relativePath), relativePath).not.toContain(
        'from "@/lib/api/agentRuntime"',
      );
    }
  });

  it("canonical thread read-model DTO 必须直接从 sessionTypes 获取", () => {
    expect(
      readSource(
        "src/components/agent/chat/workspace/workspacePluginHistoryRestoreRuntime.ts",
      ),
    ).toContain('from "@/lib/api/agentRuntime/sessionTypes"');
  });
});
