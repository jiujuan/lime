import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runSuiteDryRun } from "./benchmark-dry-run.mjs";
import {
  buildBenchmarkReleaseRunPlan,
  runBenchmarkRelease,
} from "./benchmark-release-run.mjs";
import {
  buildBenchmarkReleaseSummary,
  validateBenchmarkReleaseSummary,
} from "./benchmark-release-summary.mjs";
import {
  buildPreflightReport,
  writePreflightArtifacts,
} from "./benchmark-true-run-preflight.mjs";
import {
  buildTrueRunReport,
  writeTrueRunArtifacts,
} from "./benchmark-true-run.mjs";

const TEST_COMMIT = "0123456789abcdef0123456789abcdef01234567";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lime-benchmark-release-run-current-"));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeFile(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeGitHead(sourceRoot) {
  writeFile(path.join(sourceRoot, ".git", "HEAD"), "ref: refs/heads/main\n");
  writeFile(path.join(sourceRoot, ".git", "refs", "heads", "main"), `${TEST_COMMIT}\n`);
}

function writeTerminalBenchTask(sourceRoot, taskId) {
  const taskRoot = path.join(sourceRoot, "original-tasks", taskId);
  writeFile(
    path.join(taskRoot, "task.yaml"),
    [
      "instruction: |-",
      `  Complete ${taskId}.`,
      "difficulty: easy",
      "category: file-ops",
      "parser_name: pytest",
      "max_agent_timeout_sec: 300",
      "",
    ].join("\n"),
  );
  writeFile(path.join(taskRoot, "Dockerfile"), "FROM debian:stable\n");
  writeFile(path.join(taskRoot, "docker-compose.yaml"), "services:\n  client:\n    build: .\n");
  writeFile(path.join(taskRoot, "run-tests.sh"), "#!/bin/bash\n");
  writeFile(path.join(taskRoot, "tests", "test_outputs.py"), "def test_ok(): pass\n");
}

function makeManifest() {
  return {
    schemaVersion: "benchmark-release-v1",
    datasetVersion: "test-version",
    suites: [
      {
        id: "terminal-bench-release-slice",
        priority: "P1",
        runner: "harbor-adapter",
        requiredForRelease: true,
        taskSet: ["hello-world", "fix-git"],
      },
    ],
  };
}

function makeRunnableManifest(rootDir) {
  const sourceRoot = path.join(rootDir, "sources", "terminal-bench");
  const taskRoot = path.join(sourceRoot, "original-tasks");
  return {
    schemaVersion: "benchmark-release-v1",
    datasetVersion: "test-version",
    downloadedSources: [
      {
        id: "terminal-bench",
        localPath: path.relative(process.cwd(), sourceRoot),
        commit: TEST_COMMIT,
      },
    ],
    suites: [
      {
        id: "terminal-bench-release-slice",
        priority: "P1",
        runner: "harbor-adapter",
        sourceRef: "terminal-bench",
        requiredForRelease: true,
        adapterStatus: "ready",
        taskRoot: path.relative(process.cwd(), taskRoot),
        taskSet: ["hello-world", "fix-git"],
      },
    ],
  };
}

function makeCurrentChainEvidence({ taskId }) {
  return {
    schemaVersion: "benchmark-current-chain-evidence-v1",
    suiteId: "terminal-bench-release-slice",
    taskId,
    appServer: {
      method: "agentSession/turn/start",
      invoked: true,
      sessionId: "session-1",
      threadId: "thread-1",
      turnId: `turn-${taskId}`,
    },
    evidenceExport: {
      method: "evidence/export",
      invoked: true,
      pack: {
        session_id: "session-1",
        thread_id: "thread-1",
        workspace_root: "/tmp/lime-workspace",
        pack_relative_root: `.lime/harness/sessions/session-1/${taskId}/evidence`,
        pack_absolute_root: `/tmp/lime-workspace/.lime/harness/sessions/session-1/${taskId}/evidence`,
        exported_at: "2026-07-09T00:00:00.000Z",
        thread_status: "completed",
        latest_turn_status: "completed",
        turn_count: 1,
        item_count: 2,
        pending_request_count: 0,
        queued_turn_count: 0,
        recent_artifact_count: 1,
        known_gaps: [],
        observability_summary: {
          schemaVersion: "runtime-evidence-pack.v1",
          source: "app-server-current",
          sessionId: "session-1",
          threadId: "thread-1",
        },
        artifacts: [],
      },
    },
    externalVerifier: {
      invoked: true,
      verdict: "pass",
      reward: 1,
    },
  };
}

function argValue(args, name, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function scriptArgs(step) {
  const separator = step.args.indexOf("--");
  return separator >= 0 ? step.args.slice(separator + 1) : [];
}

function commandResult(status = 0, stdout = "", stderr = "", error = "") {
  return {
    status,
    signal: "",
    stdout,
    stderr,
    error,
  };
}

function readyTerminalCommandRunner(command, args, options = {}) {
  const key = `${command} ${args.join(" ")}`;
  const okKeys = new Set([
    "uv --version",
    "docker --version",
    "docker info --format {{json .ServerVersion}}",
    "tb --help",
  ]);
  const ok = okKeys.has(key);
  return {
    command,
    args,
    cwd: path.relative(process.cwd(), options.cwd || process.cwd()) || ".",
    status: ok ? 0 : 1,
    signal: "",
    ok,
    stdout: ok ? "ok\n" : "",
    stderr: "",
    error: ok ? "" : "ENOENT",
  };
}

function readOptionalCurrentChainEvidence(filePath) {
  try {
    return readJson(filePath);
  } catch (error) {
    return {
      schemaVersion: "benchmark-current-chain-evidence-load-error-v1",
      loadError: error.message,
      sourcePath: filePath,
    };
  }
}

function suiteForManifest(manifest, suiteId) {
  const suite = manifest.suites.find((entry) => entry.id === suiteId);
  if (!suite) {
    throw new Error(`missing suite ${suiteId}`);
  }
  return suite;
}

function makeReleaseCommandRunner(rootDir) {
  return (step) => {
    const script = step.args[1];
    const args = scriptArgs(step);
    const manifestPath = argValue(args, "--manifest", "manifest.json");
    const outputPath = argValue(args, "--output", step.outputPath);

    if (script === "agent-qc:benchmark-release:context") {
      writeJson(path.resolve(rootDir, outputPath), {
        schemaVersion: "benchmark-release-context-v1",
        validation: { valid: true, issues: [] },
      });
      return commandResult();
    }

    if (script === "agent-qc:benchmark-release:checklist") {
      writeJson(path.resolve(rootDir, outputPath), {
        schemaVersion: "benchmark-release-checklist-v1",
        validation: { valid: true, issues: [] },
      });
      return commandResult();
    }

    if (script === "agent-qc:benchmark:dry-run") {
      const report = runSuiteDryRun(rootDir, {
        manifestPath,
        suiteId: argValue(args, "--suite"),
        outputPath: argValue(args, "--output"),
      });
      return commandResult(
        report.summary.verdict === "dry_run_ready" ? 0 : 1,
        `${JSON.stringify(report, null, 2)}\n`,
      );
    }

    if (script === "agent-qc:benchmark:true-run-preflight") {
      const manifest = readJson(path.resolve(rootDir, manifestPath));
      const suite = suiteForManifest(manifest, argValue(args, "--suite"));
      const report = buildPreflightReport({
        manifest,
        suite,
        taskId: argValue(args, "--task"),
        commandRunner: readyTerminalCommandRunner,
      });
      const written = writePreflightArtifacts(report, path.resolve(argValue(args, "--output")));
      const status = args.includes("--check") && written.verdict !== "ready" ? 1 : 0;
      return commandResult(status, `${JSON.stringify(written, null, 2)}\n`);
    }

    if (script === "agent-qc:benchmark:terminal-run") {
      const manifest = readJson(path.resolve(rootDir, manifestPath));
      const suite = suiteForManifest(manifest, "terminal-bench-release-slice");
      const currentChainEvidence = readOptionalCurrentChainEvidence(
        argValue(args, "--current-chain-evidence"),
      );
      const report = buildTrueRunReport({
        manifest,
        suite,
        taskId: argValue(args, "--task"),
        currentChainEvidence,
        commandRunner: readyTerminalCommandRunner,
      });
      const written = writeTrueRunArtifacts(report, path.resolve(argValue(args, "--output")));
      const status = args.includes("--check") && written.verdict !== "ready" ? 1 : 0;
      return commandResult(status, `${JSON.stringify(written, null, 2)}\n`);
    }

    if (script === "agent-qc:benchmark-release:summary") {
      const summary = buildBenchmarkReleaseSummary({
        rootDir,
        manifestPath,
        evidenceRoot: argValue(args, "--evidence-root"),
      });
      const validation = validateBenchmarkReleaseSummary(summary);
      writeJson(path.resolve(rootDir, outputPath), { ...summary, validation });
      const status =
        validation.valid && (!args.includes("--release-gate") || summary.releaseReady) ? 0 : 1;
      return commandResult(status, `${JSON.stringify({ ...summary, validation }, null, 2)}\n`);
    }

    if (script === "agent-qc:benchmark-release:check") {
      writeJson(path.resolve(rootDir, outputPath), {
        schemaVersion: "benchmark-release-check-v1",
        valid: true,
        releaseReady: false,
        releaseBlockers: [],
      });
      return commandResult();
    }

    return commandResult(1, "", "", `unsupported script ${script}`);
  };
}

describe("benchmark release run current-chain evidence", () => {
  it("current-chain evidence root 会按 suite/task 传给 true-run step", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeManifest());

    const plan = buildBenchmarkReleaseRunPlan({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      currentChainEvidenceRoot: ".lime/benchmark/current-chain",
      fullExternalSuites: true,
    });

    expect(plan.currentChainEvidenceRoot).toBe(".lime/benchmark/current-chain");
    expect(plan.steps.find((step) => step.id === "terminal-bench-release-slice:hello-world:true-run")).toEqual(
      expect.objectContaining({
        args: expect.arrayContaining([
          "--current-chain-evidence",
          ".lime/benchmark/current-chain/terminal-bench/hello-world/current-chain-evidence.json",
        ]),
      }),
    );
    expect(plan.steps.find((step) => step.id === "terminal-bench-release-slice:fix-git:true-run")).toEqual(
      expect.objectContaining({
        args: expect.arrayContaining([
          "--current-chain-evidence",
          ".lime/benchmark/current-chain/terminal-bench/fix-git/current-chain-evidence.json",
        ]),
      }),
    );
  });

  it("release runner 使用 current-chain root 时，valid task ready，缺失 task fail-closed", () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, "sources", "terminal-bench");
    const outputRoot = path.join(root, "release");
    const currentChainRoot = path.join(root, "current-chain");
    writeGitHead(sourceRoot);
    writeTerminalBenchTask(sourceRoot, "hello-world");
    writeTerminalBenchTask(sourceRoot, "fix-git");
    writeJson(path.join(root, "manifest.json"), makeRunnableManifest(root));
    writeJson(
      path.join(currentChainRoot, "terminal-bench", "hello-world", "current-chain-evidence.json"),
      makeCurrentChainEvidence({ taskId: "hello-world" }),
    );

    const report = runBenchmarkRelease({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0-current-chain-root",
      outputRoot,
      currentChainEvidenceRoot: currentChainRoot,
      fullExternalSuites: true,
      commandRunner: makeReleaseCommandRunner(root),
      storageChecker: () => ({
        status: "ready",
        reason: "",
        outputRoot,
        checkedPath: outputRoot,
        minFreeBytes: 0,
        availableBytes: 1024 * 1024 * 1024,
        totalBytes: 1024 * 1024 * 1024,
        error: "",
      }),
      now: () => new Date("2026-07-09T00:00:00.000Z"),
    });
    const summary = readJson(path.join(outputRoot, "benchmark-release-summary.json"));
    const suite = summary.suites.find((entry) => entry.id === "terminal-bench-release-slice");
    const helloWorld = suite.trueRunTasks.find((task) => task.taskId === "hello-world");
    const fixGit = suite.trueRunTasks.find((task) => task.taskId === "fix-git");

    expect(report.summary).toMatchObject({
      failedStepCount: 0,
      skippedStepCount: 0,
      valid: true,
    });
    expect(summary.releaseReady).toBe(false);
    expect(helloWorld).toMatchObject({
      verdict: "ready",
      execution: {
        currentChainInvoked: true,
        trueRunInvoked: true,
        verifierInvoked: true,
        currentChain: {
          appServerMethod: "agentSession/turn/start",
          evidenceExportMethod: "evidence/export",
          evidenceExportInvoked: true,
        },
      },
      evidencePack: {
        present: true,
        valid: true,
      },
    });
    expect(fixGit).toMatchObject({
      verdict: "blocked",
      blockers: [
        expect.objectContaining({
          id: "lime_current_chain_evidence",
          phase: "adapter",
        }),
      ],
    });
    expect(summary.trueRunBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          suiteId: "terminal-bench-release-slice",
          taskId: "fix-git",
          id: "lime_current_chain_evidence",
        }),
      ]),
    );
    expect(summary.trueRunEvidenceBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          suiteId: "terminal-bench-release-slice",
          taskId: "fix-git",
          id: "task_set_true_run_not_ready",
        }),
      ]),
    );
  });
});
