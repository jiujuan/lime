#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_LIMIT_RUNS = 5000;
const DEFAULT_LIMIT_GROUPS = 24;

function parseArgs(argv) {
  const result = {
    dbPath: defaultLimeDbPath(),
    format: "markdown",
    help: false,
    limitGroups: DEFAULT_LIMIT_GROUPS,
    limitRuns: DEFAULT_LIMIT_RUNS,
    outputPath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--db" && argv[index + 1]) {
      result.dbPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--format" && argv[index + 1]) {
      result.format = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--limit-runs" && argv[index + 1]) {
      result.limitRuns = Number.parseInt(String(argv[index + 1]), 10);
      index += 1;
      continue;
    }
    if (arg === "--limit-groups" && argv[index + 1]) {
      result.limitGroups = Number.parseInt(String(argv[index + 1]), 10);
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

  return result;
}

function printHelp() {
  console.log(`
Lime AgentUI TTFT Sample Matrix

用法:
  node scripts/agentui-ttft-sample-matrix.mjs
  node scripts/agentui-ttft-sample-matrix.mjs --db "$HOME/Library/Application Support/lime/lime.db" --format markdown
  node scripts/agentui-ttft-sample-matrix.mjs --format json --output /tmp/agentui-ttft-sample-matrix.json

选项:
  --db PATH             Lime SQLite DB；默认按当前平台推导本机 lime.db
  --format FMT          markdown | json，默认 markdown
  --limit-runs N        最近 agent_runs 扫描上限，默认 ${DEFAULT_LIMIT_RUNS}
  --limit-groups N      Markdown 表格输出的 group 上限，默认 ${DEFAULT_LIMIT_GROUPS}
  --output PATH         写入文件；默认 stdout
  -h, --help            显示帮助

安全边界:
  只读取 agent_runs 的 id/status/duration/metadata 聚合字段；不输出用户 prompt、assistant 正文、error_message 或密钥。
`);
}

function defaultLimeDbPath() {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "lime", "lime.db");
  }
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(home, "AppData", "Roaming"),
      "lime",
      "lime.db",
    );
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(home, ".local", "share"), "lime", "lime.db");
}

function normalizePositiveInt(value, fallback) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function abbreviateHomePath(filePath) {
  const home = os.homedir();
  return filePath.startsWith(home) ? `~${filePath.slice(home.length)}` : filePath;
}

function sqliteJson(dbPath, sql) {
  let output = "";
  try {
    output = execFileSync("sqlite3", ["-readonly", "-json", dbPath, sql], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("sqlite3 CLI not found; install sqlite3 before exporting the TTFT sample matrix.");
    }
    throw error;
  }
  return output ? JSON.parse(output) : [];
}

function parseJsonObject(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function numberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function redactProvider(provider) {
  const normalized = stringValue(provider);
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith("custom-") && normalized.length > 19) {
    return `${normalized.slice(0, 15)}...`;
  }
  return normalized;
}

function parseRouting(metadata) {
  const requestMetadata = parseJsonObject(
    firstDefined(metadata.request_metadata, metadata.requestMetadata),
  );
  const limeRuntime = firstDefined(
    requestMetadata?.lime_runtime,
    requestMetadata?.limeRuntime,
    metadata.lime_runtime,
    metadata.limeRuntime,
  );
  const routingDecision = firstDefined(
    limeRuntime?.routing_decision,
    limeRuntime?.routingDecision,
    requestMetadata?.routing_decision,
    requestMetadata?.routingDecision,
    metadata.routing_decision,
    metadata.routingDecision,
  );
  const runtimeSummary = firstDefined(
    limeRuntime?.runtime_summary,
    limeRuntime?.runtimeSummary,
    requestMetadata?.runtime_summary,
    requestMetadata?.runtimeSummary,
    metadata.runtime_summary,
    metadata.runtimeSummary,
  );

  const selectedProvider = stringValue(
    firstDefined(
      routingDecision?.selectedProvider,
      routingDecision?.selected_provider,
      metadata.selected_provider,
      metadata.selectedProvider,
      metadata.provider,
    ),
  );
  const selectedModel = stringValue(
    firstDefined(
      routingDecision?.selectedModel,
      routingDecision?.selected_model,
      metadata.selected_model,
      metadata.selectedModel,
      metadata.model,
    ),
  );

  return {
    candidateCount: numberValue(
      firstDefined(
        routingDecision?.candidateCount,
        routingDecision?.candidate_count,
        runtimeSummary?.candidateCount,
        runtimeSummary?.candidate_count,
      ),
    ),
    decisionReason: stringValue(
      firstDefined(routingDecision?.decisionReason, routingDecision?.decision_reason),
    ),
    decisionSource: stringValue(
      firstDefined(
        routingDecision?.decisionSource,
        routingDecision?.decision_source,
        runtimeSummary?.decisionSource,
        runtimeSummary?.decision_source,
      ),
    ),
    fallbackChain: Array.isArray(routingDecision?.fallbackChain)
      ? routingDecision.fallbackChain
      : Array.isArray(routingDecision?.fallback_chain)
        ? routingDecision.fallback_chain
        : [],
    selectedModel,
    selectedProvider,
    serviceModelSlot: stringValue(
      firstDefined(routingDecision?.serviceModelSlot, routingDecision?.service_model_slot),
    ),
  };
}

function parseRun(row) {
  const metadata = parseJsonObject(row.metadata) || {};
  const routing = parseRouting(metadata);
  const provider = redactProvider(routing.selectedProvider) || "(unknown)";
  const model = routing.selectedModel || "(unknown)";
  const decisionSource = routing.decisionSource || "(unknown)";

  return {
    createdAt: row.created_at || null,
    decisionSource,
    durationMs: numberValue(row.duration_ms),
    firstTextMs: numberValue(
      firstDefined(metadata.model_first_text_delta_ms, metadata.modelFirstTextDeltaMs),
    ),
    firstThinkingMs: numberValue(
      firstDefined(metadata.model_first_thinking_delta_ms, metadata.modelFirstThinkingDeltaMs),
    ),
    firstVisibleMs: numberValue(
      firstDefined(metadata.model_first_visible_delta_ms, metadata.modelFirstVisibleDeltaMs),
    ),
    id: row.id,
    model,
    provider,
    routing,
    status: row.status || "(unknown)",
  };
}

function percentile(values, ratio) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function summarizeNumbers(values) {
  const numbers = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (numbers.length === 0) {
    return null;
  }
  const sum = numbers.reduce((total, value) => total + value, 0);
  return {
    avg: Math.round(sum / numbers.length),
    count: numbers.length,
    max: Math.max(...numbers),
    min: Math.min(...numbers),
    p50: percentile(numbers, 0.5),
  };
}

function formatStats(stats) {
  if (!stats) {
    return "n/a";
  }
  return `${stats.min}/${stats.p50}/${stats.avg}/${stats.max}ms`;
}

function markdownInlineCode(value) {
  return `\`${String(value).replaceAll("`", "'").replaceAll("|", "\\|")}\``;
}

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}

function buildGroupKey(run) {
  return `${run.decisionSource}\u0000${run.provider}\u0000${run.model}`;
}

function buildReport({ dbPath, generatedAt = new Date().toISOString(), limitRuns }) {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`DB not found: ${dbPath}`);
  }

  const safeLimit = normalizePositiveInt(limitRuns, DEFAULT_LIMIT_RUNS);
  const rows = sqliteJson(
    dbPath,
    `SELECT id, status, duration_ms, metadata, created_at
     FROM agent_runs
     WHERE metadata IS NOT NULL
     ORDER BY created_at DESC
     LIMIT ${safeLimit}`,
  );
  const runs = rows.map(parseRun);
  const groups = new Map();

  for (const run of runs) {
    const key = buildGroupKey(run);
    if (!groups.has(key)) {
      groups.set(key, {
        decisionSource: run.decisionSource,
        durationStats: null,
        firstTextStats: null,
        firstTextCount: 0,
        model: run.model,
        provider: run.provider,
        runs: [],
        statusCounts: {},
        withRoutingEvidence: 0,
      });
    }
    const group = groups.get(key);
    group.runs.push(run);
    group.statusCounts[run.status] = (group.statusCounts[run.status] || 0) + 1;
    if (run.firstTextMs !== null) {
      group.firstTextCount += 1;
    }
    if (run.routing.selectedProvider || run.routing.selectedModel || run.routing.decisionReason) {
      group.withRoutingEvidence += 1;
    }
  }

  const groupSummaries = [...groups.values()]
    .map((group) => {
      const runCount = group.runs.length;
      return {
        decisionSource: group.decisionSource,
        durationStats: summarizeNumbers(group.runs.map((run) => run.durationMs)),
        firstTextCount: group.firstTextCount,
        firstTextStats: summarizeNumbers(group.runs.map((run) => run.firstTextMs)),
        model: group.model,
        provider: group.provider,
        runCount,
        statusCounts: group.statusCounts,
        withRoutingEvidence: group.withRoutingEvidence,
      };
    })
    .sort((left, right) => {
      const firstTextDelta = right.firstTextCount - left.firstTextCount;
      if (firstTextDelta !== 0) {
        return firstTextDelta;
      }
      return right.runCount - left.runCount;
    });

  return {
    dbPath: abbreviateHomePath(dbPath),
    generatedAt,
    groups: groupSummaries,
    privacy: {
      exportedFields: [
        "provider/model",
        "decisionSource",
        "status counts",
        "duration stats",
        "first text TTFT stats",
        "routing evidence count",
      ],
      omittedFields: ["prompt", "assistant response", "error_message", "secrets", "run ids"],
    },
    summary: {
      firstTextRuns: runs.filter((run) => run.firstTextMs !== null).length,
      groups: groupSummaries.length,
      runs: runs.length,
      routingEvidenceRuns: runs.filter(
        (run) => run.routing.selectedProvider || run.routing.selectedModel || run.routing.decisionReason,
      ).length,
    },
  };
}

function statusSummary(statusCounts) {
  return Object.entries(statusCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${status}:${count}`)
    .join(" / ");
}

function renderMarkdown(report, { limitGroups }) {
  const safeLimitGroups = normalizePositiveInt(limitGroups, DEFAULT_LIMIT_GROUPS);
  const groups = report.groups.slice(0, safeLimitGroups);
  const missingFirstText = report.groups
    .filter((group) => group.firstTextCount === 0 && group.withRoutingEvidence > 0)
    .slice(0, Math.min(safeLimitGroups, 12));
  const lines = [
    "# AgentUI TTFT sample matrix export",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- db: ${report.dbPath}`,
    `- runs scanned: ${report.summary.runs}`,
    `- groups: ${report.summary.groups}`,
    `- runs with routing evidence: ${report.summary.routingEvidenceRuns}`,
    `- runs with first text TTFT: ${report.summary.firstTextRuns}`,
    "- privacy: prompt / response / error_message are not exported",
    "",
    "## Group summary",
    "",
    "| decision | provider/model | runs | status | routing evidence | first text samples | first text min/p50/avg/max | duration min/p50/avg/max |",
    "| --- | --- | ---: | --- | ---: | ---: | --- | --- |",
  ];

  for (const group of groups) {
    lines.push(
      [
        markdownCell(group.decisionSource),
        markdownInlineCode(`${group.provider}/${group.model}`),
        String(group.runCount),
        markdownCell(statusSummary(group.statusCounts) || "n/a"),
        String(group.withRoutingEvidence),
        String(group.firstTextCount),
        formatStats(group.firstTextStats),
        formatStats(group.durationStats),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
    );
  }

  lines.push("", "## Missing first-text TTFT candidates", "");
  if (missingFirstText.length === 0) {
    lines.push("- none with routing evidence");
  } else {
    for (const group of missingFirstText) {
      lines.push(
        [
          `- ${markdownInlineCode(`${group.provider}/${group.model}`)}`,
          `(${group.decisionSource}): ${group.runCount} runs,`,
          `status ${statusSummary(group.statusCounts) || "n/a"}`,
        ].join(" "),
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function writeOutput(outputPath, content) {
  if (!outputPath) {
    process.stdout.write(content);
    return;
  }
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, content, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const report = buildReport({
    dbPath: path.resolve(args.dbPath),
    limitRuns: args.limitRuns,
  });
  if (args.format === "json") {
    writeOutput(args.outputPath, `${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  if (args.format !== "markdown") {
    throw new Error(`Unsupported format: ${args.format}`);
  }
  writeOutput(args.outputPath, renderMarkdown(report, { limitGroups: args.limitGroups }));
}

main();
