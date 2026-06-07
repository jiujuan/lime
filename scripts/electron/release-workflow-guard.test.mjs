import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { validateReleaseWorkflow } from "./release-workflow-guard.mjs";

function tempWorkflowPath(content) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "electron-release-workflow-"),
  );
  const filePath = path.join(dir, "release.yml");
  fs.writeFileSync(filePath, content);
  return filePath;
}

function tempForgeConfigPath(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "electron-forge-config-"));
  const filePath = path.join(dir, "forge.config.mjs");
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe("Electron release workflow guard", () => {
  it("accepts the current Forge-only release workflow", () => {
    expect(() => validateReleaseWorkflow()).not.toThrow();
  });

  it("rejects macOS arm64 runner drift", () => {
    const current = fs.readFileSync(".github/workflows/release.yml", "utf8");
    const workflowPath = tempWorkflowPath(
      current.replace("platform: macos-15", "platform: macos-latest"),
    );

    expect(() => validateReleaseWorkflow({ workflowPath })).toThrow(
      /macOS-arm64\.platform expected macos-15/,
    );
  });

  it("rejects retired packaging tools in release workflow", () => {
    const current = fs.readFileSync(".github/workflows/release.yml", "utf8");
    const workflowPath = tempWorkflowPath(`${current}\n# electron-builder\n`);

    expect(() => validateReleaseWorkflow({ workflowPath })).toThrow(
      /release workflow must not use retired packaging input: electron-builder/,
    );
  });

  it("rejects missing macOS notarization env wiring in the Forge make step", () => {
    const current = fs.readFileSync(".github/workflows/release.yml", "utf8");
    const workflowPath = tempWorkflowPath(
      current.replace(
        "APPLE_APP_SPECIFIC_PASSWORD: ${{ startsWith(matrix.platform, 'macos') && secrets.APPLE_PASSWORD || '' }}",
        "APPLE_APP_SPECIFIC_PASSWORD: ''",
      ),
    );

    expect(() => validateReleaseWorkflow({ workflowPath })).toThrow(
      /Electron build env APPLE_APP_SPECIFIC_PASSWORD must include secrets\.APPLE_PASSWORD/,
    );
  });

  it("rejects missing Windows Squirrel signing env wiring in the Forge make step", () => {
    const current = fs.readFileSync(".github/workflows/release.yml", "utf8");
    const workflowPath = tempWorkflowPath(
      current.replace(
        "LIME_ELECTRON_SIGN: ${{ (startsWith(matrix.platform, 'macos') || matrix.host_platform == 'win32') && '1' || '' }}",
        "LIME_ELECTRON_SIGN: ${{ startsWith(matrix.platform, 'macos') && '1' || '' }}",
      ),
    );

    expect(() => validateReleaseWorkflow({ workflowPath })).toThrow(
      /Electron build env LIME_ELECTRON_SIGN must include matrix\.host_platform == 'win32'/,
    );
  });

  it("rejects missing Windows Squirrel maker config", () => {
    const forgeConfig = fs.readFileSync("forge.config.mjs", "utf8");
    const forgeConfigPath = tempForgeConfigPath(
      forgeConfig.replace("new MakerSquirrel", "new DisabledMakerSquirrel"),
    );

    expect(() => validateReleaseWorkflow({ forgeConfigPath })).toThrow(
      /Forge current maker config must include new MakerSquirrel/,
    );
  });

  it("rejects retired packaging tools in Forge config", () => {
    const forgeConfig = fs.readFileSync("forge.config.mjs", "utf8");
    const forgeConfigPath = tempForgeConfigPath(
      `${forgeConfig}\n// electron-updater\n`,
    );

    expect(() => validateReleaseWorkflow({ forgeConfigPath })).toThrow(
      /Forge config must not use retired packaging input: electron-updater/,
    );
  });
});
