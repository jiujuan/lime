import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildSuiteSummary,
  buildTrueRunReport,
  writeTrueRunArtifacts,
} from "./benchmark-true-run.mjs";

const TEST_COMMIT = "0123456789abcdef0123456789abcdef01234567";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lime-benchmark-true-run-"));
}

function writeFile(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeGitHead(sourceRoot) {
  writeFile(path.join(sourceRoot, ".git", "HEAD"), "ref: refs/heads/main\n");
  writeFile(path.join(sourceRoot, ".git", "refs", "heads", "main"), `${TEST_COMMIT}\n`);
}

function writeTerminalBenchTask(sourceRoot, taskId = "hello-world") {
  const taskRoot = path.join(sourceRoot, "original-tasks", taskId);
  writeFile(
    path.join(taskRoot, "task.yaml"),
    [
      "instruction: |-",
      "  Create a hello world file.",
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

function writeDeepSweTask(sourceRoot, taskId = "ytt-jsonpath-query-api") {
  const taskRoot = path.join(sourceRoot, "tasks", taskId);
  writeFile(
    path.join(taskRoot, "task.toml"),
    [
      'schema_version = "1.1"',
      'artifacts = ["/logs/artifacts/model.patch"]',
      "[metadata]",
      'task_id = "ytt-jsonpath-query-api"',
      'display_title = "Add JSONPath query APIs"',
      'language = "go"',
      'repository_url = "https://github.com/carvel-dev/ytt"',
      'base_commit_hash = "452382821dd9dae7cc36995960656bb94dc47212"',
      "[verifier]",
      'environment_mode = "separate"',
      "[environment]",
      'docker_image = "public.ecr.aws/example/deep-swe:v1.1"',
      "",
    ].join("\n"),
  );
  writeFile(path.join(taskRoot, "instruction.md"), "Add JSONPath query APIs.\n");
  writeFile(path.join(taskRoot, "pre_artifacts.sh"), "#!/bin/bash\n");
  writeFile(path.join(taskRoot, "environment", "Dockerfile"), "FROM debian:stable\n");
  writeFile(path.join(taskRoot, "tests", "Dockerfile"), "FROM debian:stable\n");
  writeFile(path.join(taskRoot, "tests", "test.patch"), "diff --git a/a b/a\n");
  writeFile(path.join(taskRoot, "tests", "test.sh"), "#!/bin/bash\n");
  writeFile(path.join(taskRoot, "tests", "grader.py"), "print('ok')\n");
  writeFile(path.join(taskRoot, "tests", "config.json"), "{}\n");
}

function makeTerminalManifest(rootDir, taskId = "hello-world") {
  const sourceRoot = path.join(rootDir, "sources", "terminal-bench");
  return {
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
        runner: "harbor-adapter",
        sourceRef: "terminal-bench",
        requiredForRelease: true,
        adapterStatus: "dry_run_ready",
        taskRoot: path.relative(
          process.cwd(),
          path.join(sourceRoot, "original-tasks"),
        ),
        taskSet: [taskId],
      },
    ],
  };
}

function makeDeepSweManifest(rootDir, taskId = "ytt-jsonpath-query-api") {
  const sourceRoot = path.join(rootDir, "sources", "deep-swe");
  return {
    downloadedSources: [
      {
        id: "deep-swe",
        localPath: path.relative(process.cwd(), sourceRoot),
        commit: TEST_COMMIT,
      },
    ],
    suites: [
      {
        id: "deepswe-fixed-ten",
        runner: "deepswe-adapter",
        sourceRef: "deep-swe",
        requiredForRelease: true,
        adapterStatus: "dry_run_ready",
        taskRoot: path.relative(process.cwd(), path.join(sourceRoot, "tasks")),
        taskSet: [taskId],
      },
    ],
  };
}

function makeCurrentChainEvidence({
  suiteId = "terminal-bench-release-slice",
  taskId = "hello-world",
} = {}) {
  return {
    schemaVersion: "benchmark-current-chain-evidence-v1",
    suiteId,
    taskId,
    appServer: {
      method: "agentSession/turn/start",
      invoked: true,
      sessionId: "session-1",
      threadId: "thread-1",
      turnId: "turn-1",
    },
    evidenceExport: {
      method: "evidence/export",
      invoked: true,
      pack: {
        session_id: "session-1",
        thread_id: "thread-1",
        workspace_root: "/tmp/lime-workspace",
        pack_relative_root: ".lime/harness/sessions/session-1/evidence",
        pack_absolute_root: "/tmp/lime-workspace/.lime/harness/sessions/session-1/evidence",
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

function makeRunner(results) {
  return (command, args, options = {}) => {
    const key = `${command} ${args.join(" ")}`;
    const result = results[key] || { status: 1, error: "ENOENT" };
    return {
      command,
      args,
      cwd: path.relative(process.cwd(), options.cwd || process.cwd()) || ".",
      status: result.status ?? 0,
      signal: result.signal || "",
      ok: (result.status ?? 0) === 0,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      error: result.error || "",
    };
  };
}

describe("benchmark true-run", () => {
  it("preflight blocked 时生成 blocked true-run evidence，且不调用 provider / verifier", () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, "sources", "terminal-bench");
    const outputDir = path.join(root, "runs", "hello-world");
    writeGitHead(sourceRoot);
    writeTerminalBenchTask(sourceRoot);
    const manifest = makeTerminalManifest(root);

    const report = buildTrueRunReport({
      manifest,
      suite: manifest.suites[0],
      taskId: "hello-world",
      currentChainEvidence: {
        schemaVersion: "benchmark-current-chain-evidence-load-error-v1",
        loadError: "missing fixture",
      },
      commandRunner: makeRunner({
        "uv --version": { status: 0, stdout: "uv 0.9.8\n" },
        "docker --version": { status: 1, error: "ENOENT" },
        "tb --help": { status: 1, error: "ENOENT" },
      }),
    });
    const written = writeTrueRunArtifacts(report, outputDir);
    const verifier = JSON.parse(
      fs.readFileSync(path.join(outputDir, "verifier-result.json"), "utf8"),
    );

    expect(report.verdict).toBe("blocked");
    expect(report.execution).toMatchObject({
      currentChainInvoked: false,
      providerInvoked: false,
      verifierInvoked: false,
      trueRunInvoked: false,
      currentChain: {
        target: "lime_app_server_current",
        appServerMethod: "agentSession/turn/start",
        evidenceExportMethod: "evidence/export",
        externalVerifier: true,
        invoked: false,
        evidenceExportInvoked: false,
      },
    });
    expect(report.blockers.map((blocker) => blocker.id)).toEqual(
      expect.arrayContaining(["docker_cli", "terminal_bench_runner_entry"]),
    );
    expect(report.blockers.map((blocker) => blocker.id)).not.toContain(
      "lime_current_chain_evidence",
    );
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "lime_current_true_run_adapter",
          status: "skipped",
          reason: "blocked_before_adapter",
        }),
      ]),
    );
    expect(verifier).toMatchObject({
      verifierInvoked: false,
      verdict: "blocked",
    });
    expect(written.artifacts).toEqual(
      expect.arrayContaining([
        path.relative(process.cwd(), path.join(outputDir, "summary.json")),
        path.relative(process.cwd(), path.join(outputDir, "evidence-pack", "manifest.json")),
      ]),
    );
  });

  it("preflight ready 时仍 fail-closed 在 Lime current true-run adapter 未实现", () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, "sources", "terminal-bench");
    writeGitHead(sourceRoot);
    writeTerminalBenchTask(sourceRoot);
    const manifest = makeTerminalManifest(root);

    const report = buildTrueRunReport({
      manifest,
      suite: manifest.suites[0],
      taskId: "hello-world",
      commandRunner: makeRunner({
        "uv --version": { status: 0, stdout: "uv 0.9.8\n" },
        "docker --version": { status: 0, stdout: "Docker version test\n" },
        "docker info --format {{json .ServerVersion}}": {
          status: 0,
          stdout: "\"27.0.0\"\n",
        },
        "tb --help": { status: 0, stdout: "tb help\n" },
      }),
    });

    expect(report.preflight).toMatchObject({
      verdict: "ready",
      blockerCount: 0,
    });
    expect(report.verdict).toBe("blocked");
    expect(report.blockers).toEqual([
      expect.objectContaining({
        id: "lime_current_true_run_adapter",
        reason: "lime_current_true_run_adapter_not_implemented",
        phase: "adapter",
      }),
    ]);
  });

  it("preflight ready 但 current-chain evidence 无效时生成 blocked evidence", () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, "sources", "terminal-bench");
    writeGitHead(sourceRoot);
    writeTerminalBenchTask(sourceRoot);
    const manifest = makeTerminalManifest(root);

    const report = buildTrueRunReport({
      manifest,
      suite: manifest.suites[0],
      taskId: "hello-world",
      currentChainEvidence: {
        schemaVersion: "benchmark-current-chain-evidence-load-error-v1",
        loadError: "missing current-chain evidence",
      },
      commandRunner: makeRunner({
        "uv --version": { status: 0, stdout: "uv 0.9.8\n" },
        "docker --version": { status: 0, stdout: "Docker version test\n" },
        "docker info --format {{json .ServerVersion}}": {
          status: 0,
          stdout: "\"27.0.0\"\n",
        },
        "tb --help": { status: 0, stdout: "tb help\n" },
      }),
    });

    expect(report.verdict).toBe("blocked");
    expect(report.blockers).toEqual([
      expect.objectContaining({
        id: "lime_current_chain_evidence",
        phase: "adapter",
        reason: expect.stringContaining("current_chain_evidence_invalid"),
      }),
    ]);
  });

  it("preflight ready 且导入 current-chain evidence 时生成 ready true-run evidence", () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, "sources", "terminal-bench");
    const outputDir = path.join(root, "runs", "hello-world");
    writeGitHead(sourceRoot);
    writeTerminalBenchTask(sourceRoot);
    const manifest = makeTerminalManifest(root);

    const report = buildTrueRunReport({
      manifest,
      suite: manifest.suites[0],
      taskId: "hello-world",
      currentChainEvidence: makeCurrentChainEvidence(),
      commandRunner: makeRunner({
        "uv --version": { status: 0, stdout: "uv 0.9.8\n" },
        "docker --version": { status: 0, stdout: "Docker version test\n" },
        "docker info --format {{json .ServerVersion}}": {
          status: 0,
          stdout: "\"27.0.0\"\n",
        },
        "tb --help": { status: 0, stdout: "tb help\n" },
      }),
    });
    writeTrueRunArtifacts(report, outputDir);
    const verifier = JSON.parse(
      fs.readFileSync(path.join(outputDir, "verifier-result.json"), "utf8"),
    );

    expect(report.verdict).toBe("ready");
    expect(report.blockers).toEqual([]);
    expect(report.execution).toMatchObject({
      currentChainInvoked: true,
      trueRunInvoked: true,
      verifierInvoked: true,
      currentChain: {
        appServerMethod: "agentSession/turn/start",
        evidenceExportMethod: "evidence/export",
        evidenceExportInvoked: true,
        sessionId: "session-1",
        turnId: "turn-1",
      },
    });
    expect(verifier).toMatchObject({
      verifierInvoked: true,
      verdict: "ready",
    });
  });

  it("DeepSWE blocked true-run 生成 patch / reward / ctrf / replay 占位证据，但不伪造 pass", () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, "sources", "deep-swe");
    const outputDir = path.join(root, "runs", "ytt-jsonpath-query-api");
    writeGitHead(sourceRoot);
    writeDeepSweTask(sourceRoot);
    const manifest = makeDeepSweManifest(root);

    const report = buildTrueRunReport({
      manifest,
      suite: manifest.suites[0],
      taskId: "ytt-jsonpath-query-api",
      commandRunner: makeRunner({
        "uv --version": { status: 0, stdout: "uv 0.9.8\n" },
        "docker --version": { status: 1, error: "ENOENT" },
        "pier --version": { status: 1, error: "ENOENT" },
        "uv tool list": { status: 0, stdout: "" },
      }),
    });
    writeTrueRunArtifacts(report, outputDir);

    const reward = JSON.parse(fs.readFileSync(path.join(outputDir, "reward.json"), "utf8"));
    const replay = JSON.parse(
      fs.readFileSync(path.join(outputDir, "replay-case", "replay.json"), "utf8"),
    );

    expect(reward).toMatchObject({
      verdict: "blocked",
      reward: null,
    });
    expect(replay).toMatchObject({
      verdict: "blocked",
      suiteId: "deepswe-fixed-ten",
      taskId: "ytt-jsonpath-query-api",
    });
    expect(fs.readFileSync(path.join(outputDir, "patch.diff"), "utf8")).toContain(
      "patch not generated",
    );
    expect(fs.existsSync(path.join(outputDir, "ctrf.json"))).toBe(true);
  });

  it("suite summary 汇总 true-run blocked 任务", () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, "sources", "terminal-bench");
    const outputRoot = path.join(root, "runs", "terminal-bench");
    writeGitHead(sourceRoot);
    writeTerminalBenchTask(sourceRoot);
    const manifest = makeTerminalManifest(root);
    const report = writeTrueRunArtifacts(
      buildTrueRunReport({
        manifest,
        suite: manifest.suites[0],
        taskId: "hello-world",
        commandRunner: makeRunner({
          "uv --version": { status: 0, stdout: "uv 0.9.8\n" },
          "docker --version": { status: 1, error: "ENOENT" },
          "tb --help": { status: 1, error: "ENOENT" },
        }),
      }),
      path.join(outputRoot, "hello-world"),
    );

    const summary = buildSuiteSummary({
      suite: manifest.suites[0],
      outputRoot,
      taskReports: [report],
    });

    expect(summary).toMatchObject({
      schemaVersion: "benchmark-suite-true-run-v1",
      summary: {
        readyCount: 0,
        blockedCount: 1,
        taskCount: 1,
        verdict: "blocked",
        releaseReady: false,
      },
    });
  });
});
