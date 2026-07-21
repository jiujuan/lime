import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace Task Center interaction runtime boundary", () => {
  it("草稿物化、切题和 Chrome 接线必须由 interaction runtime 组合", () => {
    const workspaceSource = [
      "src/components/agent/chat/useAgentChatWorkspaceRuntime.tsx",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceEntryRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceSetupRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceCommandRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceSceneRuntime.tsx",
    ]
      .map((ownerPath) => readFileSync(join(process.cwd(), ownerPath), "utf8"))
      .join("\n");
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceTaskCenterInteractionRuntime.ts",
      ),
      "utf8",
    );
    const shellInteractionOwnerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useAgentChatWorkspaceShellInteractionRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain(
      "useAgentChatWorkspaceShellInteractionRuntime({",
    );
    expect(workspaceSource).not.toContain(
      "useWorkspaceTaskCenterInteractionRuntime(",
    );
    expect(shellInteractionOwnerSource).toContain(
      "useWorkspaceTaskCenterInteractionRuntime(",
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
      expect(shellInteractionOwnerSource).not.toContain(
        retiredWorkspaceTaskCenterInteractionGlue,
      );
      expect(ownerSource).toContain(retiredWorkspaceTaskCenterInteractionGlue);
    }
  });
});
