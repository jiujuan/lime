import { describe, expect, it } from "vitest";

import { buildQCLoopPreflightReport } from "./agent-qc-qcloop-preflight-core.mjs";

describe("agent-qc-qcloop-preflight-core", () => {
  it("基础环境通过时应返回 pass", () => {
    const report = buildQCLoopPreflightReport({
      cwd: "/repo/lime",
      expectedCwd: "/repo/lime",
      tmpWritable: true,
    });

    expect(report.status).toBe("pass");
    expect(report.failedChecks).toEqual([]);
  });

  it("cwd 不匹配时应返回 blocked", () => {
    const report = buildQCLoopPreflightReport({
      cwd: "/repo/qcloop",
      expectedCwd: "/repo/lime",
      tmpWritable: true,
    });

    expect(report.status).toBe("blocked");
    expect(report.failedChecks).toContain("cwd-expected");
  });

  it("DevBridge 不可访问时应返回 blocked", () => {
    const report = buildQCLoopPreflightReport({
      cwd: "/repo/lime",
      tmpWritable: true,
      devBridge: {
        ok: false,
        url: "http://127.0.0.1:3030/health",
        error: "TypeError: fetch failed",
      },
    });

    expect(report.status).toBe("blocked");
    expect(report.failedChecks).toContain("devbridge-health");
    expect(
      report.checks.find((check) => check.id === "devbridge-health")?.detail,
    ).toContain("fetch failed");
  });
});
