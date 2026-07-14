import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(join(cwd(), relativePath), "utf8");
}

describe("canonical roster fallback boundary", () => {
  it("GUI roster owners 不得引用 legacy child-session DTO 或 fallback", () => {
    const ownerPaths = [
      "src/components/agent/chat/components/AgentRuntimeStrip.tsx",
      "src/components/agent/chat/components/HarnessActivitySections.tsx",
      "src/components/agent/chat/components/HarnessDelegationSection.tsx",
      "src/components/agent/chat/components/HarnessStatusPanel.tsx",
      "src/components/agent/chat/components/HarnessStatusPanelTypes.ts",
      "src/components/agent/chat/components/harnessStatusPanelSectionModels.ts",
      "src/components/agent/chat/components/harnessStatusPanelViewModel.ts",
      "src/components/agent/chat/workspace/WorkspaceHarnessDialogs.tsx",
      "src/components/agent/chat/workspace/useWorkspaceGeneralWorkbenchHarnessSurfaceRuntime.ts",
    ];
    const ownerSource = ownerPaths.map((path) => readSource(path)).join("\n");

    for (const retiredSurface of [
      "AgentSubagentSessionInfo",
      "AgentSubagentParentContext",
      "childSubagentSessions",
      "summarizeChildSubagentSessions",
      "resolveSubagentRuntimeStatusLabel",
      "resolveSubagentRuntimeStatusVariant",
      "resolveSubagentSessionTypeLabel",
      "RuntimeSubagentSessionList",
    ]) {
      expect(ownerSource, retiredSurface).not.toContain(retiredSurface);
    }

    expect(ownerSource).toContain("CanonicalChildThreadSummary");
    expect(ownerSource).toContain("summarizeCanonicalChildThreads");
  });

  it("Workspace Harness 接线只向 panel 传递 canonical roster", () => {
    const workspaceSource = readSource(
      "src/components/agent/chat/AgentChatWorkspace.tsx",
    );
    const call = workspaceSource.match(
      /useWorkspaceGeneralWorkbenchHarnessSurfaceRuntime\(\{([\s\S]*?)\n\s{4}\}\);/,
    )?.[1];

    expect(call).toBeTruthy();
    expect(call).toContain("canonicalChildren");
    expect(call).not.toContain("childSubagentSessions");
  });
});
