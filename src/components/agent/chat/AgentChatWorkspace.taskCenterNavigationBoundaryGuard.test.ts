import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace Task Center navigation runtime boundary", () => {
  it("topic switch、initial session navigation 和 tab session 必须由 Task Center navigation runtime 组合", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceTaskCenterNavigationRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain(
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
