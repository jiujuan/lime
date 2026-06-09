#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { buildReadonlyHttpApiGeneratedFiles } from "./lib/readonly-http-api-draft-template.mjs";
import {
  findWorkspaceRegisteredSkill,
  findWorkspaceSkillBinding,
  workspaceSkillDirectoryFromName,
  writeWorkspaceSkillFixture,
} from "./lib/workspace-skill-fixture.mjs";

const DEFAULTS = {
  healthUrl: "http://127.0.0.1:3030/health",
  invokeUrl: "http://127.0.0.1:3030/invoke",
  timeoutMs: 120_000,
  intervalMs: 1_000,
  workspaceRoot: "",
  cleanup: false,
  json: false,
};
const RETIRED_AUTHORING_COMMANDS = [
  ["capability", "draft", "create"].join("_"),
  ["capability", "draft", "verify"].join("_"),
];
const CAPABILITY_DRAFT_BOUNDARY = {
  registrationSurface: "direct-workspace-skill-fixture",
  retiredCommandSurface: RETIRED_AUTHORING_COMMANDS.join("|"),
  classification: "dead/guard-only",
  currentReadMethods: [
    "workspaceRegisteredSkills/list",
    "workspaceSkillBindings/list",
  ],
  exitCondition:
    "do not restore retired authoring commands; keep smoke evidence on App Server current read methods",
};

function printHelp() {
  console.log(`
Read-Only HTTP API Current Smoke

用途:
  验证只读 HTTP API 技能模板仍保持离线 fixture / expected output / session policy gate，
  并通过 App Server workspaceRegisteredSkills/list 与 workspaceSkillBindings/list current 读链发现临时 workspace skill。

用法:
  node scripts/readonly-http-api-smoke.mjs [选项]

选项:
  --health-url <url>     DevBridge 健康检查地址，默认 http://127.0.0.1:3030/health
  --invoke-url <url>     DevBridge invoke 地址，默认 http://127.0.0.1:3030/invoke
  --timeout-ms <ms>      等待 DevBridge 超时，默认 120000
  --interval-ms <ms>     轮询间隔，默认 1000
  --workspace-root <dir> 指定 smoke workspace；默认创建临时目录
  --cleanup              成功或失败后删除本脚本创建的临时 workspace
  --json                 只输出 JSON summary
  -h, --help             显示帮助
`);
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--health-url" && argv[index + 1]) {
      options.healthUrl = String(argv[++index]).trim();
      continue;
    }
    if (arg === "--invoke-url" && argv[index + 1]) {
      options.invokeUrl = String(argv[++index]).trim();
      continue;
    }
    if (arg === "--timeout-ms" && argv[index + 1]) {
      options.timeoutMs = Number(argv[++index]);
      continue;
    }
    if (arg === "--interval-ms" && argv[index + 1]) {
      options.intervalMs = Number(argv[++index]);
      continue;
    }
    if (arg === "--workspace-root" && argv[index + 1]) {
      options.workspaceRoot = path.resolve(String(argv[++index]).trim());
      continue;
    }
    if (arg === "--cleanup") {
      options.cleanup = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`未知参数: ${arg}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1_000) {
    throw new Error("--timeout-ms 必须是 >= 1000 的数字");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms 必须是 >= 100 的数字");
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

function pickString(target, ...keys) {
  for (const key of keys) {
    const value = target?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

async function checkHealth(url) {
  const response = await fetch(url, { method: "GET" });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return text ? JSON.parse(text) : null;
}

async function waitForHealth(options) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    try {
      const payload = await checkHealth(options.healthUrl);
      if (!options.json) {
        console.log(
          `[readonly-http-api:p6-smoke] DevBridge 已就绪 (${Date.now() - startedAt}ms)`,
        );
      }
      return payload;
    } catch (error) {
      lastError = error;
      await sleep(options.intervalMs);
    }
  }
  throw new Error(
    `DevBridge 未就绪，请先启动 npm run electron:dev。最后错误: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function invoke(invokeUrl, cmd, args = {}) {
  const response = await fetch(invokeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cmd, args }),
  });
  if (!response.ok) {
    throw new Error(`${cmd} HTTP ${response.status}: ${response.statusText}`);
  }
  const payload = await response.json();
  if (payload?.error) {
    throw new Error(`${cmd} failed: ${payload.error}`);
  }
  return payload?.result;
}

async function invokeAppServer(invokeUrl, method, params = {}) {
  const response = await invoke(invokeUrl, "app_server_handle_json_lines", {
    request: {
      lines: [
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params,
        }),
      ],
    },
  });
  const responseLines = response?.result?.lines ?? response?.lines;
  const lines = Array.isArray(responseLines) ? responseLines : [];
  for (const line of lines) {
    const text = typeof line === "string" ? line.trim() : "";
    if (!text) {
      continue;
    }
    const message = JSON.parse(text);
    if (message?.id !== 1) {
      continue;
    }
    if (message.error) {
      throw new Error(`${method} failed: ${JSON.stringify(message.error)}`);
    }
    return message.result;
  }
  throw new Error(`${method} did not return a JSON-RPC response`);
}

async function prepareWorkspace(options) {
  if (options.workspaceRoot) {
    await fs.mkdir(options.workspaceRoot, { recursive: true });
    return { workspaceRoot: options.workspaceRoot, createdTemp: false };
  }
  const workspaceRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "lime-readonly-http-api-p6-"),
  );
  return { workspaceRoot, createdTemp: true };
}

function fileContentByPath(files) {
  return new Map(
    files.map((file) => [file.relativePath, String(file.content ?? "")]),
  );
}

function assertReadonlyTemplateGate() {
  const positiveFiles = buildReadonlyHttpApiGeneratedFiles();
  const positive = fileContentByPath(positiveFiles);
  assert(positive.has("SKILL.md"), "只读 HTTP API 模板缺少 SKILL.md");
  assert(positive.has("tests/fixture.json"), "只读 HTTP API 模板缺少 fixture");
  assert(
    positive.has("tests/expected-output.json"),
    "只读 HTTP API 模板缺少 expected output",
  );
  assert(
    positive.has("policy/readonly-http-session.json"),
    "只读 HTTP API 模板缺少 session authorization policy",
  );
  const dryRun = positive.get("scripts/dry-run.mjs") || "";
  assert(
    dryRun.includes("tests/expected-output.json"),
    "dry-run 未绑定 expected output",
  );
  assert(!dryRun.includes("fetch("), "默认 dry-run 不应发真实网络请求");
  assert(!dryRun.includes("https://"), "默认 dry-run 不应包含真实 endpoint");

  const negativeChecks = [
    [
      "missingFixture",
      () => buildReadonlyHttpApiGeneratedFiles({ includeFixture: false }),
      (files) => !files.some((file) => file.relativePath === "tests/fixture.json"),
    ],
    [
      "missingExpectedOutput",
      () => buildReadonlyHttpApiGeneratedFiles({ includeExpectedOutput: false }),
      (files) =>
        !files.some((file) => file.relativePath === "tests/expected-output.json"),
    ],
    [
      "missingFixtureInput",
      () => buildReadonlyHttpApiGeneratedFiles({ includeFixtureInput: false }),
      (files) =>
        !(fileContentByPath(files).get("contract/input.schema.json") || "").includes(
          "fixture_path",
        ),
    ],
    [
      "missingDryRunEntry",
      () => buildReadonlyHttpApiGeneratedFiles({ includeDryRunEntry: false }),
      (files) => !files.some((file) => file.relativePath === "scripts/dry-run.mjs"),
    ],
    [
      "missingDryRunExpectedOutputBinding",
      () =>
        buildReadonlyHttpApiGeneratedFiles({
          includeDryRunExpectedOutputBinding: false,
        }),
      (files) =>
        !(fileContentByPath(files).get("scripts/dry-run.mjs") || "").includes(
          "tests/expected-output.json",
        ),
    ],
    [
      "networkedDryRun",
      () => buildReadonlyHttpApiGeneratedFiles({ includeNetworkedDryRun: true }),
      (files) =>
        (fileContentByPath(files).get("scripts/dry-run.mjs") || "").includes(
          "fetch(",
        ),
    ],
    [
      "credentialHeader",
      () => buildReadonlyHttpApiGeneratedFiles({ includeCredentialHeader: true }),
      (files) =>
        (fileContentByPath(files).get("scripts/client.ts") || "").includes(
          "Authorization",
        ),
    ],
  ];

  const negativeResults = {};
  for (const [key, buildFiles, predicate] of negativeChecks) {
    const files = buildFiles();
    negativeResults[key] = Boolean(predicate(files));
    assert(negativeResults[key], `只读 HTTP API 负向模板 gate 未命中: ${key}`);
  }

  return {
    positiveFilePaths: positiveFiles.map((file) => file.relativePath),
    dryRunOffline: !dryRun.includes("fetch(") && !dryRun.includes("https://"),
    dryRunBindsExpectedOutput: dryRun.includes("tests/expected-output.json"),
    negativeResults,
  };
}

function buildReadonlyHttpApiRegistration(fileCount) {
  const timestamp = new Date().toISOString();
  return {
    registrationId: `smoke-capreg-readonly-http-api-${Date.now()}`,
    registeredAt: timestamp,
    sourceDraftId: "smoke-capdraft-readonly-http-api-fixture",
    sourceVerificationReportId: "smoke-capver-readonly-http-api-fixture",
    generatedFileCount: fileCount,
    permissionSummary: [
      "Level 0 只读发现",
      "允许只读 HTTP API GET 请求，不做外部写操作",
    ],
    source: "readonly_http_api_smoke_fixture",
  };
}

async function runSmoke(options) {
  await waitForHealth(options);
  const workspace = await prepareWorkspace(options);
  const startedAt = new Date().toISOString();

  try {
    const templateGate = assertReadonlyTemplateGate();
    const skillName = "只读 HTTP API 每日报告";
    const skillDirectory = workspaceSkillDirectoryFromName(skillName);
    const generatedFiles = buildReadonlyHttpApiGeneratedFiles();
    const { registeredSkillDirectory, registration } =
      await writeWorkspaceSkillFixture({
        workspaceRoot: workspace.workspaceRoot,
        directory: skillDirectory,
        generatedFiles,
        registration: buildReadonlyHttpApiRegistration(generatedFiles.length),
      });

    const registeredSkillsResult = await invokeAppServer(
      options.invokeUrl,
      "workspaceRegisteredSkills/list",
      { workspaceRoot: workspace.workspaceRoot },
    );
    const registeredSkill = findWorkspaceRegisteredSkill(
      registeredSkillsResult,
      registeredSkillDirectory,
      skillName,
    );
    assert(
      registeredSkill,
      "registered discovery 未找到只读 HTTP API fixture skill",
    );

    const bindingSnapshot = await invokeAppServer(
      options.invokeUrl,
      "workspaceSkillBindings/list",
      {
        workspaceRoot: workspace.workspaceRoot,
        caller: "assistant",
        workbench: true,
        browserAssist: false,
      },
    );
    const binding = findWorkspaceSkillBinding(
      bindingSnapshot,
      registeredSkillDirectory,
      skillDirectory,
    );
    assert(binding, "runtime binding readiness 未找到只读 HTTP API fixture skill");
    assert(
      pickString(binding, "binding_status", "bindingStatus") ===
        "ready_for_manual_enable",
      `binding 未 ready_for_manual_enable: ${pickString(binding, "binding_status", "bindingStatus")}`,
    );

    const summary = {
      status: "passed",
      startedAt,
      finishedAt: new Date().toISOString(),
      workspaceRoot: workspace.workspaceRoot,
      sourceDraftId: pickString(registration, "sourceDraftId"),
      verificationStatus: "retired_authoring_not_invoked",
      verificationReportId: pickString(
        registration,
        "sourceVerificationReportId",
      ),
      templateGate,
      registeredSkillDirectory,
      registeredSkillName: pickString(registeredSkill, "name"),
      bindingStatus: pickString(binding, "binding_status", "bindingStatus"),
      nextGate: pickString(binding, "next_gate", "nextGate"),
      capabilityDraftBoundary: CAPABILITY_DRAFT_BOUNDARY,
      cleanup: options.cleanup && workspace.createdTemp,
    };

    if (options.cleanup && workspace.createdTemp) {
      await fs.rm(workspace.workspaceRoot, { recursive: true, force: true });
    }
    return summary;
  } catch (error) {
    error.workspaceRoot = workspace.workspaceRoot;
    if (options.cleanup && workspace.createdTemp) {
      await fs.rm(workspace.workspaceRoot, { recursive: true, force: true });
    }
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  try {
    const summary = await runSmoke(options);
    if (options.json) {
      console.log(JSON.stringify(summary));
    } else {
      console.log("[readonly-http-api:p6-smoke] 通过");
      console.log(JSON.stringify(summary, null, 2));
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[readonly-http-api:p6-smoke] 失败: ${detail}`);
    if (error?.workspaceRoot) {
      console.error(`[readonly-http-api:p6-smoke] workspaceRoot: ${error.workspaceRoot}`);
    }
    process.exit(1);
  }
}

await main();
