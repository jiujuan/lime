import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildPreflightReport,
  writePreflightArtifacts,
} from "./benchmark-true-run-preflight.mjs";

const TEST_COMMIT = "0123456789abcdef0123456789abcdef01234567";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lime-benchmark-preflight-"));
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

describe("benchmark true-run preflight", () => {
  it("允许使用 uv project 入口替代全局 tb CLI", () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, "sources", "terminal-bench");
    writeGitHead(sourceRoot);
    writeTerminalBenchTask(sourceRoot);
    const manifest = makeTerminalManifest(root);

    const report = buildPreflightReport({
      manifest,
      suite: manifest.suites[0],
      taskId: "hello-world",
      commandRunner: (command, args, options = {}) => {
        const key = `${command} ${args.join(" ")}`;
        const okKeys = new Set([
          "uv --version",
          "docker --version",
          "docker info --format {{json .ServerVersion}}",
        ]);
        const ok = okKeys.has(key) || key.startsWith("uv run --project ");
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
      },
    });

    expect(report.verdict).toBe("ready");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "terminal_bench_cli", status: "skipped" }),
        expect.objectContaining({ id: "terminal_bench_uv_cli", status: "ok" }),
      ]),
    );
  });

  it("阻断 Docker 和 Terminal-Bench runner 缺失，但不执行 verifier", () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, "sources", "terminal-bench");
    writeGitHead(sourceRoot);
    writeTerminalBenchTask(sourceRoot);
    const manifest = makeTerminalManifest(root);
    const report = buildPreflightReport({
      manifest,
      suite: manifest.suites[0],
      taskId: "hello-world",
      commandRunner: makeRunner({
        "uv --version": { status: 0, stdout: "uv 0.9.8\n" },
        "docker --version": { status: 1, error: "ENOENT" },
        "tb --help": { status: 1, error: "ENOENT" },
      }),
    });

    expect(report.verdict).toBe("blocked");
    expect(report.execution).toMatchObject({
      providerInvoked: false,
      verifierInvoked: false,
      trueRunInvoked: false,
    });
    expect(report.blockers.map((blocker) => blocker.id)).toEqual(
      expect.arrayContaining([
        "docker_cli",
        "terminal_bench_uv_cli",
        "terminal_bench_runner_entry",
      ]),
    );
  });

  it("preflight artifact 使用 blocked verifier result，避免伪造 pass", () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, "sources", "terminal-bench");
    const outputDir = path.join(root, "runs", "hello-world");
    writeGitHead(sourceRoot);
    writeTerminalBenchTask(sourceRoot);
    const manifest = makeTerminalManifest(root);
    const report = buildPreflightReport({
      manifest,
      suite: manifest.suites[0],
      taskId: "hello-world",
      commandRunner: makeRunner({
        "uv --version": { status: 0, stdout: "uv 0.9.8\n" },
        "docker --version": { status: 1, error: "ENOENT" },
        "tb --help": { status: 1, error: "ENOENT" },
      }),
    });

    const written = writePreflightArtifacts(report, outputDir);
    const verifier = JSON.parse(
      fs.readFileSync(path.join(outputDir, "verifier-result.json"), "utf8"),
    );

    expect(written.outputDir).toBe(path.relative(process.cwd(), outputDir));
    expect(verifier).toMatchObject({
      verifierInvoked: false,
      verdict: "blocked",
    });
    expect(
      fs.existsSync(path.join(outputDir, "evidence-pack", "manifest.json")),
    ).toBe(true);
  });

  it("DeepSWE Pier 和 Docker 前提满足时 preflight ready，但不执行 verifier", () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, "sources", "deep-swe");
    writeGitHead(sourceRoot);
    writeDeepSweTask(sourceRoot);
    const manifest = makeDeepSweManifest(root);
    const report = buildPreflightReport({
      manifest,
      suite: manifest.suites[0],
      taskId: "ytt-jsonpath-query-api",
      commandRunner: makeRunner({
        "uv --version": { status: 0, stdout: "uv 0.9.8\n" },
        "docker --version": { status: 0, stdout: "Docker version test\n" },
        "docker info --format {{json .ServerVersion}}": {
          status: 0,
          stdout: "\"27.0.0\"\n",
        },
        "pier --version": { status: 0, stdout: "datacurve-pier 0.3.0\n" },
      }),
    });

    expect(report.verdict).toBe("ready");
    expect(report.execution).toMatchObject({
      providerInvoked: false,
      verifierInvoked: false,
      trueRunInvoked: false,
    });
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "deep_swe_task_metadata", status: "ok" }),
        expect.objectContaining({ id: "deep_swe_verifier_files", status: "ok" }),
        expect.objectContaining({ id: "deep_swe_pier_cli", status: "ok" }),
      ]),
    );
  });

  it("DeepSWE 阻断 Docker 和 Pier 缺失，并保持 verifier blocked", () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, "sources", "deep-swe");
    const outputDir = path.join(root, "runs", "ytt-jsonpath-query-api");
    writeGitHead(sourceRoot);
    writeDeepSweTask(sourceRoot);
    const manifest = makeDeepSweManifest(root);
    const report = buildPreflightReport({
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

    const written = writePreflightArtifacts(report, outputDir);
    const verifier = JSON.parse(
      fs.readFileSync(path.join(outputDir, "verifier-result.json"), "utf8"),
    );

    expect(report.verdict).toBe("blocked");
    expect(report.blockers.map((blocker) => blocker.id)).toEqual(
      expect.arrayContaining([
        "docker_cli",
        "deep_swe_pier_uv_tool",
        "deep_swe_runner_entry",
      ]),
    );
    expect(written.outputDir).toBe(path.relative(process.cwd(), outputDir));
    expect(verifier).toMatchObject({
      verifierInvoked: false,
      verdict: "blocked",
    });
  });
});
