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
  STATS_REQUIRED_METHODS,
  applyFailedSettingsStatsEvidence,
  applyPassingSettingsStatsEvidence,
  createSettingsStatsEvidence,
  parseSettingsStatsFixtureArgs,
  summarizeSettingsStatsTrace,
} from "./lib/settings-stats-fixture-evidence.mjs";

const DEFAULTS = {
  runId: process.env.LIME_GATE_RUN_ID?.trim() || null,
  evidenceDir: null,
  prefix: "settings-stats-fixture",
  timeoutMs: 120_000,
  intervalMs: 250,
  keepTemp: false,
};

function printHelp() {
  console.log(`
Settings Stats Electron Fixture

Usage:
  node scripts/electron/settings-stats-fixture-smoke.mjs --run-id <id>

Options:
  --run-id <id> --evidence-dir <path> --prefix <name>
  --timeout-ms <ms> --interval-ms <ms> --keep-temp -h|--help
`);
}

async function readStatsState(page, options) {
  return await waitForPageCondition(
    page,
    options,
    ({ requiredMethods }) => {
      const bodyText = document.body?.innerText ?? "";
      const statsTab = document.querySelector(
        '[data-testid="settings-sidebar-tab-stats"]',
      );
      const loadingVisible =
        document.querySelectorAll(".animate-pulse").length > 0;
      const errorVisible = bodyText.includes("加载统计数据失败");
      const traceRaw = window.localStorage.getItem(
        "lime_invoke_trace_buffer_v1",
      );
      let methods = [];
      try {
        const entries = JSON.parse(traceRaw || "[]");
        methods = (Array.isArray(entries) ? entries : []).flatMap((entry) => {
          if (
            entry?.command !== "app_server_handle_json_lines" ||
            entry?.transport !== "electron-ipc"
          ) {
            return [];
          }
          const lines = entry?.args_preview?.request?.lines;
          if (!Array.isArray(lines)) {
            return [];
          }
          return lines.flatMap((line) => {
            try {
              const request = JSON.parse(String(line));
              return typeof request?.method === "string"
                ? [request.method]
                : [];
            } catch {
              return [];
            }
          });
        });
      } catch {
        methods = [];
      }
      if (
        statsTab?.getAttribute("data-active") !== "true" ||
        !bodyText.includes("数据统计") ||
        loadingVisible ||
        errorVisible ||
        !requiredMethods.every((method) => methods.includes(method))
      ) {
        return null;
      }
      return {
        url: window.location.href,
        statsActive: true,
        loadingVisible,
        errorVisible,
        traceRaw,
        errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
      };
    },
    "Stats Settings did not reach a terminal current read state",
    { requiredMethods: STATS_REQUIRED_METHODS },
  );
}

async function run() {
  const options = parseSettingsStatsFixtureArgs(process.argv.slice(2), {
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
  const runtimeEnv = createTempRuntimeEnv();
  const appServerBinary = resolveDevAppServerBinary({
    env: runtimeEnv.env,
    repoRoot: process.cwd(),
    forceBuild: false,
  });
  const appServerEnv = resolveElectronAppServerRuntimeEnv({
    env: { ...runtimeEnv.env, APP_SERVER_BIN: appServerBinary },
  });
  const summary = createSettingsStatsEvidence({
    candidateRunId: options.runId,
    startedAt: new Date().toISOString(),
    prefix: options.prefix,
  });
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
    await page.evaluate(() => {
      window.localStorage.removeItem("lime_invoke_error_buffer_v1");
      window.localStorage.removeItem("lime_invoke_trace_buffer_v1");
    });
    await page.locator('[data-testid="settings-sidebar-tab-stats"]').click();
    const state = await readStatsState(page, options);
    const trace = summarizeSettingsStatsTrace(state.traceRaw);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    applyPassingSettingsStatsEvidence(summary, {
      completedAt: new Date().toISOString(),
      electronRenderer: handle.rendererSnapshot.electron,
      preloadInvoke: handle.rendererSnapshot.hasInvokeBridge,
      statsActive: state.statsActive,
      loadingVisible: state.loadingVisible,
      errorVisible: state.errorVisible,
      trace,
      consoleErrors,
      pageErrors,
      invokeErrorCount: parseInvokeTraceRaw(state.errorRaw).length,
      screenshotWritten: fs.existsSync(screenshotPath),
    });
    writeJsonFile(rawEvidencePath, {
      url: state.url,
      methods: trace.methods,
    });
    writeJsonFile(summaryPath, summary);
    console.log(`[smoke:settings-stats-fixture] summary=${summaryPath}`);
  } catch (error) {
    applyFailedSettingsStatsEvidence(summary, error);
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
    `[smoke:settings-stats-fixture] ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
