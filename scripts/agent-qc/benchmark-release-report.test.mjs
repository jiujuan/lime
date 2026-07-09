import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildBenchmarkReleaseReport,
  renderMarkdown,
  validateBenchmarkReleaseReport,
} from "./benchmark-release-report.mjs";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lime-benchmark-release-report-"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeReleaseFiles(root, {
  version = "1.97.0",
  releaseReady = false,
  compareDecision = "pass",
  includeCompare = true,
  baselineReady = true,
} = {}) {
  const releaseRoot = path.join(root, `.lime/benchmark/releases/${version}`);
  writeJson(path.join(releaseRoot, "benchmark-release-run.json"), {
    schemaVersion: "benchmark-release-run-v1",
    plan: {
      version,
    },
    summary: {
      stepCount: 3,
      passedStepCount: 3,
      failedStepCount: 0,
      skippedStepCount: 0,
      valid: true,
    },
  });
  writeJson(path.join(releaseRoot, "benchmark-release-summary.json"), {
    schemaVersion: "benchmark-release-summary-v1",
    version,
    releaseReady,
    summary: {
      evidenceFileCount: 12,
      p0GateBlockerCount: releaseReady ? 0 : 1,
      releaseBlockerCount: releaseReady ? 0 : 1,
      preflightBlockerCount: releaseReady ? 0 : 2,
      trueRunBlockerCount: releaseReady ? 0 : 2,
      trueRunEvidenceBlockerCount: 0,
    },
    releaseBlockers: releaseReady ? [] : ["terminal-bench-release-slice: adapterStatus=dry_run_ready"],
    p0GateBlockers: releaseReady
      ? []
      : [{ suiteId: "lime-p0-gate", id: "missing", command: "npm run verify:local", reason: "missing_p0_gate_step" }],
    preflightBlockers: [],
    trueRunBlockers: [],
    trueRunEvidenceBlockers: [],
  });
  if (includeCompare) {
    writeJson(path.join(releaseRoot, "benchmark-release-compare.json"), {
      summary: { decision: compareDecision },
    });
  }
  writeJson(path.join(releaseRoot, "benchmark-baseline.json"), {
    schemaVersion: "benchmark-release-baseline-v1",
    baselineReady,
  });
}

describe("benchmark release report", () => {
  it("summary 未 releaseReady 时输出 blocked 决策和 blockers", () => {
    const root = makeTempDir();
    writeReleaseFiles(root, { releaseReady: false });

    const report = buildBenchmarkReleaseReport({ rootDir: root, version: "1.97.0" });
    const validation = validateBenchmarkReleaseReport(report);

    expect(validation.valid).toBe(true);
    expect(report.decision).toBe("blocked");
    expect(report.summary).toMatchObject({
      runStepCount: 3,
      releaseBlockerCount: 1,
      p0GateBlockerCount: 1,
      compareDecision: "pass",
      baselineReady: true,
    });
    expect(report.blockers.map((entry) => entry.kind)).toEqual(["release", "p0_gate"]);
    expect(renderMarkdown(report)).toContain("decision: blocked");
  });

  it("releaseReady 但缺 compare 时要求补版本对比", () => {
    const root = makeTempDir();
    writeReleaseFiles(root, { releaseReady: true, includeCompare: false });

    const report = buildBenchmarkReleaseReport({ rootDir: root, version: "1.97.0" });

    expect(report.decision).toBe("needs_compare");
    expect(report.summary.compareDecision).toBe("missing");
  });

  it("releaseReady、compare pass 和 baseline ready 时 decision=pass", () => {
    const root = makeTempDir();
    writeReleaseFiles(root, { releaseReady: true, compareDecision: "pass", baselineReady: true });

    const report = buildBenchmarkReleaseReport({ rootDir: root, version: "1.97.0" });

    expect(report.decision).toBe("pass");
    expect(report.releaseReady).toBe(true);
  });

  it("未显式传 version 时从 release run 推导版本", () => {
    const root = makeTempDir();
    const version = "2026-07-10-checklist-run-sync";
    writeReleaseFiles(root, { version, releaseReady: true });

    const report = buildBenchmarkReleaseReport({
      rootDir: root,
      releaseRoot: `.lime/benchmark/releases/${version}`,
    });

    expect(report.version).toBe(version);
  });

  it("缺 run 或 summary 时结构校验失败", () => {
    const root = makeTempDir();

    const report = buildBenchmarkReleaseReport({ rootDir: root, version: "1.97.0" });
    const validation = validateBenchmarkReleaseReport(report);

    expect(report.decision).toBe("invalid");
    expect(validation.valid).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        ".lime/benchmark/releases/1.97.0/benchmark-release-run.json: required artifact missing",
        ".lime/benchmark/releases/1.97.0/benchmark-release-summary.json: required artifact missing",
      ]),
    );
  });
});
