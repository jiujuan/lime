import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  buildStandaloneNativeBuildPlan,
} from "./lib/plugin-standalone-native-build-runner-core.mjs";
import {
  writeStandaloneNativeShellConfigFiles,
} from "./lib/plugin-standalone-native-shell-config-writer-core.mjs";

function readyConfigPlan(outputRoot) {
  return {
    schemaVersion: 1,
    status: "ready",
    readyToWrite: true,
    appId: "content-factory-app",
    entryKey: "dashboard",
    deepLinkScheme: "app-content-factory",
    planHash: "package-fnv1a-plan",
    files: [
      {
        kind: "native_shell_config",
        path: path.join(outputRoot, "runtime", "native-shell.config.json"),
        encoding: "utf8",
        content: "{}\n",
        contentHash: "package-fnv1a-config",
        sensitive: false,
      },
      {
        kind: "runtime_env",
        path: path.join(outputRoot, ".env.standalone"),
        encoding: "utf8",
        content: "APP_ID=content-factory-app\n",
        contentHash: "package-fnv1a-env",
        sensitive: false,
      },
    ],
    blockers: [],
  };
}

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

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

describe("standalone deprecated artifact adapter guard", () => {
  it.each([
    "scripts/plugin/standalone-native-shell-config-writer.mjs",
    "scripts/plugin/standalone-native-build-runner.mjs",
  ])("%s exits through the deprecated artifact adapter gate", (entrypoint) => {
    const result = spawnSync(process.execPath, [path.resolve(entrypoint)], {
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Electron/App Server release pipeline");
    expect(result.stderr).toContain("npm run dev");
    expect(result.stderr).toContain("lime-rs");
  });

  it("keeps legacy standalone artifact adapter helpers blocked", () => {
    const outputRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "standalone-deprecated-adapter-"),
    );
    const configResult = writeStandaloneNativeShellConfigFiles({
      outputRoot,
      plan: readyConfigPlan(outputRoot),
    });
    const buildPlan = buildStandaloneNativeBuildPlan({
      outputRoot,
      repoRoot: "/repo",
      writerResult: writtenWriterResult(outputRoot),
    });

    expect(configResult).toMatchObject({
      status: "blocked",
      filesWritten: [],
      blockers: [
        expect.objectContaining({ code: "DEPRECATED_STANDALONE_ARTIFACT_ADAPTER" }),
      ],
    });
    expect(buildPlan).toMatchObject({
      status: "blocked",
      readyToRun: false,
      releaseReadiness: "deprecated_not_release_ready",
      blockers: [
        expect.objectContaining({ code: "DEPRECATED_STANDALONE_ARTIFACT_ADAPTER" }),
      ],
    });
  });

  it("does not let deprecated adapter naming leak into current release evidence", () => {
    const currentReleaseSources = [
      "scripts/lib/plugin-standalone-release-evidence-core.mjs",
      "scripts/lib/plugin-standalone-macos-release-commands-core.mjs",
      "scripts/lib/plugin-standalone-updater-publisher-core.mjs",
      "scripts/plugin/standalone-evidence-pack.mjs",
      "src/features/plugin/packaging/releasePipeline.ts",
    ];

    for (const filePath of currentReleaseSources) {
      const content = readFile(filePath);

      expect(content, filePath).not.toMatch(/\bold\s+host\s+build\b/i);
      expect(content, filePath).not.toMatch(/\bold_host_config\b/i);
      expect(content, filePath).not.toMatch(/\bold_host_build_runner\b/i);
      expect(content, filePath).not.toMatch(/plugin-standalone-old-host/i);
      expect(content, filePath).not.toMatch(/verify:gui-smoke/);
    }
  });
});
