import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const SOURCE = "src/lib/agent/legacySceneAppExecutionSummary.ts";

function readSource(relativePath: string): string {
  return readFileSync(join(cwd(), relativePath), "utf8");
}

describe("legacy SceneApp execution summary current owner boundary", () => {
  it("只读摘要不得回绕 agentRuntime compat 根 barrel", () => {
    const source = readSource(SOURCE);

    expect(source).not.toContain('from "@/lib/api/agentRuntime"');
  });

  it("review decision DTO 必须直接从 evidenceTypes 获取", () => {
    expect(readSource(SOURCE)).toContain(
      'from "@/lib/api/agentRuntime/evidenceTypes"',
    );
  });
});
