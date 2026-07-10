import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { writeReleaseAuditReportFile } from "./benchmark-release-run.mjs";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lime-benchmark-release-run-audit-"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

describe("benchmark release run audit report", () => {
  it("从 runner evidence root 写出人读审计报告", () => {
    const root = makeTempDir();
    const releaseRoot = "out";
    writeJson(path.join(root, releaseRoot, "benchmark-release-run.json"), {
      schemaVersion: "benchmark-release-run-v1",
      plan: {
        version: "1.97.0",
      },
      summary: {
        valid: true,
        stepCount: 2,
        passedStepCount: 2,
        failedStepCount: 0,
        skippedStepCount: 0,
      },
    });
    writeJson(path.join(root, releaseRoot, "benchmark-release-summary.json"), {
      schemaVersion: "benchmark-release-summary-v1",
      version: "1.97.0",
      releaseReady: false,
      summary: {
        evidenceFileCount: 8,
        p0GateBlockerCount: 0,
        releaseBlockerCount: 1,
        preflightBlockerCount: 0,
        trueRunBlockerCount: 0,
        trueRunEvidenceBlockerCount: 0,
      },
      releaseBlockers: ["terminal-bench-release-slice: adapterStatus=dry_run_ready"],
      p0GateBlockers: [],
      preflightBlockers: [],
      trueRunBlockers: [],
      trueRunEvidenceBlockers: [],
    });

    const result = writeReleaseAuditReportFile({ rootDir: root, releaseRoot });
    const markdown = fs.readFileSync(path.join(root, result.path), "utf8");

    expect(result.path).toBe("out/benchmark-release-report.md");
    expect(result.validation.valid).toBe(true);
    expect(markdown).toContain("version: 1.97.0");
    expect(markdown).toContain("decision: blocked");
  });
});
