import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildDryRunReport, runSuiteDryRun } from "./benchmark-dry-run.mjs";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lime-benchmark-dry-run-"));
}

function writeFile(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function makeManifest(rootDir) {
  const sourceRoot = path.join(rootDir, "sources", "terminal-bench");
  return {
    downloadedSources: [
      {
        id: "terminal-bench",
        localPath: path.relative(process.cwd(), sourceRoot),
        commit: "test-commit",
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
        taskSet: ["multi-service-task"],
      },
    ],
  };
}

function writeTerminalBenchMultiServiceTask(rootDir) {
  const taskRoot = path.join(
    rootDir,
    "sources",
    "terminal-bench",
    "original-tasks",
    "multi-service-task",
  );
  writeFile(
    path.join(taskRoot, "task.yaml"),
    [
      "instruction: |-",
      "  Scrape a local service.",
      "difficulty: easy",
      "category: data-science",
      "parser_name: pytest",
      "max_agent_timeout_sec: 900",
      "",
    ].join("\n"),
  );
  writeFile(
    path.join(taskRoot, "docker-compose.yaml"),
    [
      "services:",
      "  client:",
      "    build:",
      "      context: client",
      "      dockerfile: Dockerfile",
      "  server:",
      "    build:",
      "      context: server",
      "      dockerfile: Dockerfile",
      "",
    ].join("\n"),
  );
  writeFile(path.join(taskRoot, "run-tests.sh"), "#!/bin/bash\n");
  writeFile(path.join(taskRoot, "tests", "test_outputs.py"), "def test_ok(): pass\n");
  writeFile(path.join(taskRoot, "client", "Dockerfile"), "FROM debian:stable\n");
  writeFile(path.join(taskRoot, "server", "Dockerfile"), "FROM debian:stable\n");
}

describe("benchmark dry run", () => {
  it("支持 Terminal-Bench 多服务 compose Dockerfile 结构", () => {
    const root = makeTempDir();
    writeTerminalBenchMultiServiceTask(root);
    const manifest = makeManifest(root);

    const report = buildDryRunReport({
      manifest,
      suite: manifest.suites[0],
      taskId: "multi-service-task",
    });

    expect(report.verdict).toBe("dry_run_ready");
    expect(report.missingFiles).toEqual([]);
    expect(report.requiredFiles.map((entry) => entry.path)).toEqual(
      expect.arrayContaining([
        "original-tasks/multi-service-task/client/Dockerfile",
        "original-tasks/multi-service-task/server/Dockerfile",
      ]),
    );
  });

  it("批量 dry-run 会写出 suite summary 和 evidence pack", () => {
    const root = makeTempDir();
    const outputDir = path.join(root, "runs", "terminal-bench");
    writeTerminalBenchMultiServiceTask(root);
    const manifest = makeManifest(root);
    const manifestPath = path.join(root, "manifest.json");
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const report = runSuiteDryRun(process.cwd(), {
      manifestPath,
      outputPath: outputDir,
      suiteId: "terminal-bench-release-slice",
    });

    expect(report.summary).toMatchObject({
      readyCount: 1,
      blockedCount: 0,
      taskCount: 1,
      verdict: "dry_run_ready",
    });
    expect(fs.existsSync(path.join(outputDir, "suite-summary.json"))).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          outputDir,
          "multi-service-task",
          "evidence-pack",
          "manifest.json",
        ),
      ),
    ).toBe(true);
  });
});
