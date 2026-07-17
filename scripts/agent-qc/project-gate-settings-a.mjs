#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { chromium } from "playwright";

import {
  SETTINGS_GATE_A_CRITICAL_TABS,
  SETTINGS_GATE_A_LOCALES,
  SETTINGS_GATE_A_TABS,
  SETTINGS_GATE_A_VIEWPORTS,
  buildSettingsGateAEvidence,
  validateSettingsGateARunId,
} from "../lib/project-gate-settings-a-core.mjs";
import {
  SETTINGS_GATE_A_STATE_ERROR_MARKER,
  runSettingsGateAStateScenarios,
} from "../lib/project-gate-settings-a-states.mjs";

const DEFAULTS = {
  appUrl: "http://127.0.0.1:1420/",
  healthUrl: "http://127.0.0.1:3030/health",
  timeoutMs: 120_000,
  headless: true,
};

const PROBLEM_PATTERNS = [
  /Unable to connect to the backend bridge/i,
  /Desktop Host.*not (?:supported|implemented)/i,
  /Unsupported command/i,
  /bridge cooldown active/i,
  /unknown command/i,
  /electron-host-diagnostic/i,
  /Desktop Host current/i,
  /get_skill_package_file_association_status/i,
  /set_skill_package_file_association_default/i,
  /尚未接入真实/,
  /无法连接后端桥接/,
  /未知命令/,
];

function logStage(stage) {
  console.log(`[agent-qc:project-gate-settings-a] stage=${stage}`);
}

function printHelp() {
  console.log(`
Project Gate SETTINGS-01 Gate A

Usage:
  npm run agent-qc:project-gate-settings-a -- --run-id <candidate-run-id>

Options:
  --run-id <id>        Candidate run-id. Defaults to an explicit standalone id.
  --app-url <url>      Renderer URL. Default: http://127.0.0.1:1420/
  --health-url <url>   DevBridge health URL. Default: http://127.0.0.1:3030/health
  --skip-health        Skip the HTTP health probe for explicit browser-bridge fixtures
  --timeout-ms <ms>    Total timeout. Default: 120000
  --headed             Launch a visible Chrome window
  -h, --help           Show help
`);
}

function parseArgs(argv) {
  const options = {
    ...DEFAULTS,
    runId: process.env.LIME_GATE_RUN_ID?.trim() || null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "--run-id" && next) {
      options.runId = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--app-url" && next) {
      options.appUrl = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--health-url" && next) {
      options.healthUrl = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms" && next) {
      options.timeoutMs = Number(next);
      index += 1;
      continue;
    }
    if (arg === "--skip-health") {
      options.healthUrl = null;
      continue;
    }
    if (arg === "--headed") {
      options.headless = false;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 10_000) {
    throw new Error("--timeout-ms must be >= 10000");
  }
  options.runId ??= standaloneRunId();
  validateSettingsGateARunId(options.runId);
  return options;
}

function standaloneRunId() {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
  return `standalone-settings-a-${timestamp}-${process.pid}`;
}

function resolveChromeExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_EXECUTABLE,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function sanitizeDiagnostic(value) {
  let result = String(value ?? "")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/\b(sk|pc)[_-][A-Za-z0-9._-]{12,}\b/g, "$1_[redacted]")
    .replace(
      /((?:api[_-]?key|authorization|password|secret|token)[^=\s]*=)([^\s]+)/gi,
      "$1[redacted]",
    );
  const home = process.env.HOME?.trim();
  if (home) {
    result = result.replaceAll(home, "~");
  }
  return result.slice(0, 500);
}

async function waitForHealth(options) {
  if (!options.healthUrl) {
    return;
  }
  const deadline = Date.now() + options.timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(options.healthUrl);
      if (response.ok) {
        return;
      }
      lastError = new Error(`health status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`DevBridge health timeout: ${String(lastError)}`);
}

async function enterSettings(page, options) {
  await page.setViewportSize(SETTINGS_GATE_A_VIEWPORTS[0]);
  await page.goto(options.appUrl, {
    waitUntil: "domcontentloaded",
    timeout: Math.min(options.timeoutMs, 60_000),
  });
  const accountButton = page.locator(
    '[data-testid="app-sidebar-account-button"]',
  );
  await accountButton.waitFor({ state: "visible", timeout: 45_000 });
  await accountButton.click();
  const settingsButton = page.locator(
    '[data-testid="app-sidebar-account-model-settings"]',
  );
  await settingsButton.waitFor({ state: "visible", timeout: 10_000 });
  await settingsButton.click();
  await page
    .locator('[data-testid="settings-top-header"]')
    .waitFor({ state: "visible", timeout: 20_000 });
}

async function setLocale(page, locale) {
  await page.evaluate(async (nextLocale) => {
    const localeModule = await import("/src/i18n/createI18n.ts");
    await localeModule.changeLimeLocale(nextLocale);
  }, locale);
  await page.waitForFunction(
    (expectedLocale) => document.documentElement.lang === expectedLocale,
    locale,
    { timeout: 10_000 },
  );
}

async function clearInvokeBuffers(page) {
  await page.evaluate(() => {
    localStorage.removeItem("lime_invoke_error_buffer_v1");
    localStorage.removeItem("lime_invoke_trace_buffer_v1");
  });
}

async function activateSettingsTab(page, tab) {
  const sidebarTab = page.locator(
    `[data-testid="settings-sidebar-tab-${tab}"]`,
  );
  if (await sidebarTab.isVisible()) {
    await sidebarTab.click();
  } else {
    const floatingButton = page.locator(
      '[data-testid="settings-floating-nav-button"]',
    );
    await floatingButton.waitFor({ state: "visible", timeout: 10_000 });
    await floatingButton.click();
    const floatingTab = page.locator(
      `[data-testid="settings-floating-tab-${tab}"]`,
    );
    await floatingTab.waitFor({ state: "visible", timeout: 10_000 });
    await floatingTab.click();
  }
  await page.waitForFunction(
    (activeTab) => {
      const sidebar = document.querySelector(
        `[data-testid="settings-sidebar-tab-${activeTab}"]`,
      );
      const floating = document.querySelector(
        `[data-testid="settings-floating-tab-${activeTab}"]`,
      );
      return [sidebar, floating].some(
        (entry) => entry?.getAttribute("data-active") === "true",
      );
    },
    tab,
    { timeout: 12_000 },
  );
}

async function clickSettingsTab(page, tab) {
  await activateSettingsTab(page, tab);
  await page.waitForFunction(
    () => {
      const atmosphere = document.querySelector(
        '[data-testid="settings-content-atmosphere"]',
      );
      const content = atmosphere?.parentElement;
      if (!(content instanceof HTMLElement)) {
        return false;
      }
      const text = content.innerText.replace(/\s+/g, " ").trim();
      const visibleBusy = [
        ...content.querySelectorAll(
          '[aria-busy="true"], [data-testid*="loading"], .animate-pulse',
        ),
      ].some((entry) => {
        const rect = entry.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      return text.length > 8 && !visibleBusy;
    },
    null,
    { timeout: 15_000 },
  );
}

async function observeSettingsTab(page, { locale, viewport, tab }) {
  return await page.evaluate(
    ({ expectedLocale, viewportLabel, tabKey, problemPatterns }) => {
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      };
      const atmosphere = document.querySelector(
        '[data-testid="settings-content-atmosphere"]',
      );
      const content = atmosphere?.parentElement;
      const sidebar = document.querySelector(
        '[data-testid="settings-sidebar"]',
      );
      const floating = document.querySelector(
        '[data-testid="settings-floating-nav"]',
      );
      const activeCandidates = [
        document.querySelector(
          `[data-testid="settings-sidebar-tab-${tabKey}"]`,
        ),
        document.querySelector(
          `[data-testid="settings-floating-tab-${tabKey}"]`,
        ),
      ];
      const text =
        content instanceof HTMLElement
          ? content.innerText.replace(/\s+/g, " ").trim()
          : "";
      const rawKeys = text.match(/\bsettings\.[A-Za-z0-9_.-]+\b/g) ?? [];
      const problems = problemPatterns.filter(({ source, flags }) =>
        new RegExp(source, flags).test(text),
      );
      const loading = content
        ? [
            ...content.querySelectorAll(
              '[aria-busy="true"], [data-testid*="loading"], .animate-pulse',
            ),
          ].filter(isVisible)
        : [];
      let invokeErrorCount = 0;
      try {
        const raw = localStorage.getItem("lime_invoke_error_buffer_v1");
        const parsed = raw ? JSON.parse(raw) : [];
        invokeErrorCount = Array.isArray(parsed) ? parsed.length : 1;
      } catch {
        invokeErrorCount = 1;
      }
      const title = content?.querySelector("h1, h2")?.textContent?.trim() ?? "";
      return {
        viewport: viewportLabel,
        locale: expectedLocale,
        tab: tabKey,
        title,
        settingsMounted: Boolean(atmosphere),
        activeTabBound: activeCandidates.some(
          (entry) => entry?.getAttribute("data-active") === "true",
        ),
        contentVisible: isVisible(content),
        contentHasText: text.length > 8,
        documentLocaleBound: document.documentElement.lang === expectedLocale,
        rawTranslationKeyCount: rawKeys.length,
        problemTextCount: problems.length,
        visibleLoadingCount: loading.length,
        documentOverflow:
          document.documentElement.scrollWidth > window.innerWidth + 2,
        navigationVisible: isVisible(sidebar) || isVisible(floating),
        invokeErrorCount,
      };
    },
    {
      expectedLocale: locale,
      viewportLabel: viewport,
      tabKey: tab,
      problemPatterns: PROBLEM_PATTERNS.map((pattern) => ({
        source: pattern.source,
        flags: pattern.flags,
      })),
    },
  );
}

async function runTabMatrix(page, { locale, viewport, tabs, observations }) {
  logStage(`locale:${viewport.label}:${locale}`);
  await setLocale(page, locale);
  for (const tab of tabs) {
    logStage(`tab:${viewport.label}:${locale}:${tab}`);
    await clearInvokeBuffers(page);
    await clickSettingsTab(page, tab);
    observations.push(
      await observeSettingsTab(page, {
        locale,
        viewport: viewport.label,
        tab,
      }),
    );
  }
}

async function verifyNavigationRecovery(page) {
  await page.locator('[data-testid="settings-home-button"]').click();
  await page
    .locator('[data-testid="app-sidebar-account-button"]')
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('[data-testid="app-sidebar-account-button"]').click();
  await page
    .locator('[data-testid="app-sidebar-account-model-settings"]')
    .click();
  await page
    .locator('[data-testid="settings-top-header"]')
    .waitFor({ state: "visible", timeout: 15_000 });
  return true;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const startedAt = new Date();
  const evidenceDir = path.join(
    process.cwd(),
    ".lime",
    "qc",
    "project-gates",
    options.runId,
    "settings-01-gate-a",
  );
  fs.mkdirSync(evidenceDir, { recursive: true });
  const profileDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "lime-settings-gate-a-"),
  );
  const observations = [];
  const screenshots = [];
  const stateObservations = [];
  const consoleErrors = [];
  const expectedStateConsoleErrors = [];
  const pageErrors = [];
  let statePhase = null;
  let navigationRecovered = false;
  let context = null;
  let evidence = null;

  try {
    logStage("wait-health");
    await waitForHealth(options);
    logStage("launch-browser");
    context = await chromium.launchPersistentContext(profileDir, {
      headless: options.headless,
      executablePath: resolveChromeExecutable(),
      viewport: SETTINGS_GATE_A_VIEWPORTS[0],
    });
    const page = context.pages()[0] ?? (await context.newPage());
    page.on("console", (message) => {
      if (message.type() === "error") {
        const diagnostic = sanitizeDiagnostic(message.text());
        if (
          statePhase === "error" &&
          diagnostic.includes(SETTINGS_GATE_A_STATE_ERROR_MARKER)
        ) {
          expectedStateConsoleErrors.push(diagnostic);
        } else {
          consoleErrors.push(diagnostic);
        }
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(sanitizeDiagnostic(error.message));
    });

    logStage("enter-settings");
    await enterSettings(page, options);
    for (const viewport of SETTINGS_GATE_A_VIEWPORTS) {
      logStage(`viewport:${viewport.label}`);
      await page.setViewportSize(viewport);
      await runTabMatrix(page, {
        locale: "zh-CN",
        viewport,
        tabs: SETTINGS_GATE_A_TABS,
        observations,
      });
      const screenshot = `${viewport.label}-zh-CN.png`;
      await page.screenshot({
        path: path.join(evidenceDir, screenshot),
        fullPage: true,
      });
      screenshots.push(screenshot);
    }

    const desktop = SETTINGS_GATE_A_VIEWPORTS[0];
    await page.setViewportSize(desktop);
    for (const locale of SETTINGS_GATE_A_LOCALES.filter(
      (entry) => entry !== "zh-CN",
    )) {
      await runTabMatrix(page, {
        locale,
        viewport: desktop,
        tabs: SETTINGS_GATE_A_CRITICAL_TABS,
        observations,
      });
      const screenshot = `desktop-${locale}.png`;
      await page.screenshot({
        path: path.join(evidenceDir, screenshot),
        fullPage: true,
      });
      screenshots.push(screenshot);
    }
    await setLocale(page, "zh-CN");
    logStage("navigation-recovery");
    navigationRecovered = await verifyNavigationRecovery(page);
    await runSettingsGateAStateScenarios(page, {
      evidenceDir,
      screenshots,
      stateObservations,
      expectedStateConsoleErrors,
      desktopViewport: SETTINGS_GATE_A_VIEWPORTS[0],
      logStage,
      setLocale,
      clickSettingsTab,
      activateSettingsTab,
      clearInvokeBuffers,
      setStatePhase(value) {
        statePhase = value;
      },
    });
  } finally {
    evidence = buildSettingsGateAEvidence({
      candidateRunId: options.runId,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      observations,
      screenshots,
      consoleErrors,
      pageErrors,
      navigationRecovered,
      stateObservations,
    });
    fs.writeFileSync(
      path.join(evidenceDir, "summary.json"),
      `${JSON.stringify(evidence, null, 2)}\n`,
      "utf8",
    );
    await context?.close().catch(() => undefined);
    fs.rmSync(profileDir, { recursive: true, force: true });
  }

  if (evidence.result !== "pass") {
    throw new Error(
      `SETTINGS-01 Gate A failed: ${evidence.assertions.failed.join(", ")}`,
    );
  }
  console.log(
    `[agent-qc:project-gate-settings-a] result=pass complete=${evidence.surfaceProof.complete} observations=${observations.length} summary=${path.join(evidenceDir, "summary.json")}`,
  );
}

main().catch((error) => {
  console.error(
    `[agent-qc:project-gate-settings-a] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
