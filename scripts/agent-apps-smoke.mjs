#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const DEFAULTS = {
  appUrl: "http://127.0.0.1:1420/",
  healthUrl: "http://127.0.0.1:3030/health",
  timeoutMs: 120_000,
  intervalMs: 1_000,
  evidenceDir: path.join(process.cwd(), ".lime", "qc", "gui-evidence", "agent-apps"),
  prefix: "agent-apps-smoke",
};

const ACCOUNT_MENU_BUTTON_SELECTOR = '[data-testid="app-sidebar-account-button"]';
const AGENT_APPS_NAV_SELECTOR =
  'button[aria-label="Agent Apps"], button[title="Agent Apps"]';
const AGENT_APP_LAB_NAV_SELECTOR =
  'button[aria-label="Agent App Lab"], button[title="Agent App Lab"]';

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--app-url" && argv[index + 1]) {
      options.appUrl = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--health-url" && argv[index + 1]) {
      options.healthUrl = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms" && argv[index + 1]) {
      options.timeoutMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--interval-ms" && argv[index + 1]) {
      options.intervalMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--evidence-dir" && argv[index + 1]) {
      options.evidenceDir = path.resolve(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--prefix" && argv[index + 1]) {
      options.prefix = String(argv[index + 1]).trim();
      index += 1;
    }
  }
  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function logStage(stage) {
  console.log(`[smoke:agent-apps] stage=${stage}`);
}

async function openAccountMenuForAgentApps(page, timeoutMs) {
  if ((await page.locator(AGENT_APPS_NAV_SELECTOR).count()) > 0) {
    return;
  }
  await page.click(ACCOUNT_MENU_BUTTON_SELECTOR);
  await page.waitForSelector(AGENT_APPS_NAV_SELECTOR, {
    timeout: timeoutMs,
  });
}

async function clickAgentAppsNav(page, timeoutMs) {
  await openAccountMenuForAgentApps(page, timeoutMs);
  await page.locator(AGENT_APPS_NAV_SELECTOR).first().click();
}

async function launchSmokeContext(userDataDir) {
  try {
    return await chromium.launchPersistentContext(userDataDir, {
      channel: "chrome",
      headless: true,
    });
  } catch (error) {
    console.warn(
      `[smoke:agent-apps] Chrome channel 启动失败，尝试 Playwright Chromium: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return chromium.launchPersistentContext(userDataDir, {
      headless: true,
    });
  }
}

async function waitForHealth(options) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    try {
      const response = await fetch(options.healthUrl);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      console.log(
        `[smoke:agent-apps] DevBridge 已就绪 (${Date.now() - startedAt}ms) status=${payload?.status ?? "unknown"}`,
      );
      return payload;
    } catch (error) {
      lastError = error;
      await sleep(options.intervalMs);
    }
  }
  throw new Error(
    `[smoke:agent-apps] DevBridge 未就绪: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

function activeCloudBootstrapPayload() {
  return {
    schemaVersion: "agent-app-cloud-bootstrap/v1",
    tenantId: "smoke-formal-entry",
    generatedAt: "2026-05-16T00:00:00.000Z",
    apps: [
      {
        appId: "content-factory-app",
        displayName: "内容工厂",
        version: "0.3.0",
        releaseId: "smoke-content-factory-app-0.3.0",
        channel: "smoke",
        licenseState: "active",
        registrationRequired: true,
        registrationState: "active",
        enabled: true,
        packageUrl: "https://lime.local/agent-apps/content-factory-app/releases/0.3.0/package.zip",
        packageHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        manifestHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        capabilityRequirements: {},
        defaultEntries: ["dashboard", "content_scenario_planning"],
        policyDefaults: {},
        toolAvailability: [],
      },
    ],
  };
}

async function runFlagOffRegression(options) {
  logStage("flag-off-regression");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lime-agent-apps-flag-off-"));
  const context = await launchSmokeContext(userDataDir);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  try {
    await page.goto(options.appUrl, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="app-sidebar-main-nav"]', {
      timeout: options.timeoutMs,
    });
    await openAccountMenuForAgentApps(page, options.timeoutMs);

    const assertions = {
      agentAppsNavVisible: (await page.locator(AGENT_APPS_NAV_SELECTOR).count()) > 0,
      labNavHidden: (await page.locator(AGENT_APP_LAB_NAV_SELECTOR).count()) === 0,
      noConsoleErrors: consoleErrors.length === 0,
    };

    Object.entries(assertions).forEach(([key, value]) => {
      assert(Boolean(value), `Flag-off assertion failed: ${key}`);
    });

    const screenshotPath = path.join(options.evidenceDir, `${options.prefix}-flag-off.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return {
      assertions,
      consoleErrors,
      screenshot: screenshotPath,
    };
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.evidenceDir, { recursive: true });
  await waitForHealth(options);

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lime-agent-apps-smoke-"));
  const context = await launchSmokeContext(userDataDir);
  const consoleErrors = [];
  const failedRequests = [];

  const bootstrap = activeCloudBootstrapPayload();
  await context.addInitScript((payload) => {
    window.localStorage.removeItem("lime.agentAppHost.flags");
    window.localStorage.removeItem("lime.agentAppHost.labEnabled");
    window.__LIME_AGENT_APPS_SMOKE_BOOTSTRAP__ = payload;
  }, bootstrap);

  const page = await context.newPage();
  await page.route(
    "https://user.limeai.run/api/v1/public/tenants/*/client/agent-apps",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(bootstrap),
      });
    },
  );
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText ?? "unknown",
    });
  });

  try {
    logStage("open-app");
    await page.goto(options.appUrl, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.waitForSelector('[data-testid="app-sidebar-main-nav"]', {
      timeout: options.timeoutMs,
    });
    await openAccountMenuForAgentApps(page, options.timeoutMs);
    assert(
      (await page.locator(AGENT_APPS_NAV_SELECTOR).count()) > 0,
      "Agent Apps nav should be visible",
    );
    assert(
      (await page.locator(AGENT_APP_LAB_NAV_SELECTOR).count()) === 0,
      "Agent App Lab nav should stay hidden in formal smoke",
    );

    logStage("open-agent-apps");
    await clickAgentAppsNav(page, options.timeoutMs);
    await page.waitForSelector('[data-testid="agent-apps-page"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="agent-apps-installed-content-factory-app"]', {
      timeout: options.timeoutMs,
    });

    logStage("verify-registration-required");
    await page.waitForSelector('[data-testid="agent-apps-registration-content-factory-app"]', {
      timeout: options.timeoutMs,
    });
    const registrationInstallBlocked = await page.isDisabled(
      '[data-testid="agent-apps-install-cloud-content-factory-app"]',
    );

    logStage("activate-bootstrap-catalog");
    await page.evaluate((payload) => {
      window.__LIME_OEM_CLOUD__ = {
        enabled: true,
        baseUrl: "https://user.limeai.run",
        tenantId: payload.tenantId,
      };
      window.__LIME_SESSION_TOKEN__ = "smoke-agent-apps-token";
      window.__LIME_BOOTSTRAP__ = { data: { agentAppCatalog: payload } };
    }, bootstrap);
    await page.click('[data-testid="agent-apps-refresh"]');
    await page.waitForFunction(
      () => {
        const button = document.querySelector(
          '[data-testid="agent-apps-install-cloud-content-factory-app"]',
        );
        return button instanceof HTMLButtonElement && !button.disabled;
      },
      undefined,
      { timeout: options.timeoutMs },
    );

    logStage("install-cloud-review");
    await page.click('[data-testid="agent-apps-install-cloud-content-factory-app"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="agent-apps-install-review"]', {
      timeout: options.timeoutMs,
    });
    await page.click('[data-testid="agent-apps-install-review-confirm"]');
    await page.waitForSelector('[data-testid="agent-apps-installed-content-factory-app"]', {
      timeout: options.timeoutMs,
    });

    logStage("disable-enable");
    await page.click('[data-testid="agent-apps-installed-content-factory-app"]');
    await page.click('[data-testid="agent-apps-disable"]');
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="agent-apps-launch-entry-dashboard"]')
          ?.hasAttribute("disabled") &&
        !document.querySelector('[data-testid="agent-apps-enable"]')?.hasAttribute("disabled"),
      undefined,
      { timeout: options.timeoutMs },
    );
    const disabledLaunchBlocked = await page.isDisabled(
      '[data-testid="agent-apps-launch-entry-dashboard"]',
    );
    await page.click('[data-testid="agent-apps-enable"]');
    await page.waitForFunction(
      () =>
        !document
          .querySelector('[data-testid="agent-apps-launch-entry-dashboard"]')
          ?.hasAttribute("disabled"),
      undefined,
      { timeout: options.timeoutMs },
    );

    logStage("launch-runtime-surface");
    await page.click('[data-testid="agent-apps-launch-entry-dashboard"]');
    await page.waitForSelector('[data-testid="agent-app-runtime-surface"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="agent-app-runtime-frame"]', {
      timeout: options.timeoutMs,
    });
    const runtimeFrameSrc = await page.getAttribute(
      '[data-testid="agent-app-runtime-frame"]',
      "src",
    );

    logStage("return-agent-apps");
    await clickAgentAppsNav(page, options.timeoutMs);
    await page.waitForSelector('[data-testid="agent-apps-page"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="agent-apps-installed-content-factory-app"]', {
      timeout: options.timeoutMs,
    });

    logStage("uninstall-rehearsal");
    await page.click('[data-testid="agent-apps-uninstall-delete-data"]');
    await page.waitForSelector('[data-testid="agent-apps-uninstall-preview"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="agent-apps-cleanup-evidence-json"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="agent-apps-residual-audit"]', {
      timeout: options.timeoutMs,
    });
    const cleanupEvidenceText = await page.textContent(
      '[data-testid="agent-apps-cleanup-evidence-json"]',
    );
    const cleanupEvidence = JSON.parse(cleanupEvidenceText ?? "{}");
    await page.click('[data-testid="agent-apps-uninstall-confirm"]');
    await page.waitForSelector('[data-testid="agent-apps-launch-summary"]', {
      timeout: options.timeoutMs,
    });
    const stillInstalledAfterRehearsal =
      (await page.locator('[data-testid="agent-apps-installed-content-factory-app"]').count()) > 0;

    const flagOff = await runFlagOffRegression(options);
    const assertions = {
      formalPageVisible: Boolean(await page.$('[data-testid="agent-apps-page"]')),
      installedVisible: stillInstalledAfterRehearsal,
      registrationRequiredBlocked: registrationInstallBlocked,
      cloudInstallReviewVisible: true,
      disabledLaunchBlocked,
      runtimeSurfaceVisible: Boolean(runtimeFrameSrc),
      cleanupEvidenceSelectedApp: cleanupEvidence.appId === "content-factory-app",
      cleanupEvidenceStrategy: cleanupEvidence.strategy === "delete-data",
      cleanupEvidenceDryRunOnly:
        Array.isArray(cleanupEvidence.warningCodes) &&
        cleanupEvidence.warningCodes.includes("DRY_RUN_ONLY"),
      cleanupEvidenceBlockedCount: cleanupEvidence.blockedTargetCount === 0,
      flagOffAgentAppsNavVisible: flagOff.assertions.agentAppsNavVisible,
      flagOffLabNavHidden: flagOff.assertions.labNavHidden,
      flagOffNoConsoleErrors: flagOff.assertions.noConsoleErrors,
    };

    Object.entries(assertions).forEach(([key, value]) => {
      assert(Boolean(value), `Assertion failed: ${key}`);
    });

    const screenshotPath = path.join(options.evidenceDir, `${options.prefix}.png`);
    const summaryPath = path.join(options.evidenceDir, `${options.prefix}-summary.json`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    fs.writeFileSync(
      summaryPath,
      `${JSON.stringify(
        {
          scenarioId: "agent-apps-smoke",
          appUrl: options.appUrl,
          assertions,
          runtimeFrameSrc,
          cleanupEvidence,
          flagOff,
          consoleErrors,
          failedRequests,
          screenshot: screenshotPath,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`[smoke:agent-apps] summary=${summaryPath}`);
    console.log("[smoke:agent-apps] 通过");
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
