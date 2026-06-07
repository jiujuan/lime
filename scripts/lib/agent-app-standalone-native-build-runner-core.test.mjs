import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  buildStandaloneNativeBuildPlan,
  runStandaloneNativeBuildPlan,
  writeJsonFile,
} from "./agent-app-standalone-native-build-runner-core.mjs";

function writtenWriterResult(outputRoot) {
  return {
    schemaVersion: 1,
    status: "written",
    outputRoot,
    planHash: "package-fnv1a-plan",
    filesWritten: [
      {
        kind: "native_shell_config",
        path: path.join(outputRoot, "runtime", "native-shell.config.json"),
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

describe("agent-app standalone native build runner core", () => {
  it("旧 standalone artifact build runner 固定为 deprecated blocked", () => {
    const outputRoot = "/tmp/lime-agent-apps/content-factory";
    const plan = buildStandaloneNativeBuildPlan({
      outputRoot,
      packageFormat: "dmg",
      repoRoot: "/repo/lime",
      targetTriple: "aarch64-apple-darwin",
      writerResult: writtenWriterResult(outputRoot),
    });

    expect(plan).toMatchObject({
      status: "blocked",
      readyToRun: false,
      releaseReadiness: "deprecated_not_release_ready",
      outputRoot,
      repoRoot: "/repo/lime",
      writerPlanHash: "package-fnv1a-plan",
      blockers: [
        expect.objectContaining({
          code: "DEPRECATED_STANDALONE_ARTIFACT_ADAPTER",
        }),
      ],
    });
    expect(plan).not.toHaveProperty("command");
  });

  it("writer evidence 未成功时必须 blocked", () => {
    const plan = buildStandaloneNativeBuildPlan({
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
        expect.objectContaining({
          code: "DEPRECATED_STANDALONE_ARTIFACT_ADAPTER",
        }),
        expect.objectContaining({ code: "WRITER_RESULT_NOT_WRITTEN" }),
        expect.objectContaining({ code: "NATIVE_SHELL_CONFIG_REF_MISSING" }),
        expect.objectContaining({ code: "RUNTIME_ENV_REF_MISSING" }),
      ],
    });
  });

  it("拒绝使用 output root 外的 writer refs", () => {
    const outputRoot = "/tmp/lime-agent-apps/content-factory";
    const otherRoot = "/tmp/lime-agent-apps/other-app";
    const plan = buildStandaloneNativeBuildPlan({
      outputRoot,
      writerResult: writtenWriterResult(otherRoot),
    });

    expect(plan).toMatchObject({
      status: "blocked",
      blockers: expect.arrayContaining([
        expect.objectContaining({
          code: "DEPRECATED_STANDALONE_ARTIFACT_ADAPTER",
        }),
        expect.objectContaining({ code: "BUILD_INPUT_OUTSIDE_OUTPUT_ROOT" }),
      ]),
    });
    expect(
      plan.blockers.filter(
        (blocker) => blocker.code === "BUILD_INPUT_OUTSIDE_OUTPUT_ROOT",
      ),
    ).toHaveLength(2);
  });

  it("runner 不执行 deprecated blocked plan", () => {
    const outputRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-native-build-"),
    );
    fs.writeFileSync(
      path.join(outputRoot, ".env.standalone"),
      "LIME_AGENT_APP_STANDALONE_APP_ID=content-factory-app\n",
      "utf8",
    );
    const plan = buildStandaloneNativeBuildPlan({
      outputRoot,
      repoRoot: "/repo/lime",
      writerResult: writtenWriterResult(outputRoot),
    });

    const result = runStandaloneNativeBuildPlan({
      plan,
      runner: {
        run() {
          throw new Error("deprecated runner must not execute");
        },
      },
    });

    expect(result).toMatchObject({
      status: "blocked",
      blockers: [
        expect.objectContaining({
          code: "DEPRECATED_STANDALONE_ARTIFACT_ADAPTER",
        }),
      ],
    });
  });

  it("CLI 只输出 deprecated entrypoint 提示", () => {
    const outputRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-native-build-cli-"),
    );
    const writerEvidencePath = path.join(outputRoot, "writer-evidence.json");
    const buildEvidencePath = path.join(outputRoot, "build-plan.json");
    writeJsonFile(writerEvidencePath, writtenWriterResult(outputRoot));

    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/agent-app/standalone-native-build-runner.mjs"),
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

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Electron/App Server release pipeline");
    expect(fs.existsSync(buildEvidencePath)).toBe(false);
  });
});
