#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const result = {
    check: false,
    evidencePackPath: "",
    format: "json",
    help: false,
    jsonRpcTracePath: "",
    outputPath: "",
    suiteId: "",
    taskId: "",
    turnStartPath: "",
    verifierPath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      result.check = true;
      continue;
    }
    if (arg === "--evidence-pack" && argv[index + 1]) {
      result.evidencePackPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--format" && argv[index + 1]) {
      result.format = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--output" && argv[index + 1]) {
      result.outputPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--json-rpc-trace" && argv[index + 1]) {
      result.jsonRpcTracePath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--suite" && argv[index + 1]) {
      result.suiteId = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--task" && argv[index + 1]) {
      result.taskId = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--turn-start" && argv[index + 1]) {
      result.turnStartPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--verifier" && argv[index + 1]) {
      result.verifierPath = String(argv[index + 1]).trim();
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
  if (!result.help) {
    for (const [name, value] of Object.entries({
      "--suite": result.suiteId,
      "--task": result.taskId,
      "--evidence-pack": result.evidencePackPath,
      "--verifier": result.verifierPath,
    })) {
      if (!value) {
        throw new Error(`必须提供 ${name}`);
      }
    }
    if (!result.turnStartPath && !result.jsonRpcTracePath) {
      throw new Error("必须提供 --turn-start 或 --json-rpc-trace");
    }
  }

  return result;
}

function printHelp() {
  console.log(`
Lime Benchmark Current Chain Evidence

用法:
  npm run agent-qc:benchmark:current-chain-evidence -- \\
    --suite terminal-bench-release-slice \\
    --task hello-world \\
    --turn-start .lime/benchmark/current-chain/turn-start.json \\
    --evidence-pack .lime/benchmark/current-chain/evidence-pack.json \\
    --verifier .lime/benchmark/current-chain/verifier-result.json \\
    --output .lime/benchmark/current-chain/current-chain-evidence.json \\
    --check

选项:
  --suite ID          benchmark suite id
  --task ID           benchmark task id
  --turn-start PATH   App Server agentSession/turn/start 记录
  --json-rpc-trace PATH
                      Electron / App Server JSON-RPC trace；可替代 --turn-start，并校验 evidence/export 请求存在
  --evidence-pack PATH
                      App Server evidence/export 返回的 Evidence Pack
  --verifier PATH     external verifier 结果
  --output PATH       写入 benchmark-current-chain-evidence-v1；默认 stdout
  --format FMT        输出格式：json | markdown
  --check             合同无效时非 0 退出
  -h, --help          显示帮助
`);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"));
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseJson(raw, fallback = null) {
  try {
    return JSON.parse(String(raw ?? ""));
  } catch {
    return fallback;
  }
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

function readString(record, ...names) {
  for (const name of names) {
    const value = record?.[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function decodeJsonRpcLines(lines) {
  if (!Array.isArray(lines)) {
    return [];
  }
  return lines.map((line) => parseJson(line, null)).filter(isRecord);
}

function requestsFromTraceEntry(entry) {
  if (!isRecord(entry)) {
    return [];
  }
  if (Array.isArray(entry.appServerRequests)) {
    return entry.appServerRequests
      .filter(isRecord)
      .map((request) => ({
        method: readString(request, "method"),
        sessionId: readString(request.params || {}, "sessionId", "session_id") || readString(request, "sessionId", "session_id"),
        threadId: readString(request.params || {}, "threadId", "thread_id") || readString(request, "threadId", "thread_id"),
        turnId: readString(request.params || {}, "turnId", "turn_id") || readString(request, "turnId", "turn_id"),
      }))
      .filter((request) => request.method);
  }
  return decodeJsonRpcLines(entry.args_preview?.request?.lines)
    .filter((message) => typeof message.method === "string")
    .map((message) => ({
      method: message.method,
      sessionId: readString(message.params || {}, "sessionId", "session_id"),
      threadId: readString(message.params || {}, "threadId", "thread_id"),
      turnId: readString(message.params || {}, "turnId", "turn_id"),
    }));
}

function requestsFromJsonRpcTrace(trace) {
  const entries = [];
  if (Array.isArray(trace)) {
    entries.push(...trace);
  } else if (isRecord(trace)) {
    for (const key of [
      "appServerInvokeEntries",
      "app_server_invoke_entries",
      "traceEntries",
      "trace_entries",
      "entries",
    ]) {
      if (Array.isArray(trace[key])) {
        entries.push(...trace[key]);
      }
    }
    if (Array.isArray(trace.appServerRequests)) {
      entries.push(trace);
    }
  }
  return entries.flatMap(requestsFromTraceEntry);
}

function factsFromJsonRpcTrace(trace) {
  const requests = requestsFromJsonRpcTrace(trace);
  const turnStart = requests.find((request) => request.method === "agentSession/turn/start") || null;
  const evidenceExport = requests.find((request) => request.method === "evidence/export") || null;
  return {
    turnStart: turnStart
      ? {
          method: "agentSession/turn/start",
          invoked: true,
          sessionId: turnStart.sessionId,
          threadId: turnStart.threadId,
          turnId: turnStart.turnId,
        }
      : null,
    evidenceExportInvoked: Boolean(evidenceExport),
    requests,
  };
}

function readNumber(record, ...names) {
  for (const name of names) {
    const value = record?.[name];
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

function normalizeEvidencePack(pack) {
  return {
    session_id: readString(pack, "session_id", "sessionId"),
    thread_id: readString(pack, "thread_id", "threadId"),
    workspace_root: readString(pack, "workspace_root", "workspaceRoot"),
    pack_relative_root: readString(pack, "pack_relative_root", "packRelativeRoot"),
    pack_absolute_root: readString(pack, "pack_absolute_root", "packAbsoluteRoot"),
    exported_at: readString(pack, "exported_at", "exportedAt"),
    thread_status: readString(pack, "thread_status", "threadStatus"),
    latest_turn_status: readString(pack, "latest_turn_status", "latestTurnStatus"),
    turn_count: readNumber(pack, "turn_count", "turnCount"),
    item_count: readNumber(pack, "item_count", "itemCount"),
    pending_request_count: readNumber(pack, "pending_request_count", "pendingRequestCount"),
    queued_turn_count: readNumber(pack, "queued_turn_count", "queuedTurnCount"),
    recent_artifact_count: readNumber(pack, "recent_artifact_count", "recentArtifactCount"),
    known_gaps: Array.isArray(pack?.known_gaps)
      ? pack.known_gaps
      : Array.isArray(pack?.knownGaps)
        ? pack.knownGaps
        : [],
    observability_summary: pack?.observability_summary || pack?.observabilitySummary || {},
    artifacts: Array.isArray(pack?.artifacts) ? pack.artifacts : [],
  };
}

function normalizeTurnStart(turnStart) {
  return {
    method: readString(turnStart, "method"),
    invoked: turnStart?.invoked === true,
    sessionId: readString(turnStart, "sessionId", "session_id"),
    threadId: readString(turnStart, "threadId", "thread_id"),
    turnId: readString(turnStart, "turnId", "turn_id"),
    requestId: readString(turnStart, "requestId", "request_id"),
  };
}

function normalizeVerifier(verifier) {
  const verdict = readString(verifier, "verdict", "status").toLowerCase();
  return {
    invoked: verifier?.invoked === true || verifier?.verifierInvoked === true,
    verdict,
    reward: Object.hasOwn(verifier || {}, "reward") ? verifier.reward : null,
    source: readString(verifier, "source", "runner"),
  };
}

function validateCurrentChainEvidence(evidence) {
  const issues = [];
  if (evidence.schemaVersion !== "benchmark-current-chain-evidence-v1") {
    issues.push("schemaVersion 必须是 benchmark-current-chain-evidence-v1");
  }
  if (!evidence.suiteId) {
    issues.push("suiteId 不能为空");
  }
  if (!evidence.taskId) {
    issues.push("taskId 不能为空");
  }
  if (evidence.appServer.method !== "agentSession/turn/start" || evidence.appServer.invoked !== true) {
    issues.push("appServer 必须证明 agentSession/turn/start 已调用");
  }
  if (!evidence.appServer.sessionId || !evidence.appServer.threadId) {
    issues.push("appServer 必须包含 sessionId 和 threadId");
  }
  if (evidence.evidenceExport.method !== "evidence/export" || evidence.evidenceExport.invoked !== true) {
    issues.push("evidenceExport 必须证明 evidence/export 已调用");
  }
  const pack = evidence.evidenceExport.pack;
  for (const field of ["session_id", "thread_id", "pack_relative_root", "exported_at"]) {
    if (!pack[field]) {
      issues.push(`Evidence Pack 缺少 ${field}`);
    }
  }
  if (pack.observability_summary?.source !== "app-server-current") {
    issues.push("Evidence Pack observability_summary.source 必须是 app-server-current");
  }
  if (evidence.externalVerifier.invoked !== true) {
    issues.push("externalVerifier 必须已调用");
  }
  if (!["pass", "passed", "ready"].includes(evidence.externalVerifier.verdict)) {
    issues.push("externalVerifier verdict 必须是 pass / passed / ready");
  }
  return {
    valid: issues.length === 0,
    issues,
  };
}

function buildCurrentChainEvidence({
  suiteId,
  taskId,
  turnStart,
  evidencePack,
  verifier,
  evidenceExportInvoked = true,
  generatedAt = new Date().toISOString(),
}) {
  const pack = normalizeEvidencePack(evidencePack);
  const appServer = {
    ...normalizeTurnStart(turnStart),
  };
  if (!appServer.sessionId) {
    appServer.sessionId = pack.session_id;
  }
  if (!appServer.threadId) {
    appServer.threadId = pack.thread_id;
  }
  const externalVerifier = normalizeVerifier(verifier);
  const evidence = {
    schemaVersion: "benchmark-current-chain-evidence-v1",
    generatedAt,
    suiteId,
    taskId,
    appServer,
    evidenceExport: {
      method: "evidence/export",
      invoked: evidenceExportInvoked,
      pack,
    },
    externalVerifier,
  };
  const validation = validateCurrentChainEvidence(evidence);
  return { ...evidence, validation };
}

function renderMarkdown(evidence) {
  const lines = [
    "# Benchmark Current Chain Evidence",
    "",
    `- suite: ${evidence.suiteId}`,
    `- task: ${evidence.taskId}`,
    `- valid: ${evidence.validation.valid ? "yes" : "no"}`,
    `- appServer: ${evidence.appServer.method} invoked=${evidence.appServer.invoked ? "yes" : "no"}`,
    `- evidenceExport: ${evidence.evidenceExport.method} invoked=${evidence.evidenceExport.invoked ? "yes" : "no"}`,
    `- verifier: invoked=${evidence.externalVerifier.invoked ? "yes" : "no"} verdict=${evidence.externalVerifier.verdict || "-"}`,
  ];
  if (evidence.validation.issues.length > 0) {
    lines.push("", "## Issues", "");
    for (const issue of evidence.validation.issues) {
      lines.push(`- ${issue}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const traceFacts = options.jsonRpcTracePath
    ? factsFromJsonRpcTrace(readJsonFile(options.jsonRpcTracePath))
    : null;
  const evidence = buildCurrentChainEvidence({
    suiteId: options.suiteId,
    taskId: options.taskId,
    turnStart: traceFacts ? traceFacts.turnStart : readJsonFile(options.turnStartPath),
    evidencePack: readJsonFile(options.evidencePackPath),
    verifier: readJsonFile(options.verifierPath),
    evidenceExportInvoked: traceFacts ? traceFacts.evidenceExportInvoked : true,
  });
  const content =
    options.format === "json" ? `${JSON.stringify(evidence, null, 2)}\n` : renderMarkdown(evidence);
  writeOutput(options.outputPath, content);

  if (options.check && !evidence.validation.valid) {
    for (const issue of evidence.validation.issues) {
      console.error(`[benchmark-current-chain-evidence] ${issue}`);
    }
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  buildCurrentChainEvidence,
  factsFromJsonRpcTrace,
  normalizeEvidencePack,
  normalizeTurnStart,
  normalizeVerifier,
  renderMarkdown,
  validateCurrentChainEvidence,
};
