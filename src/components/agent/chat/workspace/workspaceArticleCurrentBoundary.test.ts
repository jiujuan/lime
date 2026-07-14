import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const ARTICLE_WORKSPACE_THREAD_READ_SOURCES = [
  "src/components/agent/chat/workspace/workspaceArticleWorkspaceModel.ts",
  "src/components/agent/chat/workspace/workspaceArticleWorkspaceWorkerEvidence.ts",
  "src/components/agent/chat/workspace/workspaceArticleWorkspaceWorkflowFacts.ts",
] as const;

function readSource(relativePath: string): string {
  return readFileSync(join(cwd(), relativePath), "utf8");
}

describe("workspace article thread read current owner boundary", () => {
  it("Article Workspace thread projection 不得回绕 agentRuntime compat 根 barrel", () => {
    for (const relativePath of ARTICLE_WORKSPACE_THREAD_READ_SOURCES) {
      expect(readSource(relativePath), relativePath).not.toContain(
        'from "@/lib/api/agentRuntime"',
      );
    }
  });

  it("Article Workspace 必须从 sessionTypes 读取 canonical thread DTO", () => {
    expect(
      readSource(
        "src/components/agent/chat/workspace/workspaceArticleWorkspaceModel.ts",
      ),
    ).toContain('from "@/lib/api/agentRuntime/sessionTypes"');
  });
});
