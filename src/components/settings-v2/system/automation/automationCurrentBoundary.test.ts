import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const AUTOMATION_CURRENT_OWNER_SOURCES = [
  "src/lib/api/automation.ts",
  "src/lib/api/automation.d.ts",
  "src/components/settings-v2/system/automation/automationThreadLineage.ts",
  "src/components/settings-v2/system/automation/index.tsx",
  "src/components/settings-v2/system/automation/index.test.tsx",
] as const;

function readSource(relativePath: string): string {
  return readFileSync(join(cwd(), relativePath), "utf8");
}

describe("automation current owner boundary", () => {
  it("自动化策略与目标审计不得回绕 agentRuntime compat 根 barrel", () => {
    for (const relativePath of AUTOMATION_CURRENT_OWNER_SOURCES) {
      const source = readSource(relativePath);

      expect(source, relativePath).not.toContain(
        'from "@/lib/api/agentRuntime"',
      );
      expect(source, relativePath).not.toContain(
        'vi.mock("@/lib/api/agentRuntime"',
      );
    }
  });

  it("自动化策略类型和目标审计必须使用各自 current owner", () => {
    expect(readSource("src/lib/api/automation.ts")).toContain(
      'from "@/lib/api/agentExecutionRuntime"',
    );
    expect(
      readSource(
        "src/components/settings-v2/system/automation/automationThreadLineage.ts",
      ),
    ).toContain('from "@/lib/api/agentExecutionRuntime"');
    expect(
      readSource("src/components/settings-v2/system/automation/index.tsx"),
    ).toContain('from "@/lib/api/agentRuntime/objectiveClient"');
  });
});
