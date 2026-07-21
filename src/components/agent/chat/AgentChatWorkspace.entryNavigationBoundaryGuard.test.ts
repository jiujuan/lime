import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace entry navigation runtime boundary", () => {
  it("文件、技能管理与子代理入口动作必须由 entry navigation owner 提供", () => {
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
        "src/components/agent/chat/workspace/useWorkspaceEntryNavigationRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspaceEntryNavigationRuntime({");
    expect(ownerSource.split("\n").length).toBeLessThan(120);
    for (const entryNavigationGlue of [
      "initialSkillPackageRequestKey: Date.now()",
      "initialScaffoldRequestKey: requestKey",
      "previous.subagent ? previous",
    ]) {
      expect(workspaceSource).not.toContain(entryNavigationGlue);
      expect(ownerSource).toContain(entryNavigationGlue);
    }
  });
});
