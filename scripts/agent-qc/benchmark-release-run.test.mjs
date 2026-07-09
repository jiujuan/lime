import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildBenchmarkReleaseRunPlan,
  runBenchmarkRelease,
  validateBenchmarkReleaseRun,
} from "./benchmark-release-run.mjs";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lime-benchmark-release-run-"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function makeManifest({
  terminalTaskSet = ["hello-world"],
  deepsweTaskSet = ["ytt-jsonpath-query-api"],
} = {}) {
  return {
    schemaVersion: "benchmark-release-v1",
    datasetVersion: "test-version",
    suites: [
      {
        id: "agent-qc-p0-manifest",
        priority: "P0",
        runner: "npm",
        requiredForRelease: true,
        commands: ["npm run agent-qc:check", "npm run test:contracts"],
      },
      {
        id: "terminal-bench-release-slice",
        priority: "P1",
        runner: "harbor-adapter",
        requiredForRelease: true,
        taskSet: terminalTaskSet,
      },
      {
        id: "deepswe-fixed-ten",
        priority: "P1",
        runner: "deepswe-adapter",
        requiredForRelease: true,
        taskSet: deepsweTaskSet,
      },
    ],
  };
}

function writeBaselineDescriptor(root, {
  version = "1.96.0",
  baselineReady = true,
  baselineKind = "stable",
  releaseReady = true,
  summaryPath = `.lime/benchmark/releases/${version}/benchmark-release-summary.json`,
  allowNotReady = false,
} = {}) {
  writeJson(path.join(root, `.lime/benchmark/releases/${version}/benchmark-baseline.json`), {
    schemaVersion: "benchmark-release-baseline-v1",
    version,
    baselineKind,
    baselineReady,
    releaseReady,
    allowNotReady,
    summaryPath,
  });
}

function writeCustomBaselineDescriptor(root, {
  baselineReady = true,
  baselineKind = "stable",
  releaseReady = true,
  summaryPath = "baseline-summary.json",
  allowNotReady = false,
} = {}) {
  writeJson(path.join(root, "benchmark-baseline.json"), {
    schemaVersion: "benchmark-release-baseline-v1",
    version: "custom",
    baselineKind,
    baselineReady,
    releaseReady,
    allowNotReady,
    summaryPath,
  });
}

function makeRepo(manifestOptions = {}) {
  const root = makeTempDir();
  writeJson(path.join(root, "manifest.json"), makeManifest(manifestOptions));
  return root;
}

describe("benchmark release run", () => {
  it("生成 release evidence run 步骤，覆盖 context / checklist / P1 / summary / check", () => {
    const root = makeRepo();

    const plan = buildBenchmarkReleaseRunPlan({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
    });

    expect(plan.outputRoot).toBe(".lime/benchmark/releases/1.97.0");
    expect(plan.steps.map((step) => step.id)).toEqual([
      "benchmark-release:context",
      "benchmark-release:checklist",
      "terminal-bench-release-slice:dry-run",
      "terminal-bench-release-slice:hello-world:true-run-preflight",
      "terminal-bench-release-slice:hello-world:true-run",
      "deepswe-fixed-ten:dry-run",
      "deepswe-fixed-ten:ytt-jsonpath-query-api:true-run-preflight",
      "deepswe-fixed-ten:ytt-jsonpath-query-api:true-run",
      "benchmark-release:summary",
      "benchmark-release:check",
    ]);
    expect(
      plan.steps.find((step) => step.id === "terminal-bench-release-slice:hello-world:true-run"),
    ).toEqual(
      expect.objectContaining({
        command: expect.stringContaining("agent-qc:benchmark:terminal-run"),
        args: expect.arrayContaining(["--manifest", "manifest.json"]),
        outputPath:
          ".lime/benchmark/releases/1.97.0/terminal-bench/hello-world-true-run/summary.json",
      }),
    );
    expect(plan.steps.find((step) => step.id === "benchmark-release:checklist")).toEqual(
      expect.objectContaining({
        args: expect.arrayContaining([
          "--manifest",
          "manifest.json",
          "--output-root",
          ".lime/benchmark/releases/1.97.0",
        ]),
      }),
    );
    expect(plan.steps.find((step) => step.id === "benchmark-release:summary")).toEqual(
      expect.objectContaining({
        args: expect.arrayContaining(["--manifest", "manifest.json"]),
      }),
    );
    expect(plan.steps.find((step) => step.id === "benchmark-release:check")).toEqual(
      expect.objectContaining({
        args: expect.arrayContaining(["--manifest", "manifest.json"]),
      }),
    );
  });

  it("默认只对每个 external suite 的首题执行 preflight 和 true-run", () => {
    const root = makeRepo({
      terminalTaskSet: ["hello-world", "git-mastery"],
      deepsweTaskSet: ["ytt-jsonpath-query-api", "rust-serde-compat"],
    });

    const plan = buildBenchmarkReleaseRunPlan({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
    });

    expect(plan.fullExternalSuites).toBe(false);
    expect(
      plan.steps
        .filter((step) => step.kind === "true_run_preflight" || step.kind === "true_run")
        .map((step) => step.id),
    ).toEqual([
      "terminal-bench-release-slice:hello-world:true-run-preflight",
      "terminal-bench-release-slice:hello-world:true-run",
      "deepswe-fixed-ten:ytt-jsonpath-query-api:true-run-preflight",
      "deepswe-fixed-ten:ytt-jsonpath-query-api:true-run",
    ]);
  });

  it("full-external-suites 会展开 external suite 的全部 taskSet", () => {
    const root = makeRepo({
      terminalTaskSet: ["hello-world", "git-mastery"],
      deepsweTaskSet: ["ytt-jsonpath-query-api", "rust-serde-compat"],
    });

    const plan = buildBenchmarkReleaseRunPlan({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      fullExternalSuites: true,
    });

    expect(plan.fullExternalSuites).toBe(true);
    expect(plan.steps.find((step) => step.id === "benchmark-release:checklist")).toEqual(
      expect.objectContaining({
        args: expect.arrayContaining(["--full-external-suites"]),
      }),
    );
    expect(
      plan.steps
        .filter((step) => step.kind === "true_run_preflight" || step.kind === "true_run")
        .map((step) => step.id),
    ).toEqual([
      "terminal-bench-release-slice:hello-world:true-run-preflight",
      "terminal-bench-release-slice:hello-world:true-run",
      "terminal-bench-release-slice:git-mastery:true-run-preflight",
      "terminal-bench-release-slice:git-mastery:true-run",
      "deepswe-fixed-ten:ytt-jsonpath-query-api:true-run-preflight",
      "deepswe-fixed-ten:ytt-jsonpath-query-api:true-run",
      "deepswe-fixed-ten:rust-serde-compat:true-run-preflight",
      "deepswe-fixed-ten:rust-serde-compat:true-run",
    ]);
  });

  it("strict gate 自动启用 external suite 全量 taskSet", () => {
    const root = makeRepo({
      terminalTaskSet: ["hello-world", "git-mastery"],
      deepsweTaskSet: ["ytt-jsonpath-query-api", "rust-serde-compat"],
    });

    const plan = buildBenchmarkReleaseRunPlan({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      baselineVersion: "1.96.0",
      includeP0: true,
      strictGate: true,
    });

    expect(plan.fullExternalSuites).toBe(true);
    expect(plan.steps.find((step) => step.id === "benchmark-release:checklist")).toEqual(
      expect.objectContaining({
        args: expect.arrayContaining(["--full-external-suites", "--strict-gate"]),
      }),
    );
    expect(plan.steps.map((step) => step.id)).toContain(
      "terminal-bench-release-slice:git-mastery:true-run",
    );
    expect(plan.steps.map((step) => step.id)).toContain(
      "deepswe-fixed-ten:rust-serde-compat:true-run",
    );
  });

  it("dry-run-only 不运行 preflight 和 true-run", () => {
    const root = makeRepo();

    const plan = buildBenchmarkReleaseRunPlan({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      dryRunOnly: true,
    });

    expect(plan.steps.map((step) => step.kind)).not.toContain("true_run");
    expect(plan.steps.map((step) => step.kind)).not.toContain("true_run_preflight");
    expect(plan.steps.filter((step) => step.kind === "dry_run")).toHaveLength(2);
  });

  it("include-p0 会执行 manifest 中的 P0 npm 门禁", () => {
    const root = makeRepo();

    const plan = buildBenchmarkReleaseRunPlan({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      includeP0: true,
    });

    expect(plan.includeP0).toBe(true);
    expect(plan.steps.map((step) => step.id)).toContain(
      "agent-qc-p0-manifest:npm-01-agent-qc-check",
    );
    expect(
      plan.steps.find(
        (step) => step.id === "agent-qc-p0-manifest:npm-01-agent-qc-check",
      ),
    ).toEqual(
      expect.objectContaining({
        kind: "p0_npm_gate",
        command: "npm run agent-qc:check",
        outputPath:
          ".lime/benchmark/releases/1.97.0/p0/agent-qc-p0-manifest/01-agent-qc-check.json",
      }),
    );
    expect(plan.steps.map((step) => step.id).slice(0, 3)).toEqual([
      "benchmark-release:context",
      "benchmark-release:checklist",
      "agent-qc-p0-manifest:npm-01-agent-qc-check",
    ]);
  });

  it("strict gate 会加入 release gate 步骤", () => {
    const root = makeRepo();

    const plan = buildBenchmarkReleaseRunPlan({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      baselineVersion: "1.96.0",
      includeP0: true,
      strictGate: true,
    });

    expect(plan.steps.at(-1)).toEqual(
      expect.objectContaining({
        id: "benchmark-release:gate",
        kind: "release_gate",
      }),
    );
  });

  it("baseline summary 存在时会在 manifest check 后加入 release compare", () => {
    const root = makeRepo();

    const plan = buildBenchmarkReleaseRunPlan({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      baselineSummaryPath: ".lime/benchmark/releases/1.96.0/benchmark-release-summary.json",
      includeP0: true,
      strictGate: true,
    });

    expect(plan.baselineSummaryPath).toBe(
      ".lime/benchmark/releases/1.96.0/benchmark-release-summary.json",
    );
    expect(plan.steps.map((step) => step.id).slice(-3)).toEqual([
      "benchmark-release:check",
      "benchmark-release:compare",
      "benchmark-release:gate",
    ]);
    expect(plan.steps.find((step) => step.id === "benchmark-release:compare")).toEqual(
      expect.objectContaining({
        kind: "release_compare",
        command:
          "npm run agent-qc:benchmark-release:compare -- --manifest manifest.json --baseline-summary .lime/benchmark/releases/1.96.0/benchmark-release-summary.json --candidate-summary .lime/benchmark/releases/1.97.0/benchmark-release-summary.json --output .lime/benchmark/releases/1.97.0/benchmark-release-compare.json --format json --check",
        outputPath: ".lime/benchmark/releases/1.97.0/benchmark-release-compare.json",
      }),
    );
    expect(plan.steps.at(-1)).toEqual(
      expect.objectContaining({
        args: expect.arrayContaining(["--manifest", "manifest.json"]),
      }),
    );
    expect(plan.steps.find((step) => step.id === "benchmark-release:summary")).toEqual(
      expect.objectContaining({
        args: expect.arrayContaining(["--release-gate"]),
      }),
    );
  });

  it("baseline version 会解析为标准 release summary 路径", () => {
    const root = makeRepo();

    const plan = buildBenchmarkReleaseRunPlan({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      baselineVersion: "1.96.0",
    });

    expect(plan.baselineVersion).toBe("1.96.0");
    expect(plan.baselineSummaryPath).toBe(
      ".lime/benchmark/releases/1.96.0/benchmark-release-summary.json",
    );
    expect(plan.steps.at(-1)).toEqual(
      expect.objectContaining({
        id: "benchmark-release:compare",
        command:
          "npm run agent-qc:benchmark-release:compare -- --manifest manifest.json --baseline-summary .lime/benchmark/releases/1.96.0/benchmark-release-summary.json --candidate-summary .lime/benchmark/releases/1.97.0/benchmark-release-summary.json --output .lime/benchmark/releases/1.97.0/benchmark-release-compare.json --format json --check",
      }),
    );
  });

  it("promote baseline 会在 strict gate 后加入 baseline 步骤", () => {
    const root = makeRepo();

    const plan = buildBenchmarkReleaseRunPlan({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      baselineVersion: "1.96.0",
      includeP0: true,
      strictGate: true,
      promoteBaseline: true,
    });

    expect(plan.promoteBaseline).toBe(true);
    expect(plan.steps.map((step) => step.id).slice(-3)).toEqual([
      "benchmark-release:compare",
      "benchmark-release:gate",
      "benchmark-release:baseline",
    ]);
    expect(plan.steps.at(-1)).toEqual(
      expect.objectContaining({
        kind: "baseline_promotion",
        command:
          "npm run agent-qc:benchmark-release:baseline -- --manifest manifest.json --version 1.97.0 --summary .lime/benchmark/releases/1.97.0/benchmark-release-summary.json --compare .lime/benchmark/releases/1.97.0/benchmark-release-compare.json --output .lime/benchmark/releases/1.97.0/benchmark-baseline.json --require-compare --format json --check",
        outputPath: ".lime/benchmark/releases/1.97.0/benchmark-baseline.json",
      }),
    );
  });

  it("promote baseline 必须启用 strict gate 并提供 baseline", () => {
    const root = makeRepo();

    expect(() =>
      buildBenchmarkReleaseRunPlan({
        rootDir: root,
        manifestPath: "manifest.json",
        version: "1.97.0",
        promoteBaseline: true,
      }),
    ).toThrow("strictGate");
    expect(() =>
      buildBenchmarkReleaseRunPlan({
        rootDir: root,
        manifestPath: "manifest.json",
        version: "1.97.0",
        includeP0: true,
        strictGate: true,
        promoteBaseline: true,
      }),
    ).toThrow("baselineSummaryPath 或 baselineVersion");
  });

  it("strict gate 必须启用 P0 并提供 baseline", () => {
    const root = makeRepo();

    expect(() =>
      buildBenchmarkReleaseRunPlan({
        rootDir: root,
        manifestPath: "manifest.json",
        version: "1.97.0",
        baselineVersion: "1.96.0",
        strictGate: true,
      }),
    ).toThrow("includeP0");
    expect(() =>
      buildBenchmarkReleaseRunPlan({
        rootDir: root,
        manifestPath: "manifest.json",
        version: "1.97.0",
        includeP0: true,
        strictGate: true,
      }),
    ).toThrow("baselineSummaryPath 或 baselineVersion");
  });

  it("baseline summary 和 baseline version 同时提供时拒绝生成计划", () => {
    const root = makeRepo();

    expect(() =>
      buildBenchmarkReleaseRunPlan({
        rootDir: root,
        manifestPath: "manifest.json",
        version: "1.97.0",
        baselineSummaryPath: "custom-baseline-summary.json",
        baselineVersion: "1.96.0",
      }),
    ).toThrow("只能二选一");
  });

  it("执行失败的必需步骤会停止后续步骤并让 run invalid", () => {
    const root = makeRepo();
    const report = runBenchmarkRelease({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      commandRunner: (step) => ({
        status: step.id === "terminal-bench-release-slice:dry-run" ? 1 : 0,
        signal: "",
        stdout: "",
        stderr: "",
        error: "",
      }),
      now: () => new Date("2026-07-09T00:00:00.000Z"),
    });
    const validation = validateBenchmarkReleaseRun(report);

    expect(validation.valid).toBe(false);
    expect(report.summary).toMatchObject({
      failedStepCount: 1,
      skippedStepCount: 7,
      valid: false,
    });
    expect(report.steps.find((step) => step.id === "terminal-bench-release-slice:dry-run")).toEqual(
      expect.objectContaining({
        status: "failed",
        reason: "command_failed",
      }),
    );
  });

  it("release compare 失败时会阻断 strict gate", () => {
    const root = makeRepo();
    writeCustomBaselineDescriptor(root);
    const report = runBenchmarkRelease({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      baselineSummaryPath: "baseline-summary.json",
      includeP0: true,
      strictGate: true,
      commandRunner: (step) => ({
        status: step.id === "benchmark-release:compare" ? 1 : 0,
        signal: "",
        stdout: "",
        stderr: "",
        error: "",
      }),
      now: () => new Date("2026-07-09T00:00:00.000Z"),
    });

    expect(report.summary).toMatchObject({
      failedStepCount: 1,
      skippedStepCount: 1,
      valid: false,
    });
    expect(report.steps.find((step) => step.id === "benchmark-release:compare")).toEqual(
      expect.objectContaining({
        status: "failed",
        reason: "command_failed",
      }),
    );
    expect(report.steps.at(-1)).toEqual(
      expect.objectContaining({
        id: "benchmark-release:gate",
        status: "skipped",
        reason: "previous_required_step_failed",
      }),
    );
  });

  it("strict gate 下 summary releaseReady=false 会阻断 compare 和后续 gate", () => {
    const root = makeRepo();
    writeCustomBaselineDescriptor(root);
    const report = runBenchmarkRelease({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      baselineSummaryPath: "baseline-summary.json",
      includeP0: true,
      strictGate: true,
      commandRunner: (step) => ({
        status: step.id === "benchmark-release:summary" ? 1 : 0,
        signal: "",
        stdout: "",
        stderr: "",
        error: "",
      }),
      now: () => new Date("2026-07-09T00:00:00.000Z"),
    });

    expect(report.summary).toMatchObject({
      failedStepCount: 1,
      skippedStepCount: 3,
      valid: false,
    });
    expect(report.steps.find((step) => step.id === "benchmark-release:summary")).toEqual(
      expect.objectContaining({
        status: "failed",
        reason: "command_failed",
      }),
    );
    expect(report.steps.find((step) => step.id === "benchmark-release:compare")).toEqual(
      expect.objectContaining({
        status: "skipped",
        reason: "previous_required_step_failed",
      }),
    );
    expect(report.steps.at(-1)).toEqual(
      expect.objectContaining({
        id: "benchmark-release:gate",
        status: "skipped",
      }),
    );
  });

  it("strict gate 失败时会阻断 baseline promotion", () => {
    const root = makeRepo();
    writeBaselineDescriptor(root);
    const report = runBenchmarkRelease({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      baselineVersion: "1.96.0",
      includeP0: true,
      strictGate: true,
      promoteBaseline: true,
      commandRunner: (step) => ({
        status: step.id === "benchmark-release:gate" ? 1 : 0,
        signal: "",
        stdout: "",
        stderr: "",
        error: "",
      }),
      now: () => new Date("2026-07-09T00:00:00.000Z"),
    });

    expect(report.summary).toMatchObject({
      failedStepCount: 1,
      skippedStepCount: 1,
      valid: false,
    });
    expect(report.steps.find((step) => step.id === "benchmark-release:gate")).toEqual(
      expect.objectContaining({
        status: "failed",
      }),
    );
    expect(report.steps.at(-1)).toEqual(
      expect.objectContaining({
        id: "benchmark-release:baseline",
        status: "skipped",
        reason: "previous_required_step_failed",
      }),
    );
  });

  it("strict gate 和 baseline promotion 都通过时 run valid", () => {
    const root = makeRepo();
    writeBaselineDescriptor(root);
    const report = runBenchmarkRelease({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      baselineVersion: "1.96.0",
      includeP0: true,
      strictGate: true,
      promoteBaseline: true,
      commandRunner: () => ({
        status: 0,
        signal: "",
        stdout: "",
        stderr: "",
        error: "",
      }),
      now: () => new Date("2026-07-09T00:00:00.000Z"),
    });

    expect(report.summary).toMatchObject({
      failedStepCount: 0,
      skippedStepCount: 0,
      valid: true,
    });
    expect(report.steps.at(-1)).toEqual(
      expect.objectContaining({
        id: "benchmark-release:baseline",
        status: "passed",
      }),
    );
  });

  it("strict gate 使用 baseline version 时要求 baseline descriptor ready", () => {
    const root = makeRepo();
    const commandCalls = [];
    const report = runBenchmarkRelease({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      baselineVersion: "1.96.0",
      includeP0: true,
      strictGate: true,
      commandRunner: (step) => {
        commandCalls.push(step.id);
        return {
          status: 0,
          signal: "",
          stdout: "",
          stderr: "",
          error: "",
        };
      },
      now: () => new Date("2026-07-09T00:00:00.000Z"),
    });
    const validation = validateBenchmarkReleaseRun(report);

    expect(commandCalls).toEqual([]);
    expect(validation.valid).toBe(false);
    expect(report.baselineDescriptor).toEqual(
      expect.objectContaining({
        status: "blocked",
        descriptorPath: ".lime/benchmark/releases/1.96.0/benchmark-baseline.json",
      }),
    );
    expect(report.issues).toEqual([
      "baseline_descriptor: .lime/benchmark/releases/1.96.0/benchmark-baseline.json: baseline descriptor 不存在",
    ]);
    expect(report.steps.every((step) => step.status === "skipped")).toBe(true);
  });

  it("strict gate 拒绝 bootstrap baseline descriptor", () => {
    const root = makeRepo();
    writeBaselineDescriptor(root, {
      baselineReady: false,
      baselineKind: "bootstrap",
      releaseReady: false,
      allowNotReady: true,
    });

    const report = runBenchmarkRelease({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      baselineVersion: "1.96.0",
      includeP0: true,
      strictGate: true,
      commandRunner: () => ({
        status: 0,
        signal: "",
        stdout: "",
        stderr: "",
        error: "",
      }),
      now: () => new Date("2026-07-09T00:00:00.000Z"),
    });

    expect(report.summary).toMatchObject({
      failedStepCount: 0,
      skippedStepCount: report.summary.stepCount,
      valid: false,
    });
    expect(report.issues).toEqual(
      expect.arrayContaining([
        "baseline_descriptor: .lime/benchmark/releases/1.96.0/benchmark-baseline.json: baselineReady 不是 true",
        "baseline_descriptor: .lime/benchmark/releases/1.96.0/benchmark-baseline.json: releaseReady 不是 true",
        "baseline_descriptor: .lime/benchmark/releases/1.96.0/benchmark-baseline.json: bootstrap baseline 不能用于 strict gate",
      ]),
    );
  });

  it("storage preflight blocked 时不执行任何步骤并输出 skipped report", () => {
    const root = makeRepo();
    const commandCalls = [];
    const report = runBenchmarkRelease({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      commandRunner: (step) => {
        commandCalls.push(step.id);
        return {
          status: 0,
          signal: "",
          stdout: "",
          stderr: "",
          error: "",
        };
      },
      storageChecker: () => ({
        status: "blocked",
        reason: "available_below_minimum",
        outputRoot: ".lime/benchmark/releases/1.97.0",
        checkedPath: root,
        minFreeBytes: 1024,
        availableBytes: 1,
        totalBytes: 1024,
        error: "",
      }),
      now: () => new Date("2026-07-09T00:00:00.000Z"),
    });
    const validation = validateBenchmarkReleaseRun(report);

    expect(commandCalls).toEqual([]);
    expect(validation.valid).toBe(false);
    expect(report.storage).toEqual(
      expect.objectContaining({
        status: "blocked",
        reason: "available_below_minimum",
      }),
    );
    expect(report.summary).toMatchObject({
      failedStepCount: 0,
      skippedStepCount: 10,
      valid: false,
    });
    expect(report.steps.every((step) => step.status === "skipped")).toBe(true);
    expect(report.issues).toEqual(["storage_preflight: available_below_minimum"]);
  });

  it("P0 step 失败时会写出 failed 和 skipped step evidence", () => {
    const root = makeRepo();
    const report = runBenchmarkRelease({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      outputRoot: "out",
      includeP0: true,
      commandRunner: (step) => ({
        status: step.id === "agent-qc-p0-manifest:npm-01-agent-qc-check" ? 1 : 0,
        signal: "",
        stdout: "",
        stderr: "",
        error: "",
      }),
      now: () => new Date("2026-07-09T00:00:00.000Z"),
    });

    expect(report.summary).toMatchObject({
      failedStepCount: 1,
      valid: false,
    });
    expect(
      readJson(path.join(root, "out", "p0", "agent-qc-p0-manifest", "01-agent-qc-check.json")),
    ).toEqual(
      expect.objectContaining({
        status: "failed",
        reason: "command_failed",
      }),
    );
    expect(
      readJson(path.join(root, "out", "p0", "agent-qc-p0-manifest", "02-test-contracts.json")),
    ).toEqual(
      expect.objectContaining({
        status: "skipped",
        reason: "previous_required_step_failed",
      }),
    );
  });
});
