import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace Task Center navigation runtime boundary", () => {
  it("topic switch、initial session navigation 和 tab session 必须由 Task Center navigation runtime 组合", () => {
    const workspaceSource = [
      "src/components/agent/chat/useAgentChatWorkspaceRuntime.tsx",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceEntryRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceSetupRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceCommandRuntime.ts",
      "src/components/agent/chat/workspace/useAgentChatWorkspaceSceneRuntime.tsx",
    ]
      .map((ownerPath) => readFileSync(join(process.cwd(), ownerPath), "utf8"))
      .join("\n");
    const commandWiringSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useAgentChatWorkspaceCommandWiring.ts",
      ),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceTaskCenterNavigationRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useAgentChatWorkspaceCommandWiring({");
    expect(workspaceSource).not.toContain(
      "useWorkspaceTaskCenterNavigationRuntime({",
    );
    expect(commandWiringSource).toContain(
      "useWorkspaceTaskCenterNavigationRuntime({",
    );
    expect(ownerSource.split("\n").length).toBeLessThan(180);
    for (const retiredWorkspaceTaskCenterNavigationGlue of [
      "useWorkspaceTopicSwitch({",
      "useWorkspaceInitialSessionNavigation({",
      "useTaskCenterTabSessionRuntime({",
      "resolveInitialTaskSessionSwitchOptions(",
      "loadPersistedSessionWorkspaceId(topicId)",
    ]) {
      expect(workspaceSource).not.toContain(
        retiredWorkspaceTaskCenterNavigationGlue,
      );
      expect(ownerSource).toContain(retiredWorkspaceTaskCenterNavigationGlue);
    }
  });
});
