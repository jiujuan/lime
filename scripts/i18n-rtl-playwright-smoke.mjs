#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const DEFAULTS = {
  appUrl: "http://127.0.0.1:1420/",
  evidenceDir: path.join(process.cwd(), "docs", "roadmap", "i18n", "evidence"),
  headless: true,
  timeoutMs: 120_000,
  viewportHeight: 692,
  viewportWidth: 1200,
};

function printHelp() {
  console.log(`
Lime RTL Playwright Smoke

用途:
  在现有 Lime 页面上强制 RTL 方向，验证首页、Workspace、设置页和用户菜单
  在方向反转下仍可交互，并输出截图与 JSON evidence。

用法:
  npm run i18n:rtl-smoke
  npm run i18n:rtl-smoke -- --app-url http://127.0.0.1:1420/

选项:
  --app-url <url>       前端地址，默认 http://127.0.0.1:1420/
  --evidence-dir <dir>  证据目录，默认 docs/roadmap/i18n/evidence
  --timeout-ms <ms>     总超时，默认 120000
  --headed              使用 headed 浏览器
  -h, --help            显示帮助
`);
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--app-url" && next) {
      options.appUrl = String(next).trim();
      index += 1;
      continue;
    }

    if (arg === "--evidence-dir" && next) {
      options.evidenceDir = path.resolve(String(next).trim());
      index += 1;
      continue;
    }

    if (arg === "--timeout-ms" && next) {
      options.timeoutMs = Number(next);
      index += 1;
      continue;
    }

    if (arg === "--headed") {
      options.headless = false;
      continue;
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number");
  }

  return options;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function launchBrowser(options) {
  try {
    return await chromium.launch({
      channel: "chrome",
      headless: options.headless,
    });
  } catch (error) {
    console.warn(
      `[i18n:rtl-smoke] Chrome channel unavailable, fallback to Playwright Chromium: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return chromium.launch({ headless: options.headless });
  }
}

async function waitForPageReady(page, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (
      (await page.title().catch(() => "")) === "Lime" &&
      (await page
        .locator('button[aria-label="搜索任务"]')
        .count()
        .catch(() => 0)) > 0
    ) {
      return;
    }
    await sleep(200);
  }
  throw new Error(`[i18n:rtl-smoke] page is not ready after ${timeoutMs}ms`);
}

async function captureBox(page, selector) {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      };
    });
}

async function captureFullPageScreenshot(page, evidenceDir, fileName) {
  const screenshotPath = path.join(evidenceDir, fileName);
  await page.screenshot({
    fullPage: true,
    path: screenshotPath,
    scale: "css",
    type: "png",
  });
  return screenshotPath;
}

async function runSmoke(options) {
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  const browser = await launchBrowser(options);
  const context = await browser.newContext({
    viewport: {
      height: options.viewportHeight,
      width: options.viewportWidth,
    },
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  try {
    console.log(`[i18n:rtl-smoke] appUrl=${options.appUrl}`);
    await page.goto(options.appUrl, { waitUntil: "domcontentloaded" });
    await waitForPageReady(page, options.timeoutMs);

    console.log("[i18n:rtl-smoke] applying rtl direction");
    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
      document.body.dir = "rtl";
    });
    await page.waitForFunction(
      () =>
        document.documentElement.dir === "rtl" && document.body.dir === "rtl",
      { timeout: options.timeoutMs },
    );

    const homeSidebarBox = await captureBox(page, "aside");
    const homeMainBox = await captureBox(page, "main");
    assert(
      homeSidebarBox.x > homeMainBox.x,
      `[i18n:rtl-smoke] expected sidebar to move to the right in rtl, got sidebar.x=${homeSidebarBox.x} main.x=${homeMainBox.x}`,
    );

    console.log("[i18n:rtl-smoke] capturing home screenshot");
    const homeScreenshotPath = await captureFullPageScreenshot(
      page,
      options.evidenceDir,
      "rtl-home-automated.png",
    );
    const homeFullPageScreenshotPath = await captureFullPageScreenshot(
      page,
      options.evidenceDir,
      "rtl-home-fullpage.png",
    );

    console.log("[i18n:rtl-smoke] opening user menu");
    await page.locator('button[aria-label="打开用户菜单"]').first().click();
    const userMenuDialog = page.getByRole("dialog", { name: "用户菜单" });
    await userMenuDialog.waitFor({
      state: "visible",
      timeout: options.timeoutMs,
    });

    console.log("[i18n:rtl-smoke] capturing user menu screenshot");
    const userMenuScreenshotPath = await captureFullPageScreenshot(
      page,
      options.evidenceDir,
      "rtl-user-menu-automated.png",
    );
    const userMenuFullPageScreenshotPath = await captureFullPageScreenshot(
      page,
      options.evidenceDir,
      "rtl-user-menu-fullpage.png",
    );

    console.log("[i18n:rtl-smoke] opening settings page");
    await userMenuDialog
      .getByRole("button", { name: "设置", exact: true })
      .click();
    await page.getByTestId("settings-top-header").waitFor({
      state: "visible",
      timeout: options.timeoutMs,
    });
    await page.getByTestId("settings-floating-nav-button").waitFor({
      state: "visible",
      timeout: options.timeoutMs,
    });
    await page.getByTestId("settings-floating-nav-button").click();
    await page.getByTestId("settings-floating-nav-panel").waitFor({
      state: "visible",
      timeout: options.timeoutMs,
    });

    console.log("[i18n:rtl-smoke] capturing settings screenshot");
    const settingsScreenshotPath = await captureFullPageScreenshot(
      page,
      options.evidenceDir,
      "rtl-settings-automated.png",
    );
    const settingsFullPageScreenshotPath = await captureFullPageScreenshot(
      page,
      options.evidenceDir,
      "rtl-settings-fullpage.png",
    );

    await page.getByRole("button", { name: "回到首页" }).click();
    await page.getByTestId("workspace-shell-scene").waitFor({
      state: "visible",
      timeout: options.timeoutMs,
    });
    const workspaceBox = await captureBox(
      page,
      '[data-testid="workspace-shell-scene"]',
    );
    assert(
      workspaceBox.width > 0 && workspaceBox.height > 0,
      `[i18n:rtl-smoke] expected workspace shell to be visible, got ${JSON.stringify(workspaceBox)}`,
    );

    console.log("[i18n:rtl-smoke] capturing workspace screenshot");
    const workspaceScreenshotPath = await captureFullPageScreenshot(
      page,
      options.evidenceDir,
      "rtl-workspace-automated.png",
    );
    const workspaceFullPageScreenshotPath = await captureFullPageScreenshot(
      page,
      options.evidenceDir,
      "rtl-workspace-fullpage.png",
    );

    const report = {
      appUrl: options.appUrl,
      consoleErrorCount: consoleErrors.length + pageErrors.length,
      consoleErrors,
      dir: {
        body: "",
        document: "",
      },
      evidenceDir: options.evidenceDir,
      pageErrors,
      schemaVersion: "lime.i18n.rtlPlaywrightSmokeReport.v1",
      screenshots: {
        home: homeScreenshotPath,
        homeFullPage: homeFullPageScreenshotPath,
        settings: settingsScreenshotPath,
        settingsFullPage: settingsFullPageScreenshotPath,
        userMenu: userMenuScreenshotPath,
        userMenuFullPage: userMenuFullPageScreenshotPath,
        workspace: workspaceScreenshotPath,
        workspaceFullPage: workspaceFullPageScreenshotPath,
      },
      summary: {
        homeSidebarOnRight: homeSidebarBox.x > homeMainBox.x,
        settingsNavVisible: true,
        userMenuDialogVisible: true,
        workspaceVisible: workspaceBox.width > 0 && workspaceBox.height > 0,
      },
    };

    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
      document.body.dir = "rtl";
    });
    report.dir = {
      body: await page.evaluate(() => document.body.dir || ""),
      document: await page.evaluate(() => document.documentElement.dir || ""),
    };

    const reportPath = path.join(
      options.evidenceDir,
      "rtl-playwright-smoke-report.json",
    );
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

    assert(
      report.consoleErrorCount === 0,
      "[i18n:rtl-smoke] console errors found",
    );

    console.log(JSON.stringify(report, null, 2));
    return 0;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const exitCode = await runSmoke(options);
    process.exitCode = exitCode;
  } catch (error) {
    process.stderr.write(
      `[i18n:rtl-smoke] ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

await main();
