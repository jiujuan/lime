#!/usr/bin/env node

/**
 * 主题工作台社媒链路联调脚本
 *
 * 用法示例：
 *   node scripts/social-workbench-e2e-smoke.mjs --session-id <session_id>
 *   node scripts/social-workbench-e2e-smoke.mjs --session-id <session_id> --content-id <content_id>
 *
 * 前置条件：
 *   1. Lime 已运行（Dev Bridge: http://127.0.0.1:3030/invoke）
 *   2. 该 session 已在 UI 中实际触发过社媒生成
 */

const BRIDGE_URL = "http://127.0.0.1:3030/invoke";
const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";
const METHOD_DIAGNOSTICS_SERVER_READ = "diagnostics/server/read";
const METHOD_THREAD_READ = "thread/read";

function printUsage() {
  console.log(`
用法:
  node scripts/social-workbench-e2e-smoke.mjs --session-id <id> [--content-id <id>] [--expected-provider <id>] [--expected-model <id>] [--timeout-ms <ms>] [--interval-ms <ms>]

参数:
  --session-id   必填，会话 ID
  --content-id   可选，文稿 ID（用于校验版本状态）
  --expected-provider 可选，期望命中的 provider（校验 run metadata 中的 requested_provider / provider_override）
  --expected-model 可选，期望命中的模型（校验 run metadata 中的 requested_model / model_override）
  --timeout-ms   可选，等待终态超时（默认 60000）
  --interval-ms  可选，轮询间隔（默认 1000）
  --help         显示帮助
`);
}

function parseArgs(argv) {
  const result = {
    sessionId: "",
    contentId: "",
    expectedProvider: "",
    expectedModel: "",
    timeoutMs: 60_000,
    intervalMs: 1_000,
    help: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      result.help = true;
      continue;
    }
    if (token === "--session-id") {
      result.sessionId = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--content-id") {
      result.contentId = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--expected-provider") {
      result.expectedProvider = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--expected-model") {
      result.expectedModel = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--timeout-ms") {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value > 0) {
        result.timeoutMs = value;
      }
      i += 1;
      continue;
    }
    if (token === "--interval-ms") {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value > 0) {
        result.intervalMs = value;
      }
      i += 1;
    }
  }

  return result;
}

async function invoke(cmd, args) {
  const response = await fetch(BRIDGE_URL, {
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
  if (payload.error) {
    throw new Error(String(payload.error));
  }

  return payload.result;
}

let appServerRequestId = 1;

async function invokeAppServerJsonRpc(method, params = {}) {
  const id = `social-workbench-${appServerRequestId++}`;
  const result = await invoke(APP_SERVER_HANDLE_JSON_LINES_COMMAND, {
    request: {
      lines: [`${JSON.stringify({ id, method, params })}\n`],
    },
  });
  const lines = Array.isArray(result?.lines) ? result.lines : [];
  for (const line of lines) {
    let message = null;
    try {
      message = JSON.parse(String(line));
    } catch {
      continue;
    }
    if (message?.id !== id) {
      continue;
    }
    if (message.error) {
      const detail = message.error?.message || JSON.stringify(message.error);
      throw new Error(`${method}: ${detail}`);
    }
    if (Object.hasOwn(message, "result")) {
      return message.result;
    }
  }

  throw new Error(`${method}: missing App Server response`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseRunMetadata(raw) {
  if (!raw) {
    return null;
  }
  if (typeof raw === "object") {
    return raw;
  }
  if (typeof raw !== "string") {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeNonEmptyString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function pickMetadataString(metadata, keys) {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }

  for (const key of keys) {
    const value = normalizeNonEmptyString(metadata[key]);
    if (value) {
      return value;
    }
  }

  return "";
}

function pickArtifactPaths(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }
  const paths = metadata.artifact_paths;
  if (!Array.isArray(paths)) {
    return [];
  }
  return paths.filter((item) => typeof item === "string" && item.trim());
}

function pickPathBySuffix(paths, suffix) {
  return paths.find((item) => item.toLowerCase().endsWith(suffix)) || "";
}

function isTerminalRunStatus(status) {
  return (
    status === "success" ||
    status === "error" ||
    status === "canceled" ||
    status === "timeout"
  );
}

function normalizeRunItem(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const runId = normalizeNonEmptyString(value.run_id || value.runId);
  const title = normalizeNonEmptyString(value.title);
  const status = normalizeNonEmptyString(value.status);
  const startedAt = normalizeNonEmptyString(
    value.started_at || value.startedAt,
  );
  if (!runId || !title || !status || !startedAt) {
    return null;
  }
  const artifactPaths = Array.isArray(
    value.artifact_paths || value.artifactPaths,
  )
    ? (value.artifact_paths || value.artifactPaths).filter(
        (item) => typeof item === "string" && item.trim(),
      )
    : [];
  return {
    run_id: runId,
    execution_id: normalizeNonEmptyString(
      value.execution_id || value.executionId,
    ),
    session_id: normalizeNonEmptyString(value.session_id || value.sessionId),
    metadata: value.metadata || value.run_metadata || value.runMetadata || null,
    artifact_paths: artifactPaths,
    title,
    gate_key: normalizeNonEmptyString(value.gate_key || value.gateKey) || null,
    status,
    source: normalizeNonEmptyString(value.source) || "chat",
    source_ref:
      normalizeNonEmptyString(value.source_ref || value.sourceRef) || null,
    started_at: startedAt,
    finished_at:
      normalizeNonEmptyString(value.finished_at || value.finishedAt) || null,
  };
}

function statusFromTurnStatus(status) {
  switch (status) {
    case "accepted":
    case "queued":
      return "queued";
    case "running":
    case "waitingAction":
      return "running";
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "canceled":
      return "canceled";
    default:
      return "";
  }
}

function readExecutionRuns(sessionRead) {
  const detail =
    sessionRead?.detail && typeof sessionRead.detail === "object"
      ? sessionRead.detail
      : {};
  const threadRead =
    detail.thread_read && typeof detail.thread_read === "object"
      ? detail.thread_read
      : detail.threadRead && typeof detail.threadRead === "object"
        ? detail.threadRead
        : {};
  const runs =
    threadRead.execution_runs ||
    threadRead.executionRuns ||
    detail.execution_runs ||
    detail.executionRuns;
  return Array.isArray(runs) ? runs.map(normalizeRunItem).filter(Boolean) : [];
}

function runItemFromTurn(session, turn) {
  const status = statusFromTurnStatus(turn?.status);
  const turnId = normalizeNonEmptyString(turn?.turnId || turn?.turn_id);
  const startedAt =
    normalizeNonEmptyString(turn?.startedAt || turn?.started_at) ||
    normalizeNonEmptyString(session?.updatedAt || session?.updated_at);
  if (!turnId || !status || !startedAt) {
    return null;
  }
  return {
    run_id: normalizeNonEmptyString(session?.sessionId || session?.session_id),
    execution_id: turnId,
    session_id: normalizeNonEmptyString(
      session?.sessionId || session?.session_id,
    ),
    artifact_paths: [],
    title:
      normalizeNonEmptyString(session?.businessObjectRef?.title) ||
      normalizeNonEmptyString(session?.business_object_ref?.title) ||
      "主题工作台社媒链路",
    gate_key: "write_mode",
    status,
    source: "chat",
    source_ref:
      normalizeNonEmptyString(session?.businessObjectRef?.kind) ||
      normalizeNonEmptyString(session?.business_object_ref?.kind) ||
      null,
    started_at: startedAt,
    finished_at:
      normalizeNonEmptyString(turn?.completedAt || turn?.completed_at) || null,
  };
}

async function readAgentSession(sessionId) {
  const result = await invokeAppServerJsonRpc(METHOD_THREAD_READ, {
    sessionId,
  });
  assert(result?.session, "thread/read 未返回 session");
  assert(Array.isArray(result.turns), "thread/read 未返回 turns 数组");
  return result;
}

function projectWorkbenchState(sessionRead, limit) {
  const detailRuns = readExecutionRuns(sessionRead);
  const turnRuns = (Array.isArray(sessionRead.turns) ? sessionRead.turns : [])
    .map((turn) => runItemFromTurn(sessionRead.session, turn))
    .filter(Boolean);
  const runs = detailRuns.length > 0 ? detailRuns : turnRuns;
  const queueItems = runs
    .filter((item) => !isTerminalRunStatus(item.status))
    .slice(0, limit);
  const recentTerminals = runs
    .filter((item) => isTerminalRunStatus(item.status))
    .slice(0, limit);
  return {
    run_state: queueItems.length > 0 ? "auto_running" : "idle",
    current_gate_key: queueItems[0]?.gate_key || "idle",
    queue_items: queueItems,
    latest_terminal: recentTerminals[0] || null,
    recent_terminals: recentTerminals,
    updated_at:
      normalizeNonEmptyString(sessionRead.session?.updatedAt) ||
      normalizeNonEmptyString(sessionRead.session?.updated_at),
  };
}

function projectRunDetail(sessionRead, runId) {
  const runs = readExecutionRuns(sessionRead);
  const matchedRun =
    runs.find((item) => item.run_id === runId || item.execution_id === runId) ||
    runs[0] ||
    null;
  const detail =
    sessionRead?.detail && typeof sessionRead.detail === "object"
      ? sessionRead.detail
      : {};
  const metadata =
    matchedRun?.metadata ||
    detail.social_workbench_run_metadata ||
    detail.socialWorkbenchRunMetadata ||
    detail.general_workbench_run_metadata ||
    detail.generalWorkbenchRunMetadata ||
    detail.run_metadata ||
    detail.runMetadata ||
    detail.metadata ||
    sessionRead.session?.metadata ||
    null;
  return {
    ...(matchedRun || {}),
    metadata,
  };
}

async function waitTerminalState(sessionId, timeoutMs, intervalMs) {
  const startedAt = Date.now();
  let latest = null;

  while (Date.now() - startedAt < timeoutMs) {
    const sessionRead = await readAgentSession(sessionId);
    const state = projectWorkbenchState(sessionRead, 10);
    latest = state;

    const terminal = state?.latest_terminal;
    if (terminal && state?.run_state !== "auto_running") {
      return state;
    }

    await sleep(intervalMs);
  }

  throw new Error(
    `等待主题工作台终态超时（${timeoutMs}ms），最后状态: ${JSON.stringify(latest)}`,
  );
}

function verifyArtifactPaths(artifactPaths) {
  const articlePath = pickPathBySuffix(artifactPaths, ".md");
  const coverPath = pickPathBySuffix(artifactPaths, ".cover.json");
  const publishPackPath = pickPathBySuffix(artifactPaths, ".publish-pack.json");

  assert(articlePath, "缺少主稿路径（*.md）");
  assert(coverPath, "缺少封面元数据路径（*.cover.json）");
  assert(publishPackPath, "缺少发布包路径（*.publish-pack.json）");
  assert(
    new Set([articlePath, coverPath, publishPackPath]).size === 3,
    "产物路径不应重复",
  );

  return {
    articlePath,
    coverPath,
    publishPackPath,
  };
}

async function verifyContentVersionState(
  contentId,
  expectedRunId,
  timeoutMs,
  intervalMs,
) {
  const startedAt = Date.now();
  let latest = null;

  while (Date.now() - startedAt < timeoutMs) {
    const state = await invoke("content_get_theme_workbench_document_state", {
      id: contentId,
    });
    latest = state;

    if (state && Array.isArray(state.versions)) {
      const matched = state.versions.find((item) => item?.id === expectedRunId);
      if (matched) {
        return {
          currentVersionId: state.current_version_id,
          matchedStatus: matched.status || null,
        };
      }
    }

    await sleep(intervalMs);
  }

  throw new Error(
    `未在文稿版本状态中找到 run_id=${expectedRunId}，最后状态: ${JSON.stringify(latest)}`,
  );
}

function verifyRunModelSelection(metadata, expectedProvider, expectedModel) {
  const requestedProvider = pickMetadataString(metadata, [
    "requested_provider",
    "provider_override",
    "provider_id",
    "provider",
  ]);
  const requestedModel = pickMetadataString(metadata, [
    "requested_model",
    "model_override",
    "model_name",
    "model",
  ]);
  const resolvedProvider = pickMetadataString(metadata, [
    "resolved_provider",
    "runtime_provider",
    "provider_name",
  ]);
  const resolvedModel = pickMetadataString(metadata, [
    "resolved_model",
    "runtime_model",
  ]);

  if (expectedProvider) {
    assert(
      requestedProvider === expectedProvider,
      `Provider 不匹配: expected=${expectedProvider}, actual_requested=${requestedProvider || "<empty>"}, actual_resolved=${resolvedProvider || "<empty>"}`,
    );
  }

  if (expectedModel) {
    assert(
      requestedModel === expectedModel,
      `模型不匹配: expected=${expectedModel}, actual_requested=${requestedModel || "<empty>"}, actual_resolved=${resolvedModel || "<empty>"}`,
    );
  }

  return {
    requestedProvider,
    requestedModel,
    resolvedProvider,
    resolvedModel,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printUsage();
    return;
  }

  if (!args.sessionId) {
    printUsage();
    throw new Error("缺少必填参数 --session-id");
  }

  console.log(`[Smoke] 开始校验 session: ${args.sessionId}`);

  const diagnostics = await invokeAppServerJsonRpc(
    METHOD_DIAGNOSTICS_SERVER_READ,
  );
  assert(
    diagnostics && typeof diagnostics.running === "boolean",
    "diagnostics/server/read 返回格式异常",
  );
  console.log("[Smoke] Dev Bridge 可用");

  const runState = await waitTerminalState(
    args.sessionId,
    args.timeoutMs,
    args.intervalMs,
  );
  const terminal = runState.latest_terminal;
  assert(terminal, "未获取到 latest_terminal");
  console.log(
    `[Smoke] 终态: status=${terminal.status}, run_id=${terminal.run_id}, gate=${terminal.gate_key}`,
  );

  const sessionRead = await readAgentSession(args.sessionId);
  const runDetail = projectRunDetail(sessionRead, terminal.run_id);
  assert(runDetail, "thread/read 未能投影运行详情");

  const metadata = parseRunMetadata(runDetail.metadata);
  assert(metadata, "运行 metadata 为空或不可解析");
  assert(
    metadata.workflow === "social_content_pipeline_v1",
    `workflow 不匹配: ${metadata.workflow}`,
  );

  const modelSelection = verifyRunModelSelection(
    metadata,
    args.expectedProvider,
    args.expectedModel,
  );
  console.log(
    `[Smoke] 模型轨迹: requested=${modelSelection.requestedProvider || "<empty>"} / ${modelSelection.requestedModel || "<empty>"}, resolved=${modelSelection.resolvedProvider || "<empty>"} / ${modelSelection.resolvedModel || "<empty>"}`,
  );

  const stages = Array.isArray(metadata.stages) ? metadata.stages : [];
  assert(stages.length >= 3, `stages 不完整: ${JSON.stringify(stages)}`);
  assert(stages.includes("topic_select"), "stages 缺少 topic_select");
  assert(stages.includes("write_mode"), "stages 缺少 write_mode");
  assert(stages.includes("publish_confirm"), "stages 缺少 publish_confirm");

  const artifactPaths = pickArtifactPaths(metadata);
  assert(
    artifactPaths.length >= 3,
    `artifact_paths 不完整: ${JSON.stringify(artifactPaths)}`,
  );
  console.log("[Smoke] 产物路径:", artifactPaths.join(", "));

  const artifactSummary = verifyArtifactPaths(artifactPaths);
  console.log(
    `[Smoke] 产物路径校验通过: ${artifactSummary.articlePath}, ${artifactSummary.coverPath}, ${artifactSummary.publishPackPath}`,
  );

  if (args.contentId) {
    const contentVersion = await verifyContentVersionState(
      args.contentId,
      terminal.run_id,
      args.timeoutMs,
      args.intervalMs,
    );
    console.log(
      `[Smoke] 文稿版本校验通过: current=${contentVersion.currentVersionId}, status=${contentVersion.matchedStatus || "unknown"}`,
    );
  } else {
    console.log("[Smoke] 跳过文稿版本校验（未提供 --content-id）");
  }

  console.log("[Smoke] ✅ 主题工作台社媒链路校验通过");
}

main().catch((error) => {
  console.error(
    "[Smoke] ❌ 校验失败:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
