#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

const DEFAULTS = {
  healthUrl: "http://127.0.0.1:3030/health",
  invokeUrl: "http://127.0.0.1:3030/invoke",
  timeoutMs: 60_000,
  intervalMs: 1_000,
  sampleProjectName: "Lime Smoke Workspace",
};

function printHelp() {
  console.log(`
Lime Workspace Ready Smoke

用途:
  验证 DevBridge 已就绪，并检查默认 workspace 可获取、可修复、可按路径回查。

用法:
  node scripts/workspace-ready-smoke.mjs [选项]

选项:
  --health-url <url>         健康检查地址，默认 http://127.0.0.1:3030/health
  --invoke-url <url>         DevBridge invoke 地址，默认 http://127.0.0.1:3030/invoke
  --timeout-ms <ms>          等待健康检查超时，默认 60000
  --interval-ms <ms>         健康检查轮询间隔，默认 1000
  --sample-project-name <s>  用于校验目录解析的示例项目名
  -h, --help                 显示帮助

示例:
  npm run smoke:workspace-ready
  npm run smoke:workspace-ready -- --timeout-ms 120000
`);
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--health-url" && argv[index + 1]) {
      options.healthUrl = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--invoke-url" && argv[index + 1]) {
      options.invokeUrl = String(argv[index + 1]).trim();
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
    if (arg === "--sample-project-name" && argv[index + 1]) {
      options.sampleProjectName = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1000) {
    throw new Error("--timeout-ms 必须是 >= 1000 的数字");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms 必须是 >= 100 的数字");
  }
  if (!options.sampleProjectName) {
    throw new Error("--sample-project-name 不能为空");
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

function normalizePath(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
}

function pickStringField(target, ...keys) {
  if (!target || typeof target !== "object") {
    return "";
  }

  for (const key of keys) {
    const value = target[key];
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
      console.log(
        `[smoke:workspace-ready] DevBridge 已就绪 (${Date.now() - startedAt}ms)${
          payload?.status ? ` status=${payload.status}` : ""
        }`,
      );
      return payload;
    } catch (error) {
      lastError = error;
      await sleep(options.intervalMs);
    }
  }

  const detail =
    lastError instanceof Error
      ? lastError.message
      : String(lastError || "unknown error");
  throw new Error(
    `[smoke:workspace-ready] DevBridge 未就绪，请先启动 npm run electron:dev。最后错误: ${detail}`,
  );
}

async function invoke(invokeUrl, cmd, args) {
  const response = await fetch(invokeUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ cmd, args }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const payload = await response.json();
  if (payload?.error) {
    throw new Error(String(payload.error));
  }

  return payload?.result;
}

function assertWorkspaceShape(project, label) {
  assert(project && typeof project === "object", `${label} 返回为空`);
  assert(
    typeof project.id === "string" && project.id.trim(),
    `${label} 缺少 id`,
  );
  assert(
    pickStringField(project, "rootPath", "root_path"),
    `${label} 缺少 rootPath`,
  );
}

async function main() {
  if (typeof fetch !== "function") {
    throw new Error("当前 Node 运行时不支持 fetch，请使用 Node 18+");
  }

  const options = parseArgs(process.argv.slice(2));
  await waitForHealth(options);

  const projectsRoot = await invoke(
    options.invokeUrl,
    "workspace_get_projects_root",
  );
  assert(
    typeof projectsRoot === "string" && projectsRoot.trim(),
    "workspace_get_projects_root 返回为空",
  );

  const resolvedSamplePath = await invoke(
    options.invokeUrl,
    "workspace_resolve_project_path",
    {
      name: options.sampleProjectName,
    },
  );
  assert(
    typeof resolvedSamplePath === "string" && resolvedSamplePath.trim(),
    "workspace_resolve_project_path 返回为空",
  );

  const normalizedProjectsRoot = normalizePath(path.resolve(projectsRoot));
  const normalizedResolvedSamplePath = normalizePath(
    path.resolve(resolvedSamplePath),
  );
  assert(
    normalizedResolvedSamplePath.startsWith(`${normalizedProjectsRoot}/`) ||
      normalizedResolvedSamplePath === normalizedProjectsRoot,
    `解析后的项目目录未落在 workspace 根目录下: ${resolvedSamplePath}`,
  );

  const defaultProject = await invoke(
    options.invokeUrl,
    "get_or_create_default_project",
  );
  assertWorkspaceShape(defaultProject, "get_or_create_default_project");

  const defaultProjectDetail = await invoke(
    options.invokeUrl,
    "workspace_get",
    {
      id: defaultProject.id,
    },
  );
  assertWorkspaceShape(defaultProjectDetail, "workspace_get");

  const defaultProjectFromDefault = await invoke(
    options.invokeUrl,
    "workspace_get_default",
  );
  assertWorkspaceShape(defaultProjectFromDefault, "workspace_get_default");
  assert(
    defaultProjectFromDefault.id === defaultProject.id,
    "workspace_get_default 与 get_or_create_default_project 返回的默认 workspace 不一致",
  );

  const ensureDefault = await invoke(
    options.invokeUrl,
    "workspace_ensure_default_ready",
  );
  assert(
    ensureDefault && typeof ensureDefault === "object",
    "默认 workspace 健康检查返回为空",
  );
  assert(
    pickStringField(ensureDefault, "workspaceId", "workspace_id") ===
      defaultProject.id,
    "workspace_ensure_default_ready 返回的 workspace_id 不匹配",
  );
  assert(
    pickStringField(ensureDefault, "rootPath", "root_path"),
    "workspace_ensure_default_ready 缺少 rootPath",
  );

  const ensureExplicit = await invoke(
    options.invokeUrl,
    "workspace_ensure_ready",
    {
      id: defaultProject.id,
    },
  );
  assert(
    ensureExplicit && typeof ensureExplicit === "object",
    "workspace_ensure_ready 返回为空",
  );
  assert(
    pickStringField(ensureExplicit, "workspaceId", "workspace_id") ===
      defaultProject.id,
    "workspace_ensure_ready 返回的 workspace_id 不匹配",
  );

  const ensuredRootPath = pickStringField(
    ensureExplicit,
    "rootPath",
    "root_path",
  );
  assert(ensuredRootPath, "workspace_ensure_ready 缺少 rootPath");

  const workspaceByPath = await invoke(
    options.invokeUrl,
    "workspace_get_by_path",
    {
      rootPath: ensuredRootPath,
    },
  );
  assertWorkspaceShape(workspaceByPath, "workspace_get_by_path");
  assert(
    workspaceByPath.id === defaultProject.id,
    "workspace_get_by_path 未返回默认 workspace",
  );

  const workspaces = await invoke(options.invokeUrl, "workspace_list");
  assert(Array.isArray(workspaces), "workspace_list 返回非数组");
  assert(
    workspaces.some((item) => item?.id === defaultProject.id),
    "workspace_list 中未找到默认 workspace",
  );

  console.log("\n[smoke:workspace-ready] 通过");
  console.log(
    JSON.stringify(
      {
        projectsRoot,
        sampleProjectPath: resolvedSamplePath,
        defaultWorkspaceId: defaultProject.id,
        defaultWorkspaceRoot: ensuredRootPath,
        workspaceCount: workspaces.length,
        repaired: Boolean(ensureExplicit.repaired),
        relocated: Boolean(ensureExplicit.relocated),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : String(error || "unknown error"),
  );
  process.exit(1);
});
