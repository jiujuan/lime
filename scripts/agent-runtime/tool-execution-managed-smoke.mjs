#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import electronPath from "electron";
import { _electron as electron } from "playwright";

import { resolveElectronAppServerRuntimeEnv } from "../lib/electron-app-server-assets.mjs";
import { resolveDevAppServerBinary } from "../lib/electron-dev-sidecar.mjs";

const LOG_PREFIX = "[smoke:agent-runtime-tool-execution:managed]";
const DEFAULT_TIMEOUT_MS = 300_000;
const INTERVAL_MS = 500;
const TEMP_CLEANUP_RETRY_COUNT = 8;
const TEMP_CLEANUP_RETRY_DELAY_MS = 250;
const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeText(value) {
  return String(value ?? "")
    .replace(
      /((?:api[_-]?key|authorization|password|secret|session|token)[^=\s]*=)(["']?)[^\s"']+/gi,
      "$1$2[redacted]",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/sk-[A-Za-z0-9._-]+/g, "sk-[redacted]");
}

function timeoutFromArgs(args) {
  const index = args.indexOf("--timeout-ms");
  if (index >= 0 && args[index + 1]) {
    const value = Number(args[index + 1]);
    if (Number.isFinite(value) && value >= 30_000) {
      return value;
    }
  }
  return DEFAULT_TIMEOUT_MS;
}

function createTempRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "tool-execution-managed-electron-"),
  );
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  const electronUserDataDir = path.join(tempRoot, "electron-user-data");
  const agentRoot = path.join(tempRoot, "agent");

  for (const dir of [
    home,
    xdgDataHome,
    localAppData,
    roamingAppData,
    electronUserDataDir,
    agentRoot,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return {
    tempRoot,
    electronUserDataDir,
    env: {
      ...process.env,
      HOME: home,
      XDG_DATA_HOME: xdgDataHome,
      APPDATA: roamingAppData,
      LOCALAPPDATA: localAppData,
      LIME_AGENT_RUNTIME_ROOT: agentRoot,
    },
  };
}

function cleanupTempRoot(tempRoot) {
  try {
    fs.rmSync(tempRoot, {
      recursive: true,
      force: true,
      maxRetries: TEMP_CLEANUP_RETRY_COUNT,
      retryDelay: TEMP_CLEANUP_RETRY_DELAY_MS,
    });
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} temp cleanup skipped path=${tempRoot} error=${sanitizeText(error)}`,
    );
  }
}

async function waitForRendererReady(page, timeoutMs) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const snapshot = await page.evaluate((command) => ({
        url: window.location.href,
        title: document.title || "",
        electron: window.__LIME_ELECTRON__ === true,
        hasInvokeBridge: typeof window.electronAPI?.invoke === "function",
        supportsAppServer:
          typeof window.electronAPI?.supportsCommand === "function" &&
          window.electronAPI.supportsCommand(command),
        startupVisible: Boolean(
          document.querySelector("[data-lime-startup-shell]"),
        ),
        appSidebarVisible: Boolean(
          document.querySelector('[data-testid="app-sidebar"]'),
        ),
        bodyText: document.body?.innerText || "",
      }), APP_SERVER_HANDLE_JSON_LINES_COMMAND);
      lastSnapshot = snapshot;
      if (
        snapshot.electron &&
        snapshot.hasInvokeBridge &&
        snapshot.supportsAppServer &&
        !snapshot.startupVisible &&
        snapshot.appSidebarVisible
      ) {
        return snapshot;
      }
    } catch (error) {
      lastSnapshot = { error: sanitizeText(error) };
    }
    await sleep(INTERVAL_MS);
  }
  throw new Error(
    `Electron renderer / App Server bridge 未就绪: ${JSON.stringify(lastSnapshot)}`,
  );
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function writeJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

async function invokeElectron(page, command, args) {
  return await page.evaluate(
    async ({ command, args }) => {
      const invoke = window.electronAPI?.invoke;
      if (typeof invoke !== "function") {
        throw new Error("Electron preload invoke bridge is unavailable");
      }
      return await invoke(command, args);
    },
    { command, args },
  );
}

async function startBridgeProxy(page) {
  const server = createServer((request, response) => {
    void (async () => {
      if (request.method === "OPTIONS") {
        writeJson(response, 204, {});
        return;
      }
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, {
          status: "ok",
          transport: "managed-electron-host",
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/invoke") {
        const body = await readJsonBody(request);
        const command = typeof body.cmd === "string" ? body.cmd.trim() : "";
        if (!command) {
          writeJson(response, 400, { error: "cmd is required" });
          return;
        }
        try {
          const result = await invokeElectron(page, command, body.args ?? {});
          writeJson(response, 200, { result });
        } catch (error) {
          writeJson(response, 200, { error: sanitizeText(error) });
        }
        return;
      }
      writeJson(response, 404, { error: "not found" });
    })().catch((error) => {
      writeJson(response, 200, { error: sanitizeText(error) });
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  if (!port) {
    throw new Error("managed DevBridge proxy 未获得监听端口");
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

function runChild(args, bridgeBaseUrl) {
  const childArgs = [
    "scripts/agent-runtime/tool-execution-smoke.mjs",
    ...args,
    "--health-url",
    `${bridgeBaseUrl}/health`,
    "--invoke-url",
    `${bridgeBaseUrl}/invoke`,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, childArgs, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve({
        code: typeof code === "number" ? code : signal ? 1 : 0,
        signal: signal || "",
      });
    });
  });
}

async function closeServer(server) {
  if (!server) {
    return;
  }
  await new Promise((resolve) => server.close(resolve));
}

async function main() {
  const childArgs = process.argv.slice(2);
  const timeoutMs = timeoutFromArgs(childArgs);
  const runtimeEnv = createTempRuntimeEnv();
  const appServerBinary = resolveDevAppServerBinary({
    env: runtimeEnv.env,
    repoRoot: process.cwd(),
  });
  const appServerEnv = resolveElectronAppServerRuntimeEnv({
    env: {
      ...runtimeEnv.env,
      APP_SERVER_BIN: appServerBinary,
    },
  });
  let app = null;
  let bridge = null;
  try {
    console.log(`${LOG_PREFIX} stage=launch-electron`);
    app = await electron.launch({
      executablePath: electronPath,
      args: ["--use-mock-keychain", "."],
      cwd: process.cwd(),
      env: {
        ...runtimeEnv.env,
        ...appServerEnv,
        ELECTRON_E2E_USER_DATA_DIR: runtimeEnv.electronUserDataDir,
        LIME_ELECTRON_E2E: "1",
        LIME_ELECTRON_BRAND_DEV_APP: "0",
        LIME_ELECTRON_CLEAR_RENDERER_CACHE: "0",
        LIME_ELECTRON_DEV_HTTP_BRIDGE: "0",
      },
      timeout: timeoutMs,
    });
    const page = await app.firstWindow({ timeout: timeoutMs });
    page.setDefaultTimeout(timeoutMs);
    await page.setViewportSize({ width: 1440, height: 1000 });

    console.log(`${LOG_PREFIX} stage=wait-renderer`);
    const snapshot = await waitForRendererReady(page, timeoutMs);
    console.log(
      `${LOG_PREFIX} renderer ready url=${snapshot.url} title=${snapshot.title}`,
    );

    console.log(`${LOG_PREFIX} stage=start-bridge-proxy`);
    bridge = await startBridgeProxy(page);
    console.log(`${LOG_PREFIX} bridge=${bridge.baseUrl}`);

    const result = await runChild(childArgs, bridge.baseUrl);
    process.exitCode = result.code;
  } finally {
    await closeServer(bridge?.server);
    if (app) {
      try {
        await app.close();
      } catch (error) {
        console.warn(`${LOG_PREFIX} electron close skipped: ${sanitizeText(error)}`);
        try {
          const childProcess =
            typeof app.process === "function" ? app.process() : null;
          if (childProcess && !childProcess.killed) {
            childProcess.kill("SIGTERM");
          }
        } catch {
          // best effort cleanup
        }
      }
    }
    cleanupTempRoot(runtimeEnv.tempRoot);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
