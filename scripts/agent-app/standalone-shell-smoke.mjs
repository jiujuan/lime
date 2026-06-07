#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

function resolveDefaultAgentAppDir() {
  if (process.env.CONTENT_FACTORY_APP_DIR) {
    return path.resolve(process.env.CONTENT_FACTORY_APP_DIR);
  }
  return path.resolve(process.cwd(), "..", "..", "limecloud", "content-factory-app");
}

const DEFAULTS = {
  appUrl: "http://127.0.0.1:1420/",
  healthUrl: "http://127.0.0.1:3030/health",
  timeoutMs: 180_000,
  intervalMs: 1_000,
  contentFactoryDir: resolveDefaultAgentAppDir(),
  evidenceDir: path.join(process.cwd(), ".lime", "qc", "gui-evidence", "agent-apps"),
  prefix: "content-factory-standalone-shell",
};

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--help") {
      printHelp();
      process.exit(0);
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
    if (arg === "--interval-ms" && next) {
      options.intervalMs = Number(next);
      index += 1;
      continue;
    }
    if (arg === "--content-factory-dir" && next) {
      options.contentFactoryDir = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--evidence-dir" && next) {
      options.evidenceDir = path.resolve(next.trim());
      index += 1;
      continue;
    }
    if (arg === "--prefix" && next) {
      options.prefix = next.trim();
      index += 1;
    }
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
    throw new Error("--interval-ms must be a positive number");
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/agent-app/standalone-shell-smoke.mjs [options]

Options:
  --app-url <url>                 Lime WebView URL, default http://127.0.0.1:1420/
  --health-url <url>              DevBridge health URL, default http://127.0.0.1:3030/health
  --timeout-ms <ms>               Timeout for browser/API operations, default 180000
  --content-factory-dir <dir>     Content Factory Agent App directory, default ../../limecloud/content-factory-app
  --evidence-dir <dir>            Evidence output directory
  --prefix <name>                 Evidence filename prefix
`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logStage(stage) {
  console.log(`[standalone-shell-smoke] stage=${stage}`);
}

async function waitForHealth(options) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    try {
      const response = await fetch(options.healthUrl, {
        signal: AbortSignal.timeout(5_000),
      });
      const payload = await response.json();
      if (response.ok) {
        console.log(
          `[standalone-shell-smoke] DevBridge ready in ${
            Date.now() - startedAt
          }ms status=${payload?.status ?? "unknown"}`,
        );
        return payload;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `DevBridge health unavailable: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function launchBrowser(userDataDir) {
  try {
    return await chromium.launchPersistentContext(userDataDir, {
      channel: "chrome",
      headless: true,
    });
  } catch (error) {
    console.warn(
      `[standalone-shell-smoke] Chrome channel failed, fallback to Playwright Chromium: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return chromium.launchPersistentContext(userDataDir, { headless: true });
  }
}

async function probeEntryUrl(url, timeoutMs) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    bodyLength: text.length,
    hasHtmlShell: /<html|<!doctype html|<div id="?root"?/i.test(text),
  };
}

async function runStandaloneLaunch(page, options) {
  return page.evaluate(
    async ({ appDir }) => {
      window.__LIME_OEM_CLOUD__ = {
        enabled: true,
        baseUrl: "https://user.limeai.run",
        tenantId: "content-factory-standalone-shell",
      };
      window.__LIME_SESSION_TOKEN__ = "standalone-shell-smoke-token";
      window.__LIME_BOOTSTRAP__ = {
        data: {
          agentAppCatalog: {
            schemaVersion: "agent-app-cloud-bootstrap/v1",
            tenantId: "content-factory-standalone-shell",
            generatedAt: new Date().toISOString(),
            apps: [
              {
                appId: "content-factory-app",
                displayName: "内容工厂",
                version: "0.8.0",
                releaseId: "standalone-shell-smoke",
                channel: "smoke",
                registrationRequired: true,
                registrationState: "active",
                enabled: true,
                packageUrl:
                  "https://lime.local/agent-apps/content-factory-app/releases/0.8.0/package.zip",
                packageHash:
                  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                manifestHash:
                  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                capabilityRequirements: {},
                defaultEntries: ["dashboard"],
                policyDefaults: {},
                toolAvailability: [],
              },
            ],
          },
        },
      };

      const api = await import("/src/lib/api/agentApps.ts");
      const profileModule = await import(
        "/src/features/agent-app/runtime/workflowRuntimeCapabilityProfile.ts"
      );
      const runtimeProfileModule = await import(
        "/src/features/agent-app/runtime-profile/index.ts"
      );
      const shellModule = await import("/src/features/agent-app/shell/index.ts");

      const hostProfile = profileModule.buildWorkflowRuntimeCapabilityProfile({
        realAdapterEnabled: true,
        uiRuntimeEnabled: true,
        workerRuntimeEnabled: true,
      });
      const review = await api.reviewLocalAgentAppPackage({
        appDir,
        profile: hostProfile,
      });
      const state = structuredClone(review.state);
      const modeReadiness = state.readiness?.installModes?.find(
        (item) => item.mode === "standalone",
      );
      state.installMode = "standalone";
      state.runtimeProfileSummary = {
        installMode: "standalone",
        shellKind: "app_shell",
        runtimeVersion: modeReadiness?.runtimeVersion,
        runtimeMinVersion: state.manifest?.install?.runtime?.minVersion,
        checkedAt: state.readiness?.checkedAt ?? new Date().toISOString(),
      };
      state.updatedAt = new Date().toISOString();
      await api.saveInstalledAgentAppState({ state });

      const runtimeProfile =
        runtimeProfileModule.buildLimeRuntimeProfileForInstalledState({
          state,
          hostProfile,
        });
      const entry =
        state.projection.entries.find((item) => item.key === "dashboard") ??
        state.projection.entries.find((item) =>
          ["page", "panel", "settings"].includes(item.kind),
        ) ??
        state.projection.entries[0];
      if (!entry) {
        throw new Error("Content Factory has no launchable entry");
      }
      const preview = {
        identity: state.identity,
        manifest: state.manifest,
        projection: state.projection,
        readiness: state.readiness,
        cleanupPlan: { generatedAt: state.updatedAt },
      };
      const shellLaunch =
        shellModule.resolveShellLaunchDescriptorForInstalledEntry({
          state,
          preview,
          runtimeProfile,
          entry,
        });
      if (shellLaunch.status !== "ready") {
        throw new Error(`Shell launch not ready: ${shellLaunch.reason}`);
      }
      const result = await api.launchAgentAppShell({
        descriptor: shellLaunch.descriptor,
      });
      return {
        appId: state.appId,
        installMode: state.installMode,
        runtimeProfileSummary: state.runtimeProfileSummary,
        descriptor: {
          appId: shellLaunch.descriptor.appId,
          installMode: shellLaunch.descriptor.installMode,
          shellKind: shellLaunch.descriptor.runtimeProfile.shellKind,
          entry: shellLaunch.descriptor.entry,
          isolation: shellLaunch.descriptor.isolation,
          packageHash: shellLaunch.descriptor.packageHash,
          manifestHash: shellLaunch.descriptor.manifestHash,
        },
        result,
      };
    },
    { appDir: options.contentFactoryDir },
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.evidenceDir, { recursive: true });
  assert(
    fs.existsSync(options.contentFactoryDir),
    `Content Factory dir not found: ${options.contentFactoryDir}`,
  );
  await waitForHealth(options);

  const userDataDir = fs.mkdtempSync(
    path.join(process.cwd(), ".lime", "tmp-standalone-shell-"),
  );
  const context = await launchBrowser(userDataDir);
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
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
    logStage("open-lime");
    await page.goto(options.appUrl, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });
    await page.waitForSelector('[data-testid="app-sidebar-main-nav"]', {
      timeout: options.timeoutMs,
    });
    consoleErrors.length = 0;
    failedRequests.length = 0;

    logStage("launch-standalone-shell");
    const launch = await runStandaloneLaunch(page, options);
    assert(launch.result.status === "launched", "shell launch should be launched");
    assert(launch.result.devShell === true, "shell launch should be devShell");
    assert(
      launch.result.shellWindow?.label ===
        "agent-app-shell-content-factory-app-standalone",
      `unexpected shell window label: ${launch.result.shellWindow?.label}`,
    );
    assert(
      launch.result.shellWindow?.url && launch.result.runtimeStatus?.entryUrl,
      "shell launch should include shellWindow.url and runtimeStatus.entryUrl",
    );
    assert(
      launch.result.shellWindow.url === launch.result.runtimeStatus.entryUrl,
      "shell window URL should match runtime entry URL",
    );
    assert(
      launch.descriptor.isolation.packageMount === "read-only" &&
        launch.descriptor.isolation.secrets === "refs-only" &&
        launch.descriptor.isolation.sideEffects === "runtime-broker" &&
        launch.descriptor.isolation.evidence === "runtime-provenance",
      "shell descriptor isolation policy should stay strict",
    );

    logStage("probe-runtime-entry-url");
    const entryProbe = await probeEntryUrl(
      launch.result.shellWindow.url,
      Math.min(options.timeoutMs, 30_000),
    );
    assert(entryProbe.ok, `runtime entry URL should be reachable: ${entryProbe.status}`);
    assert(entryProbe.hasHtmlShell, "runtime entry URL should return an HTML shell");

    const screenshot = path.join(options.evidenceDir, `${options.prefix}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    const summaryPath = path.join(options.evidenceDir, `${options.prefix}-summary.json`);
    const summary = {
      scenarioId: "content-factory-standalone-shell",
      generatedAt: new Date().toISOString(),
      appUrl: options.appUrl,
      contentFactoryDir: options.contentFactoryDir,
      assertions: {
        launched: launch.result.status === "launched",
        devShell: launch.result.devShell === true,
        standaloneMode: launch.installMode === "standalone",
        appShellKind: launch.result.shellKind === "app_shell",
        shellWindowReturned: Boolean(launch.result.shellWindow),
        runtimeEntryReachable: entryProbe.ok,
        strictIsolation:
          launch.descriptor.isolation.packageMount === "read-only" &&
          launch.descriptor.isolation.secrets === "refs-only" &&
          launch.descriptor.isolation.sideEffects === "runtime-broker" &&
          launch.descriptor.isolation.evidence === "runtime-provenance",
        noConsoleErrors: consoleErrors.length === 0,
      },
      launch,
      entryProbe,
      consoleErrors,
      failedRequests: failedRequests.slice(0, 20),
      screenshot,
    };
    fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`[standalone-shell-smoke] summary=${summaryPath}`);
    console.log("[standalone-shell-smoke] 通过");
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(
    `[standalone-shell-smoke] failed: ${
      error instanceof Error ? error.stack || error.message : String(error)
    }`,
  );
  process.exit(1);
});
