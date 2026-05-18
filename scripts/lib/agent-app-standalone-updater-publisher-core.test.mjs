import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  buildStandaloneUpdaterPublishPlan,
  writeJsonFile,
  writeStandaloneUpdaterPublishFiles,
} from "./agent-app-standalone-updater-publisher-core.mjs";

function releaseInput(outputDir) {
  return {
    appId: "content-factory-app",
    version: "0.8.0",
    channel: "stable",
    endpoint: "https://updates.limecloud.example/agent-apps",
    pubkey: "lime-agent-app-updater-pubkey",
    outputDir,
    previousArtifactRef: "sha256:previous-pkg",
    previousManifestRef:
      "https://updates.limecloud.example/agent-apps/content-factory-app/stable/previous.json",
    artifacts: [
      {
        kind: "pkg",
        platform: "macos",
        path: path.join(outputDir, "Content Factory.signed.pkg"),
        contentHash: "sha256:pkg",
        updaterSignature: "tauri-signature:pkg",
        notarized: true,
        size: 1234,
      },
    ],
  };
}

describe("agent-app standalone updater publisher", () => {
  it("生成 latest.json / rollback.json 本地发布计划", () => {
    const outputDir = "/tmp/lime-agent-apps/content-factory/updater";
    const plan = buildStandaloneUpdaterPublishPlan(releaseInput(outputDir));

    expect(plan).toMatchObject({
      status: "ready",
      readyToPublish: true,
      releaseReadiness: "local_manifest_ready_not_uploaded",
      appId: "content-factory-app",
      version: "0.8.0",
      files: [
        expect.objectContaining({ kind: "latest_manifest" }),
        expect.objectContaining({ kind: "rollback_manifest" }),
      ],
      uploadPlan: [
        {
          kind: "latest_manifest",
          path: `${outputDir}/latest.json`,
          url: "https://updates.limecloud.example/agent-apps/content-factory-app/stable/latest.json",
        },
        {
          kind: "rollback_manifest",
          path: `${outputDir}/rollback.json`,
          url: "https://updates.limecloud.example/agent-apps/content-factory-app/stable/rollback.json",
        },
      ],
    });
    expect(plan.latest.artifacts[0]).toMatchObject({
      contentHash: "sha256:pkg",
      signature: "tauri-signature:pkg",
      url: "https://updates.limecloud.example/agent-apps/content-factory-app/stable/0.8.0/Content%20Factory.signed.pkg",
    });
  });

  it("缺 updater signature / endpoint / rollback ref 时 blocked", () => {
    const plan = buildStandaloneUpdaterPublishPlan({
      appId: "content-factory-app",
      version: "0.8.0",
      channel: "stable",
      outputDir: "/tmp/out",
      artifacts: [
        {
          kind: "pkg",
          platform: "macos",
          path: "/tmp/out/Content Factory.signed.pkg",
          contentHash: "sha256:pkg",
          notarized: true,
        },
      ],
    });

    expect(plan).toMatchObject({
      status: "blocked",
      readyToPublish: false,
      files: [],
      blockers: [
        expect.objectContaining({ code: "ENDPOINT_MISSING" }),
        expect.objectContaining({ code: "UPDATER_PUBKEY_MISSING" }),
        expect.objectContaining({ code: "ARTIFACT_UPDATER_SIGNATURE_MISSING" }),
        expect.objectContaining({ code: "ROLLBACK_REFERENCE_MISSING" }),
      ],
    });
  });

  it("写入本地 latest 和 rollback manifest，但不做网络发布", () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-updater-publisher-"),
    );
    const plan = buildStandaloneUpdaterPublishPlan(releaseInput(outputDir));

    const result = writeStandaloneUpdaterPublishFiles(plan);

    expect(result).toMatchObject({
      status: "written",
      releaseReadiness: "local_manifest_written_not_uploaded",
      filesWritten: [
        { kind: "latest_manifest", path: path.join(outputDir, "latest.json") },
        {
          kind: "rollback_manifest",
          path: path.join(outputDir, "rollback.json"),
        },
      ],
    });
    expect(
      JSON.parse(fs.readFileSync(path.join(outputDir, "latest.json"), "utf8")),
    ).toMatchObject({
      appId: "content-factory-app",
      artifacts: [
        expect.objectContaining({ signature: "tauri-signature:pkg" }),
      ],
    });
  });

  it("CLI 能写出本地 manifest evidence", () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-updater-publisher-cli-"),
    );
    const releasePath = path.join(outputDir, "release.json");
    const evidencePath = path.join(outputDir, "publish-evidence.json");
    writeJsonFile(releasePath, releaseInput(outputDir));

    const result = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/agent-app-standalone-updater-publisher.mjs"),
        "--release",
        releasePath,
        "--output-dir",
        outputDir,
        "--evidence",
        evidencePath,
        "--write",
        "--check",
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(fs.readFileSync(evidencePath, "utf8"))).toMatchObject({
      status: "written",
      releaseReadiness: "local_manifest_written_not_uploaded",
    });
  });
});
