import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const SOURCE = "src/components/agent/chat/utils/codeFixPrompt.ts";

function readSource(): string {
  return readFileSync(join(cwd(), SOURCE), "utf8");
}

describe("code fix prompt current owner boundary", () => {
  it("文件快照摘要不得回绕 agentRuntime compat 根 barrel", () => {
    expect(readSource()).not.toContain('from "@/lib/api/agentRuntime"');
  });

  it("文件快照摘要必须直接从 sessionTypes 获取", () => {
    expect(readSource()).toContain(
      'from "@/lib/api/agentRuntime/sessionTypes"',
    );
  });
});
