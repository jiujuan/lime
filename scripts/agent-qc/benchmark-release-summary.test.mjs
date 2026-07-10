import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildBenchmarkReleaseSummary,
  validateBenchmarkReleaseSummary,
} from "./benchmark-release-summary.mjs";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lime-benchmark-release-summary-"));
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
        commands: ["npm run agent-qc:check"],
        status: "ready",
      },
      {
        id: "terminal-bench-release-slice",
        priority: "P1",
        runner: "harbor-adapter",
        requiredForRelease: true,
        adapterStatus: "dry_run_ready",
        status: "dry_run_ready",
      },
      {
        id: "deepswe-fixed-ten",
        priority: "P1",
        runner: "deepswe-adapter",
        requiredForRelease: true,
        adapterStatus: "dry_run_ready",
        status: "dry_run_ready",
      },
    ],
  };
}

function makeDryRunSuite(suiteId) {
  return {
    schemaVersion: "benchmark-suite-dry-run-v1",
    generatedAt: "2026-07-09T00:00:00.000Z",
    mode: "dry_run",
    suite: {
      id: suiteId,
      runner: "harbor-adapter",
      sourceRef: "terminal-bench",
      taskCount: 2,
    },
    summary: {
      readyCount: 2,
      blockedCount: 0,
      taskCount: 2,
      verdict: "dry_run_ready",
    },
    tasks: [],
  };
}

function makePreflightSummary(suiteId, taskId) {
  return {
    schemaVersion: "benchmark-true-run-preflight-v1",
    generatedAt: "2026-07-09T00:10:00.000Z",
    mode: "true_run_preflight",
    verdict: "blocked",
    suite: {
      id: suiteId,
      runner: "deepswe-adapter",
      sourceRef: "deep-swe",
      requiredForRelease: true,
      adapterStatus: "dry_run_ready",
    },
    task: {
      id: taskId,
      benchmarkKind: "deep-swe",
    },
    blockers: [
      {
        id: "docker_cli",
        reason: "docker_cli_missing",
        label: "Docker CLI is available",
      },
    ],
  };
}

function makeTrueRunSuite(suiteId) {
  return {
    schemaVersion: "benchmark-suite-true-run-v1",
    generatedAt: "2026-07-09T00:20:00.000Z",
    mode: "true_run",
    suite: {
      id: suiteId,
      runner: "harbor-adapter",
      requiredForRelease: true,
      taskCount: 1,
    },
    summary: {
      readyCount: 0,
      blockedCount: 1,
      taskCount: 1,
      verdict: "blocked",
      releaseReady: false,
    },
    tasks: [
      {
        taskId: "hello-world",
        verdict: "blocked",
        blockerCount: 1,
        blockers: [
          {
            id: "lime_current_true_run_adapter",
            reason: "lime_current_true_run_adapter_not_implemented",
            phase: "adapter",
          },
        ],
      },
    ],
  };
}

function makeReadyTrueRunTask({
  taskId = "hello-world",
  currentChainInvoked = true,
  trueRunInvoked = true,
  verifierInvoked = true,
  currentChain = {
    target: "lime_app_server_current",
    appServerMethod: "agentSession/turn/start",
    evidenceExportMethod: "evidence/export",
    externalVerifier: true,
    invoked: currentChainInvoked,
    evidenceExportInvoked: currentChainInvoked,
  },
} = {}) {
  return {
    schemaVersion: "benchmark-true-run-v1",
    generatedAt: "2026-07-09T00:30:00.000Z",
    mode: "true_run",
    verdict: "ready",
    suite: {
      id: "terminal-bench-release-slice",
      runner: "harbor-adapter",
      sourceRef: "terminal-bench",
      requiredForRelease: true,
      adapterStatus: "ready",
    },
    task: {
      id: taskId,
      benchmarkKind: "terminal-bench",
    },
    execution: {
      providerInvoked: true,
      verifierInvoked,
      dockerInvoked: true,
      liveProviderUsed: true,
      trueRunInvoked,
      currentChainInvoked,
      currentChain,
      reason: "test ready true-run evidence",
    },
    checks: [],
    blockers: [],
    requiredFiles: [],
    missingFiles: [],
  };
}

function makeTrueRunEvidencePack({ taskId = "hello-world", verdict = "ready" } = {}) {
  return {
    schemaVersion: "benchmark-evidence-pack-v1",
    generatedAt: "2026-07-09T00:30:01.000Z",
    mode: "true_run",
    suiteId: "terminal-bench-release-slice",
    taskId,
    outputDir: `runs/true-run/terminal/${taskId}`,
    verdict,
    files: [],
    source: {
      id: "terminal-bench",
    },
    blockers: [],
    missingFiles: [],
  };
}

function makeP0OnlyManifest() {
  return {
    schemaVersion: "benchmark-release-v1",
    datasetVersion: "test-version",
    suites: [
      {
        id: "lime-p0-gate",
        priority: "P0",
        runner: "npm",
        requiredForRelease: true,
        commands: ["npm run verify:local", "npm run test:contracts"],
        status: "planned",
      },
    ],
  };
}

function makeP0AndReadyExternalManifest({ taskSet = [] } = {}) {
  return {
    schemaVersion: "benchmark-release-v1",
    datasetVersion: "test-version",
    suites: [
      {
        id: "lime-p0-gate",
        priority: "P0",
        runner: "npm",
        requiredForRelease: true,
        commands: ["npm run verify:local"],
        status: "ready",
      },
      {
        id: "terminal-bench-release-slice",
        priority: "P1",
        runner: "harbor-adapter",
        requiredForRelease: true,
        adapterStatus: "ready",
        status: "ready",
        taskSet,
      },
    ],
  };
}

function makeP0GateStep({ command, id, status, generatedAt = "2026-07-09T00:00:00.000Z" }) {
  return {
    kind: "p0_npm_gate",
    id,
    command,
    status,
    exitCode: status === "passed" ? 0 : 1,
    reason: status === "passed" ? "" : "command_failed",
    outputPath: `.lime/benchmark/runs/test/p0/lime-p0-gate/${id}.json`,
    generatedAt,
  };
}

describe("benchmark release summary", () => {
  it("聚合 dry-run suite 和 true-run preflight evidence，但不把 blocked 当结构失败", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeManifest());
    writeJson(
      path.join(root, "runs", "dry", "terminal", "suite-summary.json"),
      makeDryRunSuite("terminal-bench-release-slice"),
    );
    writeJson(
      path.join(root, "runs", "preflight", "deepswe", "summary.json"),
      makePreflightSummary("deepswe-fixed-ten", "ytt-jsonpath-query-api"),
    );

    const summary = buildBenchmarkReleaseSummary({
      rootDir: root,
      manifestPath: "manifest.json",
      evidenceRoot: "runs",
    });
    const validation = validateBenchmarkReleaseSummary(summary);

    expect(validation.valid).toBe(true);
    expect(summary.releaseReady).toBe(false);
    expect(summary.summary).toMatchObject({
      dryRunSuiteCount: 1,
      preflightCount: 1,
      preflightBlockerCount: 1,
      releaseBlockerCount: 2,
    });
    expect(summary.suites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "terminal-bench-release-slice",
          state: "dry_run_ready",
        }),
        expect.objectContaining({
          id: "deepswe-fixed-ten",
          state: "blocked",
        }),
      ]),
    );
  });

  it("required external suite 缺少 dry-run 或 preflight evidence 时校验失败", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeManifest());

    const summary = buildBenchmarkReleaseSummary({
      rootDir: root,
      manifestPath: "manifest.json",
      evidenceRoot: "runs",
    });
    const validation = validateBenchmarkReleaseSummary(summary);

    expect(validation.valid).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("terminal-bench-release-slice"),
        expect.stringContaining("deepswe-fixed-ten"),
      ]),
    );
  });

  it("聚合 true-run suite evidence 并标记 blocked", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeManifest());
    writeJson(
      path.join(root, "runs", "true-run", "terminal", "suite-summary.json"),
      makeTrueRunSuite("terminal-bench-release-slice"),
    );

    const summary = buildBenchmarkReleaseSummary({
      rootDir: root,
      manifestPath: "manifest.json",
      evidenceRoot: "runs",
    });

    expect(summary.summary).toMatchObject({
      trueRunSuiteCount: 1,
      trueRunBlockerCount: 1,
    });
    expect(summary.suites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "terminal-bench-release-slice",
          state: "blocked",
          trueRun: expect.objectContaining({
            verdict: "blocked",
            blockedCount: 1,
          }),
        }),
      ]),
    );
  });

  it("required P0 npm suite 缺少 step evidence 时进入 P0 blocker", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeP0OnlyManifest());

    const summary = buildBenchmarkReleaseSummary({
      rootDir: root,
      manifestPath: "manifest.json",
      evidenceRoot: "runs",
    });
    const validation = validateBenchmarkReleaseSummary(summary);

    expect(validation.valid).toBe(true);
    expect(summary.releaseReady).toBe(false);
    expect(summary.summary).toMatchObject({
      p0GateStepCount: 0,
      p0GateBlockerCount: 2,
    });
    expect(summary.p0GateBlockers).toEqual([
      expect.objectContaining({
        suiteId: "lime-p0-gate",
        id: "p0_gate_missing",
        command: "npm run verify:local",
        reason: "missing_p0_gate_evidence",
      }),
      expect.objectContaining({
        suiteId: "lime-p0-gate",
        id: "p0_gate_missing",
        command: "npm run test:contracts",
        reason: "missing_p0_gate_evidence",
      }),
    ]);
  });

  it("聚合 P0 npm step evidence，并把失败 step 计入 releaseReady blocker", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeP0OnlyManifest());
    writeJson(
      path.join(root, "runs", "p0", "verify-local.json"),
      makeP0GateStep({
        id: "lime-p0-gate:npm-01-verify-local",
        command: "npm run verify:local",
        status: "failed",
      }),
    );
    writeJson(
      path.join(root, "runs", "p0", "test-contracts.json"),
      makeP0GateStep({
        id: "lime-p0-gate:npm-02-test-contracts",
        command: "npm run test:contracts",
        status: "passed",
      }),
    );

    const summary = buildBenchmarkReleaseSummary({
      rootDir: root,
      manifestPath: "manifest.json",
      evidenceRoot: "runs",
    });

    expect(summary.releaseReady).toBe(false);
    expect(summary.summary).toMatchObject({
      p0GateStepCount: 2,
      p0GatePassedCount: 1,
      p0GateFailedCount: 1,
      p0GateBlockerCount: 1,
    });
    expect(summary.suites).toEqual([
      expect.objectContaining({
        id: "lime-p0-gate",
        state: "failed",
        p0Gate: expect.arrayContaining([
          expect.objectContaining({
            command: "npm run verify:local",
            status: "failed",
          }),
        ]),
      }),
    ]);
  });

  it("全部 P0 npm step 通过且无外部 blocker 时 releaseReady 为 true", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeP0OnlyManifest());
    writeJson(
      path.join(root, "runs", "p0", "verify-local.json"),
      makeP0GateStep({
        id: "lime-p0-gate:npm-01-verify-local",
        command: "npm run verify:local",
        status: "passed",
      }),
    );
    writeJson(
      path.join(root, "runs", "p0", "test-contracts.json"),
      makeP0GateStep({
        id: "lime-p0-gate:npm-02-test-contracts",
        command: "npm run test:contracts",
        status: "passed",
      }),
    );

    const summary = buildBenchmarkReleaseSummary({
      rootDir: root,
      manifestPath: "manifest.json",
      evidenceRoot: "runs",
    });

    expect(summary.releaseReady).toBe(true);
    expect(summary.summary).toMatchObject({
      p0GateStepCount: 2,
      p0GatePassedCount: 2,
      p0GateBlockerCount: 0,
      releaseBlockerCount: 0,
    });
    expect(summary.suites).toEqual([
      expect.objectContaining({
        id: "lime-p0-gate",
        state: "passed",
      }),
    ]);
  });

  it("P0 全过且 adapter ready 时，blocked true-run 仍阻断 releaseReady", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeP0AndReadyExternalManifest());
    writeJson(
      path.join(root, "runs", "p0", "verify-local.json"),
      makeP0GateStep({
        id: "lime-p0-gate:npm-01-verify-local",
        command: "npm run verify:local",
        status: "passed",
      }),
    );
    writeJson(
      path.join(root, "runs", "true-run", "terminal", "suite-summary.json"),
      makeTrueRunSuite("terminal-bench-release-slice"),
    );

    const summary = buildBenchmarkReleaseSummary({
      rootDir: root,
      manifestPath: "manifest.json",
      evidenceRoot: "runs",
    });

    expect(summary.releaseReady).toBe(false);
    expect(summary.summary).toMatchObject({
      releaseBlockerCount: 0,
      p0GateBlockerCount: 0,
      trueRunBlockerCount: 1,
    });
    expect(summary.trueRunBlockers).toEqual([
      expect.objectContaining({
        suiteId: "terminal-bench-release-slice",
        id: "suite_true_run_blocked",
        reason: "blockedCount=1",
      }),
    ]);
  });

  it("P0 全过且 adapter ready 但缺 current-chain ready true-run task 时仍阻断 releaseReady", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeP0AndReadyExternalManifest());
    writeJson(
      path.join(root, "runs", "p0", "verify-local.json"),
      makeP0GateStep({
        id: "lime-p0-gate:npm-01-verify-local",
        command: "npm run verify:local",
        status: "passed",
      }),
    );
    writeJson(
      path.join(root, "runs", "dry", "terminal", "suite-summary.json"),
      makeDryRunSuite("terminal-bench-release-slice"),
    );

    const summary = buildBenchmarkReleaseSummary({
      rootDir: root,
      manifestPath: "manifest.json",
      evidenceRoot: "runs",
    });

    expect(summary.releaseReady).toBe(false);
    expect(summary.summary).toMatchObject({
      releaseBlockerCount: 0,
      p0GateBlockerCount: 0,
      trueRunBlockerCount: 0,
      trueRunEvidenceBlockerCount: 1,
    });
    expect(summary.trueRunEvidenceBlockers).toEqual([
      expect.objectContaining({
        suiteId: "terminal-bench-release-slice",
        id: "ready_true_run_task_missing",
        reason: "required_external_suite_needs_ready_current_chain_true_run_task",
      }),
    ]);
  });

  it("ready true-run 必须同时具备 current chain、true-run、external verifier 和 Evidence Pack", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeP0AndReadyExternalManifest());
    writeJson(
      path.join(root, "runs", "p0", "verify-local.json"),
      makeP0GateStep({
        id: "lime-p0-gate:npm-01-verify-local",
        command: "npm run verify:local",
        status: "passed",
      }),
    );
    writeJson(
      path.join(root, "runs", "dry", "terminal", "suite-summary.json"),
      makeDryRunSuite("terminal-bench-release-slice"),
    );
    writeJson(
      path.join(root, "runs", "true-run", "terminal", "hello-world", "summary.json"),
      makeReadyTrueRunTask({
        currentChainInvoked: false,
        trueRunInvoked: true,
        verifierInvoked: false,
      }),
    );

    const missingEvidenceSummary = buildBenchmarkReleaseSummary({
      rootDir: root,
      manifestPath: "manifest.json",
      evidenceRoot: "runs",
    });

    expect(missingEvidenceSummary.releaseReady).toBe(false);
    expect(missingEvidenceSummary.summary.trueRunEvidenceBlockerCount).toBe(3);
    expect(missingEvidenceSummary.trueRunEvidenceBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "current_chain_not_invoked",
        }),
        expect.objectContaining({
          id: "external_verifier_not_invoked",
        }),
        expect.objectContaining({
          id: "evidence_pack_invalid",
          reason: "evidence_pack_missing",
        }),
      ]),
    );

    writeJson(
      path.join(
        root,
        "runs",
        "true-run",
        "terminal",
        "hello-world",
        "summary.json",
      ),
      makeReadyTrueRunTask(),
    );
    writeJson(
      path.join(
        root,
        "runs",
        "true-run",
        "terminal",
        "hello-world",
        "evidence-pack",
        "manifest.json",
      ),
      makeTrueRunEvidencePack(),
    );

    const summary = buildBenchmarkReleaseSummary({
      rootDir: root,
      manifestPath: "manifest.json",
      evidenceRoot: "runs",
    });

    expect(summary.releaseReady).toBe(true);
    expect(summary.summary).toMatchObject({
      releaseBlockerCount: 0,
      p0GateBlockerCount: 0,
      trueRunBlockerCount: 0,
      trueRunEvidenceBlockerCount: 0,
    });
    expect(summary.suites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "terminal-bench-release-slice",
          state: "true_run_task_ready",
          trueRunTasks: [
            expect.objectContaining({
              taskId: "hello-world",
              verdict: "ready",
              execution: expect.objectContaining({
                currentChainInvoked: true,
                trueRunInvoked: true,
                verifierInvoked: true,
              }),
              evidencePack: expect.objectContaining({
                valid: true,
              }),
            }),
          ],
        }),
      ]),
    );
  });

  it("ready true-run 声称 current chain invoked 时必须给出 current App Server contract", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeP0AndReadyExternalManifest());
    writeJson(
      path.join(root, "runs", "p0", "verify-local.json"),
      makeP0GateStep({
        id: "lime-p0-gate:npm-01-verify-local",
        command: "npm run verify:local",
        status: "passed",
      }),
    );
    writeJson(
      path.join(root, "runs", "dry", "terminal", "suite-summary.json"),
      makeDryRunSuite("terminal-bench-release-slice"),
    );
    writeJson(
      path.join(root, "runs", "true-run", "terminal", "hello-world", "summary.json"),
      makeReadyTrueRunTask({
        currentChain: {
          target: "legacy_agent_runtime",
          appServerMethod: "agent_runtime_turn_start",
          evidenceExportMethod: "agent_runtime_export",
          externalVerifier: true,
          invoked: true,
          evidenceExportInvoked: false,
        },
      }),
    );
    writeJson(
      path.join(
        root,
        "runs",
        "true-run",
        "terminal",
        "hello-world",
        "evidence-pack",
        "manifest.json",
      ),
      makeTrueRunEvidencePack(),
    );

    const summary = buildBenchmarkReleaseSummary({
      rootDir: root,
      manifestPath: "manifest.json",
      evidenceRoot: "runs",
    });

    expect(summary.releaseReady).toBe(false);
    expect(summary.summary.trueRunEvidenceBlockerCount).toBe(2);
    expect(summary.trueRunEvidenceBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "current_chain_contract_invalid",
        }),
        expect.objectContaining({
          id: "evidence_export_not_invoked",
        }),
      ]),
    );
  });

  it("adapter ready 的 required external suite 必须覆盖 manifest taskSet 全量 true-run", () => {
    const root = makeTempDir();
    writeJson(
      path.join(root, "manifest.json"),
      makeP0AndReadyExternalManifest({ taskSet: ["hello-world", "fix-git"] }),
    );
    writeJson(
      path.join(root, "runs", "p0", "verify-local.json"),
      makeP0GateStep({
        id: "lime-p0-gate:npm-01-verify-local",
        command: "npm run verify:local",
        status: "passed",
      }),
    );
    writeJson(
      path.join(root, "runs", "dry", "terminal", "suite-summary.json"),
      makeDryRunSuite("terminal-bench-release-slice"),
    );
    writeJson(
      path.join(root, "runs", "true-run", "terminal", "hello-world", "summary.json"),
      makeReadyTrueRunTask({ taskId: "hello-world" }),
    );
    writeJson(
      path.join(root, "runs", "true-run", "terminal", "hello-world", "evidence-pack", "manifest.json"),
      makeTrueRunEvidencePack({ taskId: "hello-world" }),
    );

    const missingTaskSummary = buildBenchmarkReleaseSummary({
      rootDir: root,
      manifestPath: "manifest.json",
      evidenceRoot: "runs",
    });

    expect(missingTaskSummary.releaseReady).toBe(false);
    expect(missingTaskSummary.summary.trueRunEvidenceBlockerCount).toBe(1);
    expect(missingTaskSummary.trueRunEvidenceBlockers).toEqual([
      expect.objectContaining({
        suiteId: "terminal-bench-release-slice",
        taskId: "fix-git",
        id: "task_set_true_run_missing",
        reason: "required_external_suite_must_cover_full_task_set",
      }),
    ]);

    writeJson(
      path.join(root, "runs", "true-run", "terminal", "fix-git", "summary.json"),
      makeReadyTrueRunTask({ taskId: "fix-git" }),
    );
    writeJson(
      path.join(root, "runs", "true-run", "terminal", "fix-git", "evidence-pack", "manifest.json"),
      makeTrueRunEvidencePack({ taskId: "fix-git" }),
    );

    const fullTaskSetSummary = buildBenchmarkReleaseSummary({
      rootDir: root,
      manifestPath: "manifest.json",
      evidenceRoot: "runs",
    });

    expect(fullTaskSetSummary.releaseReady).toBe(true);
    expect(fullTaskSetSummary.summary).toMatchObject({
      trueRunTaskCount: 2,
      trueRunEvidenceBlockerCount: 0,
    });
  });
});
