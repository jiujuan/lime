import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  buildStandaloneReleaseSecretPreflight,
  writeJsonFile,
} from "./agent-app-standalone-release-secret-preflight-core.mjs";

describe("agent-app standalone release secret preflight", () => {
  it("macOS pkg stable remote upload 缺少 secrets 时必须 blocked 且不泄露值", () => {
    const result = buildStandaloneReleaseSecretPreflight({
      channel: "stable",
      env: {},
      packageFormat: "pkg",
      platform: "macos",
      remoteUpload: true,
    });

    expect(result).toMatchObject({
      status: "blocked",
      ready: false,
      missingSecrets: expect.arrayContaining([
        expect.objectContaining({ key: "APPLE_CERTIFICATE" }),
        expect.objectContaining({ key: "APPLE_INSTALLER_SIGNING_IDENTITY" }),
        expect.objectContaining({
          key: "LIME_AGENT_APP_UPDATER_SIGNING_PRIVATE_KEY",
        }),
        expect.objectContaining({ key: "LIME_AGENT_APP_RELEASE_UPLOAD_TOKEN" }),
      ]),
    });
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it("接受 Electron updater signing secret", () => {
    const result = buildStandaloneReleaseSecretPreflight({
      channel: "beta",
      env: {
        APPLE_CERTIFICATE: "secret-value",
        APPLE_CERTIFICATE_PASSWORD: "secret-value",
        APPLE_ID: "ci@example.com",
        APPLE_PASSWORD: "secret-value",
        APPLE_SIGNING_IDENTITY:
          "Developer ID Application: Lime Cloud (TEAMID1234)",
        APPLE_TEAM_ID: "TEAMID1234",
        LIME_AGENT_APP_UPDATER_SIGNING_PRIVATE_KEY_PASSWORD: "secret-value",
        LIME_AGENT_APP_UPDATER_SIGNING_PRIVATE_KEY_RAW: "secret-value",
      },
      packageFormat: "dmg",
      platform: "macos",
    });

    expect(result).toMatchObject({
      status: "ready",
      ready: true,
      missingSecrets: [],
      presentSecretKeys: expect.arrayContaining([
        expect.objectContaining({
          key: "LIME_AGENT_APP_UPDATER_SIGNING_PRIVATE_KEY_RAW",
          canonicalKey: "LIME_AGENT_APP_UPDATER_SIGNING_PRIVATE_KEY",
        }),
      ]),
    });
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it("Windows release 需要独立签名 secret", () => {
    const result = buildStandaloneReleaseSecretPreflight({
      channel: "dev",
      env: {
        LIME_AGENT_APP_UPDATER_SIGNING_PRIVATE_KEY: "secret-value",
        LIME_AGENT_APP_UPDATER_SIGNING_PRIVATE_KEY_PASSWORD: "secret-value",
      },
      platform: "windows",
    });

    expect(result.missingSecrets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "WINDOWS_SIGNING_CERTIFICATE" }),
        expect.objectContaining({
          key: "WINDOWS_SIGNING_CERTIFICATE_PASSWORD",
        }),
      ]),
    );
  });

  it("CLI --check 会根据 presence gate 返回退出码并写非敏感 JSON", () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-release-secret-preflight-"),
    );
    const blockedPath = path.join(outputDir, "blocked.json");
    const blocked = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/agent-app-standalone-release-secret-preflight.mjs"),
        "--platform",
        "macos",
        "--package-format",
        "pkg",
        "--remote-upload",
        "--output",
        blockedPath,
        "--check",
      ],
      { encoding: "utf8", env: { PATH: process.env.PATH } },
    );

    expect(blocked.status).toBe(1);
    expect(JSON.parse(fs.readFileSync(blockedPath, "utf8"))).toMatchObject({
      status: "blocked",
      ready: false,
    });

    const readyPath = path.join(outputDir, "ready.json");
    const ready = spawnSync(
      process.execPath,
      [
        path.resolve("scripts/agent-app-standalone-release-secret-preflight.mjs"),
        "--platform",
        "macos",
        "--package-format",
        "dmg",
        "--channel",
        "beta",
        "--output",
        readyPath,
        "--check",
      ],
      {
        encoding: "utf8",
        env: {
          APPLE_CERTIFICATE: "secret-value",
          APPLE_CERTIFICATE_PASSWORD: "secret-value",
          APPLE_ID: "ci@example.com",
          APPLE_PASSWORD: "secret-value",
          APPLE_SIGNING_IDENTITY:
            "Developer ID Application: Lime Cloud (TEAMID1234)",
          APPLE_TEAM_ID: "TEAMID1234",
          PATH: process.env.PATH,
          LIME_AGENT_APP_UPDATER_SIGNING_PRIVATE_KEY: "secret-value",
          LIME_AGENT_APP_UPDATER_SIGNING_PRIVATE_KEY_PASSWORD: "secret-value",
        },
      },
    );

    expect(ready.status).toBe(0);
    const readyJson = JSON.parse(fs.readFileSync(readyPath, "utf8"));
    expect(readyJson).toMatchObject({ status: "ready", ready: true });
    expect(JSON.stringify(readyJson)).not.toContain("secret-value");
  });

  it("writeJsonFile 会创建父目录", () => {
    const outputDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "lime-agent-app-release-secret-write-"),
    );
    const output = path.join(outputDir, "nested", "preflight.json");
    writeJsonFile(output, { status: "ready" });

    expect(JSON.parse(fs.readFileSync(output, "utf8"))).toEqual({
      status: "ready",
    });
  });
});
