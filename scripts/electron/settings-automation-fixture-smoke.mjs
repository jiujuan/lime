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
  AUTOMATION_REQUIRED_READ_METHODS,
  applyFailedSettingsAutomationEvidence,
  applyPassingSettingsAutomationEvidence,
  createSettingsAutomationEvidence,
  parseSettingsAutomationFixtureArgs,
  summarizeSettingsAutomationTrace,
} from "./lib/settings-automation-fixture-evidence.mjs";

const DEFAULTS = {
  runId: process.env.LIME_GATE_RUN_ID?.trim() || null,
  evidenceDir: null,
  prefix: "settings-automation-fixture",
  timeoutMs: 120_000,
  intervalMs: 250,
  keepTemp: false,
};
const ENABLE_LABELS = ["启用调度器", "啟用排程器", "Enable scheduler"];
const HISTORY_LABELS = ["记录执行历史", "記錄執行歷史", "Keep run history"];
const SAVE_LABELS = ["保存调度器", "儲存排程器", "Save scheduler"];

function printHelp() {
  console.log(`
Settings Automation Electron Fixture

Usage:
  node scripts/electron/settings-automation-fixture-smoke.mjs --run-id <id>

Options:
  --run-id <id> --evidence-dir <path> --prefix <name>
  --timeout-ms <ms> --interval-ms <ms> --keep-temp -h|--help
`);
}

async function openAutomationSettings(page, options) {
  await openSettings(page, options);
  await page.locator('[data-testid="settings-sidebar-tab-automation"]').click();
}

async function readAutomationState(
  page,
  options,
  { expected = null, requireUpdate = false } = {},
) {
  return await waitForPageCondition(
    page,
    options,
    ({ expected, requireUpdate, requiredReadMethods, enableLabels, historyLabels, saveLabels }) => {
      const exactTextElement = (labels) =>
        Array.from(document.querySelectorAll("div,button")).find((element) =>
          labels.includes((element.textContent ?? "").trim()),
        );
      const switchFor = (labels) => {
        const label = exactTextElement(labels);
        return label?.parentElement?.parentElement?.querySelector(
          '[role="switch"]',
        );
      };
      const enabledSwitch = switchFor(enableLabels);
      const historySwitch = switchFor(historyLabels);
      const intervalInput = document.querySelector('input[type="number"]');
      const saveButton = Array.from(document.querySelectorAll("button")).find(
        (button) => saveLabels.includes((button.textContent ?? "").trim()),
      );
      const traceRaw = window.localStorage.getItem(
        "lime_invoke_trace_buffer_v1",
      );
      const methods = (() => {
        try {
          const entries = JSON.parse(traceRaw || "[]");
          return Array.from(
            new Set(
              (Array.isArray(entries) ? entries : [])
                .filter(
                  (entry) =>
                    entry?.command === "app_server_handle_json_lines" &&
                    entry?.transport === "electron-ipc",
                )
                .flatMap((entry) => entry?.args_preview?.request?.lines ?? [])
                .flatMap((line) => {
                  try {
                    const request = JSON.parse(String(line));
                    return typeof request?.method === "string"
                      ? [request.method]
                      : [];
                  } catch {
                    return [];
                  }
                }),
            ),
          );
        } catch {
          return [];
        }
      })();
      const enabled = enabledSwitch?.getAttribute("aria-checked") === "true";
      const history = historySwitch?.getAttribute("aria-checked") === "true";
      const interval = Number(intervalInput?.value);
      const automationTabActive =
        document
          .querySelector('[data-testid="settings-sidebar-tab-automation"]')
          ?.getAttribute("data-active") === "true";
      const bodyText = document.body?.innerText ?? "";
      const schedulerControlsReady = Boolean(
        enabledSwitch &&
          historySwitch &&
          intervalInput &&
          saveButton &&
          !saveButton.disabled &&
          Number.isFinite(interval),
      );
      const jobSummaryReady =
        /持续流程(?:数)?\s*[:：]?\s*\d+|持續流程(?:數)?\s*[:：]?\s*\d+|Jobs\s*[:：]?\s*\d+/i.test(
          bodyText,
        );
      const healthSummaryReady =
        /风险(?:项|提醒)?\s*[:：]?\s*\d+|風險(?:項|提醒)?\s*[:：]?\s*\d+|Risks\s*[:：]?\s*\d+/i.test(
          bodyText,
        );
      const expectedMatches =
        !expected ||
        (enabled === expected.enabled &&
          history === expected.history &&
          interval === expected.interval);
      const readsReady = requiredReadMethods.every((method) =>
        methods.includes(method),
      );
      const updateReady =
        !requireUpdate || methods.includes("automationScheduler/config/update");
      const errorVisible =
        bodyText.includes("自动化加载失败") ||
        bodyText.includes("Automation failed to load");
      if (
        !automationTabActive ||
        !schedulerControlsReady ||
        !jobSummaryReady ||
        !healthSummaryReady ||
        !expectedMatches ||
        !readsReady ||
        !updateReady ||
        errorVisible
      ) {
        return null;
      }
      return {
        enabled,
        history,
        interval,
        automationTabActive,
        schedulerControlsReady,
        jobSummaryReady,
        healthSummaryReady,
        loadingVisible: false,
        errorVisible,
        traceRaw,
        errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
      };
    },
    "Automation Settings did not reach the expected current lifecycle state",
    {
      expected,
      requireUpdate,
      requiredReadMethods: AUTOMATION_REQUIRED_READ_METHODS,
      enableLabels: ENABLE_LABELS,
      historyLabels: HISTORY_LABELS,
      saveLabels: SAVE_LABELS,
    },
  );
}

async function switchLocator(page, labels) {
  for (const label of labels) {
    const target = page
      .getByText(label, { exact: true })
      .locator("xpath=../..")
      .getByRole("switch");
    if ((await target.count()) > 0) return target.first();
  }
  throw new Error(`Automation switch not found: ${labels.join(" / ")}`);
}

async function saveAutomationState(page, desired) {
  const enabledSwitch = await switchLocator(page, ENABLE_LABELS);
  const historySwitch = await switchLocator(page, HISTORY_LABELS);
  const currentEnabled =
    (await enabledSwitch.getAttribute("aria-checked")) === "true";
  const currentHistory =
    (await historySwitch.getAttribute("aria-checked")) === "true";
  if (currentEnabled !== desired.enabled) await enabledSwitch.click();
  if (currentHistory !== desired.history) await historySwitch.click();
  await page.locator('input[type="number"]').fill(String(desired.interval));
  for (const label of SAVE_LABELS) {
    const button = page.getByRole("button", { name: label, exact: true });
    if ((await button.count()) > 0) {
      await button.click();
      return;
    }
  }
  throw new Error("Automation scheduler save action not found");
}

async function run() {
  const options = parseSettingsAutomationFixtureArgs(process.argv.slice(2), {
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
  const changedScreenshotPath = file("-changed.png");
  const restartScreenshotPath = file("-restart.png");
  const restoredScreenshotPath = file("-restored.png");
  const failureScreenshotPath = file("-failure.png");
  const runtimeEnv = createTempRuntimeEnv();
  const appServerBinary = resolveDevAppServerBinary({
    env: runtimeEnv.env,
    repoRoot: process.cwd(),
    forceBuild: false,
  });
  const appServerEnv = resolveElectronAppServerRuntimeEnv({
    env: { ...runtimeEnv.env, APP_SERVER_BIN: appServerBinary },
  });
  const summary = createSettingsAutomationEvidence({
    candidateRunId: options.runId,
    startedAt: new Date().toISOString(),
    prefix: options.prefix,
  });
  let handle = null;
  let page = null;
  const consoleErrors = [];
  const pageErrors = [];
  const traceRaws = [];
  const errorRaws = [];
  const rendererSnapshots = [];
  try {
    handle = await launchElectronFixture({
      options,
      runtimeEnv,
      appServerEnv,
      consoleErrors,
      pageErrors,
    });
    rendererSnapshots.push(handle.rendererSnapshot);
    page = handle.page;
    await openAutomationSettings(page, options);
    const original = await readAutomationState(page, options);
    const changed = {
      enabled: !original.enabled,
      history: !original.history,
      interval: original.interval === 5 ? 10 : 5,
    };
    await saveAutomationState(page, changed);
    const changedState = await readAutomationState(page, options, {
      expected: changed,
      requireUpdate: true,
    });
    traceRaws.push(changedState.traceRaw);
    errorRaws.push(changedState.errorRaw);
    await page.screenshot({ path: changedScreenshotPath, fullPage: true });
    await closeElectronFixture(handle);
    handle = null;
    page = null;

    handle = await launchElectronFixture({
      options,
      runtimeEnv,
      appServerEnv,
      consoleErrors,
      pageErrors,
    });
    rendererSnapshots.push(handle.rendererSnapshot);
    page = handle.page;
    await openAutomationSettings(page, options);
    const restartState = await readAutomationState(page, options, {
      expected: changed,
    });
    traceRaws.push(restartState.traceRaw);
    errorRaws.push(restartState.errorRaw);
    await page.screenshot({ path: restartScreenshotPath, fullPage: true });
    await saveAutomationState(page, original);
    const restoredSaveState = await readAutomationState(page, options, {
      expected: original,
      requireUpdate: true,
    });
    traceRaws.push(restoredSaveState.traceRaw);
    errorRaws.push(restoredSaveState.errorRaw);
    await closeElectronFixture(handle);
    handle = null;
    page = null;

    handle = await launchElectronFixture({
      options,
      runtimeEnv,
      appServerEnv,
      consoleErrors,
      pageErrors,
    });
    rendererSnapshots.push(handle.rendererSnapshot);
    page = handle.page;
    await openAutomationSettings(page, options);
    const finalState = await readAutomationState(page, options, {
      expected: original,
    });
    traceRaws.push(finalState.traceRaw);
    errorRaws.push(finalState.errorRaw);
    await page.screenshot({ path: restoredScreenshotPath, fullPage: true });
    const trace = summarizeSettingsAutomationTrace(traceRaws);
    applyPassingSettingsAutomationEvidence(summary, {
      completedAt: new Date().toISOString(),
      electronLaunchCount: rendererSnapshots.filter(
        (snapshot) => snapshot.electron,
      ).length,
      preloadLaunchCount: rendererSnapshots.filter(
        (snapshot) => snapshot.hasInvokeBridge,
      ).length,
      isolatedUserData: runtimeEnv.electronUserDataDir.startsWith(
        runtimeEnv.tempRoot,
      ),
      automationTabActive: finalState.automationTabActive,
      schedulerControlsReady: finalState.schedulerControlsReady,
      jobSummaryReady: finalState.jobSummaryReady,
      healthSummaryReady: finalState.healthSummaryReady,
      allControlsChanged:
        changed.enabled !== original.enabled &&
        changed.history !== original.history &&
        changed.interval !== original.interval,
      restartReadback:
        restartState.enabled === changed.enabled &&
        restartState.history === changed.history &&
        restartState.interval === changed.interval,
      restorationSaved:
        restoredSaveState.enabled === original.enabled &&
        restoredSaveState.history === original.history &&
        restoredSaveState.interval === original.interval,
      finalRestorationReadback:
        finalState.enabled === original.enabled &&
        finalState.history === original.history &&
        finalState.interval === original.interval,
      loadingVisible: finalState.loadingVisible,
      errorVisible: finalState.errorVisible,
      trace,
      consoleErrors,
      pageErrors,
      invokeErrorCount: errorRaws.reduce(
        (count, raw) => count + parseInvokeTraceRaw(raw).length,
        0,
      ),
      changedScreenshotWritten: fs.existsSync(changedScreenshotPath),
      restartScreenshotWritten: fs.existsSync(restartScreenshotPath),
      restoredScreenshotWritten: fs.existsSync(restoredScreenshotPath),
    });
    writeJsonFile(rawEvidencePath, {
      lifecycle: {
        isolatedUserData: true,
        allControlsChanged: true,
        restartReadback: true,
        restorationSaved: true,
        finalRestorationReadback: true,
      },
      appServerMethods: trace.methods,
    });
    writeJsonFile(summaryPath, summary);
    console.log(`[smoke:settings-automation-fixture] summary=${summaryPath}`);
  } catch (error) {
    applyFailedSettingsAutomationEvidence(summary, error);
    summary.consoleErrors = consoleErrors.map(sanitizeText);
    summary.pageErrors = pageErrors.map(sanitizeText);
    summary.failureTrace = summarizeSettingsAutomationTrace(traceRaws);
    if (page) {
      const traceRaw = await page
        .evaluate(() =>
          window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
        )
        .catch(() => null);
      summary.failureTrace = summarizeSettingsAutomationTrace([
        ...traceRaws,
        traceRaw,
      ]);
    }
    writeJsonFile(summaryPath, summary);
    if (page) {
      await page
        .screenshot({ path: failureScreenshotPath, fullPage: true })
        .catch(() => undefined);
    }
    throw error;
  } finally {
    if (handle) await closeElectronFixture(handle);
    if (!options.keepTemp) {
      fs.rmSync(runtimeEnv.tempRoot, { recursive: true, force: true });
    }
  }
}

run().catch((error) => {
  console.error(
    `[smoke:settings-automation-fixture] ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
