#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_LIMIT_RUNS = 5000;
const DEFAULT_LIMIT_GROUPS = 24;
const DEFAULT_MIN_FIRST_TEXT_PER_RESPONSIVE_GROUP = 3;
const MATRIX_PRESETS = {
  "agentui-responsive-chat-ttft": {
    minFirstTextPerResponsiveGroup: 3,
    requiredResponsiveModels: ["deepseek-v4-flash", "MiniMax-M2.7"],
    requiredResponsiveProviders: ["siliconflow-cn", "openrouter", "lime-hub"],
  },
};

function applyPreset(result, presetName) {
  const preset = MATRIX_PRESETS[presetName];
  if (!preset) {
    throw new Error(
      `Unknown preset: ${presetName}. Available presets: ${Object.keys(MATRIX_PRESETS).join(", ")}`,
    );
  }
  result.checkResponsiveMatrix = true;
  result.matrixPreset = presetName;
  result.minFirstTextPerResponsiveGroup = preset.minFirstTextPerResponsiveGroup;
  result.requiredResponsiveModels = [...new Set([
    ...result.requiredResponsiveModels,
    ...preset.requiredResponsiveModels,
  ])];
  result.requiredResponsiveProviders = [...new Set([
    ...result.requiredResponsiveProviders,
    ...preset.requiredResponsiveProviders,
  ])];
}

function parseArgs(argv) {
  const result = {
    dbPath: defaultLimeDbPath(),
    format: "markdown",
    help: false,
    checkResponsiveMatrix: false,
    limitGroups: DEFAULT_LIMIT_GROUPS,
    limitRuns: DEFAULT_LIMIT_RUNS,
    minFirstTextPerResponsiveGroup: DEFAULT_MIN_FIRST_TEXT_PER_RESPONSIVE_GROUP,
    matrixPreset: "",
    outputPath: "",
    requiredResponsiveModels: [],
    requiredResponsiveProviders: [],
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
    if (arg === "--min-first-text-per-responsive-group" && argv[index + 1]) {
      result.minFirstTextPerResponsiveGroup = Number.parseInt(String(argv[index + 1]), 10);
      index += 1;
      continue;
    }
    if (arg === "--check-responsive-matrix") {
      result.checkResponsiveMatrix = true;
      continue;
    }
    if (arg === "--preset" && argv[index + 1]) {
      applyPreset(result, String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--require-responsive-provider" && argv[index + 1]) {
      result.requiredResponsiveProviders.push(String(argv[index + 1]).trim());
      index += 1;
      continue;
    }
    if (arg === "--require-responsive-model" && argv[index + 1]) {
      result.requiredResponsiveModels.push(String(argv[index + 1]).trim());
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
  --check-responsive-matrix
                        检查 responsive_chat latency group 是否满足 first-text TTFT 样本下限
  --preset NAME         套用检查预设：${Object.keys(MATRIX_PRESETS).join(" | ")}
  --min-first-text-per-responsive-group N
                        每个 responsive_chat latency group 的 first-text TTFT 样本下限，默认 ${DEFAULT_MIN_FIRST_TEXT_PER_RESPONSIVE_GROUP}
  --require-responsive-provider PROVIDER
                        必须出现在 responsive_chat latency group 中的 provider；可重复
  --require-responsive-model MODEL
                        必须出现在 responsive_chat latency group 中的 model；可重复
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

function normalizeNonNegativeInt(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
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

function saneFirstTextValue(value) {
  const number = numberValue(value);
  if (number === null || number < 0 || number > 600_000) {
    return null;
  }
  return number;
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeRoutingToken(value) {
  return stringValue(value)?.toLowerCase().replaceAll("-", "_") || "";
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
    settingsSource: stringValue(
      firstDefined(routingDecision?.settingsSource, routingDecision?.settings_source),
    ),
    selectedModel,
    selectedProvider,
    serviceModelSlot: stringValue(
      firstDefined(routingDecision?.serviceModelSlot, routingDecision?.service_model_slot),
    ),
  };
}

function isResponsiveChatLatencyRun(routing) {
  return (
    normalizeRoutingToken(routing.decisionSource) === "responsive_chat_auto" ||
    normalizeRoutingToken(routing.serviceModelSlot) === "responsive_chat" ||
    normalizeRoutingToken(routing.settingsSource) === "service_models.responsive_chat"
  );
}

function parseRun(row) {
  const metadata = parseJsonObject(row.metadata) || {};
  const routing = parseRouting(metadata);
  const provider = redactProvider(routing.selectedProvider) || "(unknown)";
  const model = routing.selectedModel || "(unknown)";
  const decisionSource = routing.decisionSource || "(unknown)";
  const metadataFirstTextMs = saneFirstTextValue(
    firstDefined(metadata.model_first_text_delta_ms, metadata.modelFirstTextDeltaMs),
  );
  const timelineFirstTextMs =
    row.status === "success" ? saneFirstTextValue(row.timeline_first_text_delta_ms) : null;
  const firstTextMs = metadataFirstTextMs ?? timelineFirstTextMs;

  return {
    createdAt: row.created_at || null,
    decisionSource,
    durationMs: numberValue(row.duration_ms),
    firstTextMs,
    firstTextSource:
      metadataFirstTextMs !== null
        ? "agent_runs.metadata"
        : timelineFirstTextMs !== null
          ? "thread_items.timeline"
          : null,
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
    responsiveLatencyEligible: isResponsiveChatLatencyRun(routing),
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

function buildResponsiveGroupKey(run) {
  return `${run.provider}\u0000${run.model}`;
}

function buildReport({ dbPath, generatedAt = new Date().toISOString(), limitRuns }) {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`DB not found: ${dbPath}`);
  }

  const safeLimit = normalizePositiveInt(limitRuns, DEFAULT_LIMIT_RUNS);
  const rows = sqliteJson(
    dbPath,
    `SELECT id,
            status,
            duration_ms,
            metadata,
            created_at,
            session_id,
            (
              SELECT CAST((julianday(agent_item.started_at) - julianday(user_item.started_at)) * 86400000 AS INTEGER)
              FROM agent_thread_items AS user_item
              JOIN agent_thread_items AS agent_item
                ON agent_item.session_id = user_item.session_id
               AND agent_item.item_type = 'agent_message'
               AND (
                 json_extract(agent_runs.metadata, '$.turn_state.turn_id') IS NULL
                 OR agent_item.turn_id = json_extract(agent_runs.metadata, '$.turn_state.turn_id')
               )
              WHERE user_item.session_id = agent_runs.session_id
                AND user_item.item_type = 'user_message'
                AND (
                  json_extract(agent_runs.metadata, '$.turn_state.turn_id') IS NULL
                  OR user_item.turn_id = json_extract(agent_runs.metadata, '$.turn_state.turn_id')
                )
              ORDER BY user_item.sequence ASC, agent_item.sequence ASC
              LIMIT 1
            ) AS timeline_first_text_delta_ms
     FROM agent_runs
     WHERE metadata IS NOT NULL
     ORDER BY created_at DESC
     LIMIT ${safeLimit}`,
  );
  const runs = rows.map(parseRun);
  const groups = new Map();
  const responsiveLatencyGroups = new Map();

  for (const run of runs) {
    const key = buildGroupKey(run);
    if (!groups.has(key)) {
      groups.set(key, {
        decisionSource: run.decisionSource,
        durationStats: null,
        firstTextStats: null,
        firstTextCount: 0,
        firstTextSourceCounts: {},
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
      group.firstTextSourceCounts[run.firstTextSource] =
        (group.firstTextSourceCounts[run.firstTextSource] || 0) + 1;
    }
    if (run.routing.selectedProvider || run.routing.selectedModel || run.routing.decisionReason) {
      group.withRoutingEvidence += 1;
    }

    if (run.responsiveLatencyEligible) {
      const responsiveKey = buildResponsiveGroupKey(run);
      if (!responsiveLatencyGroups.has(responsiveKey)) {
        responsiveLatencyGroups.set(responsiveKey, {
          decisionSourceCounts: {},
          durationStats: null,
          firstTextStats: null,
          firstTextCount: 0,
          firstTextSourceCounts: {},
          model: run.model,
          provider: run.provider,
          runs: [],
          statusCounts: {},
          withRoutingEvidence: 0,
        });
      }
      const responsiveGroup = responsiveLatencyGroups.get(responsiveKey);
      responsiveGroup.runs.push(run);
      responsiveGroup.statusCounts[run.status] =
        (responsiveGroup.statusCounts[run.status] || 0) + 1;
      responsiveGroup.decisionSourceCounts[run.decisionSource] =
        (responsiveGroup.decisionSourceCounts[run.decisionSource] || 0) + 1;
      if (run.firstTextMs !== null) {
        responsiveGroup.firstTextCount += 1;
        responsiveGroup.firstTextSourceCounts[run.firstTextSource] =
          (responsiveGroup.firstTextSourceCounts[run.firstTextSource] || 0) + 1;
      }
      if (run.routing.selectedProvider || run.routing.selectedModel || run.routing.decisionReason) {
        responsiveGroup.withRoutingEvidence += 1;
      }
    }
  }

  const groupSummaries = [...groups.values()]
    .map((group) => {
      const runCount = group.runs.length;
      return {
        decisionSource: group.decisionSource,
        durationStats: summarizeNumbers(group.runs.map((run) => run.durationMs)),
        firstTextCount: group.firstTextCount,
        firstTextSourceCounts: group.firstTextSourceCounts,
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

  const responsiveLatencyGroupSummaries = [...responsiveLatencyGroups.values()]
    .map((group) => {
      const runCount = group.runs.length;
      return {
        decisionSourceCounts: group.decisionSourceCounts,
        decisionSources: Object.keys(group.decisionSourceCounts).sort(),
        durationStats: summarizeNumbers(group.runs.map((run) => run.durationMs)),
        firstTextCount: group.firstTextCount,
        firstTextSourceCounts: group.firstTextSourceCounts,
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
        "first text source counts",
        "routing evidence count",
      ],
      omittedFields: ["prompt", "assistant response", "error_message", "secrets", "run ids"],
    },
    responsiveLatencyGroups: responsiveLatencyGroupSummaries,
    summary: {
      firstTextRuns: runs.filter((run) => run.firstTextMs !== null).length,
      groups: groupSummaries.length,
      responsiveLatencyGroups: responsiveLatencyGroupSummaries.length,
      responsiveLatencyRuns: runs.filter((run) => run.responsiveLatencyEligible).length,
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

function statusCount(statusCounts, status) {
  return Number(statusCounts?.[status] || 0);
}

function errorLikeSampleCount(statusCounts) {
  return Object.entries(statusCounts || {}).reduce((total, [status, count]) => {
    if (status === "success" || status === "running") {
      return total;
    }
    return total + Number(count || 0);
  }, 0);
}

function isFallbackOnlyResponsiveGroup(group, minimum) {
  return (
    group.firstTextCount < minimum &&
    statusCount(group.statusCounts, "success") === 0 &&
    errorLikeSampleCount(group.statusCounts) > 0
  );
}

function buildResponsiveMatrixCheck(
  report,
  {
    minFirstTextPerGroup,
    preset = "",
    requiredModels = [],
    requiredProviders = [],
  },
) {
  const minimum = normalizeNonNegativeInt(
    minFirstTextPerGroup,
    DEFAULT_MIN_FIRST_TEXT_PER_RESPONSIVE_GROUP,
  );
  const responsiveGroups = report.responsiveLatencyGroups || [];
  const fallbackOnlyGroups = responsiveGroups
    .filter((group) => isFallbackOnlyResponsiveGroup(group, minimum))
    .map((group) => ({
      decisionSources: group.decisionSources || [],
      firstTextCount: group.firstTextCount,
      minimum,
      model: group.model,
      provider: group.provider,
      runCount: group.runCount,
      status: statusSummary(group.statusCounts) || "n/a",
    }));
  const missingGroups = responsiveGroups
    .filter((group) => group.firstTextCount < minimum)
    .filter((group) => !isFallbackOnlyResponsiveGroup(group, minimum))
    .map((group) => ({
      decisionSources: group.decisionSources || [],
      firstTextCount: group.firstTextCount,
      minimum,
      model: group.model,
      neededFirstTextSamples: minimum - group.firstTextCount,
      provider: group.provider,
      runCount: group.runCount,
      status: statusSummary(group.statusCounts) || "n/a",
    }));
  const missingRequiredProviders = requiredProviders
    .filter((provider) => provider)
    .filter(
      (provider) => !responsiveGroups.some((group) => group.provider === provider),
    );
  const missingRequiredModels = requiredModels
    .filter((model) => model)
    .filter((model) => !responsiveGroups.some((group) => group.model === model));

  return {
    fallbackOnlyGroups,
    firstTextTargetPerGroup: minimum,
    missingGroups,
    missingRequiredModels,
    missingRequiredProviders,
    passingGroups: responsiveGroups.length - missingGroups.length - fallbackOnlyGroups.length,
    preset,
    requiredModels: requiredModels.filter(Boolean),
    requiredProviders: requiredProviders.filter(Boolean),
    responsiveGroupKind: "responsive_chat_latency",
    responsiveGroups: responsiveGroups.length,
    status:
      responsiveGroups.length > 0 &&
      missingGroups.length === 0 &&
      missingRequiredProviders.length === 0 &&
      missingRequiredModels.length === 0
        ? "pass"
        : "fail",
    totalNeededFirstTextSamples: missingGroups.reduce(
      (total, group) => total + group.neededFirstTextSamples,
      0,
    ),
  };
}

function renderMatrixCheckMarkdown(matrixCheck) {
  const lines = [
    "",
    "## Responsive matrix check",
    "",
    `- status: ${matrixCheck.status}`,
    `- responsive_chat latency groups: ${matrixCheck.responsiveGroups}`,
    `- passing groups: ${matrixCheck.passingGroups}`,
    `- fallback-only groups: ${matrixCheck.fallbackOnlyGroups.length}`,
    `- first-text target per group: ${matrixCheck.firstTextTargetPerGroup}`,
    `- additional first-text samples needed: ${matrixCheck.totalNeededFirstTextSamples}`,
  ];
  if (matrixCheck.preset) {
    lines.push(`- preset: ${matrixCheck.preset}`);
  }
  if (matrixCheck.requiredProviders.length > 0) {
    lines.push(`- required providers: ${matrixCheck.requiredProviders.join(", ")}`);
  }
  if (matrixCheck.requiredModels.length > 0) {
    lines.push(`- required models: ${matrixCheck.requiredModels.join(", ")}`);
  }
  if (matrixCheck.missingRequiredProviders.length > 0) {
    lines.push(`- missing required providers: ${matrixCheck.missingRequiredProviders.join(", ")}`);
  }
  if (matrixCheck.missingRequiredModels.length > 0) {
    lines.push(`- missing required models: ${matrixCheck.missingRequiredModels.join(", ")}`);
  }
  if (matrixCheck.missingGroups.length === 0) {
    lines.push("- missing groups: none");
  } else {
    lines.push("- missing groups:");
    for (const group of matrixCheck.missingGroups) {
      lines.push(
        [
          `  - ${markdownInlineCode(`${group.provider}/${group.model}`)}`,
          `${group.firstTextCount}/${group.minimum} first-text samples,`,
          `need ${group.neededFirstTextSamples} more,`,
          `${group.runCount} runs, status ${group.status}`,
          group.decisionSources?.length ? `sources ${group.decisionSources.join("/")}` : "",
        ].join(" "),
      );
    }
  }

  if (matrixCheck.fallbackOnlyGroups.length === 0) {
    lines.push("- fallback-only groups: none");
  } else {
    lines.push("- fallback-only groups:");
    for (const group of matrixCheck.fallbackOnlyGroups) {
      lines.push(
        [
          `  - ${markdownInlineCode(`${group.provider}/${group.model}`)}`,
          `${group.runCount} runs, status ${group.status},`,
          "kept as routing fallback evidence rather than first-text baseline",
          group.decisionSources?.length ? `sources ${group.decisionSources.join("/")}` : "",
        ].join(" "),
      );
    }
  }
  return lines;
}

function reportMatrixCheckFailure(matrixCheck) {
  const missing = matrixCheck.missingGroups
    .map((group) => `${group.provider}/${group.model} (${group.firstTextCount}/${group.minimum})`)
    .join(", ");
  const missingProviders =
    matrixCheck.missingRequiredProviders.length > 0
      ? `Missing required providers: ${matrixCheck.missingRequiredProviders.join(", ")}.`
      : "";
  const missingModels =
    matrixCheck.missingRequiredModels.length > 0
      ? `Missing required models: ${matrixCheck.missingRequiredModels.join(", ")}.`
      : "";
  const fallbackOnly =
    matrixCheck.fallbackOnlyGroups.length > 0
      ? `Fallback-only groups: ${matrixCheck.fallbackOnlyGroups
          .map((group) => `${group.provider}/${group.model} (${group.status})`)
          .join(", ")}.`
      : "";
  console.error(
    [
      "Responsive matrix check failed:",
      `${matrixCheck.passingGroups}/${matrixCheck.responsiveGroups} groups passed`,
      `with target ${matrixCheck.firstTextTargetPerGroup} first-text samples per responsive_chat latency group.`,
      `Need ${matrixCheck.totalNeededFirstTextSamples} additional first-text samples.`,
      missing ? `Missing: ${missing}` : "",
      fallbackOnly,
      missingProviders,
      missingModels,
    ]
      .filter(Boolean)
      .join(" "),
  );
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
    `- responsive_chat latency runs: ${report.summary.responsiveLatencyRuns}`,
    `- responsive_chat latency groups: ${report.summary.responsiveLatencyGroups}`,
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

  const responsiveLatencyGroups = (report.responsiveLatencyGroups || []).slice(
    0,
    safeLimitGroups,
  );
  lines.push(
    "",
    "## Responsive chat latency groups",
    "",
    "| provider/model | runs | decision sources | status | routing evidence | first text samples | first text min/p50/avg/max | duration min/p50/avg/max |",
    "| --- | ---: | --- | --- | ---: | ---: | --- | --- |",
  );
  for (const group of responsiveLatencyGroups) {
    lines.push(
      [
        markdownInlineCode(`${group.provider}/${group.model}`),
        String(group.runCount),
        markdownCell(group.decisionSources.join(" / ") || "n/a"),
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

  if (report.matrixCheck) {
    lines.push(...renderMatrixCheckMarkdown(report.matrixCheck));
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
  if (args.checkResponsiveMatrix) {
    report.matrixCheck = buildResponsiveMatrixCheck(report, {
      minFirstTextPerGroup: args.minFirstTextPerResponsiveGroup,
      preset: args.matrixPreset,
      requiredModels: args.requiredResponsiveModels,
      requiredProviders: args.requiredResponsiveProviders,
    });
  }
  if (args.format === "json") {
    writeOutput(args.outputPath, `${JSON.stringify(report, null, 2)}\n`);
    if (report.matrixCheck && report.matrixCheck.status !== "pass") {
      reportMatrixCheckFailure(report.matrixCheck);
      process.exitCode = 1;
    }
    return;
  }
  if (args.format !== "markdown") {
    throw new Error(`Unsupported format: ${args.format}`);
  }
  writeOutput(args.outputPath, renderMarkdown(report, { limitGroups: args.limitGroups }));
  if (report.matrixCheck && report.matrixCheck.status !== "pass") {
    reportMatrixCheckFailure(report.matrixCheck);
    process.exitCode = 1;
  }
}

main();
