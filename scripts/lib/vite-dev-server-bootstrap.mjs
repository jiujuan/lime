import { spawn } from "node:child_process";
import process from "node:process";

const DEV_URL_TIMEOUT_MS = 1_500;
const ENTRY_MODULE_TIMEOUT_MS = 6_000;
const OPTIMIZED_DEPS_TIMEOUT_MS = 6_000;
const REUSE_ONLY_TIMEOUT_MS = 10_000;
const REUSE_ONLY_INTERVAL_MS = 500;
const ROOT_MARKERS = ["<title>Lime</title>", '<div id="root"></div>'];
const OPTIMIZED_DEP_FILES = [
  "react.js",
  "react-dom_client.js",
  "react_jsx-dev-runtime.js",
];
const HOST_BRIDGE_MODULE_PATH = "/src/features/agent-app/runtime/hostBridge.ts";
const TAURI_DIALOG_MOCK_MARKER = "/src/lib/tauri-mock/plugin-dialog";

function isLimeDevShell(html) {
  return ROOT_MARKERS.some((marker) => html.includes(marker));
}

function isEntryModuleReady(code) {
  return (
    code.includes("ReactDOM.createRoot") ||
    code.includes("registerLightweightRenderers")
  );
}

function isOptimizedDepReady(code) {
  return code.includes("export") || code.includes("import ");
}

async function fetchText(url, timeoutMs) {
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();

  return {
    response,
    text,
  };
}

function createEnv({ browserBridge }) {
  const env = { ...process.env };

  if (browserBridge) {
    delete env.TAURI_ENV_PLATFORM;
    env.LIME_BROWSER_BRIDGE = "1";
  } else if (!env.TAURI_ENV_PLATFORM) {
    // Tauri dev server 必须强制进入 Tauri 解析模式，否则 Vite 会把 dialog 解析到浏览器 mock。
    env.TAURI_ENV_PLATFORM = process.platform;
  }

  return env;
}

function resolveOptimizedDepUrls(url, { browserBridge }) {
  const depsDir = browserBridge ? ".vite-web" : ".vite-tauri";
  return OPTIMIZED_DEP_FILES.map((file) =>
    new URL(`/node_modules/${depsDir}/deps/${file}`, url).toString(),
  );
}

function describeExpectedRuntimeMode({ browserBridge }) {
  return browserBridge ? "浏览器 DevBridge mock 模式" : "Tauri 原生模式";
}

async function probeExistingDevServer(url, options) {
  if (typeof fetch !== "function") {
    return { reachable: false };
  }

  try {
    const { response, text: html } = await fetchText(url, DEV_URL_TIMEOUT_MS);
    const limeDevShellReady = response.ok && isLimeDevShell(html);

    let entryModuleReady = false;
    let optimizedDepsReady = false;
    let runtimeModeReady = false;

    if (limeDevShellReady) {
      try {
        const entryModuleUrl = new URL(options.entryModulePath, url).toString();
        const { response: entryResponse, text: entryCode } = await fetchText(
          entryModuleUrl,
          ENTRY_MODULE_TIMEOUT_MS,
        );
        entryModuleReady =
          entryResponse.ok && isEntryModuleReady(entryCode);
      } catch {
        entryModuleReady = false;
      }

      if (entryModuleReady) {
        const optimizedDepResults = await Promise.all(
          resolveOptimizedDepUrls(url, options).map(async (depUrl) => {
            try {
              const { response: depResponse, text: depCode } = await fetchText(
                depUrl,
                OPTIMIZED_DEPS_TIMEOUT_MS,
              );
              return depResponse.ok && isOptimizedDepReady(depCode);
            } catch {
              return false;
            }
          }),
        );
        optimizedDepsReady = optimizedDepResults.every(Boolean);
      }

      if (entryModuleReady) {
        try {
          const hostBridgeUrl = new URL(HOST_BRIDGE_MODULE_PATH, url).toString();
          const { response: bridgeResponse, text: bridgeCode } = await fetchText(
            hostBridgeUrl,
            ENTRY_MODULE_TIMEOUT_MS,
          );
          const usesDialogMock = bridgeCode.includes(TAURI_DIALOG_MOCK_MARKER);
          runtimeModeReady =
            bridgeResponse.ok &&
            (options.browserBridge ? usesDialogMock : !usesDialogMock);
        } catch {
          runtimeModeReady = false;
        }
      }
    }

    return {
      reachable: true,
      status: response.status,
      statusText: response.statusText,
      isLimeDevShell: limeDevShellReady,
      isEntryModuleReady: entryModuleReady,
      areOptimizedDepsReady: optimizedDepsReady,
      isRuntimeModeReady: runtimeModeReady,
    };
  } catch {
    return { reachable: false };
  }
}

async function waitForExistingDevServer(url, options) {
  const startedAt = Date.now();
  let lastProbe = { reachable: false };

  while (Date.now() - startedAt < REUSE_ONLY_TIMEOUT_MS) {
    lastProbe = await probeExistingDevServer(url, options);

    if (
      lastProbe.reachable &&
      lastProbe.isLimeDevShell &&
      lastProbe.isEntryModuleReady &&
      lastProbe.areOptimizedDepsReady &&
      lastProbe.isRuntimeModeReady
    ) {
      return lastProbe;
    }

    if (lastProbe.reachable && !lastProbe.isLimeDevShell) {
      const statusLabel = `${lastProbe.status} ${lastProbe.statusText}`.trim();
      throw new Error(
        `[${options.logLabel}] ${options.devUrl} 已被其他服务占用，且返回内容不是 Lime dev shell（${statusLabel}）。请先关闭占用进程后重试。`,
      );
    }

    if (
      lastProbe.reachable &&
      lastProbe.isLimeDevShell &&
      lastProbe.isEntryModuleReady &&
      lastProbe.areOptimizedDepsReady &&
      !lastProbe.isRuntimeModeReady
    ) {
      throw new Error(
        `[${options.logLabel}] ${options.devUrl} 当前不是${describeExpectedRuntimeMode(options)}。请先关闭现有 Vite dev server 后重启，避免 Tauri dialog 继续落到浏览器 mock。`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, REUSE_ONLY_INTERVAL_MS));
  }

  throw new Error(
    `[${options.logLabel}] 要求复用已有 Lime dev server，但 ${url} 在 ${REUSE_ONLY_TIMEOUT_MS}ms 内未完成入口模块与优化依赖预热。`,
  );
}

async function runCommand(command, args, env, label) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: true,
      env,
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`[${label}] 子进程被信号中断: ${signal}`));
        return;
      }

      if ((code ?? 0) !== 0) {
        reject(new Error(`[${label}] 子进程退出码异常: ${code ?? 0}`));
        return;
      }

      resolve();
    });
  });
}

function startVite(env) {
  const child = spawn("npx", ["vite"], {
    stdio: "inherit",
    shell: true,
    env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

async function waitForExitSignal() {
  await new Promise((resolve) => {
    const handleExit = () => resolve();
    process.once("SIGINT", handleExit);
    process.once("SIGTERM", handleExit);
  });
}

export async function runViteDevServerBootstrap({
  browserBridge = false,
  devUrl = "http://127.0.0.1:1420/",
  entryModulePath = "/src/main.tsx",
  reuseExistingOnly = false,
  logLabel = "vite:dev",
} = {}) {
  const env = createEnv({ browserBridge });
  const options = {
    browserBridge,
    devUrl,
    entryModulePath,
    logLabel,
  };

  if (reuseExistingOnly) {
    await waitForExistingDevServer(devUrl, options);
    console.log(`[${logLabel}] 复用已存在的 Lime dev server: ${devUrl}`);
    await waitForExitSignal();
    return;
  }

  const existingServer = await probeExistingDevServer(devUrl, options);

  if (existingServer.reachable) {
    if (!existingServer.isLimeDevShell) {
      const statusLabel = `${existingServer.status} ${existingServer.statusText}`.trim();
      throw new Error(
        `[${logLabel}] ${devUrl} 已被其他服务占用，且返回内容不是 Lime dev shell（${statusLabel}）。请先关闭占用进程后重试。`,
      );
    }

    if (
      !existingServer.isEntryModuleReady ||
      !existingServer.areOptimizedDepsReady ||
      !existingServer.isRuntimeModeReady
    ) {
      await waitForExistingDevServer(devUrl, options);
    }

    console.log(
      `[${logLabel}] 复用已存在的 Lime dev server: ${devUrl}（入口模块与优化依赖均已就绪）`,
    );
    await waitForExitSignal();
    return;
  }

  console.log(`[${logLabel}] 先执行 vite optimize，避免 Tauri 抢跑到半就绪 dev server。`);
  await runCommand("npx", ["vite", "optimize"], env, logLabel);
  startVite(env);
  await waitForExitSignal();
}
