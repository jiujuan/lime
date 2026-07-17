#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { once } from "node:events";

import { chromium } from "playwright";
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
} from "./mcp-config-fixture-smoke.mjs";
import {
  BROWSER_SESSION_REQUIRED_METHODS,
  applyFailedSettingsBrowserSessionEvidence,
  applyPassingSettingsBrowserSessionEvidence,
  createSettingsBrowserSessionEvidence,
  parseSettingsBrowserSessionFixtureArgs,
  summarizeSettingsBrowserSessionTrace,
} from "./lib/settings-browser-session-fixture-evidence.mjs";

const DEFAULTS = {
  runId: process.env.LIME_GATE_RUN_ID?.trim() || null,
  evidenceDir: null,
  prefix: "settings-browser-session-fixture",
  timeoutMs: 120_000,
  intervalMs: 250,
  keepTemp: false,
};

function printHelp() {
  console.log(`
Settings Browser Session Electron Fixture

Usage:
  node scripts/electron/settings-browser-session-fixture-smoke.mjs --run-id <id>

Options:
  --run-id <id> --evidence-dir <path> --prefix <name>
  --timeout-ms <ms> --interval-ms <ms> --keep-temp -h|--help
`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function allocateLoopbackPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (!port) throw new Error("unable to allocate local CDP port");
  return port;
}

async function startFixturePageServer() {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(
      "<!doctype html><html><head><title>Lime Browser Gate Fixture</title></head><body><main>Lime Browser Gate Fixture</main></body></html>",
    );
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  if (!port) throw new Error("fixture page server did not bind a port");
  return {
    server,
    url: `http://127.0.0.1:${port}/fixture`,
  };
}

async function closeFixturePageServer(handle) {
  if (!handle?.server?.listening) return;
  await new Promise((resolve) => handle.server.close(() => resolve()));
}

async function waitForCdpTarget({ port, url, child, options }) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < Math.min(options.timeoutMs, 30_000)) {
    if (child.spawnError) {
      throw child.spawnError;
    }
    if (child.exitCode !== null) {
      throw new Error("local Chromium exited before the CDP target was ready");
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const target = Array.isArray(targets)
          ? targets.find(
              (item) =>
                item?.url === url &&
                typeof item?.webSocketDebuggerUrl === "string",
            )
          : null;
        if (target) return target;
      }
    } catch {
      // Chromium is still starting.
    }
    await sleep(options.intervalMs);
  }
  throw new Error("local Chromium CDP target did not become ready");
}

function resolveFixtureBrowserExecutable() {
  const candidates = [
    process.env.BROWSER_FIXTURE_EXECUTABLE,
    chromium.executablePath(),
    ...(process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ]
      : []),
    ...(process.platform === "win32"
      ? [
          path.join(
            process.env.PROGRAMFILES ?? "",
            "Google/Chrome/Application/chrome.exe",
          ),
          path.join(
            process.env["PROGRAMFILES(X86)"] ?? "",
            "Google/Chrome/Application/chrome.exe",
          ),
          path.join(
            process.env.LOCALAPPDATA ?? "",
            "Google/Chrome/Application/chrome.exe",
          ),
        ]
      : []),
    ...(process.platform === "linux"
      ? [
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
        ]
      : []),
  ].filter(Boolean);
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executable) {
    throw new Error(
      "no local Chromium executable found; set BROWSER_FIXTURE_EXECUTABLE",
    );
  }
  return executable;
}

async function startLocalCdpFixture({ runtimeEnv, pageUrl, options }) {
  const port = await allocateLoopbackPort();
  const profileDir = path.join(runtimeEnv.tempRoot, "chromium-cdp-profile");
  fs.mkdirSync(profileDir, { recursive: true });
  const child = spawn(
    resolveFixtureBrowserExecutable(),
    [
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      pageUrl,
    ],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  child.spawnError = null;
  child.once("error", (error) => {
    child.spawnError = error;
  });
  try {
    const target = await waitForCdpTarget({ port, url: pageUrl, child, options });
    return { child, port, target };
  } catch (error) {
    await stopLocalCdpFixture({ child });
    throw error;
  }
}

async function stopLocalCdpFixture(handle) {
  const child = handle?.child;
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), sleep(5_000)]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([once(child, "exit"), sleep(2_000)]);
  }
}

async function openBrowserSettings(page, options) {
  await openSettings(page, options);
  await page.locator('[data-testid="settings-sidebar-tab-chrome-relay"]').click();
  await page.locator('[data-testid="browser-connection-settings"]').waitFor({
    state: "visible",
    timeout: Math.min(45_000, options.timeoutMs),
  });
}

async function readBrowserSettingsSnapshot(page) {
  return await page.evaluate(() => {
    const root = document.querySelector(
      '[data-testid="browser-connection-settings"]',
    );
    const activeTab = document.querySelector(
      '[data-testid="settings-sidebar-tab-chrome-relay"]',
    );
    return {
      connectionState: root?.getAttribute("data-connection-state") ?? null,
      targetCount: Number(root?.getAttribute("data-target-count") ?? 0),
      settingsTabActive: activeTab?.getAttribute("data-active") === "true",
      selectedTarget: Boolean(
        document.querySelector(
          '[data-testid="browser-connection-target"] input[type="radio"]:checked',
        ),
      ),
      sessionVisible: Boolean(
        document.querySelector('[data-testid="browser-connection-session"]'),
      ),
      sessionConnected:
        document
          .querySelector('[data-testid="browser-connection-session"]')
          ?.getAttribute("data-session-connected") === "true",
      errorVisible: Boolean(
        document.querySelector('[data-testid="browser-connection-error"]'),
      ),
      traceRaw: window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
      errorRaw: window.localStorage.getItem("lime_invoke_error_buffer_v1"),
    };
  });
}

async function run() {
  const options = parseSettingsBrowserSessionFixtureArgs(
    process.argv.slice(2),
    { defaults: DEFAULTS },
  );
  if (options.help) {
    printHelp();
    return;
  }
  fs.mkdirSync(options.evidenceDir, { recursive: true });
  const file = (suffix) =>
    path.join(options.evidenceDir, `${options.prefix}${suffix}`);
  const summaryPath = file("-summary.json");
  const rawEvidencePath = file("-raw.json");
  const connectedScreenshotPath = file("-connected.png");
  const closedScreenshotPath = file("-closed.png");
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
  const summary = createSettingsBrowserSessionEvidence({
    candidateRunId: options.runId,
    startedAt: new Date().toISOString(),
    prefix: options.prefix,
  });
  const consoleErrors = [];
  const pageErrors = [];
  let pageServer = null;
  let cdpFixture = null;
  let electronHandle = null;
  let page = null;
  try {
    pageServer = await startFixturePageServer();
    cdpFixture = await startLocalCdpFixture({
      runtimeEnv,
      pageUrl: pageServer.url,
      options,
    });
    electronHandle = await launchElectronFixture({
      options,
      runtimeEnv,
      appServerEnv,
      consoleErrors,
      pageErrors,
      backendMode: "unavailable",
    });
    page = electronHandle.page;
    await openBrowserSettings(page, options);
    await page
      .locator('[data-testid="browser-connection-port"]')
      .fill(String(cdpFixture.port));
    await page.locator('[data-testid="browser-connection-check"]').click();

    const fixtureTarget = page
      .locator('[data-testid="browser-connection-target"]')
      .filter({ hasText: "Lime Browser Gate Fixture" });
    await fixtureTarget.waitFor({
      state: "visible",
      timeout: Math.min(45_000, options.timeoutMs),
    });
    await fixtureTarget.locator('input[type="radio"]').check();
    const available = await readBrowserSettingsSnapshot(page);
    if (
      available.connectionState !== "available" ||
      available.targetCount < 1 ||
      !available.selectedTarget
    ) {
      throw new Error("Browser Settings did not expose a selectable CDP target");
    }

    await page.locator('[data-testid="browser-connection-connect"]').click();
    await page
      .locator(
        '[data-testid="browser-connection-settings"][data-connection-state="connected"]',
      )
      .waitFor({ timeout: Math.min(45_000, options.timeoutMs) });
    const connected = await readBrowserSettingsSnapshot(page);
    await page.screenshot({ path: connectedScreenshotPath, fullPage: true });

    await page.locator('[data-testid="browser-connection-disconnect"]').click();
    await page
      .locator(
        '[data-testid="browser-connection-settings"][data-connection-state="closed"]',
      )
      .waitFor({ timeout: Math.min(45_000, options.timeoutMs) });
    const closed = await readBrowserSettingsSnapshot(page);
    await page.screenshot({ path: closedScreenshotPath, fullPage: true });

    const trace = summarizeSettingsBrowserSessionTrace(closed.traceRaw);
    applyPassingSettingsBrowserSessionEvidence(summary, {
      completedAt: new Date().toISOString(),
      electron: electronHandle.rendererSnapshot.electron,
      preloadInvoke: electronHandle.rendererSnapshot.hasInvokeBridge,
      isolatedUserData: runtimeEnv.electronUserDataDir.startsWith(
        runtimeEnv.tempRoot,
      ),
      localCdpFixture: Boolean(cdpFixture.target?.webSocketDebuggerUrl),
      settingsTabActive:
        available.settingsTabActive &&
        connected.settingsTabActive &&
        closed.settingsTabActive,
      targetDetected: available.targetCount > 0,
      targetSelected: available.selectedTarget,
      sessionOpened:
        trace.methods.includes("browserSession/open") &&
        connected.connectionState === "connected",
      sessionReadback:
        trace.methods.includes("browserSession/read") &&
        connected.sessionVisible &&
        connected.sessionConnected,
      connectedVisible:
        connected.connectionState === "connected" && !connected.errorVisible,
      sessionClosed:
        trace.methods.includes("browserSession/close") && !closed.sessionVisible,
      closedVisible:
        closed.connectionState === "closed" && !closed.errorVisible,
      trace,
      consoleErrors,
      pageErrors,
      invokeErrorCount: parseInvokeTraceRaw(closed.errorRaw).length,
      connectedScreenshotWritten: fs.existsSync(connectedScreenshotPath),
      closedScreenshotWritten: fs.existsSync(closedScreenshotPath),
    });
    writeJsonFile(rawEvidencePath, {
      lifecycle: {
        isolatedUserData: true,
        localCdpFixture: true,
        targetDetected: true,
        targetSelected: true,
        sessionOpened: true,
        sessionReadback: true,
        connectedVisible: true,
        sessionClosed: true,
        closedVisible: true,
      },
      appServerMethods: trace.methods.filter((method) =>
        BROWSER_SESSION_REQUIRED_METHODS.includes(method),
      ),
    });
    writeJsonFile(summaryPath, summary);
    console.log(`[smoke:settings-browser-session-fixture] summary=${summaryPath}`);
  } catch (error) {
    applyFailedSettingsBrowserSessionEvidence(summary, error);
    summary.consoleErrors = consoleErrors.map(sanitizeText);
    summary.pageErrors = pageErrors.map(sanitizeText);
    if (page) {
      const failure = await readBrowserSettingsSnapshot(page).catch(() => null);
      summary.failureTrace = summarizeSettingsBrowserSessionTrace(
        failure?.traceRaw,
      );
      await page
        .screenshot({ path: failureScreenshotPath, fullPage: true })
        .catch(() => undefined);
    }
    writeJsonFile(summaryPath, summary);
    throw error;
  } finally {
    if (electronHandle) await closeElectronFixture(electronHandle);
    if (cdpFixture) await stopLocalCdpFixture(cdpFixture);
    if (pageServer) await closeFixturePageServer(pageServer);
    if (!options.keepTemp) {
      fs.rmSync(runtimeEnv.tempRoot, { recursive: true, force: true });
    }
  }
}

run().catch((error) => {
  console.error(
    `[smoke:settings-browser-session-fixture] ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
