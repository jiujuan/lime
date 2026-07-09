#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_MANIFEST_PATH = "internal/test/benchmark-release.manifest.json";
const PRIORITIES = new Set(["P0", "P1", "P2"]);

function parseArgs(argv) {
  const result = {
    check: false,
    format: "markdown",
    help: false,
    manifestPath: DEFAULT_MANIFEST_PATH,
    outputPath: "",
    releaseGate: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      result.check = true;
      continue;
    }
    if (arg === "--release-gate") {
      result.releaseGate = true;
      continue;
    }
    if (arg === "--format" && argv[index + 1]) {
      result.format = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--manifest" && argv[index + 1]) {
      result.manifestPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--output" && argv[index + 1]) {
      result.outputPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    }
  }

  if (!["json", "markdown"].includes(result.format)) {
    throw new Error("--format 只支持 json 或 markdown");
  }

  return result;
}

function printHelp() {
  console.log(`
Lime Benchmark Release Manifest Check

用法:
  npm run agent-qc:benchmark-release:check
  node scripts/agent-qc/benchmark-release-check.mjs --format markdown
  node scripts/agent-qc/benchmark-release-check.mjs --release-gate --check

选项:
  --manifest PATH   release benchmark manifest，默认 ${DEFAULT_MANIFEST_PATH}
  --format FMT      输出格式：markdown | json
  --output PATH     写入文件；默认 stdout
  --check           manifest 结构不合法时非 0 退出
  --release-gate    同时把 release blocker 作为失败条件
  -h, --help        显示帮助
`);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeOutput(outputPath, content) {
  if (!outputPath) {
    process.stdout.write(content);
    return;
  }

  const resolvedOutputPath = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, content, "utf8");
}

function isDirectory(targetPath) {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function readGitHead(repoPath) {
  if (!isDirectory(path.join(repoPath, ".git"))) {
    return null;
  }

  try {
    return execFileSync("git", ["-C", repoPath, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function npmScriptName(command) {
  const match = String(command).match(/^npm\s+run\s+([^\s]+)(?:\s|$)/);
  return match ? match[1] : "";
}

function uniqueIds(items, kind, issues) {
  const seen = new Set();
  for (const item of items) {
    if (!item?.id) {
      issues.push(`${kind} 缺少 id`);
      continue;
    }
    if (seen.has(item.id)) {
      issues.push(`${kind} id 重复：${item.id}`);
    }
    seen.add(item.id);
  }
}

function validateDownloadedSources({ rootDir, manifest, issues, warnings }) {
  const localCacheRoot = manifest.localCacheRoot || "";
  const sources = Array.isArray(manifest.downloadedSources)
    ? manifest.downloadedSources
    : [];

  if (sources.length === 0) {
    issues.push("downloadedSources 不能为空");
  }
  uniqueIds(sources, "downloadedSources", issues);

  return sources.map((source) => {
    const sourceIssues = [];
    const sourceWarnings = [];
    const resolvedPath = source.localPath
      ? path.resolve(rootDir, source.localPath)
      : "";
    const exists = Boolean(resolvedPath && isDirectory(resolvedPath));
    const gitHead = exists ? readGitHead(resolvedPath) : null;
    const commitMatches =
      Boolean(source.commit && gitHead) && gitHead === source.commit;

    if (!source.id) {
      sourceIssues.push("id 不能为空");
    }
    if (!PRIORITIES.has(source.priority)) {
      sourceIssues.push("priority 必须是 P0 / P1 / P2");
    }
    if (!source.sourceUrl) {
      sourceIssues.push("sourceUrl 不能为空");
    }
    if (!source.localPath) {
      sourceIssues.push("localPath 不能为空");
    }
    if (!source.commit) {
      sourceIssues.push("commit 不能为空");
    }
    if (source.localPath && localCacheRoot) {
      const normalizedLocalPath = source.localPath.replaceAll("\\", "/");
      const normalizedCacheRoot = localCacheRoot.replaceAll("\\", "/");
      if (!normalizedLocalPath.startsWith(`${normalizedCacheRoot}/`)) {
        sourceWarnings.push(
          `localPath 不在 localCacheRoot 下：${source.localPath}`,
        );
      }
    }
    if (!exists) {
      sourceIssues.push(`localPath 不存在：${source.localPath || "(empty)"}`);
    } else if (!gitHead) {
      sourceWarnings.push("本地目录没有可读取的 .git/HEAD，无法校验 commit");
    } else if (!commitMatches) {
      sourceIssues.push(
        `本地 HEAD 与 manifest commit 不一致：${gitHead} != ${source.commit}`,
      );
    }

    for (const issue of sourceIssues) {
      issues.push(`${source.id || "downloadedSource"}: ${issue}`);
    }
    for (const warning of sourceWarnings) {
      warnings.push(`${source.id || "downloadedSource"}: ${warning}`);
    }

    return {
      id: source.id || "",
      priority: source.priority || "",
      sourceUrl: source.sourceUrl || "",
      localPath: source.localPath || "",
      commit: source.commit || "",
      gitHead,
      exists,
      commitMatches,
      valid: sourceIssues.length === 0,
      issues: sourceIssues,
      warnings: sourceWarnings,
    };
  });
}

function validateSuite({
  rootDir,
  suite,
  sourceIds,
  packageScripts,
  issues,
  releaseBlockers,
}) {
  const suiteIssues = [];
  const missingTasks = [];
  const taskSet = Array.isArray(suite.taskSet) ? suite.taskSet : [];
  const commands = Array.isArray(suite.commands) ? suite.commands : [];
  const evidenceRequired = Array.isArray(suite.evidenceRequired)
    ? suite.evidenceRequired
    : [];
  const externalRunner = suite.runner && suite.runner !== "npm";

  if (!suite.id) {
    suiteIssues.push("id 不能为空");
  }
  if (!PRIORITIES.has(suite.priority)) {
    suiteIssues.push("priority 必须是 P0 / P1 / P2");
  }
  if (!suite.runner) {
    suiteIssues.push("runner 不能为空");
  }
  if (
    (suite.priority === "P0" ||
      suite.priority === "P1" ||
      suite.requiredForRelease) &&
    evidenceRequired.length === 0
  ) {
    suiteIssues.push("P0 / P1 / release suite 必须声明 evidenceRequired");
  }

  if (suite.runner === "npm") {
    if (commands.length === 0) {
      suiteIssues.push("npm runner 必须声明 commands");
    }
    for (const command of commands) {
      const scriptName = npmScriptName(command);
      if (scriptName && !packageScripts.has(scriptName)) {
        suiteIssues.push(`package.json 缺少 npm script：${scriptName}`);
      }
    }
  }

  if (externalRunner) {
    if (!suite.sourceRef) {
      suiteIssues.push("外部 runner 必须声明 sourceRef");
    } else if (!sourceIds.has(suite.sourceRef)) {
      suiteIssues.push(`sourceRef 不存在：${suite.sourceRef}`);
    }
    if (!suite.adapterStatus) {
      suiteIssues.push("外部 runner 必须声明 adapterStatus");
    } else if (suite.requiredForRelease && suite.adapterStatus !== "ready") {
      releaseBlockers.push(
        `${suite.id}: adapterStatus=${suite.adapterStatus}，尚不能作为 release gate 运行`,
      );
    }
  }

  if (suite.taskRoot) {
    const resolvedTaskRoot = path.resolve(rootDir, suite.taskRoot);
    if (!isDirectory(resolvedTaskRoot)) {
      suiteIssues.push(`taskRoot 不存在：${suite.taskRoot}`);
    }
    if (taskSet.length === 0) {
      suiteIssues.push("声明 taskRoot 时 taskSet 不能为空");
    }
    for (const taskId of taskSet) {
      const taskPath = path.join(resolvedTaskRoot, taskId);
      if (!isDirectory(taskPath)) {
        missingTasks.push(taskId);
      }
    }
    if (missingTasks.length > 0) {
      suiteIssues.push(`taskSet 中任务目录不存在：${missingTasks.join(", ")}`);
    }
  }

  for (const issue of suiteIssues) {
    issues.push(`${suite.id || "suite"}: ${issue}`);
  }

  return {
    id: suite.id || "",
    priority: suite.priority || "",
    runner: suite.runner || "",
    requiredForRelease: Boolean(suite.requiredForRelease),
    sourceRef: suite.sourceRef || "",
    taskRoot: suite.taskRoot || "",
    taskCount: taskSet.length,
    missingTasks,
    commands,
    evidenceCount: evidenceRequired.length,
    adapterStatus: suite.adapterStatus || "",
    status: suite.status || "",
    valid: suiteIssues.length === 0,
    issues: suiteIssues,
  };
}

function validateSuites({
  rootDir,
  manifest,
  sourceIds,
  packageScripts,
  issues,
  releaseBlockers,
}) {
  const suites = Array.isArray(manifest.suites) ? manifest.suites : [];
  if (suites.length === 0) {
    issues.push("suites 不能为空");
  }
  uniqueIds(suites, "suites", issues);

  const suiteReports = suites.map((suite) =>
    validateSuite({
      rootDir,
      suite,
      sourceIds,
      packageScripts,
      issues,
      releaseBlockers,
    }),
  );

  const suiteIds = new Set(suiteReports.map((suite) => suite.id));
  const requiredSuiteIds = Array.isArray(
    manifest.releasePolicy?.releaseVerdictRequires,
  )
    ? manifest.releasePolicy.releaseVerdictRequires
    : [];
  for (const suiteId of requiredSuiteIds) {
    if (!suiteIds.has(suiteId)) {
      issues.push(`releasePolicy.releaseVerdictRequires 引用了未知 suite：${suiteId}`);
    }
  }

  if (manifest.releasePolicy?.p0Required) {
    const hasRequiredP0 = suiteReports.some(
      (suite) => suite.priority === "P0" && suite.requiredForRelease,
    );
    if (!hasRequiredP0) {
      issues.push("releasePolicy.p0Required=true 但没有 requiredForRelease P0 suite");
    }
  }

  return suiteReports;
}

function validateRadarBacklog({ manifest, sourceIds, issues }) {
  const backlog = Array.isArray(manifest.radarBacklog)
    ? manifest.radarBacklog
    : [];
  uniqueIds(backlog, "radarBacklog", issues);

  return backlog.map((item) => {
    const itemIssues = [];
    if (!item.id) {
      itemIssues.push("id 不能为空");
    }
    if (!PRIORITIES.has(item.priority)) {
      itemIssues.push("priority 必须是 P0 / P1 / P2");
    }
    if (item.sourceRef && !sourceIds.has(item.sourceRef)) {
      itemIssues.push(`sourceRef 不存在：${item.sourceRef}`);
    }
    if (item.adapterRef && !sourceIds.has(item.adapterRef)) {
      itemIssues.push(`adapterRef 不存在：${item.adapterRef}`);
    }

    for (const issue of itemIssues) {
      issues.push(`${item.id || "radarBacklog"}: ${issue}`);
    }

    return {
      id: item.id || "",
      priority: item.priority || "",
      sourceRef: item.sourceRef || "",
      adapterRef: item.adapterRef || "",
      status: item.status || "",
      valid: itemIssues.length === 0,
      issues: itemIssues,
    };
  });
}

function createReport({ rootDir, manifestPath }) {
  const resolvedManifestPath = path.resolve(rootDir, manifestPath);
  const manifest = readJsonFile(resolvedManifestPath);
  const packageJson = readJsonFile(path.resolve(rootDir, "package.json"));
  const packageScripts = new Set(Object.keys(packageJson.scripts || {}));
  const issues = [];
  const warnings = [];
  const releaseBlockers = [];

  if (manifest.schemaVersion !== "benchmark-release-v1") {
    issues.push("schemaVersion 必须是 benchmark-release-v1");
  }
  if (!manifest.datasetVersion) {
    issues.push("datasetVersion 不能为空");
  }
  if (!manifest.localCacheRoot) {
    issues.push("localCacheRoot 不能为空");
  }
  if (!manifest.releasePolicy) {
    issues.push("releasePolicy 不能为空");
  }

  const downloadedSources = validateDownloadedSources({
    rootDir,
    manifest,
    issues,
    warnings,
  });
  const sourceIds = new Set(downloadedSources.map((source) => source.id));
  const suites = validateSuites({
    rootDir,
    manifest,
    sourceIds,
    packageScripts,
    issues,
    releaseBlockers,
  });
  const radarBacklog = validateRadarBacklog({
    manifest,
    sourceIds,
    issues,
  });

  return {
    valid: issues.length === 0,
    releaseReady: issues.length === 0 && releaseBlockers.length === 0,
    generatedAt: new Date().toISOString(),
    manifestPath,
    datasetVersion: manifest.datasetVersion || "",
    localCacheRoot: manifest.localCacheRoot || "",
    releasePolicy: manifest.releasePolicy || null,
    summary: {
      downloadedSourceCount: downloadedSources.length,
      suiteCount: suites.length,
      radarBacklogCount: radarBacklog.length,
      releaseBlockerCount: releaseBlockers.length,
      warningCount: warnings.length,
      issueCount: issues.length,
    },
    downloadedSources,
    suites,
    radarBacklog,
    issues,
    warnings,
    releaseBlockers,
  };
}

function renderList(title, items) {
  if (items.length === 0) {
    return [`## ${title}`, "", "- 无", ""];
  }
  return [`## ${title}`, "", ...items.map((item) => `- ${item}`), ""];
}

function renderMarkdown(report) {
  const lines = [
    "# Benchmark Release Manifest Check",
    "",
    `- valid: ${report.valid ? "yes" : "no"}`,
    `- releaseReady: ${report.releaseReady ? "yes" : "no"}`,
    `- manifest: ${report.manifestPath}`,
    `- datasetVersion: ${report.datasetVersion}`,
    `- generatedAt: ${report.generatedAt}`,
    "",
    "## Downloaded Sources",
    "",
    "| Source | Priority | Exists | Commit | HEAD |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const source of report.downloadedSources) {
    lines.push(
      `| ${source.id} | ${source.priority} | ${source.exists ? "yes" : "no"} | ${source.commitMatches ? "match" : "mismatch"} | ${source.gitHead || "-"} |`,
    );
  }

  lines.push(
    "",
    "## Suites",
    "",
    "| Suite | Priority | Runner | Required | Tasks | Evidence | Adapter | Valid |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  );

  for (const suite of report.suites) {
    const taskState =
      suite.taskCount === 0
        ? "-"
        : `${suite.taskCount - suite.missingTasks.length}/${suite.taskCount}`;
    lines.push(
      `| ${suite.id} | ${suite.priority} | ${suite.runner} | ${suite.requiredForRelease ? "yes" : "no"} | ${taskState} | ${suite.evidenceCount} | ${suite.adapterStatus || "-"} | ${suite.valid ? "yes" : "no"} |`,
    );
  }

  lines.push(
    "",
    "## Radar Backlog",
    "",
    "| Item | Priority | Source | Adapter | Status | Valid |",
    "| --- | --- | --- | --- | --- | --- |",
  );

  for (const item of report.radarBacklog) {
    lines.push(
      `| ${item.id} | ${item.priority} | ${item.sourceRef || "-"} | ${item.adapterRef || "-"} | ${item.status || "-"} | ${item.valid ? "yes" : "no"} |`,
    );
  }

  lines.push(
    "",
    ...renderList("Issues", report.issues),
    ...renderList("Warnings", report.warnings),
    ...renderList("Release Blockers", report.releaseBlockers),
  );

  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const report = createReport({
    rootDir: process.cwd(),
    manifestPath: options.manifestPath,
  });
  const content =
    options.format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderMarkdown(report);

  writeOutput(options.outputPath, content);

  if (options.check && !report.valid) {
    process.exit(1);
  }
  if (options.releaseGate && !report.releaseReady) {
    process.exit(1);
  }
}

main();
