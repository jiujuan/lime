import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildBenchmarkReleaseCompare,
  compareP0Steps,
  compareTrueRunTasks,
  statusClass,
  validateBenchmarkReleaseCompare,
} from "./benchmark-release-compare.mjs";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lime-benchmark-release-compare-"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function makeManifest(maxAdditionalFailedTasks = 0) {
  return {
    schemaVersion: "benchmark-release-v1",
    datasetVersion: "test-version",
    releasePolicy: {
      p1RegressionBudget: {
        maxAdditionalFailedTasks,
      },
    },
  };
}

function makeSummary({
  releaseReady = true,
  p0Status = "passed",
  terminalVerdict = "ready",
  terminalState = "ready",
  issueCount = 0,
} = {}) {
  return {
    schemaVersion: "benchmark-release-summary-v1",
    datasetVersion: "test-version",
    releaseReady,
    summary: {
      issueCount,
    },
    suites: [
      {
        id: "lime-p0-gate",
        priority: "P0",
        runner: "npm",
        requiredForRelease: true,
        state: p0Status,
        p0Gate: [
          {
            command: "npm run verify:local",
            status: p0Status,
          },
        ],
      },
      {
        id: "terminal-bench-release-slice",
        priority: "P1",
        runner: "harbor-adapter",
        requiredForRelease: true,
        state: terminalState,
        trueRun: {
          verdict: terminalState,
          blockedCount: terminalVerdict === "blocked" ? 1 : 0,
        },
        trueRunTasks: [
          {
            taskId: "hello-world",
            verdict: terminalVerdict,
          },
        ],
      },
    ],
  };
}

describe("benchmark release compare", () => {
  it("归一化 true-run / P0 状态", () => {
    expect(statusClass("ready")).toBe("passed");
    expect(statusClass("passed")).toBe("passed");
    expect(statusClass("blocked")).toBe("failed");
    expect(statusClass("skipped")).toBe("skipped");
    expect(statusClass("not-run")).toBe("skipped");
  });

  it("无 P0 或 P1 回归且 candidate releaseReady 时通过", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeManifest(0));
    writeJson(path.join(root, "baseline-summary.json"), makeSummary());
    writeJson(path.join(root, "candidate-summary.json"), makeSummary());

    const compare = buildBenchmarkReleaseCompare({
      rootDir: root,
      manifestPath: "manifest.json",
      baselineSummaryPath: "baseline-summary.json",
      candidateSummaryPath: "candidate-summary.json",
    });

    expect(compare.summary).toMatchObject({
      decision: "pass",
      additionalFailedTaskCount: 0,
      p0RegressionCount: 0,
      budgetExceeded: false,
    });
    expect(validateBenchmarkReleaseCompare(compare)).toMatchObject({
      valid: true,
    });
  });

  it("P1 candidate 新增 failed / blocked task 超过预算时阻断", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeManifest(0));
    writeJson(path.join(root, "baseline-summary.json"), makeSummary());
    writeJson(
      path.join(root, "candidate-summary.json"),
      makeSummary({
        releaseReady: false,
        terminalVerdict: "blocked",
        terminalState: "blocked",
      }),
    );

    const compare = buildBenchmarkReleaseCompare({
      rootDir: root,
      manifestPath: "manifest.json",
      baselineSummaryPath: "baseline-summary.json",
      candidateSummaryPath: "candidate-summary.json",
    });

    expect(compare.summary).toMatchObject({
      decision: "hold-or-revert",
      additionalFailedTaskCount: 1,
      budgetExceeded: true,
      releaseReadyRegression: true,
    });
    expect(compare.taskRegressions).toEqual([
      expect.objectContaining({
        suiteId: "terminal-bench-release-slice",
        taskId: "hello-world",
        baselineVerdict: "ready",
        candidateVerdict: "blocked",
      }),
    ]);
    expect(validateBenchmarkReleaseCompare(compare).valid).toBe(false);
  });

  it("P0 step 从 passed 退化为 failed 时阻断", () => {
    const baseline = makeSummary();
    const candidate = makeSummary({
      releaseReady: false,
      p0Status: "failed",
    });

    expect(compareP0Steps(baseline, candidate)).toEqual([
      expect.objectContaining({
        suiteId: "lime-p0-gate",
        command: "npm run verify:local",
        baselineStatus: "passed",
        candidateStatus: "failed",
        reason: "p0_step_no_longer_passing",
      }),
    ]);
  });

  it("candidate releaseReady=false 但无新增回归时进入 needs-release-gate", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeManifest(1));
    writeJson(
      path.join(root, "baseline-summary.json"),
      makeSummary({
        releaseReady: false,
      }),
    );
    writeJson(
      path.join(root, "candidate-summary.json"),
      makeSummary({
        releaseReady: false,
      }),
    );

    const compare = buildBenchmarkReleaseCompare({
      rootDir: root,
      manifestPath: "manifest.json",
      baselineSummaryPath: "baseline-summary.json",
      candidateSummaryPath: "candidate-summary.json",
    });

    expect(compare.summary).toMatchObject({
      decision: "needs-release-gate",
      additionalFailedTaskCount: 0,
      p0RegressionCount: 0,
      budgetExceeded: false,
      releaseReadyRegression: false,
    });
    expect(validateBenchmarkReleaseCompare(compare).valid).toBe(false);
  });

  it("直接比较 true-run task 时忽略 baseline 已失败的任务", () => {
    const baseline = makeSummary({
      releaseReady: false,
      terminalVerdict: "blocked",
      terminalState: "blocked",
    });
    const candidate = makeSummary({
      releaseReady: false,
      terminalVerdict: "blocked",
      terminalState: "blocked",
    });

    expect(compareTrueRunTasks(baseline, candidate)).toEqual([]);
  });
});
