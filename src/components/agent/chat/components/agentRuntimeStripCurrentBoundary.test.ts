import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const SOURCE = "src/components/agent/chat/components/AgentRuntimeStrip.tsx";

function readSource(): string {
  return readFileSync(join(cwd(), SOURCE), "utf8");
}

describe("agent runtime strip current owner boundary", () => {
  it("运行时状态条不得回绕 agentRuntime compat 根 barrel", () => {
    expect(readSource()).not.toContain('from "@/lib/api/agentRuntime"');
  });

  it("execution、subagent 和文件快照 DTO 必须直接指向 current owner", () => {
    const source = readSource();

    expect(source).toContain('from "@/lib/api/agentExecutionRuntime"');
    expect(source).toContain('from "@/lib/api/agentRuntime/sessionTypes"');
  });
});
