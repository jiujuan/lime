import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  buildMacOsStandaloneReleaseCommandPlan,
  runMacOsStandaloneReleaseCommandPlan,
  writeJsonFile,
} from "./plugin-standalone-macos-release-commands-core.mjs";

function artifacts(outputRoot) {
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

describe("plugin standalone macOS release commands", () => {
  it("为 dmg 发布生成 codesign/notarytool/stapler 命令计划", () => {
    const outputRoot = "/tmp/lime-plugins/content-factory/dist";
    const plan = buildMacOsStandaloneReleaseCommandPlan({
      applicationSigningIdentity:
        "Developer ID Application: Lime Cloud (TEAMID1234)",
      artifacts: artifacts(outputRoot),
      notarizationProfile: "notarytool:lime-prod",
      outputRoot,
      packageFormat: "dmg",
    });

    expect(plan).toMatchObject({
      status: "ready",
      readyToRun: true,
      releaseReadiness: "commands_only_not_executed",
      packageFormat: "dmg",
      appBundleRef: "sha256:app",
      distributableRef: "sha256:dmg",
      commands: [
        expect.objectContaining({ id: "codesign-app", tool: "codesign" }),
        expect.objectContaining({ id: "notarytool-submit", tool: "xcrun" }),
        expect.objectContaining({ id: "stapler-staple", tool: "xcrun" }),
      ],
    });
    expect(plan.commands[0].display).toContain("--options runtime");
    expect(plan.commands[1].args).toEqual([
      "notarytool",
      "submit",
      `${outputRoot}/Content Factory.dmg`,
      "--keychain-profile",
      "notarytool:lime-prod",
      "--wait",
    ]);
  });

  it("缺签名身份或 notary profile 时必须 blocked", () => {
    const outputRoot = "/tmp/lime-plugins/content-factory/dist";
    const plan = buildMacOsStandaloneReleaseCommandPlan({
      artifacts: artifacts(outputRoot),
      outputRoot,
      packageFormat: "dmg",
    });

    expect(plan).toMatchObject({
      status: "blocked",
      readyToRun: false,
      commands: [],
      blockers: [
        expect.objectContaining({
          code: "APPLICATION_SIGNING_IDENTITY_MISSING",
        }),
        expect.objectContaining({ code: "NOTARIZATION_PROFILE_MISSING" }),
      ],
    });
  });

  it("拒绝 output root 外的 artifacts", () => {
    const outputRoot = "/tmp/lime-plugins/content-factory/dist";
    const plan = buildMacOsStandaloneReleaseCommandPlan({
      applicationSigningIdentity:
        "Developer ID Application: Lime Cloud (TEAMID1234)",
      artifacts: artifacts("/tmp/lime-plugins/other/dist"),
      notarizationProfile: "notarytool:lime-prod",
      outputRoot,
      packageFormat: "dmg",
    });

    expect(plan).toMatchObject({
      status: "blocked",
      blockers: [
        expect.objectContaining({ code: "ARTIFACT_OUTSIDE_OUTPUT_ROOT" }),
        expect.objectContaining({ code: "ARTIFACT_OUTSIDE_OUTPUT_ROOT" }),
      ],
    });
  });

  it("runner 用 fake process runner 顺序执行 ready plan", () => {
    const outputRoot = "/tmp/lime-plugins/content-factory/dist";
    const plan = buildMacOsStandaloneReleaseCommandPlan({
      applicationSigningIdentity:
        "Developer ID Application: Lime Cloud (TEAMID1234)",
      artifacts: artifacts(outputRoot),
      notarizationProfile: "notarytool:lime-prod",
      outputRoot,
      packageFormat: "dmg",
    });
    const calls = [];

    const result = runMacOsStandaloneReleaseCommandPlan({
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
      releaseReadiness: "commands_completed_not_release_ready",
      commandsRun: [
        expect.objectContaining({ id: "codesign-app", exitCode: 0 }),
        expect.objectContaining({ id: "notarytool-submit", exitCode: 0 }),
        expect.objectContaining({ id: "stapler-staple", exitCode: 0 }),
      ],
    });
    expect(calls.map((call) => call.tool)).toEqual([
      "codesign",
      "xcrun",
      "xcrun",
    ]);
  });

  it("CLI 默认只生成命令计划，--check 要求 plan ready", () => {
    const outputRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-plugin-macos-release-"),
    );
    const artifactPath = path.join(outputRoot, "artifacts.json");
    const evidencePath = path.join(outputRoot, "commands.json");
    writeJsonFile(artifactPath, artifacts(outputRoot));

    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/plugin/standalone-macos-release-commands.mjs"),
        "--artifacts",
        artifactPath,
        "--output-root",
        outputRoot,
        "--package-format",
        "dmg",
        "--application-identity",
        "Developer ID Application: Lime Cloud (TEAMID1234)",
        "--notarization-profile",
        "notarytool:lime-prod",
        "--evidence",
        evidencePath,
        "--check",
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(fs.readFileSync(evidencePath, "utf8"))).toMatchObject({
      status: "ready",
      releaseReadiness: "commands_only_not_executed",
      commands: [
        expect.objectContaining({ id: "codesign-app" }),
        expect.objectContaining({ id: "notarytool-submit" }),
        expect.objectContaining({ id: "stapler-staple" }),
      ],
    });
  });
});
