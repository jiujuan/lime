import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const PLUGIN_HISTORY_SESSION_SELECTION_SOURCES = [
  "src/features/plugin/history/pluginHistorySessionSelection.ts",
  "src/features/plugin/history/pluginHistorySessionSelection.unit.test.ts",
] as const;

function readSource(relativePath: string): string {
  return readFileSync(join(cwd(), relativePath), "utf8");
}

describe("plugin history session selection current owner boundary", () => {
  it("插件历史会话选择不得回绕 agentRuntime compat 根 barrel", () => {
    for (const relativePath of PLUGIN_HISTORY_SESSION_SELECTION_SOURCES) {
      const source = readSource(relativePath);

      expect(source, relativePath).not.toContain(
        'from "@/lib/api/agentRuntime"',
      );
    }
  });

  it("会话 DTO 必须直接从 sessionTypes 获取", () => {
    expect(
      readSource(
        "src/features/plugin/history/pluginHistorySessionSelection.ts",
      ),
    ).toContain('from "@/lib/api/agentRuntime/sessionTypes"');
  });
});
