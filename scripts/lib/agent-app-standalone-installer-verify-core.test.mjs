import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  buildStandaloneInstallerVerificationPlan,
  runStandaloneInstallerVerificationPlan,
  writeJsonFile,
} from "./agent-app-standalone-installer-verify-core.mjs";

function macosArtifacts(outputRoot) {
  return [
    {
      kind: "app_bundle",
      path: path.join(outputRoot, "Content Factory.app"),
      contentHash: "sha256:app",
    },
    {
      kind: "dmg",
      path: path.join(outputRoot, "Content Factory.dmg"),
      contentHash: "sha256:dmg",
    },
  ];
}

describe("agent-app standalone installer verification", () => {
  it("为 macOS dmg 生成 codesign/spctl/hdiutil/stapler 验证命令", () => {
    const outputRoot = "/tmp/lime-agent-apps/content-factory/dist";
    const plan = buildStandaloneInstallerVerificationPlan({
      artifacts: macosArtifacts(outputRoot),
      outputRoot,
      packageFormat: "dmg",
      platform: "macos",
    });

    expect(plan).toMatchObject({
      status: "ready",
      readyToRun: true,
      releaseReadiness: "verification_commands_ready_not_executed",
      commands: [
        expect.objectContaining({ id: "codesign-verify-app" }),
        expect.objectContaining({ id: "spctl-assess-app" }),
        expect.objectContaining({ id: "hdiutil-verify-dmg" }),
        expect.objectContaining({ id: "stapler-validate" }),
      ],
    });
    expect(plan.commands[0].display).toContain("--strict");
  });

  it("拒绝 output root 外 artifact", () => {
    const outputRoot = "/tmp/lime-agent-apps/content-factory/dist";
    const plan = buildStandaloneInstallerVerificationPlan({
      artifacts: macosArtifacts("/tmp/lime-agent-apps/other/dist"),
      outputRoot,
      packageFormat: "dmg",
      platform: "macos",
    });

    expect(plan).toMatchObject({
      status: "blocked",
      blockers: [
        expect.objectContaining({ code: "ARTIFACT_OUTSIDE_OUTPUT_ROOT" }),
        expect.objectContaining({ code: "ARTIFACT_OUTSIDE_OUTPUT_ROOT" }),
      ],
    });
  });

  it("Windows installer 使用 signtool verify", () => {
    const outputRoot = "C:/lime/agent-apps/content-factory/dist";
    const plan = buildStandaloneInstallerVerificationPlan({
      artifacts: [
        {
          kind: "windows_installer",
          path: "C:/lime/agent-apps/content-factory/dist/Content Factory.exe",
          contentHash: "sha256:exe",
        },
      ],
      outputRoot,
      platform: "windows",
    });

    expect(plan).toMatchObject({
      status: "ready",
      commands: [
        expect.objectContaining({
          id: "signtool-verify-installer",
          tool: "signtool",
          args: [
            "verify",
            "/pa",
            "/v",
            "C:/lime/agent-apps/content-factory/dist/Content Factory.exe",
          ],
        }),
      ],
    });
  });

  it("runner 成功时产出 completed verification evidence", () => {
    const outputRoot = "/tmp/lime-agent-apps/content-factory/dist";
    const plan = buildStandaloneInstallerVerificationPlan({
      artifacts: macosArtifacts(outputRoot),
      outputRoot,
      packageFormat: "dmg",
      platform: "macos",
    });
    const calls = [];
    const result = runStandaloneInstallerVerificationPlan({
      plan,
      runner: {
        run(call) {
          calls.push(call);
          return { exitCode: 0, stdout: "ok", stderr: "" };
        },
      },
    });

    expect(result).toMatchObject({
      status: "completed",
      releaseReadiness: "installer_verification_completed",
    });
    expect(result.commandsRun.map((item) => item.id)).toEqual([
      "codesign-verify-app",
      "spctl-assess-app",
      "hdiutil-verify-dmg",
      "stapler-validate",
    ]);
    expect(result.commandsRun).toContainEqual(
      expect.objectContaining({ id: "codesign-verify-app", exitCode: 0 }),
    );
    expect(result.commandsRun).toContainEqual(
      expect.objectContaining({ id: "stapler-validate", exitCode: 0 }),
    );
    expect(calls.map((call) => call.tool)).toEqual([
      "codesign",
      "spctl",
      "hdiutil",
      "xcrun",
    ]);
  });

  it("runner 任一命令失败时立即 fail closed", () => {
    const outputRoot = "/tmp/lime-agent-apps/content-factory/dist";
    const plan = buildStandaloneInstallerVerificationPlan({
      artifacts: macosArtifacts(outputRoot),
      outputRoot,
      packageFormat: "dmg",
      platform: "macos",
    });
    const result = runStandaloneInstallerVerificationPlan({
      plan,
      runner: {
        run({ id }) {
          return {
            exitCode: id === "spctl-assess-app" ? 3 : 0,
            stdout: "",
            stderr: "rejected",
          };
        },
      },
    });

    expect(result).toMatchObject({
      status: "failed",
      releaseReadiness: "verification_failed",
      failedCommandId: "spctl-assess-app",
      blockers: [
        expect.objectContaining({ code: "VERIFICATION_COMMAND_FAILED" }),
      ],
    });
  });

  it("拒绝缺少 path 的 artifact，避免生成不可执行命令", () => {
    const outputRoot = "/tmp/lime-agent-apps/content-factory/dist";
    const plan = buildStandaloneInstallerVerificationPlan({
      artifacts: [
        {
          kind: "app_bundle",
          contentHash: "sha256:app",
        },
        {
          kind: "dmg",
          path: path.join(outputRoot, "Content Factory.dmg"),
          contentHash: "sha256:dmg",
        },
      ],
      outputRoot,
      packageFormat: "dmg",
      platform: "macos",
    });

    expect(plan).toMatchObject({
      status: "blocked",
      commands: [],
      blockers: [expect.objectContaining({ code: "ARTIFACT_PATH_MISSING" })],
    });
  });

  it("拒绝不支持的 macOS package format", () => {
    const outputRoot = "/tmp/lime-agent-apps/content-factory/dist";
    const plan = buildStandaloneInstallerVerificationPlan({
      artifacts: macosArtifacts(outputRoot),
      outputRoot,
      packageFormat: "zip",
      platform: "macos",
    });

    expect(plan).toMatchObject({
      status: "blocked",
      commands: [],
      blockers: [
        expect.objectContaining({ code: "PACKAGE_FORMAT_UNSUPPORTED" }),
      ],
    });
  });

  it("CLI 默认只生成验证计划，--check 要求 plan ready", () => {
    const outputRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-installer-verify-"),
    );
    const artifactsPath = path.join(outputRoot, "artifacts.json");
    const evidencePath = path.join(outputRoot, "verify.json");
    writeJsonFile(artifactsPath, macosArtifacts(outputRoot));

    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/agent-app/standalone-installer-verify.mjs"),
        "--artifacts",
        artifactsPath,
        "--output-root",
        outputRoot,
        "--package-format",
        "dmg",
        "--evidence",
        evidencePath,
        "--check",
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    expect(evidence.status).toBe("ready");
    expect(evidence.commands).toContainEqual(
      expect.objectContaining({ id: "codesign-verify-app" }),
    );
    expect(evidence.commands).toContainEqual(
      expect.objectContaining({ id: "hdiutil-verify-dmg" }),
    );
  });
});
