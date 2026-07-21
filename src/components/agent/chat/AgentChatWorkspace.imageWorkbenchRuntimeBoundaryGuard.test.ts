import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace image workbench runtime boundary", () => {
  it("发送 surface 必须委托 image workbench runtime 组合任务动作和命令启动", () => {
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
    const sendSurfaceSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceSendSurfaceRuntime.ts",
      ),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceImageWorkbenchRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useAgentChatWorkspaceCommandWiring({");
    expect(workspaceSource).not.toContain("useWorkspaceSendSurfaceRuntime({");
    expect(workspaceSource).not.toContain("useWorkspaceImageWorkbenchRuntime(");
    expect(commandWiringSource).toContain("useWorkspaceSendSurfaceRuntime({");
    expect(sendSurfaceSource).toContain("useWorkspaceImageWorkbenchRuntime(");
    expect(ownerSource.split("\n").length).toBeLessThan(160);
    for (const retiredWorkspaceImageWorkbenchGlue of [
      "useWorkspaceImageWorkbenchSendCommandRuntime({",
      "useWorkspaceImageWorkbenchActionRuntime({",
      "useWorkspaceImageWorkbenchCommandActionRuntime({",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspaceImageWorkbenchGlue);
      expect(sendSurfaceSource).not.toContain(
        retiredWorkspaceImageWorkbenchGlue,
      );
      expect(ownerSource).toContain(retiredWorkspaceImageWorkbenchGlue);
    }
  });
});
