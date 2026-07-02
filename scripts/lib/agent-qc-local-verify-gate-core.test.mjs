import { describe, expect, it } from "vitest";

import {
  buildAgentQcLocalVerifyGateReport,
  renderAgentQcLocalVerifyGateMarkdown,
} from "./agent-qc-local-verify-gate-core.mjs";

describe("agent-qc local verify gate core", () => {
  it("exit code 0 应生成 pass sidecar", () => {
    const report = buildAgentQcLocalVerifyGateReport({
      command: "npm run verify:local",
      exitCode: 0,
      signal: null,
      startedAt: "2026-07-02T00:00:00.000Z",
      completedAt: "2026-07-02T00:00:01.000Z",
      durationMs: 1000,
    });

    expect(report.status).toBe("pass");
    expect(report.failedStage).toBe("");
    expect(report.guardrails.officialEvidenceOverwritten).toBe(false);
  });

  it("非零 exit code 应生成 fail sidecar 并渲染 Markdown", () => {
    const report = buildAgentQcLocalVerifyGateReport({
      command: "npm run verify:local",
      exitCode: 2,
      signal: null,
    });
    const markdown = renderAgentQcLocalVerifyGateMarkdown(report);

    expect(report.status).toBe("fail");
    expect(report.failedStage).toBe("exitCode=2");
    expect(markdown).toContain("Agent QC Local Verify Gate");
    expect(markdown).toContain("Status: fail");
  });
});
