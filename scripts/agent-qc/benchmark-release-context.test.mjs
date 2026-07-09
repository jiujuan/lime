import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildBenchmarkReleaseContext,
  defaultOutputPath,
  validateBenchmarkReleaseContext,
} from "./benchmark-release-context.mjs";

const ROOT_COMMIT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SOURCE_COMMIT = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lime-benchmark-release-context-"));
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeJson(filePath, payload) {
  writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeGitHead(repoPath, commit) {
  writeFile(path.join(repoPath, ".git", "HEAD"), "ref: refs/heads/main\n");
  writeFile(path.join(repoPath, ".git", "refs", "heads", "main"), `${commit}\n`);
}

function makeManifest(rootDir, commit = SOURCE_COMMIT) {
  const sourceRoot = path.join(rootDir, ".lime", "benchmark", "sources", "terminal-bench");
  return {
    schemaVersion: "benchmark-release-v1",
    datasetVersion: "test-dataset",
    downloadedSources: [
      {
        id: "terminal-bench",
        priority: "P1",
        localPath: path.relative(rootDir, sourceRoot),
        commit,
      },
    ],
  };
}

function makeCommandRunner() {
  return (command, args) => {
    if (command === "git" && args.includes("rev-parse")) {
      return {
        command,
        args,
        cwd: ".",
        status: 1,
        ok: false,
        stdout: "",
        stderr: "",
        error: "rev-parse disabled in test",
        signal: "",
      };
    }
    if (command === "git" && args.includes("branch")) {
      return {
        command,
        args,
        cwd: ".",
        status: 0,
        ok: true,
        stdout: "main\n",
        stderr: "",
        error: "",
        signal: "",
      };
    }
    if (command === "git" && args.includes("status")) {
      return {
        command,
        args,
        cwd: ".",
        status: 0,
        ok: true,
        stdout: "",
        stderr: "",
        error: "",
        signal: "",
      };
    }
    if (command === "docker") {
      return {
        command,
        args,
        cwd: ".",
        status: 1,
        ok: false,
        stdout: "",
        stderr: "",
        error: "ENOENT",
        signal: "",
      };
    }
    return {
      command,
      args,
      cwd: ".",
      status: 0,
      ok: true,
      stdout: `${command} test-version\n`,
      stderr: "",
      error: "",
      signal: "",
    };
  };
}

function makeRepo() {
  const root = makeTempDir();
  const sourceRoot = path.join(root, ".lime", "benchmark", "sources", "terminal-bench");
  writeJson(path.join(root, "package.json"), {
    name: "lime",
    version: "1.97.0",
  });
  writeGitHead(root, ROOT_COMMIT);
  writeGitHead(sourceRoot, SOURCE_COMMIT);
  return { root, sourceRoot };
}

describe("benchmark release context", () => {
  it("生成版本、环境和 source commit 上下文；Docker 缺失只作为 warning", () => {
    const { root } = makeRepo();
    writeJson(path.join(root, "manifest.json"), makeManifest(root));

    const context = buildBenchmarkReleaseContext({
      rootDir: root,
      manifestPath: "manifest.json",
      commandRunner: makeCommandRunner(),
      now: () => new Date("2026-07-09T00:00:00.000Z"),
    });
    const validation = validateBenchmarkReleaseContext(context);

    expect(validation.valid).toBe(true);
    expect(context).toMatchObject({
      schemaVersion: "benchmark-release-run-context-v1",
      generatedAt: "2026-07-09T00:00:00.000Z",
      version: "1.97.0",
      datasetVersion: "test-dataset",
      git: {
        head: ROOT_COMMIT,
        branch: "main",
        dirty: false,
      },
      summary: {
        downloadedSourceCount: 1,
        sourceMismatchCount: 0,
        issueCount: 0,
      },
    });
    expect(context.downloadedSources[0]).toMatchObject({
      id: "terminal-bench",
      gitHead: SOURCE_COMMIT,
      commitMatches: true,
    });
    expect(context.environment.unavailableToolIds).toEqual([
      "docker_cli",
      "docker_daemon",
    ]);
    expect(context.warnings).toEqual([
      "unavailable tools: docker_cli, docker_daemon",
    ]);
    expect(defaultOutputPath("1.97.0")).toBe(
      ".lime/benchmark/releases/1.97.0/run-context.json",
    );
    expect(defaultOutputPath("1.97.0", "markdown")).toBe(
      ".lime/benchmark/releases/1.97.0/run-context.md",
    );
  });

  it("source HEAD 与 manifest commit 不一致时校验失败", () => {
    const { root } = makeRepo();
    writeJson(
      path.join(root, "manifest.json"),
      makeManifest(root, "cccccccccccccccccccccccccccccccccccccccc"),
    );

    const context = buildBenchmarkReleaseContext({
      rootDir: root,
      manifestPath: "manifest.json",
      commandRunner: makeCommandRunner(),
    });
    const validation = validateBenchmarkReleaseContext(context);

    expect(validation.valid).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("source HEAD 与 manifest commit 不一致"),
      ]),
    );
  });
});
