import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildBenchmarkReleaseChecklist,
  validateBenchmarkReleaseChecklist,
} from "./benchmark-release-checklist.mjs";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lime-benchmark-release-checklist-"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function makeManifest() {
  return {
    schemaVersion: "benchmark-release-v1",
    datasetVersion: "test-version",
    suites: [
      {
        id: "agent-qc-p0-manifest",
        priority: "P0",
        runner: "npm",
        requiredForRelease: true,
        commands: [
          "npm run agent-qc:check",
          "npm run agent-qc:benchmark-release:check",
        ],
      },
      {
        id: "terminal-bench-release-slice",
        priority: "P1",
        runner: "harbor-adapter",
        requiredForRelease: true,
        adapterStatus: "dry_run_ready",
        taskSet: ["hello-world", "git-mastery"],
      },
      {
        id: "deepswe-fixed-ten",
        priority: "P1",
        runner: "deepswe-adapter",
        requiredForRelease: true,
        adapterStatus: "dry_run_ready",
        taskSet: ["ytt-jsonpath-query-api", "rust-serde-compat"],
      },
    ],
  };
}

function makePackageJson() {
  return {
    scripts: {
      "agent-qc:check": "node scripts/agent-qc/report.mjs --check --format json",
      "agent-qc:benchmark-release:check": "node scripts/agent-qc/benchmark-release-check.mjs --check --format json",
      "agent-qc:benchmark:dry-run": "node scripts/agent-qc/benchmark-dry-run.mjs",
      "agent-qc:benchmark:true-run-preflight": "node scripts/agent-qc/benchmark-true-run-preflight.mjs",
      "agent-qc:benchmark:terminal-run": "node scripts/agent-qc/benchmark-true-run.mjs --suite terminal-bench-release-slice",
      "agent-qc:benchmark:deepswe-run": "node scripts/agent-qc/benchmark-true-run.mjs --suite deepswe-fixed-ten",
      "agent-qc:benchmark-release:context": "node scripts/agent-qc/benchmark-release-context.mjs",
      "agent-qc:benchmark-release:summary": "node scripts/agent-qc/benchmark-release-summary.mjs",
      "agent-qc:benchmark-release:gate": "node scripts/agent-qc/benchmark-release-check.mjs --check --release-gate --format json",
    },
  };
}

describe("benchmark release checklist", () => {
  it("展开 npm suite、外部 dry-run / preflight / planned true-run 和 release ops", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeManifest());
    writeJson(path.join(root, "package.json"), makePackageJson());

    const checklist = buildBenchmarkReleaseChecklist({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
    });
    const validation = validateBenchmarkReleaseChecklist(checklist);

    expect(validation.valid).toBe(true);
    expect(checklist).toMatchObject({
      schemaVersion: "benchmark-release-checklist-v1",
      datasetVersion: "test-version",
      releaseRoot: ".lime/benchmark/releases/1.97.0",
      fullExternalSuites: false,
      strictGate: false,
      summary: {
        suiteCount: 3,
        stepCount: 12,
        readyStepCount: 10,
        plannedStepCount: 2,
        unsupportedStepCount: 0,
        issueCount: 0,
      },
    });
    expect(checklist.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "agent-qc-p0-manifest:command:1",
          kind: "npm_command",
          status: "ready",
          command: "npm run agent-qc:check",
        }),
        expect.objectContaining({
          id: "terminal-bench-release-slice:dry-run",
          kind: "dry_run",
          status: "ready",
          evidencePath:
            ".lime/benchmark/releases/1.97.0/terminal-bench/dry-run/suite-summary.json",
        }),
        expect.objectContaining({
          id: "terminal-bench-release-slice:hello-world:true-run-preflight",
          kind: "true_run_preflight",
          status: "ready",
          command: expect.stringContaining("--manifest \"manifest.json\""),
        }),
        expect.objectContaining({
          id: "terminal-bench-release-slice:hello-world:true-run-preflight",
          kind: "true_run_preflight",
          status: "ready",
          command: expect.stringContaining("--task \"hello-world\""),
        }),
        expect.objectContaining({
          id: "terminal-bench-release-slice:hello-world:true-run",
          kind: "true_run",
          status: "planned",
          command: expect.stringContaining("--output \".lime/benchmark/releases/1.97.0/terminal-bench/hello-world-true-run\""),
          reason: "terminal_bench_true_run_adapter_not_ready",
        }),
        expect.objectContaining({
          id: "deepswe-fixed-ten:ytt-jsonpath-query-api:true-run",
          kind: "true_run",
          status: "planned",
          reason: "deepswe_true_run_adapter_not_ready",
        }),
        expect.objectContaining({
          id: "benchmark-release:context",
          kind: "release_context",
          command: expect.stringContaining(
            "npm run agent-qc:benchmark-release:context",
          ),
          evidencePath: ".lime/benchmark/releases/1.97.0/run-context.json",
        }),
        expect.objectContaining({
          id: "benchmark-release:summary",
          kind: "release_summary",
          command: expect.stringContaining(
            "npm run agent-qc:benchmark-release:summary",
          ),
        }),
        expect.objectContaining({
          id: "benchmark-release:check",
          kind: "manifest_check",
          command: expect.stringContaining("npm run agent-qc:benchmark-release:check"),
        }),
        expect.objectContaining({
          id: "benchmark-release:gate",
          kind: "release_gate",
          command: expect.stringContaining("npm run agent-qc:benchmark-release:gate"),
        }),
      ]),
    );
    expect(
      checklist.steps
        .filter((step) => step.kind === "true_run_preflight" || step.kind === "true_run")
        .map((step) => step.id),
    ).toEqual([
      "terminal-bench-release-slice:hello-world:true-run-preflight",
      "terminal-bench-release-slice:hello-world:true-run",
      "deepswe-fixed-ten:ytt-jsonpath-query-api:true-run-preflight",
      "deepswe-fixed-ten:ytt-jsonpath-query-api:true-run",
    ]);
  });

  it("full-external-suites 会展开 external suite 全量 taskSet", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeManifest());
    writeJson(path.join(root, "package.json"), makePackageJson());

    const checklist = buildBenchmarkReleaseChecklist({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      fullExternalSuites: true,
    });

    expect(checklist.fullExternalSuites).toBe(true);
    expect(checklist.summary).toMatchObject({
      stepCount: 16,
      readyStepCount: 12,
      plannedStepCount: 4,
      issueCount: 0,
    });
    expect(
      checklist.steps
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

  it("strict gate 自动启用 full external suite 并把 summary 设为 release gate", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeManifest());
    writeJson(path.join(root, "package.json"), makePackageJson());

    const checklist = buildBenchmarkReleaseChecklist({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      outputRoot: ".lime/benchmark/runs/custom-output-root",
      strictGate: true,
    });

    expect(checklist.fullExternalSuites).toBe(true);
    expect(checklist.strictGate).toBe(true);
    expect(checklist.releaseRoot).toBe(".lime/benchmark/runs/custom-output-root");
    expect(checklist.steps.map((step) => step.id)).toContain(
      "terminal-bench-release-slice:git-mastery:true-run",
    );
    expect(checklist.steps.find((step) => step.id === "benchmark-release:summary")).toEqual(
      expect.objectContaining({
        command: expect.stringContaining("--release-gate"),
        evidencePath:
          ".lime/benchmark/runs/custom-output-root/benchmark-release-summary.json",
      }),
    );
  });

  it("模块导入不依赖 process.argv[1]", () => {
    const moduleUrl = pathToFileURL(
      path.resolve(process.cwd(), "scripts/agent-qc/benchmark-release-checklist.mjs"),
    ).href;

    const stdout = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `delete process.argv[1]; const mod = await import(${JSON.stringify(moduleUrl)}); if (typeof mod.buildBenchmarkReleaseChecklist !== "function") process.exit(1);`,
      ],
      { encoding: "utf8" },
    );

    expect(stdout).toBe("");
  });
});
