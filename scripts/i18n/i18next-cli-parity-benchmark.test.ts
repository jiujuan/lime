import { describe, expect, it } from "vitest";

import { summarizeReport } from "./i18next-cli-parity-benchmark.mjs";

describe("i18next-cli parity benchmark", () => {
  it("应把 Lime sidecar 的 unused 报告纳入 summary", () => {
    const report = summarizeReport(
      {
        extractDryRun: {
          exitCode: 0,
          stderr: "",
          stdout: "  /tmp/1 [update]\n",
        },
        lint: {
          exitCode: 1,
          stderr: "",
          stdout: "Found hardcoded string: Hardcoded UI text\n",
        },
        status: {
          exitCode: 1,
          stderr: "",
          stdout: "Keys Found: 3\nNamespaces Found: 2\n",
        },
        types: {
          exitCode: 0,
          stderr: "",
          stdout:
            "Resources interface written\nTypeScript definitions written\n",
        },
        unused: {
          exitCode: 0,
          stderr: "",
          stdout: JSON.stringify(
            {
              summary: {
                dynamicKeyPatternCount: 1,
                protectedKeyCount: 2,
                unusedKeyCount: 1,
              },
              namespaceSummaries: [{ namespace: "common" }],
            },
            null,
            2,
          ),
        },
      },
      {
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify(
          {
            summary: {
              hasIssues: false,
              issueCount: 0,
              sourceKeyCount: 4,
            },
          },
          null,
          2,
        ),
      },
    );

    expect(report.limeUnused).toEqual(
      expect.objectContaining({
        exitCode: 0,
        protectedKeyCount: 2,
        unusedKeyCount: 1,
        dynamicKeyPatternCount: 1,
        topNamespace: "common",
      }),
    );
  });
});
