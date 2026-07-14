import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const SKILL_BINDINGS_CURRENT_OWNER_SOURCES = [
  "src/components/agent/chat/utils/workspaceSkillBindingsMetadata.ts",
  "src/components/agent/chat/utils/workspaceSkillBindingsMetadata.test.ts",
  "src/components/agent/chat/utils/harnessRequestMetadata.ts",
  "src/components/agent/chat/utils/harnessRequestMetadata.test.ts",
  "src/components/agent/chat/workspace/useWorkspaceHarnessRequestMetadataRuntime.ts",
  "src/components/agent/chat/workspace/useWorkspaceHarnessRequestMetadataRuntime.unit.test.ts",
  "src/components/agent/chat/workspace/useWorkspaceSkillBindingsRuntime.ts",
] as const;

function readSource(relativePath: string): string {
  return readFileSync(join(cwd(), relativePath), "utf8");
}

describe("skill bindings current owner boundary", () => {
  it("skill-binding consumer 不得回绕 agentRuntime 聚合入口", () => {
    for (const relativePath of SKILL_BINDINGS_CURRENT_OWNER_SOURCES) {
      const source = readSource(relativePath);

      expect(source, relativePath).not.toContain(
        'from "@/lib/api/agentRuntime"',
      );
      expect(source, relativePath).not.toContain(
        'from "@/lib/api/agentRuntime/types"',
      );
    }
  });

  it("binding DTO 与读取行为必须直连各自 current owner", () => {
    for (const relativePath of SKILL_BINDINGS_CURRENT_OWNER_SOURCES) {
      expect(readSource(relativePath), relativePath).toContain(
        'from "@/lib/api/agentRuntime/toolInventoryTypes"',
      );
    }

    expect(
      readSource(
        "src/components/agent/chat/workspace/useWorkspaceSkillBindingsRuntime.ts",
      ),
    ).toContain('from "@/lib/api/agentRuntime/inventoryClient"');
  });
});
