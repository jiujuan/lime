import { describe, expect, it } from "vitest";

import { renderConsoleSummary, renderMarkdown } from "./benchmark-release-run-render.mjs";

function makeReport(overrides = {}) {
  return {
    plan: {
      version: "1.97.0",
      outputRoot: ".lime/benchmark/releases/1.97.0",
      fullExternalSuites: true,
      includeP0: false,
      strictGate: false,
    },
    baselineDescriptor: { status: "not_required" },
    storage: { status: "ready", reason: "" },
    summary: {
      valid: false,
      passedStepCount: 2,
      failedStepCount: 1,
      skippedStepCount: 1,
    },
    steps: [
      { id: "context", kind: "release_context", status: "passed", exitCode: 0, outputPath: "run-context.json" },
      { id: "summary", kind: "release_summary", status: "failed", exitCode: 1, outputPath: "summary.json", reason: "command_failed" },
      { id: "gate", kind: "release_gate", status: "skipped", exitCode: null, outputPath: "", reason: "previous_required_step_failed" },
    ],
    issues: ["summary: command_failed"],
    ...overrides,
  };
}

describe("benchmark release run render", () => {
  it("renderConsoleSummary 输出适合 CI 和人工审计的短摘要", () => {
    const summary = renderConsoleSummary(makeReport(), {
      outputPath: ".lime/benchmark/releases/1.97.0/benchmark-release-run.json",
      auditReportPath: ".lime/benchmark/releases/1.97.0/benchmark-release-report.md",
    });

    expect(summary).toContain("Benchmark Release Run Summary");
    expect(summary).toContain("version=1.97.0");
    expect(summary).toContain("report=.lime/benchmark/releases/1.97.0/benchmark-release-run.json");
    expect(summary).toContain("auditReport=.lime/benchmark/releases/1.97.0/benchmark-release-report.md");
    expect(summary).toContain("steps=2 passed / 1 failed / 1 skipped");
    expect(summary).toContain("- failed: summary (command_failed)");
    expect(summary).not.toContain("stdoutTail");
  });

  it("renderMarkdown 保留完整 step 表格", () => {
    const markdown = renderMarkdown(makeReport());

    expect(markdown).toContain("# Benchmark Release Run");
    expect(markdown).toContain("| summary | release_summary | failed | 1 | summary.json |");
    expect(markdown).toContain("- summary: command_failed");
  });
});
