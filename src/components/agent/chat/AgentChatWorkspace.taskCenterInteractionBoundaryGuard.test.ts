import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace Task Center interaction runtime boundary", () => {
  it("草稿物化、切题和 Chrome 接线必须由 interaction runtime 组合", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceTaskCenterInteractionRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain(
      "useWorkspaceTaskCenterInteractionRuntime({",
    );
    expect(ownerSource.split("\n").length).toBeLessThan(140);
    for (const retiredWorkspaceTaskCenterInteractionGlue of [
      "useTaskCenterDraftMaterializationRuntime(",
      "useTaskCenterTopicNavigationRuntime(",
      "useTaskCenterChromeNavigationRuntime(",
    ]) {
      expect(workspaceSource).not.toContain(
        retiredWorkspaceTaskCenterInteractionGlue,
      );
      expect(ownerSource).toContain(retiredWorkspaceTaskCenterInteractionGlue);
    }
  });
});
