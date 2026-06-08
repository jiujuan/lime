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

function tempReleaseScriptPath(name, content) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "electron-release-script-"),
  );
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function tempRepositoryRoot(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "electron-release-root-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return dir;
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

  it("rejects missing macOS keychain search-list wiring", () => {
    const current = fs.readFileSync(".github/workflows/release.yml", "utf8");
    const workflowPath = tempWorkflowPath(
      current.replace(
        '          security list-keychains -d user -s "$KEYCHAIN_PATH" "${existing_keychains[@]}"\n',
        "",
      ),
    );

    expect(() => validateReleaseWorkflow({ workflowPath })).toThrow(
      /macOS certificate import must include security list-keychains -d user -s/,
    );
  });

  it("rejects missing Forge output inventory in the make step", () => {
    const current = fs.readFileSync(".github/workflows/release.yml", "utf8");
    const workflowPath = tempWorkflowPath(
      current.replace("          find release-electron -type f | sort\n", ""),
    );

    expect(() => validateReleaseWorkflow({ workflowPath })).toThrow(
      /Electron Forge make step must include find release-electron -type f | sort/,
    );
  });

  it("rejects missing explicit Forge package step before make", () => {
    const current = fs.readFileSync(".github/workflows/release.yml", "utf8");
    const workflowPath = tempWorkflowPath(
      current.replace(
        /          npx electron-forge package \\\n            --platform "\$\{\{ matrix\.host_platform \}\}" \\\n            --arch "\$\{\{ matrix\.arch \}\}"\n/,
        "",
      ),
    );

    expect(() => validateReleaseWorkflow({ workflowPath })).toThrow(
      /Electron Forge make step must include npx electron-forge package/,
    );
  });

  it("rejects Forge make without the existing package output", () => {
    const current = fs.readFileSync(".github/workflows/release.yml", "utf8");
    const workflowPath = tempWorkflowPath(
      current.replace("            --skip-package \\\n", ""),
    );

    expect(() => validateReleaseWorkflow({ workflowPath })).toThrow(
      /Electron Forge make step must include --skip-package/,
    );
  });

  it("rejects missing Forge make asset scan", () => {
    const current = fs.readFileSync(".github/workflows/release.yml", "utf8");
    const workflowPath = tempWorkflowPath(
      current.replaceAll("*.nupkg", "*.pkg"),
    );

    expect(() => validateReleaseWorkflow({ workflowPath })).toThrow(
      /Electron Forge make step must include \*\.nupkg/,
    );
  });

  it("rejects mandatory Windows Squirrel signing secrets in release workflow", () => {
    const current = fs.readFileSync(".github/workflows/release.yml", "utf8");
    const workflowPath = tempWorkflowPath(
      current.replace(
        "Electron Windows signing secrets are not configured; Forge Squirrel will produce unsigned installer assets.",
        "Missing Electron Windows signing secrets",
      ),
    );

    expect(() => validateReleaseWorkflow({ workflowPath })).toThrow(
      /Windows signing secret preflight/,
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

  it("rejects Windows Squirrel remote release sync from runtime feed", () => {
    const forgeConfig = fs.readFileSync("forge.config.mjs", "utf8");
    const forgeConfigPath = tempForgeConfigPath(
      forgeConfig.replace(
        "    setupExe: `${PRODUCT_NAME}-${packageVersion} Setup.exe`,",
        '    remoteReleases: updateFeedUrl("win32", arch, options),\n    setupExe: `${PRODUCT_NAME}-${packageVersion} Setup.exe`,',
      ),
    );

    expect(() => validateReleaseWorkflow({ forgeConfigPath })).toThrow(
      /must not use runtime update feed as remoteReleases/,
    );
  });

  it("rejects macOS branding after signing and notarization", () => {
    const forgeConfig = fs.readFileSync("forge.config.mjs", "utf8");
    const forgeConfigPath = tempForgeConfigPath(
      forgeConfig.replace(
        "    afterCopyExtraResources: [",
        "    afterComplete: [",
      ),
    );

    expect(() => validateReleaseWorkflow({ forgeConfigPath })).toThrow(
      /macOS branding hook must run before signing/,
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

  it("rejects retired Tauri / updater metadata files in the repository", () => {
    const repositoryRoot = tempRepositoryRoot({
      "lime-rs/tauri.windows.conf.json": '{"bundle":{"targets":["nsis"]}}',
      "docs/notes.md": "current docs",
    });

    expect(() => validateReleaseWorkflow({ repositoryRoot })).toThrow(
      /retired Electron packaging files must not exist.*lime-rs\/tauri\.windows\.conf\.json/,
    );
  });

  it("rejects retired builder updater metadata files in the repository", () => {
    const repositoryRoot = tempRepositoryRoot({
      "internal/latest-mac.yml": "legacy mac updater metadata",
      "internal/Lime.app.tar.gz": "legacy archive",
      "internal/Lime.dmg.blockmap": "legacy blockmap",
      "internal/Lime.sig": "legacy signature",
    });

    expect(() => validateReleaseWorkflow({ repositoryRoot })).toThrow(
      /retired Electron packaging files must not exist.*Lime\.app\.tar\.gz.*Lime\.dmg\.blockmap.*Lime\.sig.*latest-mac\.yml/s,
    );
  });

  it("rejects missing macOS RELEASES.json staging metadata", () => {
    const stageAssets = fs.readFileSync(
      "scripts/electron/stage-release-assets.mjs",
      "utf8",
    );
    const stageAssetsPath = tempReleaseScriptPath(
      "stage-release-assets.mjs",
      stageAssets.replaceAll(
        'metadataNames: ["RELEASES.json"]',
        'metadataNames: ["latest-mac.yml"]',
      ),
    );

    expect(() => validateReleaseWorkflow({ stageAssetsPath })).toThrow(
      /Electron release staging script must include metadataNames: \["RELEASES\.json"\]/,
    );
  });

  it("rejects missing Windows Squirrel RELEASES upload metadata", () => {
    const uploadPlan = fs.readFileSync(
      "scripts/electron/update-feed-r2-upload-plan.mjs",
      "utf8",
    );
    const updateFeedUploadPlanPath = tempReleaseScriptPath(
      "update-feed-r2-upload-plan.mjs",
      uploadPlan.replace(
        'basename === "RELEASES"',
        'basename === "latest.yml"',
      ),
    );

    expect(() => validateReleaseWorkflow({ updateFeedUploadPlanPath })).toThrow(
      /Electron R2 updater upload plan must include basename === "RELEASES"/,
    );
  });
});
