import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("AgentChatWorkspace image workbench runtime boundary", () => {
  it("发送准备、任务动作和命令启动必须由 image workbench runtime 组合", () => {
    const workspaceSource = readFileSync(
      join(process.cwd(), "src/components/agent/chat/AgentChatWorkspace.tsx"),
      "utf8",
    );
    const ownerSource = readFileSync(
      join(
        process.cwd(),
        "src/components/agent/chat/workspace/useWorkspaceImageWorkbenchRuntime.ts",
      ),
      "utf8",
    );

    expect(workspaceSource).toContain("useWorkspaceImageWorkbenchRuntime({");
    expect(ownerSource.split("\n").length).toBeLessThan(160);
    for (const retiredWorkspaceImageWorkbenchGlue of [
      "useWorkspaceImageWorkbenchSendCommandRuntime({",
      "useWorkspaceImageWorkbenchActionRuntime({",
      "useWorkspaceImageWorkbenchCommandActionRuntime({",
    ]) {
      expect(workspaceSource).not.toContain(retiredWorkspaceImageWorkbenchGlue);
      expect(ownerSource).toContain(retiredWorkspaceImageWorkbenchGlue);
    }
  });
});
