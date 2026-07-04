import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

export const LOG_PREFIX = "[smoke:claw-image-live]";

export const DEFAULTS = {
  appUrl: "",
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "live-image-command",
  ),
  prefix: `live-image-command-${Date.now()}`,
  timeoutMs: 300_000,
  intervalMs: 1_000,
  prompt: "",
  providerPreference:
    process.env.LIME_IMAGE_LIVE_PROVIDER ||
    process.env.LIME_E2E_IMAGE_PROVIDER ||
    "agnes",
  modelPreference:
    process.env.LIME_IMAGE_LIVE_MODEL ||
    process.env.LIME_E2E_IMAGE_MODEL ||
    "agnes-image-2.1-flash",
  textProviderPreference:
    process.env.LIME_AGENT_QC_PROVIDER ||
    process.env.LIME_E2E_PROVIDER ||
    process.env.LIME_DEFAULT_PROVIDER ||
    "",
  textModelPreference:
    process.env.LIME_AGENT_QC_MODEL ||
    process.env.LIME_E2E_MODEL ||
    process.env.LIME_DEFAULT_MODEL ||
    "",
  apiHost:
    process.env.LIME_IMAGE_LIVE_API_HOST ||
    process.env.LIME_E2E_IMAGE_API_HOST ||
    "https://apihub.agnes-ai.com/v1",
  apiKeyEnv: process.env.LIME_IMAGE_LIVE_API_KEY_ENV || "AGNES_API_KEY",
  setupAgnesFromEnv: false,
  keepTemp: false,
  allowLiveProvider: false,
};

export const IMAGE_WORKFLOW_KEY = "image_command_workflow";

export const INTERNAL_UI_MARKERS = [
  ".lime/tasks",
  ".lime/task-logs",
  "workflowRun",
  "workflow_run",
  "provider_id",
  "providerId",
  "request_metadata",
  "raw_transport_payload",
  "image_command_workflow",
  "mediaTaskArtifact/image/create",
  "draft-image-",
  "{task_id}",
  "Ribbi",
];

function printHelp() {
  console.log(`
Claw @配图 Live Smoke

用途:
  启动真实 Electron Desktop Host，通过 GUI 输入框发送 @配图，
  验证 Agent 普通对话流、ImageCommandWorkflow、真实图片任务 worker、
  workflow/read 审计投影、task JSONL 审计和普通 UI 隐私边界。

默认行为:
  默认 fail-closed，不调用真实 Provider。必须显式传 --allow-live-provider
  或设置 LIME_ALLOW_LIVE_PROVIDER_SMOKE=1 / LIME_REAL_API_TEST=1。

用法:
  npm run smoke:claw-image-live -- --allow-live-provider --setup-agnes-from-env

选项:
  --app-url <url>                 可选 renderer dev server，例如 http://127.0.0.1:1420/
  --evidence-dir <path>           证据目录
  --prefix <name>                 证据文件前缀
  --prompt <text>                 GUI 输入文本；默认生成带 live 时间戳的 @配图 prompt
  --timeout-ms <ms>               总超时，默认 300000
  --interval-ms <ms>              轮询间隔，默认 1000
  --provider-preference <id>      图片 provider id，默认 agnes
  --model-preference <model>      图片模型，默认 agnes-image-2.1-flash
  --text-provider-preference <id> 文本 provider id，用于 Agent 思考 / 引导
  --text-model-preference <model> 文本模型，用于 Agent 思考 / 引导
  --api-host <url>                --setup-agnes-from-env 使用的 OpenAI 兼容 Base URL
  --api-key-env <name>            --setup-agnes-from-env 读取的环境变量名，默认 AGNES_API_KEY
  --setup-agnes-from-env          从环境变量创建 / 更新 Agnes provider 与图片默认配置
  --allow-live-provider           允许真实 Provider 调用
  --keep-temp                     保留临时 HOME / App Server data 便于排查
  -h, --help                      显示帮助
`);
}

export function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--app-url" && next) {
      options.appUrl = next.trim();
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
      continue;
    }
    if (arg === "--prompt" && next) {
      options.prompt = next.trim();
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
    if (arg === "--provider-preference" && next) {
      options.providerPreference = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--model-preference" && next) {
      options.modelPreference = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--text-provider-preference" && next) {
      options.textProviderPreference = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--text-model-preference" && next) {
      options.textModelPreference = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--api-host" && next) {
      options.apiHost = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--api-key-env" && next) {
      options.apiKeyEnv = next.trim();
      index += 1;
      continue;
    }
    if (arg === "--setup-agnes-from-env") {
      options.setupAgnesFromEnv = true;
      continue;
    }
    if (arg === "--allow-live-provider") {
      options.allowLiveProvider = true;
      continue;
    }
    if (arg === "--keep-temp") {
      options.keepTemp = true;
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }

  options.allowLiveProvider =
    options.allowLiveProvider ||
    process.env.LIME_ALLOW_LIVE_PROVIDER_SMOKE === "1" ||
    process.env.LIME_REAL_API_TEST === "1";
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 60_000) {
    throw new Error("--timeout-ms 必须是 >= 60000 的数字");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms 必须是 >= 100 的数字");
  }
  if (!options.evidenceDir || !options.prefix) {
    throw new Error("--evidence-dir / --prefix 均不能为空");
  }
  if (!options.providerPreference || !options.modelPreference) {
    throw new Error("--provider-preference / --model-preference 均不能为空");
  }
  if (
    (!options.textProviderPreference && options.textModelPreference) ||
    (options.textProviderPreference && !options.textModelPreference)
  ) {
    throw new Error(
      "--text-provider-preference / --text-model-preference 必须同时提供，或同时留空以使用 UI 当前默认文本模型。",
    );
  }
  if (!options.allowLiveProvider) {
    throw new Error(
      "真实图片 smoke 默认关闭。请显式传 --allow-live-provider，或设置 LIME_ALLOW_LIVE_PROVIDER_SMOKE=1 / LIME_REAL_API_TEST=1。",
    );
  }
  if (options.setupAgnesFromEnv) {
    const apiKey = process.env[options.apiKeyEnv]?.trim();
    if (!apiKey) {
      throw new Error(
        `--setup-agnes-from-env 需要环境变量 ${options.apiKeyEnv}，不会从命令行参数读取或记录 API key。`,
      );
    }
  }
  return options;
}

export function createLiveRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-image-live-"));
  const home = path.join(tempRoot, "home");
  const xdgConfigHome = path.join(tempRoot, "xdg-config");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  const electronUserDataDir = path.join(tempRoot, "electron-user-data");
  const asterRoot = path.join(tempRoot, "aster");
  for (const dir of [
    home,
    xdgConfigHome,
    xdgDataHome,
    localAppData,
    roamingAppData,
    electronUserDataDir,
    asterRoot,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return {
    tempRoot,
    home,
    xdgConfigHome,
    electronUserDataDir,
    configPath: path.join(xdgConfigHome, "lime", "config.yaml"),
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: xdgConfigHome,
      XDG_DATA_HOME: xdgDataHome,
      APPDATA: roamingAppData,
      LOCALAPPDATA: localAppData,
      LIME_ASTER_ROOT: asterRoot,
    },
  };
}

export function defaultPrompt() {
  return [
    "@配图",
    "用 Agnes Image 2.1 Flash 画一张深圳夏天傍晚的真实摄影照片，街边绿树、高楼、海风和暖色夕阳，画面自然，不要文字",
    `live-${Date.now()}`,
  ].join(" ");
}

export function logStage(stage) {
  console.log(`${LOG_PREFIX} stage=${stage}`);
}
