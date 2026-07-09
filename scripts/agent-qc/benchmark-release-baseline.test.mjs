import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildBenchmarkReleaseBaseline,
  validateBenchmarkReleaseBaseline,
} from "./benchmark-release-baseline.mjs";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lime-benchmark-release-baseline-"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function makeManifest() {
  return {
    schemaVersion: "benchmark-release-v1",
    datasetVersion: "test-version",
  };
}

function makeSummary({ releaseReady = true } = {}) {
  return {
    schemaVersion: "benchmark-release-summary-v1",
    datasetVersion: "test-version",
    releaseReady,
    summary: {
      issueCount: 0,
      releaseBlockerCount: 0,
      p0GateBlockerCount: 0,
      preflightBlockerCount: 0,
      trueRunBlockerCount: 0,
      trueRunEvidenceBlockerCount: 0,
      p0GateStepCount: 2,
    },
  };
}

function makeSummaryWithCounts(counts) {
  return {
    ...makeSummary({ releaseReady: false }),
    summary: {
      ...makeSummary().summary,
      ...counts,
    },
  };
}

function makeCompare({ decision = "pass" } = {}) {
  return {
    schemaVersion: "benchmark-release-compare-v1",
    summary: {
      decision,
    },
  };
}

describe("benchmark release baseline", () => {
  it("releaseReady summary 和 pass compare 可以登记为 baseline", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeManifest());
    writeJson(
      path.join(root, ".lime/benchmark/releases/1.97.0/benchmark-release-summary.json"),
      makeSummary(),
    );
    writeJson(
      path.join(root, ".lime/benchmark/releases/1.97.0/benchmark-release-compare.json"),
      makeCompare(),
    );

    const baseline = buildBenchmarkReleaseBaseline({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      requireCompare: true,
    });

    expect(baseline).toMatchObject({
      schemaVersion: "benchmark-release-baseline-v1",
      version: "1.97.0",
      baselineKind: "stable",
      baselineReady: true,
      releaseReady: true,
      compare: {
        exists: true,
        decision: "pass",
      },
      summary: {
        p0GateStepCount: 2,
      },
    });
    expect(validateBenchmarkReleaseBaseline(baseline)).toEqual({
      valid: true,
      issues: [],
    });
  });

  it("releaseReady=false 默认不能作为稳定 baseline", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeManifest());
    writeJson(
      path.join(root, ".lime/benchmark/releases/1.97.0/benchmark-release-summary.json"),
      makeSummary({ releaseReady: false }),
    );

    const baseline = buildBenchmarkReleaseBaseline({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
    });

    expect(baseline.baselineReady).toBe(false);
    expect(baseline.issues).toEqual(
      expect.arrayContaining(["summary.releaseReady 不是 true，不能作为稳定 baseline"]),
    );
  });

  it("require-compare 时 compare 缺失会阻断 baseline", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeManifest());
    writeJson(
      path.join(root, ".lime/benchmark/releases/1.97.0/benchmark-release-summary.json"),
      makeSummary(),
    );

    const baseline = buildBenchmarkReleaseBaseline({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      requireCompare: true,
    });

    expect(baseline.baselineReady).toBe(false);
    expect(baseline.issues).toEqual([
      ".lime/benchmark/releases/1.97.0/benchmark-release-compare.json: compare 不存在",
    ]);
  });

  it("compare 非 pass 在 require-compare 下会阻断 baseline", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeManifest());
    writeJson(
      path.join(root, ".lime/benchmark/releases/1.97.0/benchmark-release-summary.json"),
      makeSummary(),
    );
    writeJson(
      path.join(root, ".lime/benchmark/releases/1.97.0/benchmark-release-compare.json"),
      makeCompare({ decision: "needs-release-gate" }),
    );

    const baseline = buildBenchmarkReleaseBaseline({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      requireCompare: true,
    });

    expect(baseline.baselineReady).toBe(false);
    expect(baseline.issues).toEqual([
      ".lime/benchmark/releases/1.97.0/benchmark-release-compare.json: compare decision=needs-release-gate",
    ]);
  });

  it("allow-not-ready 只放宽 releaseReady，不放宽 blocker counts", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeManifest());
    writeJson(
      path.join(root, "summary.json"),
      makeSummaryWithCounts({
        p0GateBlockerCount: 1,
        preflightBlockerCount: 1,
        trueRunBlockerCount: 1,
        trueRunEvidenceBlockerCount: 1,
      }),
    );

    const baseline = buildBenchmarkReleaseBaseline({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "bootstrap",
      summaryPath: "summary.json",
      allowNotReady: true,
    });

    expect(baseline.baselineReady).toBe(false);
    expect(baseline.baselineKind).toBe("bootstrap");
    expect(baseline.issues).toEqual([
      "summary.p0GateBlockerCount=1",
      "summary.preflightBlockerCount=1",
      "summary.trueRunBlockerCount=1",
      "summary.trueRunEvidenceBlockerCount=1",
    ]);
    expect(baseline.summary).toMatchObject({
      p0GateBlockerCount: 1,
      preflightBlockerCount: 1,
      trueRunBlockerCount: 1,
      trueRunEvidenceBlockerCount: 1,
    });
  });

  it("allow-not-ready 即使无 blocker 也不能登记为 stable baseline", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeManifest());
    writeJson(path.join(root, "summary.json"), makeSummary({ releaseReady: false }));

    const baseline = buildBenchmarkReleaseBaseline({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "bootstrap",
      summaryPath: "summary.json",
      allowNotReady: true,
    });

    expect(baseline).toMatchObject({
      baselineKind: "bootstrap",
      baselineReady: false,
      releaseReady: false,
      issues: [],
    });
    expect(validateBenchmarkReleaseBaseline(baseline).valid).toBe(false);
  });
});
