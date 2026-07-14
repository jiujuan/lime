import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const CODE_REVIEW_SUMMARY_SOURCES = [
  "src/components/agent/chat/components/CodeReviewSummaryPanel.tsx",
  "src/components/agent/chat/components/CodeReviewSummaryPanelViewModel.ts",
] as const;

function readSource(relativePath: string): string {
  return readFileSync(join(cwd(), relativePath), "utf8");
}

describe("code review summary current owner boundary", () => {
  it("文件快照摘要不得回绕 agentRuntime compat 根 barrel", () => {
    for (const relativePath of CODE_REVIEW_SUMMARY_SOURCES) {
      expect(readSource(relativePath), relativePath).not.toContain(
        'from "@/lib/api/agentRuntime"',
      );
    }
  });

  it("文件快照 DTO 必须直接从 sessionTypes 获取", () => {
    expect(
      readSource(
        "src/components/agent/chat/components/CodeReviewSummaryPanel.tsx",
      ),
    ).toContain('from "@/lib/api/agentRuntime/sessionTypes"');
  });
});
