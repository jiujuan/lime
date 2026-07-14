import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const SOURCES = [
  "src/components/agent/chat/utils/fileChangesUndo.ts",
  "src/components/agent/chat/utils/fileChangesUndo.unit.test.ts",
] as const;

function readSource(relativePath: string): string {
  return readFileSync(join(cwd(), relativePath), "utf8");
}

describe("file changes undo current owner boundary", () => {
  it("文件快照命令与 mock 不得回绕 agentRuntime compat 根 barrel", () => {
    for (const relativePath of SOURCES) {
      expect(readSource(relativePath), relativePath).not.toContain(
        'from "@/lib/api/agentRuntime"',
      );
      expect(readSource(relativePath), relativePath).not.toContain(
        'vi.mock("@/lib/api/agentRuntime"',
      );
    }
  });

  it("文件快照命令和 DTO 必须直接指向 current owner", () => {
    const source = readSource("src/components/agent/chat/utils/fileChangesUndo.ts");

    expect(source).toContain('from "@/lib/api/agentRuntime/threadClient"');
    expect(source).toContain('from "@/lib/api/agentRuntime/sessionTypes"');
  });
});
