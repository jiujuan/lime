import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  buildStandaloneTauriBuildPlan,
  runStandaloneTauriBuildPlan,
  writeJsonFile,
} from "./agent-app-standalone-tauri-build-runner-core.mjs";

function writtenWriterResult(outputRoot) {
  return {
    schemaVersion: 1,
    status: "written",
    outputRoot,
    planHash: "package-fnv1a-plan",
    filesWritten: [
      {
        kind: "tauri_config",
        path: path.join(outputRoot, "src-tauri", "tauri.conf.json"),
        contentHash: "package-fnv1a-config",
      },
      {
        kind: "runtime_env",
        path: path.join(outputRoot, ".env.standalone"),
        contentHash: "package-fnv1a-env",
      },
    ],
    blockers: [],
  };
}

describe("agent-app standalone tauri build runner core", () => {
  it("根据 writer evidence 生成受控 tauri build 命令计划", () => {
    const outputRoot = "/tmp/lime-agent-apps/content-factory";
    const plan = buildStandaloneTauriBuildPlan({
      outputRoot,
      packageFormat: "dmg",
      repoRoot: "/repo/lime",
      targetTriple: "aarch64-apple-darwin",
      writerResult: writtenWriterResult(outputRoot),
    });

    expect(plan).toMatchObject({
      status: "ready",
      readyToRun: true,
      releaseReadiness: "build_only_not_release_ready",
      outputRoot,
      repoRoot: "/repo/lime",
      writerPlanHash: "package-fnv1a-plan",
      command: {
        command: "npm",
        args: [
          "run",
          "tauri",
          "--",
          "build",
          "--config",
          `${outputRoot}/src-tauri/tauri.conf.json`,
          "--target",
          "aarch64-apple-darwin",
          "--bundles",
          "dmg",
        ],
      },
    });
    expect(plan.command.display).toContain("npm run tauri -- build --config");
  });

  it("writer evidence 未成功时必须 blocked", () => {
    const plan = buildStandaloneTauriBuildPlan({
      outputRoot: "/tmp/lime-agent-apps/content-factory",
      writerResult: {
        schemaVersion: 1,
        status: "blocked",
        filesWritten: [],
        blockers: [{ code: "WRITE_PLAN_NOT_READY" }],
      },
    });

    expect(plan).toMatchObject({
      status: "blocked",
      readyToRun: false,
      blockers: [
        expect.objectContaining({ code: "WRITER_RESULT_NOT_WRITTEN" }),
        expect.objectContaining({ code: "TAURI_CONFIG_REF_MISSING" }),
        expect.objectContaining({ code: "RUNTIME_ENV_REF_MISSING" }),
      ],
    });
  });

  it("拒绝使用 output root 外的 writer refs", () => {
    const outputRoot = "/tmp/lime-agent-apps/content-factory";
    const otherRoot = "/tmp/lime-agent-apps/other-app";
    const plan = buildStandaloneTauriBuildPlan({
      outputRoot,
      writerResult: writtenWriterResult(otherRoot),
    });

    expect(plan).toMatchObject({
      status: "blocked",
      blockers: [
        expect.objectContaining({ code: "BUILD_INPUT_OUTSIDE_OUTPUT_ROOT" }),
        expect.objectContaining({ code: "BUILD_INPUT_OUTSIDE_OUTPUT_ROOT" }),
      ],
    });
  });

  it("runner 用 env 文件和 fake process runner 执行 ready plan", () => {
    const outputRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-tauri-build-"),
    );
    fs.writeFileSync(
      path.join(outputRoot, ".env.standalone"),
      "LIME_AGENT_APP_STANDALONE_APP_ID=content-factory-app\n",
      "utf8",
    );
    const plan = buildStandaloneTauriBuildPlan({
      outputRoot,
      repoRoot: "/repo/lime",
      writerResult: writtenWriterResult(outputRoot),
    });
    const calls = [];

    const result = runStandaloneTauriBuildPlan({
      plan,
      runner: {
        run(call) {
          calls.push(call);
          return { exitCode: 0, stdout: "built", stderr: "" };
        },
      },
    });

    expect(result).toMatchObject({
      status: "completed",
      exitCode: 0,
      stdout: "built",
      outputRoot,
      writerPlanHash: "package-fnv1a-plan",
    });
    expect(calls).toEqual([
      expect.objectContaining({
        command: "npm",
        cwd: "/repo/lime",
        env: {
          LIME_AGENT_APP_STANDALONE_APP_ID: "content-factory-app",
        },
      }),
    ]);
  });

  it("CLI 默认只生成 build plan，--check 要求 plan ready", () => {
    const outputRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-tauri-build-cli-"),
    );
    const writerEvidencePath = path.join(outputRoot, "writer-evidence.json");
    const buildEvidencePath = path.join(outputRoot, "build-plan.json");
    writeJsonFile(writerEvidencePath, writtenWriterResult(outputRoot));

    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/agent-app-standalone-tauri-build-runner.mjs"),
        "--writer-evidence",
        writerEvidencePath,
        "--output-root",
        outputRoot,
        "--evidence",
        buildEvidencePath,
        "--check",
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(
      JSON.parse(fs.readFileSync(buildEvidencePath, "utf8")),
    ).toMatchObject({
      status: "ready",
      readyToRun: true,
      releaseReadiness: "build_only_not_release_ready",
    });
  });
});
