#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  applyFailedSettingsArchivedLifecycleEvidence,
  applyPassingSettingsArchivedLifecycleEvidence,
  createSettingsArchivedLifecycleEvidence,
  parseSettingsArchivedLifecycleArgs,
  summarizeSettingsArchivedLifecycleTrace,
} from "./lib/settings-archived-lifecycle-fixture-evidence.mjs";

const DEFAULTS = {
  runId: process.env.LIME_GATE_RUN_ID?.trim() || null,
  evidenceDir: null,
  prefix: "settings-archived-lifecycle-fixture",
  timeoutMs: 240_000,
  intervalMs: 250,
  keepTemp: false,
};

function printHelp() {
  console.log(`
Settings Archived Lifecycle Electron Fixture

Usage:
  node scripts/electron/settings-archived-lifecycle-fixture-smoke.mjs --run-id <id>

Options:
  --run-id <id> --evidence-dir <path> --prefix <name>
  --timeout-ms <ms> --interval-ms <ms> --keep-temp -h|--help

The wrapper runs the current session-history Electron owner fixture in an
isolated temporary evidence directory and emits a privacy-reduced SETTINGS-01
archive/restore/restart summary. It never stores conversation content,
identities, database rows, import payloads, or local paths.
`);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function runOwnerFixture(options, ownerEvidenceDir, ownerPrefix) {
  const script = path.resolve(
    process.cwd(),
    "scripts/electron/session-history-fixture-smoke.mjs",
  );
  const args = [
    script,
    "--evidence-dir",
    ownerEvidenceDir,
    "--prefix",
    ownerPrefix,
    "--timeout-ms",
    String(options.timeoutMs),
    "--interval-ms",
    String(options.intervalMs),
  ];
  if (options.keepTemp) args.push("--keep-temp");
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, LIME_GATE_RUN_ID: options.runId },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`session history owner fixture stopped by ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) {
    throw new Error(`session history owner fixture exited with ${exitCode}`);
  }
}

async function run() {
  const options = parseSettingsArchivedLifecycleArgs(process.argv.slice(2), {
    defaults: DEFAULTS,
  });
  if (options.help) {
    printHelp();
    return;
  }
  fs.mkdirSync(options.evidenceDir, { recursive: true });
  const file = (suffix) =>
    path.join(options.evidenceDir, `${options.prefix}${suffix}`);
  const summaryPath = file("-summary.json");
  const rawEvidencePath = file("-raw.json");
  const archivedScreenshotPath = file("-archived.png");
  const recoveredScreenshotPath = file("-recovered.png");
  const ownerEvidenceDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "lime-settings-archived-owner-"),
  );
  const ownerPrefix = "session-history-settings-owner";
  const ownerSummaryPath = path.join(
    ownerEvidenceDir,
    `${ownerPrefix}-summary.json`,
  );
  const ownerRawPath = path.join(ownerEvidenceDir, `${ownerPrefix}-raw.json`);
  const summary = createSettingsArchivedLifecycleEvidence({
    candidateRunId: options.runId,
    startedAt: new Date().toISOString(),
    prefix: options.prefix,
  });
  try {
    await runOwnerFixture(options, ownerEvidenceDir, ownerPrefix);
    if (!fs.existsSync(ownerSummaryPath) || !fs.existsSync(ownerRawPath)) {
      throw new Error("session history owner fixture evidence is incomplete");
    }
    const sourceSummary = JSON.parse(fs.readFileSync(ownerSummaryPath, "utf8"));
    const sourceRaw = JSON.parse(fs.readFileSync(ownerRawPath, "utf8"));
    const trace = summarizeSettingsArchivedLifecycleTrace(sourceRaw);
    const sourceArchivedScreenshot = sourceSummary.archivedScreenshot;
    const sourceRecoveredScreenshot = sourceSummary.recoveredScreenshot;
    if (
      typeof sourceArchivedScreenshot !== "string" ||
      typeof sourceRecoveredScreenshot !== "string" ||
      !fs.existsSync(sourceArchivedScreenshot) ||
      !fs.existsSync(sourceRecoveredScreenshot)
    ) {
      throw new Error(
        "session history owner fixture screenshots are incomplete",
      );
    }
    fs.copyFileSync(sourceArchivedScreenshot, archivedScreenshotPath);
    fs.copyFileSync(sourceRecoveredScreenshot, recoveredScreenshotPath);
    applyPassingSettingsArchivedLifecycleEvidence(summary, {
      completedAt: new Date().toISOString(),
      sourceSummary,
      trace,
      archivedScreenshotWritten: fs.existsSync(archivedScreenshotPath),
      recoveredScreenshotWritten: fs.existsSync(recoveredScreenshotPath),
    });
    writeJson(rawEvidencePath, {
      lifecycle: summary.lifecycle,
      appServerMethods: trace.methods,
      errors: summary.errors,
      conversationContentStored: false,
      identityStored: false,
      pathStored: false,
      importPayloadStored: false,
    });
    writeJson(summaryPath, summary);
    console.log(
      `[smoke:settings-archived-lifecycle-fixture] summary=${summaryPath}`,
    );
  } catch (error) {
    applyFailedSettingsArchivedLifecycleEvidence(summary, error);
    writeJson(summaryPath, summary);
    throw error;
  } finally {
    if (!options.keepTemp) {
      fs.rmSync(ownerEvidenceDir, { recursive: true, force: true });
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  run().catch((error) => {
    console.error(
      `[smoke:settings-archived-lifecycle-fixture] ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  });
}
