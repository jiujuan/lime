#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const DEFAULT_WORKFLOW_PATH = ".github/workflows/release.yml";
const DEFAULT_FORGE_CONFIG_PATH = "forge.config.mjs";

function readWorkflow(workflowPath = DEFAULT_WORKFLOW_PATH) {
  return YAML.parse(fs.readFileSync(workflowPath, "utf8"));
}

function stepByName(steps, name) {
  return steps.find((step) => step?.name === name);
}

function assertEnvValueIncludes(env, key, needle, label) {
  if (!env || !(key in env)) {
    throw new Error(`${label} env missing ${key}`);
  }
  assertIncludes(env[key], needle, `${label} env ${key}`);
}

function assertIncludes(haystack, needle, label) {
  if (!String(haystack || "").includes(needle)) {
    throw new Error(`${label} must include ${needle}`);
  }
}

function assertNoLegacyUpdaterAssets(runScript, label) {
  for (const forbidden of [
    "*.app.tar.gz",
    "*.sig",
    "latest.json",
    "latest.yml",
    "latest-mac.yml",
    "*.blockmap",
  ]) {
    assertIncludes(runScript, forbidden, label);
  }
}

function assertMatrix(buildJob) {
  const matrix = buildJob?.strategy?.matrix?.include;
  if (!Array.isArray(matrix)) {
    throw new Error("release build job must define strategy.matrix.include");
  }

  const expected = new Map([
    [
      "macOS-arm64",
      {
        arch: "arm64",
        feed: "darwin-arm64",
        forge_targets: "dmg,zip",
        host_platform: "darwin",
        platform: "macos-15",
        target: "aarch64-apple-darwin",
      },
    ],
    [
      "macOS-x64",
      {
        arch: "x64",
        feed: "darwin-x64",
        forge_targets: "dmg,zip",
        host_platform: "darwin",
        platform: "macos-15-intel",
        target: "x86_64-apple-darwin",
      },
    ],
    [
      "Windows-x64",
      {
        arch: "x64",
        feed: "win32-x64",
        forge_targets: "squirrel",
        host_platform: "win32",
        platform: "windows-2022",
        target: "x86_64-pc-windows-msvc",
      },
    ],
  ]);

  for (const [name, fields] of expected) {
    const row = matrix.find((item) => item?.name === name);
    if (!row) {
      throw new Error(`release build matrix missing ${name}`);
    }
    for (const [key, value] of Object.entries(fields)) {
      if (row[key] !== value) {
        throw new Error(
          `release build matrix ${name}.${key} expected ${value}, got ${row[key]}`,
        );
      }
    }
  }
}

function assertBuildSteps(buildJob) {
  const steps = buildJob?.steps;
  if (!Array.isArray(steps)) {
    throw new Error("release build job must define steps");
  }

  const buildJobEnv = buildJob?.env || {};
  assertEnvValueIncludes(
    buildJobEnv,
    "LIME_ELECTRON_UPDATES_URL",
    "LIME_UPDATES_BASE_URL",
    "release build job",
  );
  assertEnvValueIncludes(
    buildJobEnv,
    "LIME_ELECTRON_UPDATES_URL",
    "matrix.feed",
    "release build job",
  );

  const installStep = stepByName(steps, "Install dependencies");
  if (installStep?.run !== "npm ci") {
    throw new Error("release build must install dependencies with npm ci");
  }

  const macSecretStep = stepByName(
    steps,
    "Validate Electron macOS signing secrets",
  );
  const macSecretEnv = macSecretStep?.env || {};
  for (const secret of [
    "APPLE_CERTIFICATE",
    "APPLE_CERTIFICATE_PASSWORD",
    "APPLE_ID",
    "APPLE_PASSWORD",
    "APPLE_SIGNING_IDENTITY",
    "APPLE_TEAM_ID",
    "KEYCHAIN_PASSWORD",
  ]) {
    assertEnvValueIncludes(
      macSecretEnv,
      secret,
      `secrets.${secret}`,
      "macOS signing secret preflight",
    );
  }
  const macSecretRun = macSecretStep?.run || "";
  for (const secret of [
    "APPLE_CERTIFICATE",
    "APPLE_CERTIFICATE_PASSWORD",
    "APPLE_ID",
    "APPLE_PASSWORD",
    "APPLE_SIGNING_IDENTITY",
    "APPLE_TEAM_ID",
    "KEYCHAIN_PASSWORD",
  ]) {
    assertIncludes(macSecretRun, secret, "macOS signing secret preflight");
  }

  const macImportStep = stepByName(
    steps,
    "Import Electron macOS signing certificate",
  );
  const macImportEnv = macImportStep?.env || {};
  for (const secret of [
    "APPLE_CERTIFICATE",
    "APPLE_CERTIFICATE_PASSWORD",
    "KEYCHAIN_PASSWORD",
  ]) {
    assertEnvValueIncludes(
      macImportEnv,
      secret,
      `secrets.${secret}`,
      "macOS certificate import",
    );
  }
  const macImportRun = macImportStep?.run || "";
  for (const required of [
    "base64 --decode",
    "security create-keychain",
    "security import",
    "security set-key-partition-list",
    "LIME_MACOS_KEYCHAIN",
    '>> "$GITHUB_ENV"',
  ]) {
    assertIncludes(macImportRun, required, "macOS certificate import");
  }

  const winSecretStep = stepByName(
    steps,
    "Validate Electron Windows signing secrets",
  );
  const winSecretEnv = winSecretStep?.env || {};
  for (const secret of [
    "WINDOWS_SIGNING_CERTIFICATE",
    "WINDOWS_SIGNING_CERTIFICATE_PASSWORD",
  ]) {
    assertEnvValueIncludes(
      winSecretEnv,
      secret,
      `secrets.${secret}`,
      "Windows signing secret preflight",
    );
  }
  const winSecretRun = winSecretStep?.run || "";
  for (const secret of [
    "WINDOWS_SIGNING_CERTIFICATE",
    "WINDOWS_SIGNING_CERTIFICATE_PASSWORD",
  ]) {
    assertIncludes(winSecretRun, secret, "Windows signing secret preflight");
  }

  const winImportStep = stepByName(
    steps,
    "Prepare Electron Windows signing certificate",
  );
  const winImportEnv = winImportStep?.env || {};
  for (const secret of [
    "WINDOWS_SIGNING_CERTIFICATE",
    "WINDOWS_SIGNING_CERTIFICATE_PASSWORD",
  ]) {
    assertEnvValueIncludes(
      winImportEnv,
      secret,
      `secrets.${secret}`,
      "Windows certificate preparation",
    );
  }
  const winImportRun = winImportStep?.run || "";
  for (const required of [
    "WINDOWS_SIGNING_CERTIFICATE_PATH",
    'Buffer.from(certificate, "base64")',
    "LIME_WINDOWS_SIGNING_CERTIFICATE_FILE",
    "LIME_WINDOWS_SIGNING_CERTIFICATE_PASSWORD",
    '>> "$GITHUB_ENV"',
  ]) {
    assertIncludes(winImportRun, required, "Windows certificate preparation");
  }

  const buildStep = stepByName(steps, "Build Electron app");
  const buildRun = buildStep?.run || "";
  for (const required of [
    "npm run electron:build",
    "npx electron-forge make",
    '--platform "${{ matrix.host_platform }}"',
    '--arch "${{ matrix.arch }}"',
    '--targets "${{ matrix.forge_targets }}"',
  ]) {
    assertIncludes(buildRun, required, "Electron Forge make step");
  }
  const buildEnv = buildStep?.env || {};
  assertEnvValueIncludes(
    buildEnv,
    "LIME_ELECTRON_SIGN",
    "matrix.host_platform == 'win32'",
    "Electron build",
  );
  assertEnvValueIncludes(
    buildEnv,
    "APPLE_SIGNING_IDENTITY",
    "secrets.APPLE_SIGNING_IDENTITY",
    "Electron build",
  );
  assertEnvValueIncludes(
    buildEnv,
    "APPLE_ID",
    "secrets.APPLE_ID",
    "Electron build",
  );
  assertEnvValueIncludes(
    buildEnv,
    "APPLE_APP_SPECIFIC_PASSWORD",
    "secrets.APPLE_PASSWORD",
    "Electron build",
  );
  assertEnvValueIncludes(
    buildEnv,
    "APPLE_TEAM_ID",
    "secrets.APPLE_TEAM_ID",
    "Electron build",
  );

  const verifyStep = stepByName(steps, "Verify Electron package resources");
  assertIncludes(
    verifyStep?.run,
    "scripts/electron/verify-package-resources.mjs",
    "Electron package resource verification",
  );

  const stageStep = stepByName(steps, "Stage Electron release assets");
  assertIncludes(
    stageStep?.run,
    "scripts/electron/stage-release-assets.mjs",
    "Electron release staging",
  );
}

function assertPublishSteps(workflow) {
  const publishJob = workflow?.jobs?.publish_release_assets;
  const steps = publishJob?.steps;
  if (!Array.isArray(steps)) {
    throw new Error("publish_release_assets job must define steps");
  }

  const inspectStep = stepByName(steps, "Inspect Electron release assets");
  assertNoLegacyUpdaterAssets(
    inspectStep?.run || "",
    "GitHub Release asset inspection",
  );

  const prepareStep = stepByName(steps, "Prepare GitHub release upload assets");
  assertIncludes(
    prepareStep?.run,
    "scripts/electron/prepare-github-release-assets.mjs",
    "GitHub Release asset preparation",
  );

  const updaterJob = workflow?.jobs?.publish_updater_assets_r2;
  const updaterSteps = updaterJob?.steps;
  if (!Array.isArray(updaterSteps)) {
    throw new Error("publish_updater_assets_r2 job must define steps");
  }
  const uploadStep = stepByName(
    updaterSteps,
    "Upload Electron updater assets to Cloudflare R2",
  );
  assertIncludes(
    uploadStep?.run,
    "scripts/electron/update-feed-r2-upload-plan.mjs",
    "R2 updater upload plan",
  );
  const cleanupStep = stepByName(
    updaterSteps,
    "Clean old updater assets from Cloudflare R2",
  );
  assertIncludes(
    cleanupStep?.run,
    "scripts/electron/r2-release-cleanup-plan.mjs",
    "R2 updater cleanup plan",
  );
}

function assertNoRetiredPackagingInputs(content, label) {
  for (const forbidden of [
    "electron-builder",
    "electron-updater",
    "nsis",
    "plan-electron-updater-r2-upload",
  ]) {
    if (content.toLowerCase().includes(forbidden.toLowerCase())) {
      throw new Error(
        `${label} must not use retired packaging input: ${forbidden}`,
      );
    }
  }
}

function assertForgeConfig(forgeConfigPath = DEFAULT_FORGE_CONFIG_PATH) {
  const forgeConfig = fs.readFileSync(forgeConfigPath, "utf8");

  assertNoRetiredPackagingInputs(forgeConfig, "Forge config");

  for (const required of [
    "@electron-forge/maker-dmg",
    "@electron-forge/maker-zip",
    "@electron-forge/maker-squirrel",
    "new MakerDMG",
    "new MakerZIP",
    "new MakerSquirrel",
    '["darwin"]',
    '["win32"]',
    "macUpdateManifestBaseUrl",
    'updateFeedUrl("darwin", arch',
    'updateFeedUrl("win32", arch',
    "RELEASE_OUTPUT_DIR",
    "LIME_ELECTRON_FORGE_OUT_DIR",
    "dist-electron/app-server.release.json",
    "dist-electron/app-server",
  ]) {
    assertIncludes(forgeConfig, required, "Forge current maker config");
  }

  for (const required of [
    "macSignOptions",
    "hardenedRuntime",
    "lime-rs/entitlements.plist",
    "APPLE_SIGNING_IDENTITY",
    "LIME_MACOS_KEYCHAIN",
    "osxSign: macSignOptions()",
    "macNotarizeOptions",
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_PASSWORD",
    "APPLE_TEAM_ID",
    "osxNotarize: macNotarizeOptions()",
  ]) {
    assertIncludes(forgeConfig, required, "Forge macOS signing config");
  }

  for (const required of [
    "windowsSigningOptions",
    "LIME_WINDOWS_SIGNING_CERTIFICATE_FILE",
    "LIME_WINDOWS_SIGNING_CERTIFICATE_PASSWORD",
    "certificateFile",
    "certificatePassword",
    "squirrelConfig",
    "SQUIRREL_PACKAGE_NAME",
    "noMsi: true",
    "setupExe",
    "Setup.exe",
    "setupIcon",
    "lime-rs/icons/icon.ico",
    "...windowsSigningOptions(options)",
  ]) {
    assertIncludes(forgeConfig, required, "Forge Windows Squirrel config");
  }
}

function validateReleaseWorkflow({
  forgeConfigPath = DEFAULT_FORGE_CONFIG_PATH,
  workflowPath = DEFAULT_WORKFLOW_PATH,
} = {}) {
  const workflowText = fs.readFileSync(workflowPath, "utf8");
  const workflow = YAML.parse(workflowText);
  const buildJob = workflow?.jobs?.build;
  if (!buildJob) {
    throw new Error("release workflow missing build job");
  }

  assertMatrix(buildJob);
  assertBuildSteps(buildJob);
  assertPublishSteps(workflow);
  assertNoRetiredPackagingInputs(workflowText, "release workflow");
  assertForgeConfig(forgeConfigPath);
}

function main() {
  const workflowPath = process.argv[2] || DEFAULT_WORKFLOW_PATH;
  validateReleaseWorkflow({ workflowPath });
  console.log("[electron-release-workflow] ok");
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  main();
}

export { validateReleaseWorkflow };
