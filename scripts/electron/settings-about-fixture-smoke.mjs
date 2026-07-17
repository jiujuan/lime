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
  applyFailedSettingsHomeEvidence,
  applyPassingSettingsAboutEvidence,
  applyPassingSettingsHomeEvidence,
  createSettingsAboutEvidence,
  createSettingsHomeEvidence,
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
      const traceRaw = window.localStorage.getItem(
        "lime_invoke_trace_buffer_v1",
      );
      let traceEntries = [];
      try {
        const parsed = JSON.parse(traceRaw || "[]");
        traceEntries = Array.isArray(parsed) ? parsed : [];
      } catch {
        traceEntries = [];
      }
      const appServerIpcSeen = traceEntries.some(
        (entry) =>
          entry?.command === "app_server_handle_json_lines" &&
          entry?.transport === "electron-ipc",
      );
      const hostCommands = new Set(
        traceEntries
          .filter((entry) => entry?.transport === "electron-ipc")
          .map((entry) => entry?.command),
      );
      const hostReadsSeen =
        hostCommands.has("check_for_updates") &&
        hostCommands.has("get_update_install_session");
      if (
        aboutTab?.getAttribute("data-active") !== "true" ||
        loadingVisible ||
        !bodyText.includes(version) ||
        !appServerIpcSeen ||
        !hostReadsSeen
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
        traceRaw,
        errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
      };
    },
    "About page did not reach a terminal version state",
    { expectedVersion },
  );
}

async function readHomeState(page, options) {
  return await waitForPageCondition(
    page,
    options,
    () => {
      const homeStartVisible = Boolean(
        document.querySelector('[data-testid="home-start-surface"]'),
      );
      const accountButtonVisible = Boolean(
        document.querySelector('[data-testid="app-sidebar-account-button"]'),
      );
      const settingsHeaderVisible = Boolean(
        document.querySelector('[data-testid="settings-top-header"]'),
      );
      if (!homeStartVisible || !accountButtonVisible || settingsHeaderVisible) {
        return null;
      }
      return {
        url: window.location.href,
        homeStartVisible,
        accountButtonVisible,
        settingsHeaderVisible,
        traceRaw: window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
        errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
      };
    },
    "Settings back-home action did not reach the current home surface",
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
  const homeSummaryPath = path.join(
    options.evidenceDir,
    `${options.prefix}-home-summary.json`,
  );
  const homeScreenshotPath = path.join(
    options.evidenceDir,
    `${options.prefix}-home.png`,
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
  const homeSummary = createSettingsHomeEvidence({
    candidateRunId: options.runId,
    startedAt: summary.startedAt,
    prefix: options.prefix,
  });

  let handle = null;
  let page = null;
  const consoleErrors = [];
  const pageErrors = [];
  const rawEvidence = {};
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
    rawEvidence.about = {
      url: aboutState.url,
      locale: aboutState.locale,
      versionLine: aboutState.versionLine,
      appServerMethods: trace.appServerMethods,
      hostCommands: trace.hostCommands,
    };
    writeJsonFile(summaryPath, summary);

    await page.locator('[data-testid="settings-home-button"]').click();
    const homeState = await readHomeState(page, options);
    const homeTrace = summarizeSettingsAboutTrace(homeState.traceRaw);
    await page.screenshot({ path: homeScreenshotPath, fullPage: true });
    applyPassingSettingsHomeEvidence(homeSummary, {
      completedAt: new Date().toISOString(),
      electronRenderer: handle.rendererSnapshot.electron,
      preloadInvoke: handle.rendererSnapshot.hasInvokeBridge,
      homeStartVisible: homeState.homeStartVisible,
      settingsHeaderVisible: homeState.settingsHeaderVisible,
      accountButtonVisible: homeState.accountButtonVisible,
      trace: homeTrace,
      consoleErrors,
      pageErrors,
      invokeErrorCount: parseInvokeTraceRaw(homeState.errorRaw).length,
      screenshotWritten: fs.existsSync(homeScreenshotPath),
    });
    rawEvidence.home = {
      url: homeState.url,
      appServerMethods: homeTrace.appServerMethods,
    };
    writeJsonFile(rawEvidencePath, rawEvidence);
    writeJsonFile(homeSummaryPath, homeSummary);
    console.log(`[smoke:settings-about-fixture] summary=${summaryPath}`);
    console.log(`[smoke:settings-about-fixture] home=${homeSummaryPath}`);
  } catch (error) {
    if (!summary.settingsScenarioProof.complete) {
      applyFailedSettingsAboutEvidence(summary, error);
    }
    if (!homeSummary.settingsScenarioProof.complete) {
      applyFailedSettingsHomeEvidence(homeSummary, error);
    }
    summary.consoleErrors = consoleErrors.map(sanitizeText);
    summary.pageErrors = pageErrors.map(sanitizeText);
    writeJsonFile(summaryPath, summary);
    writeJsonFile(homeSummaryPath, homeSummary);
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
