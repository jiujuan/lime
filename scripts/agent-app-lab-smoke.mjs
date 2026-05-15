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
  evidenceDir: path.join(process.cwd(), ".lime", "qc", "gui-evidence", "agent-app-lab"),
  prefix: "agent-app-lab-smoke",
};

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
  console.log(`[smoke:agent-app-lab] stage=${stage}`);
}

async function launchSmokeContext(userDataDir) {
  try {
    return await chromium.launchPersistentContext(userDataDir, {
      channel: "chrome",
      headless: true,
    });
  } catch (error) {
    console.warn(
      `[smoke:agent-app-lab] Chrome channel 启动失败，尝试 Playwright Chromium: ${
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
        `[smoke:agent-app-lab] DevBridge 已就绪 (${Date.now() - startedAt}ms) status=${payload?.status ?? "unknown"}`,
      );
      return payload;
    } catch (error) {
      lastError = error;
      await sleep(options.intervalMs);
    }
  }
  throw new Error(
    `[smoke:agent-app-lab] DevBridge 未就绪: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function runFlagOffRegression(options) {
  logStage("flag-off-regression");
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "lime-agent-app-lab-flag-off-"),
  );
  const context = await launchSmokeContext(userDataDir);
  const consoleErrors = [];
  const failedRequests = [];

  await context.addInitScript(() => {
    window.localStorage.removeItem("lime.agentAppHost.flags");
    window.localStorage.removeItem("lime.agentAppHost.labEnabled");
  });

  const page = await context.newPage();
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
    await page.goto(options.appUrl, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="app-sidebar-main-nav"]', {
      timeout: options.timeoutMs,
    });

    const assertions = {
      labNavHidden: (await page.locator('button[title="Agent App Lab"]').count()) === 0,
      labPageHidden: (await page.locator('[data-testid="agent-app-lab-page"]').count()) === 0,
      agentAppsNavVisible: (await page.locator('button[title="Agent Apps"]').count()) > 0,
      noConsoleErrors: consoleErrors.length === 0,
    };

    Object.entries(assertions).forEach(([key, value]) => {
      if (!value && key === "noConsoleErrors") {
        console.error(
          `[smoke:agent-app-lab] flagOffConsoleErrors=${JSON.stringify(consoleErrors, null, 2)}`,
        );
      }
      assert(Boolean(value), `Flag-off assertion failed: ${key}`);
    });

    const screenshotPath = path.join(options.evidenceDir, `${options.prefix}-flag-off.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return {
      assertions,
      consoleErrors,
      failedRequests,
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

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lime-agent-app-lab-smoke-"));
  let context;
  context = await launchSmokeContext(userDataDir);
  const consoleErrors = [];
  const failedRequests = [];

  await context.addInitScript(() => {
    window.localStorage.setItem(
      "lime.agentAppHost.flags",
      JSON.stringify({
        labEnabled: true,
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
      }),
    );
  });

  const page = await context.newPage();
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
    await page.waitForSelector('button[title="Agent App Lab"]', {
      timeout: options.timeoutMs,
    });

    logStage("open-agent-app-lab");
    await page.click('button[title="Agent App Lab"]');
    await page.waitForSelector('[data-testid="agent-app-lab-page"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="agent-app-install-flow"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="agent-app-manager"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="agent-app-manager-repository"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="agent-app-manager-repository-list"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector(
      '[data-testid="agent-app-manager-repository-app-content-factory-playbook-app"]',
      {
        timeout: options.timeoutMs,
      },
    );
    consoleErrors.length = 0;
    failedRequests.length = 0;

    logStage("resolve-lab-setup");
    await page.click('[data-testid="agent-app-lab-resolve-setup"]');
    await page.waitForFunction(
      () => document.body.textContent?.includes("Guard 已允许") ||
        document.body.textContent?.includes("Guard allows launch") ||
        document.body.textContent?.includes("agentApp.lab.installFlow.launchReady"),
      undefined,
      { timeout: options.timeoutMs },
    );

    logStage("select-companion-app");
    await page.click(
      '[data-testid="agent-app-manager-repository-app-content-factory-playbook-app"]',
    );
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="agent-app-manager-selected-app"]')
          ?.textContent?.includes("fixture:content-factory-playbook-app"),
      undefined,
        { timeout: options.timeoutMs },
    );

    logStage("verify-disable-blocker");
    await page.click('[data-testid="agent-app-manager-disable"]');
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="agent-app-manager-launch-entry-dashboard"]')
          ?.hasAttribute("disabled") &&
        !document
          .querySelector('[data-testid="agent-app-manager-enable"]')
          ?.hasAttribute("disabled"),
      undefined,
      { timeout: options.timeoutMs },
    );
    const managerDisableBlocked = await page.isDisabled(
      '[data-testid="agent-app-manager-launch-entry-dashboard"]',
    );
    const managerEnableAvailable = !(await page.isDisabled(
      '[data-testid="agent-app-manager-enable"]',
    ));
    await page.click('[data-testid="agent-app-manager-enable"]');
    await page.waitForFunction(
      () =>
        !document
          .querySelector('[data-testid="agent-app-manager-launch-entry-dashboard"]')
          ?.hasAttribute("disabled"),
      undefined,
      { timeout: options.timeoutMs },
    );
    const managerReenabled = !(await page.isDisabled(
      '[data-testid="agent-app-manager-launch-entry-dashboard"]',
    ));

    logStage("mount-dashboard");
    await page.click('[data-testid="agent-app-manager-launch-entry-dashboard"]');
    await page.waitForSelector('[data-testid="agent-app-ui-runtime-result"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="agent-app-entry-runtime-guard-allow"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="agent-app-manager-cleanup-evidence"]', {
      timeout: options.timeoutMs,
    });

    logStage("preview-delete-data-cleanup-evidence");
    await page.click('[data-testid="agent-app-manager-uninstall-delete-data"]');
    await page.waitForSelector('[data-testid="agent-app-manager-evidence-json"]', {
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="agent-app-manager-residual-audit"]', {
      timeout: options.timeoutMs,
    });
    const cleanupEvidenceText = await page.textContent(
      '[data-testid="agent-app-manager-evidence-json"]',
    );
    const cleanupEvidence = JSON.parse(cleanupEvidenceText ?? "{}");
    const residualPendingText = await page.textContent(
      '[data-testid="agent-app-manager-residual-pending"]',
    );

    const pageText = await page.textContent("body");
    const uiRuntimeText = await page.textContent('[data-testid="agent-app-ui-runtime-result"]');
    const assertions = {
      labVisible: Boolean(await page.$('[data-testid="agent-app-lab-page"]')),
      installFlowVisible: Boolean(await page.$('[data-testid="agent-app-install-flow"]')),
      managerVisible: Boolean(await page.$('[data-testid="agent-app-manager"]')),
      managerRepository: Boolean(await page.$('[data-testid="agent-app-manager-repository"]')),
      managerRepositoryList: Boolean(
        await page.$('[data-testid="agent-app-manager-repository-list"]'),
      ),
      managerMultiApp: Boolean(
        await page.$('[data-testid="agent-app-manager-repository-app-content-factory-playbook-app"]'),
      ),
      managerSelectedApp: Boolean(
        pageText?.includes("fixture:content-factory-playbook-app"),
      ),
      managerDisableBlocked,
      managerEnableAvailable,
      managerReenabled,
      selectedRuntimeApp: Boolean(
        uiRuntimeText?.includes("content-factory-playbook-app"),
      ),
      setupResolved: pageText?.includes("Lab 示例 setup 已解决") ||
        pageText?.includes("Lab sample setup") ||
        pageText?.includes("agentApp.lab.installFlow.setupResolved"),
      guardAllowed: Boolean(await page.$('[data-testid="agent-app-entry-runtime-guard-allow"]')),
      uiMounted: Boolean(await page.$('[data-testid="agent-app-ui-runtime-result"]')),
      managerEvidence: Boolean(await page.$('[data-testid="agent-app-manager-cleanup-evidence"]')),
      cleanupEvidenceJson: Boolean(
        await page.$('[data-testid="agent-app-manager-evidence-json"]'),
      ),
      residualAuditVisible: Boolean(
        await page.$('[data-testid="agent-app-manager-residual-audit"]'),
      ),
      residualAuditPending: Boolean(
        residualPendingText?.includes("10") ||
          residualPendingText?.includes(
            "agentApp.lab.manager.evidence.residual.pendingDeletion",
          ),
      ),
      cleanupEvidenceSelectedApp: cleanupEvidence.appId === "content-factory-playbook-app",
      cleanupEvidenceStrategy: cleanupEvidence.strategy === "delete-data",
      cleanupEvidenceBlockedCount: cleanupEvidence.blockedTargetCount === 0,
      launchedStatus: pageText?.includes("已在 Lab 启动") ||
        pageText?.includes("Launched in Lab") ||
        pageText?.includes("agentApp.lab.installFlow.status.launched"),
      cleanupPreview: Boolean(
        await page.$('[data-testid="agent-app-install-flow-stage-cleanup-preview"]'),
      ),
      noConsoleErrors: consoleErrors.length === 0,
    };

    Object.entries(assertions).forEach(([key, value]) => {
      if (!value && key === "noConsoleErrors") {
        console.error(
          `[smoke:agent-app-lab] consoleErrors=${JSON.stringify(consoleErrors, null, 2)}`,
        );
      }
      assert(Boolean(value), `Assertion failed: ${key}`);
    });

    const flagOff = await runFlagOffRegression(options);
    const flagOffAssertions = {
      flagOffLabNavHidden: flagOff.assertions.labNavHidden,
      flagOffLabPageHidden: flagOff.assertions.labPageHidden,
      flagOffAgentAppsNavVisible: flagOff.assertions.agentAppsNavVisible,
      flagOffNoConsoleErrors: flagOff.assertions.noConsoleErrors,
    };
    Object.entries(flagOffAssertions).forEach(([key, value]) => {
      assert(Boolean(value), `Assertion failed: ${key}`);
    });

    const screenshotPath = path.join(options.evidenceDir, `${options.prefix}.png`);
    const summaryPath = path.join(options.evidenceDir, `${options.prefix}-summary.json`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    fs.writeFileSync(
      summaryPath,
      `${JSON.stringify(
        {
          scenarioId: "agent-app-lab-smoke",
          appUrl: options.appUrl,
          assertions: {
            ...assertions,
            ...flagOffAssertions,
          },
          cleanupEvidence,
          residualAudit: {
            pendingText: residualPendingText,
          },
          flagOff,
          consoleErrors,
          failedRequests,
          screenshot: screenshotPath,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`[smoke:agent-app-lab] summary=${summaryPath}`);
    console.log("[smoke:agent-app-lab] 通过");
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
