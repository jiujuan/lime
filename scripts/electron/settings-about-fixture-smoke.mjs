#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { resolveElectronAppServerRuntimeEnv } from "../lib/electron-app-server-assets.mjs";
import { resolveDevAppServerBinary } from "../lib/electron-dev-sidecar.mjs";
import { writeJsonFile } from "../mcp/lib/current-smoke-transport.mjs";
import {
  closeElectronFixture,
  createTempRuntimeEnv,
  launchElectronFixture,
  openSettings,
  parseInvokeTraceRaw,
  sanitizeText,
  waitForPageCondition,
} from "./mcp-config-fixture-smoke.mjs";
import {
  applyFailedSettingsAboutEvidence,
  applyPassingSettingsAboutEvidence,
  createSettingsAboutEvidence,
  isLocalizedAboutVersionLine,
  parseSettingsAboutFixtureArgs,
  summarizeSettingsAboutTrace,
} from "./lib/settings-about-fixture-evidence.mjs";

const DEFAULTS = {
  runId: process.env.LIME_GATE_RUN_ID?.trim() || null,
  evidenceDir: null,
  prefix: "settings-about-fixture",
  timeoutMs: 120_000,
  intervalMs: 250,
  keepTemp: false,
};

function printHelp() {
  console.log(`
Settings About Electron Fixture

Usage:
  node scripts/electron/settings-about-fixture-smoke.mjs --run-id <id>

Options:
  --run-id <id> --evidence-dir <path> --prefix <name>
  --timeout-ms <ms> --interval-ms <ms> --keep-temp -h|--help
`);
}

async function readAboutState(page, options, expectedVersion) {
  return await waitForPageCondition(
    page,
    options,
    ({ expectedVersion: version }) => {
      const bodyText = document.body?.innerText ?? "";
      const aboutTab = document.querySelector(
        '[data-testid="settings-sidebar-tab-about"]',
      );
      const loadingVisible = Boolean(
        document.querySelector('[data-testid="settings-page-loading"]'),
      );
      const internalDiagnosticVisible =
        /electron-host-diagnostic|Desktop Host current|get_skill_package_file_association_status|尚未接入真实/i.test(
          bodyText,
        );
      if (
        aboutTab?.getAttribute("data-active") !== "true" ||
        loadingVisible ||
        !bodyText.includes(version)
      ) {
        return null;
      }
      const versionLine = bodyText
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.includes(version));
      return {
        url: window.location.href,
        locale: document.documentElement.lang || navigator.language,
        visibleVersion: version,
        versionLine: versionLine ?? null,
        aboutActive: true,
        loadingVisible,
        internalDiagnosticVisible,
        traceRaw: window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
        errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
      };
    },
    "About page did not reach a terminal version state",
    { expectedVersion },
  );
}

async function run() {
  const options = parseSettingsAboutFixtureArgs(process.argv.slice(2), {
    defaults: DEFAULTS,
  });
  if (options.help) {
    printHelp();
    return;
  }
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  const summaryPath = path.join(
    options.evidenceDir,
    `${options.prefix}-summary.json`,
  );
  const rawEvidencePath = path.join(
    options.evidenceDir,
    `${options.prefix}-raw.json`,
  );
  const screenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}.png`,
  );
  const failureScreenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}-failure.png`,
  );
  const packageVersion = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
  ).version;
  const runtimeEnv = createTempRuntimeEnv();
  const appServerBinary = resolveDevAppServerBinary({
    env: runtimeEnv.env,
    repoRoot: process.cwd(),
    forceBuild: false,
  });
  const appServerEnv = resolveElectronAppServerRuntimeEnv({
    env: { ...runtimeEnv.env, APP_SERVER_BIN: appServerBinary },
  });
  const summary = {
    ...createSettingsAboutEvidence({
      candidateRunId: options.runId,
      startedAt: new Date().toISOString(),
      prefix: options.prefix,
    }),
    backendMode: "unavailable",
    packageVersion,
  };

  let handle = null;
  let page = null;
  const consoleErrors = [];
  const pageErrors = [];
  try {
    handle = await launchElectronFixture({
      options,
      runtimeEnv,
      appServerEnv,
      consoleErrors,
      pageErrors,
    });
    page = handle.page;
    await openSettings(page, options);
    await page.locator('[data-testid="settings-sidebar-tab-about"]').click();
    const aboutState = await readAboutState(page, options, packageVersion);
    const trace = summarizeSettingsAboutTrace(aboutState.traceRaw);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    applyPassingSettingsAboutEvidence(summary, {
      completedAt: new Date().toISOString(),
      electronRenderer: handle.rendererSnapshot.electron,
      preloadInvoke: handle.rendererSnapshot.hasInvokeBridge,
      packageVersion,
      visibleVersion: aboutState.visibleVersion,
      versionLabelLocalized: isLocalizedAboutVersionLine(
        aboutState.locale,
        aboutState.versionLine,
      ),
      aboutActive: aboutState.aboutActive,
      loadingVisible: aboutState.loadingVisible,
      internalDiagnosticVisible: aboutState.internalDiagnosticVisible,
      trace,
      consoleErrors,
      pageErrors,
      invokeErrorCount: parseInvokeTraceRaw(aboutState.errorRaw).length,
      screenshotWritten: fs.existsSync(screenshotPath),
    });
    writeJsonFile(rawEvidencePath, {
      url: aboutState.url,
      locale: aboutState.locale,
      versionLine: aboutState.versionLine,
      appServerMethods: trace.appServerMethods,
      hostCommands: trace.hostCommands,
    });
    writeJsonFile(summaryPath, summary);
    console.log(`[smoke:settings-about-fixture] summary=${summaryPath}`);
  } catch (error) {
    applyFailedSettingsAboutEvidence(summary, error);
    summary.consoleErrors = consoleErrors.map(sanitizeText);
    summary.pageErrors = pageErrors.map(sanitizeText);
    writeJsonFile(summaryPath, summary);
    if (page) {
      try {
        await page.screenshot({ path: failureScreenshotPath, fullPage: true });
      } catch {
        // Preserve the original failure.
      }
    }
    throw error;
  } finally {
    if (handle) {
      await closeElectronFixture(handle);
    }
    if (!options.keepTemp) {
      fs.rmSync(runtimeEnv.tempRoot, { recursive: true, force: true });
    }
  }
}

run().catch((error) => {
  console.error(
    `[smoke:settings-about-fixture] ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
