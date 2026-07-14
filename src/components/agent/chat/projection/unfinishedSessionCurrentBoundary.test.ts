import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const UNFINISHED_SESSION_PROJECTION_SOURCES = [
  "src/components/agent/chat/projection/unfinishedSessionProjection.ts",
  "src/components/agent/chat/projection/unfinishedSessionProjection.test.ts",
] as const;

function readSource(relativePath: string): string {
  return readFileSync(join(cwd(), relativePath), "utf8");
}

describe("unfinished session projection current owner boundary", () => {
  it("会话列表 DTO 不得回绕 agentRuntime compat 根 barrel", () => {
    for (const relativePath of UNFINISHED_SESSION_PROJECTION_SOURCES) {
      expect(readSource(relativePath), relativePath).not.toContain(
        'from "@/lib/api/agentRuntime"',
      );
    }
  });

  it("会话列表 DTO 必须直接从 sessionTypes 获取", () => {
    expect(
      readSource(
        "src/components/agent/chat/projection/unfinishedSessionProjection.ts",
      ),
    ).toContain('from "@/lib/api/agentRuntime/sessionTypes"');
  });
});
