import { describe, expect, it } from "vitest";
import {
  isRolloutCandidateEntry,
  parseRolloutCandidateMarkdown,
} from "./rolloutCandidates";

describe("rolloutCandidates", () => {
  it("应识别未处理的运行摘要候选文件", () => {
    expect(
      isRolloutCandidateEntry({
        path: "rollout_summaries/20260619T010203Z-handoff.md",
        entryType: "file",
        size: 128,
        modifiedAt: 1,
      }),
    ).toBe(true);
    expect(
      isRolloutCandidateEntry({
        path: "rollout_summaries/processed/20260619T010203Z-handoff.md",
        entryType: "file",
        size: 128,
        modifiedAt: 1,
      }),
    ).toBe(false);
    expect(
      isRolloutCandidateEntry({
        path: "rollout_summaries",
        entryType: "directory",
        size: 0,
        modifiedAt: 1,
      }),
    ).toBe(false);
  });

  it("应从运行摘要 Markdown 提取来源、导出位置和相关交付物", () => {
    const summary = parseRolloutCandidateMarkdown(
      "rollout_summaries/20260619T010203Z-handoff.md",
      [
        "# Handoff summary",
        "",
        "## Export Evidence",
        "- exportKind: `handoff_bundle`",
        "- exportRoot: `.lime/harness/sessions/session-1`",
        "- exportedAt: `2026-06-19T10:00:00Z`",
        "",
        "## Referenced Artifacts",
        "- Handoff Draft `.app-server/artifacts/handoff.md` (markdown)",
        "- Progress `.lime/harness/sessions/session-1/progress.json` (json)",
        "",
        "## Candidate Metadata",
        "- source: `agentSession/handoffBundle/export`",
        "- status: `candidate`",
      ].join("\n"),
      true,
    );

    expect(summary).toEqual({
      path: "rollout_summaries/20260619T010203Z-handoff.md",
      title: "Handoff summary",
      source: "agentSession/handoffBundle/export",
      exportKind: "handoff_bundle",
      exportRoot: ".lime/harness/sessions/session-1",
      exportedAt: "2026-06-19T10:00:00Z",
      artifacts: [
        {
          title: "Handoff Draft",
          path: ".app-server/artifacts/handoff.md",
          kind: "markdown",
        },
        {
          title: "Progress",
          path: ".lime/harness/sessions/session-1/progress.json",
          kind: "json",
        },
      ],
      truncated: true,
    });
  });
});
