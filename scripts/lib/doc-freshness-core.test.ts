import { describe, expect, it } from "vitest";

import { buildDocFreshnessReport } from "./doc-freshness-core.mjs";

describe("doc-freshness-core", () => {
  it("应在回链与路径都正常时返回 clean 报告", () => {
    const report = buildDocFreshnessReport({
      repoRoot: "/tmp/lime",
      specs: [
        {
          path: "internal/tech/harness/README.md",
          requiredMentions: [
            "harness-engine-governance.md",
            "quality-workflow.md",
            "harness-evals.md",
          ],
        },
      ],
      documents: [
        {
          path: "internal/tech/harness/README.md",
          content: `
[Governance](../../aiprompts/harness-engine-governance.md)
[Quality](../../aiprompts/quality-workflow.md)
[Evals](../../test/harness-evals.md)
`,
        },
      ],
      deletedSurfaceTargets: ["src/lib/api/agentCompat.ts"],
      pathExists: (_absolutePath, repoRelativePath) =>
        [
          "internal/aiprompts/harness-engine-governance.md",
          "internal/aiprompts/quality-workflow.md",
          "internal/test/harness-evals.md",
        ].includes(repoRelativePath),
    });

    expect(report.summary.issueCount).toBe(0);
    expect(report.documents[0].requiredMentions.every((entry) => entry.found)).toBe(
      true,
    );
  });

  it("应识别缺失回链、坏链接、坏路径与已删除表面引用", () => {
    const report = buildDocFreshnessReport({
      repoRoot: "/tmp/lime",
      specs: [
        {
          path: "internal/tech/harness/external-analysis-handoff.md",
          requiredMentions: [
            "harness-engine-governance.md",
            "quality-workflow.md",
          ],
        },
      ],
      documents: [
        {
          path: "internal/tech/harness/external-analysis-handoff.md",
          content: `
[Bad Link](missing-doc.md)
\`scripts/missing-tool.mjs\`
旧入口：src/lib/api/agentCompat.ts
`,
        },
      ],
      deletedSurfaceTargets: ["src/lib/api/agentCompat.ts"],
      pathExists: () => false,
    });

    expect(report.summary.issueCount).toBe(5);
    expect(report.issues.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining([
        "missing-required-reference",
        "broken-markdown-link",
        "broken-code-path-reference",
        "deleted-surface-reference",
      ]),
    );
  });
});
