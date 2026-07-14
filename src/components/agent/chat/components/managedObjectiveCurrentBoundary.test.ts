import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const TYPE_CONSUMERS = [
  "src/components/agent/chat/components/Inputbar/components/InputbarObjectiveInlinePanel.tsx",
  "src/components/agent/chat/components/Inputbar/components/InputbarObjectiveInlinePanel.test.tsx",
  "src/components/agent/chat/components/ManagedObjectiveAuditSummary.tsx",
  "src/components/agent/chat/components/ManagedObjectiveCurrentView.tsx",
  "src/components/agent/chat/components/ManagedObjectivePanel.tsx",
  "src/components/agent/chat/components/ManagedObjectivePanel.test.tsx",
  "src/components/agent/chat/components/managedObjectivePanelModel.ts",
] as const;

const BEHAVIOR_CONSUMERS = [
  "src/components/agent/chat/components/Inputbar/components/InputbarObjectiveInlinePanel.tsx",
  "src/components/agent/chat/components/Inputbar/hooks/useInputbarSend.ts",
  "src/components/agent/chat/components/ManagedObjectivePanel.tsx",
  "src/components/agent/chat/hooks/agentStreamSubmitExecution.ts",
] as const;

const BEHAVIOR_MOCKS = [
  "src/components/agent/chat/components/Inputbar/components/InputbarObjectiveInlinePanel.test.tsx",
  "src/components/agent/chat/components/Inputbar/hooks/useInputbarSend.test.tsx",
  "src/components/agent/chat/components/ManagedObjectivePanel.test.tsx",
  "src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts",
] as const;

function readSource(relativePath: string): string {
  return readFileSync(join(cwd(), relativePath), "utf8");
}

describe("managed objective current owner boundary", () => {
  it("Managed Objective DTO consumer 必须直连 sessionTypes", () => {
    for (const relativePath of TYPE_CONSUMERS) {
      const source = readSource(relativePath);

      expect(source, relativePath).toContain(
        'from "@/lib/api/agentRuntime/sessionTypes"',
      );
      expect(source, relativePath).not.toContain(
        'from "@/lib/api/agentRuntime"',
      );
    }
  });

  it("Managed Objective 行为 consumer 必须直连 objectiveClient", () => {
    for (const relativePath of BEHAVIOR_CONSUMERS) {
      expect(readSource(relativePath), relativePath).toContain(
        'from "@/lib/api/agentRuntime/objectiveClient"',
      );
    }
  });

  it("Managed Objective 测试必须 mock objectiveClient 且不得 mock compat 根 barrel", () => {
    for (const relativePath of BEHAVIOR_MOCKS) {
      const source = readSource(relativePath);

      expect(source, relativePath).toContain(
        'vi.mock("@/lib/api/agentRuntime/objectiveClient"',
      );
      expect(source, relativePath).not.toContain(
        'vi.mock("@/lib/api/agentRuntime"',
      );
      expect(source, relativePath).not.toContain(
        'vi.importActual<typeof import("@/lib/api/agentRuntime")>',
      );
    }
  });
});
