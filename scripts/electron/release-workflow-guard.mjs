#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const DEFAULT_WORKFLOW_PATH = ".github/workflows/release.yml";

function readWorkflow(workflowPath = DEFAULT_WORKFLOW_PATH) {
  return YAML.parse(fs.readFileSync(workflowPath, "utf8"));
}

function stepByName(steps, name) {
  return steps.find((step) => step?.name === name);
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

  const installStep = stepByName(steps, "Install dependencies");
  if (installStep?.run !== "npm ci") {
    throw new Error("release build must install dependencies with npm ci");
  }

  const macSecretStep = stepByName(
    steps,
    "Validate Electron macOS signing secrets",
  );
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
  const macImportRun = macImportStep?.run || "";
  for (const required of [
    "security create-keychain",
    "security import",
    "security set-key-partition-list",
    "LIME_MACOS_KEYCHAIN",
  ]) {
    assertIncludes(macImportRun, required, "macOS certificate import");
  }

  const winSecretStep = stepByName(
    steps,
    "Validate Electron Windows signing secrets",
  );
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
  const winImportRun = winImportStep?.run || "";
  for (const required of [
    "LIME_WINDOWS_SIGNING_CERTIFICATE_FILE",
    "LIME_WINDOWS_SIGNING_CERTIFICATE_PASSWORD",
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
  for (const requiredEnv of [
    "LIME_ELECTRON_SIGN",
    "APPLE_SIGNING_IDENTITY",
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_TEAM_ID",
  ]) {
    if (!(requiredEnv in buildEnv)) {
      throw new Error(`Electron build env missing ${requiredEnv}`);
    }
  }

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

function assertNoRetiredPackagingWorkflowInputs(workflowText) {
  for (const forbidden of [
    "electron-builder",
    "electron-updater",
    "nsis",
    "plan-electron-updater-r2-upload",
  ]) {
    if (workflowText.toLowerCase().includes(forbidden.toLowerCase())) {
      throw new Error(
        `release workflow must not use retired packaging input: ${forbidden}`,
      );
    }
  }
}

function validateReleaseWorkflow({
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
  assertNoRetiredPackagingWorkflowInputs(workflowText);
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
