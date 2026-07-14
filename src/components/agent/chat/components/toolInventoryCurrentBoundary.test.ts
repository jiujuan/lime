import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const TOOL_INVENTORY_CURRENT_OWNER_SOURCES = [
  "src/components/agent/chat/components/HarnessCatalogToolInventoryList.tsx",
  "src/components/agent/chat/components/HarnessExtensionToolInventorySections.tsx",
  "src/components/agent/chat/components/HarnessNativeToolInventoryList.tsx",
  "src/components/agent/chat/components/HarnessRuntimeToolInventoryList.tsx",
  "src/components/agent/chat/components/HarnessToolInventoryOverview.tsx",
  "src/components/agent/chat/components/HarnessToolInventorySection.tsx",
  "src/components/agent/chat/components/useHarnessToolInventoryModel.ts",
  "src/components/agent/chat/components/harnessToolInventoryViewModel.ts",
  "src/components/agent/chat/utils/runtimeToolAvailability.ts",
  "src/components/agent/chat/utils/runtimeToolAvailability.test.ts",
  "src/components/agent/chat/workspace/useWorkspaceHarnessInventoryRuntime.ts",
  "src/components/agent/chat/components/harnessStatusPanelSummary.ts",
] as const;
const TOOL_INVENTORY_DIRECT_MOCK_SOURCE =
  "src/components/agent/chat/workspace/useWorkspaceHarnessInventoryRuntime.test.tsx";

function readSource(relativePath: string): string {
  return readFileSync(join(cwd(), relativePath), "utf8");
}

describe("tool inventory current owner boundary", () => {
  it("工具库存消费者不得回绕 agentRuntime compat 根 barrel", () => {
    for (const relativePath of TOOL_INVENTORY_CURRENT_OWNER_SOURCES) {
      expect(readSource(relativePath), relativePath).not.toContain(
        'from "@/lib/api/agentRuntime"',
      );
    }
  });

  it("工具库存 DTO 与读取行为必须直接指向各自 current owner", () => {
    for (const relativePath of TOOL_INVENTORY_CURRENT_OWNER_SOURCES) {
      expect(readSource(relativePath), relativePath).toContain(
        'from "@/lib/api/agentRuntime/toolInventoryTypes"',
      );
    }

    expect(
      readSource(
        "src/components/agent/chat/workspace/useWorkspaceHarnessInventoryRuntime.ts",
      ),
    ).toContain('from "@/lib/api/agentRuntime/inventoryClient"');

    const testSource = readSource(TOOL_INVENTORY_DIRECT_MOCK_SOURCE);
    expect(testSource).not.toContain('vi.mock("@/lib/api/agentRuntime"');
    expect(testSource).toContain(
      'vi.mock("@/lib/api/agentRuntime/inventoryClient"',
    );
  });
});
