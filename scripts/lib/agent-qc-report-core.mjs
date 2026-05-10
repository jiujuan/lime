import fs from "node:fs";

const VALID_LANE_IDS = new Set([
  "L0-static-unit",
  "L1-contract-bridge",
  "L2-agent-runtime",
  "L3-product-surface",
  "L4-behavior-eval",
  "L5-release-ops",
]);
const VALID_RISKS = new Set(["P0", "P1", "P2"]);
const VALID_EXECUTORS = new Set([
  "npm_command",
  "rust_test",
  "playwright_mcp",
  "runtime_harness",
  "qcloop",
  "release_workflow",
  "mixed",
]);
const VALID_STATUSES = new Set([
  "pass",
  "fail",
  "blocked",
  "needs-human-review",
  "waived",
  "skipped",
]);
const VALID_EVIDENCE_LAYERS = new Set([
  "deterministic-smoke",
  "gui-trace",
  "runtime-transcript",
  "release-artifact",
]);

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function addIssue(issues, severity, path, message) {
  issues.push({ severity, path, message });
}

function collectNpmScriptName(command) {
  if (!isNonEmptyString(command)) {
    return "";
  }

  const match = command.trim().match(/^npm\s+run\s+([^\s]+)/);
  return match ? match[1] : "";
}

function validateNpmCommands(commands, packageScripts, pathPrefix, issues) {
  for (const [index, command] of asArray(commands).entries()) {
    if (!isNonEmptyString(command)) {
      addIssue(issues, "error", `${pathPrefix}.commands[${index}]`, "命令必须是非空字符串。");
      continue;
    }

    const scriptName = collectNpmScriptName(command);
    if (scriptName && !Object.hasOwn(packageScripts, scriptName)) {
      addIssue(
        issues,
        "error",
        `${pathPrefix}.commands[${index}]`,
        `package.json 中不存在 npm script: ${scriptName}`,
      );
    }
  }
}


function validateQCLoopConfig(qcloop, issues) {
  if (!qcloop || typeof qcloop !== "object") {
    return;
  }

  const workerTemplate = qcloop.workerPromptTemplate;
  if (!isNonEmptyString(workerTemplate)) {
    addIssue(
      issues,
      "error",
      "qcloop.workerPromptTemplate",
      "qcloop workerPromptTemplate 必须存在，且要约束 worker 输出可审查证据。",
    );
  } else {
    if (!workerTemplate.includes("evidence_required")) {
      addIssue(
        issues,
        "error",
        "qcloop.workerPromptTemplate",
        "workerPromptTemplate 必须要求 worker 逐项列出 evidence_required，否则 repair 轮会再次缺证据。",
      );
    }

    if (!workerTemplate.includes("failure_modes")) {
      addIssue(
        issues,
        "error",
        "qcloop.workerPromptTemplate",
        "workerPromptTemplate 必须要求 worker 逐项说明 failure_modes 是否命中、覆盖或排除。",
      );
    }

    if (!workerTemplate.includes("QCLOOP_WORKER_RESULT=BLOCKED")) {
      addIssue(
        issues,
        "error",
        "qcloop.workerPromptTemplate",
        "workerPromptTemplate 必须显式约束环境阻断时输出 QCLOOP_WORKER_RESULT=BLOCKED。",
      );
    }

    if (!workerTemplate.includes("QCLOOP_EVIDENCE_SUMMARY_JSON")) {
      addIssue(
        issues,
        "error",
        "qcloop.workerPromptTemplate",
        "workerPromptTemplate 必须要求 worker 输出 QCLOOP_EVIDENCE_SUMMARY_JSON，避免 verifier 只能审查散文摘要。",
      );
    }
  }

  const template = qcloop.verifierPromptTemplate;
  if (!isNonEmptyString(template)) {
    addIssue(
      issues,
      "error",
      "qcloop.verifierPromptTemplate",
      "qcloop verifierPromptTemplate 必须存在，且要带 worker evidence 占位符。",
    );
    return;
  }

  if (!template.includes("{{stdout}}") && !template.includes("{{output}}")) {
    addIssue(
      issues,
      "error",
      "qcloop.verifierPromptTemplate",
      "verifierPromptTemplate 必须包含 {{stdout}} 或 {{output}}，否则 verifier 看不到 worker 输出。",
    );
  }

  for (const placeholder of ["{{attempt_status}}", "{{exit_code}}"]) {
    if (!template.includes(placeholder)) {
      addIssue(
        issues,
        "error",
        "qcloop.verifierPromptTemplate",
        `verifierPromptTemplate 必须包含 ${placeholder}，用于判定 worker 执行状态。`,
      );
    }
  }

  if (!template.includes("{{qc_history}}") && !template.includes("{{issue_ledger}}")) {
    addIssue(
      issues,
      "error",
      "qcloop.verifierPromptTemplate",
      "verifierPromptTemplate 必须包含 {{qc_history}} 或 {{issue_ledger}}，用于判断 repair 后旧问题是否仍开放。",
    );
  }

  if (!template.includes("QCLOOP_EVIDENCE_SUMMARY_JSON")) {
    addIssue(
      issues,
      "error",
      "qcloop.verifierPromptTemplate",
      "verifierPromptTemplate 必须要求审查 QCLOOP_EVIDENCE_SUMMARY_JSON，避免命令退出码被误判为证据完整。",
    );
  }

  if (!template.includes('{"pass": true|false')) {
    addIssue(
      issues,
      "error",
      "qcloop.verifierPromptTemplate",
      'verifierPromptTemplate 必须声明只输出 {"pass": true|false, "feedback": "..."} JSON，避免 qcloop 报“verifier 输出格式错误”。',
    );
  }

  if (template.includes("{{stderr}}")) {
    addIssue(
      issues,
      "warn",
      "qcloop.verifierPromptTemplate",
      "verifierPromptTemplate 包含 {{stderr}}，Codex / GUI 场景可能产生超长 stderr；优先让 worker 在 stdout 输出摘要。",
    );
  }
}

function validateEvidenceSchema(schema, issues) {
  if (!schema || typeof schema !== "object") {
    addIssue(issues, "error", "evidenceSchema", "Evidence schema 必须是 JSON object。");
    return;
  }

  for (const field of ["$schema", "$id", "type", "required", "properties"]) {
    if (!Object.hasOwn(schema, field)) {
      addIssue(issues, "error", `evidenceSchema.${field}`, `缺少 ${field}。`);
    }
  }

  const required = asArray(schema.required);
  for (const field of ["schemaVersion", "runId", "generatedAt", "subject", "laneResults", "scenarioResults", "verdict"]) {
    if (!required.includes(field)) {
      addIssue(issues, "error", "evidenceSchema.required", `缺少必填字段 ${field}。`);
    }
  }

  const verdictStatus = schema?.properties?.verdict?.properties?.status?.enum;
  if (Array.isArray(verdictStatus)) {
    for (const status of ["pass", "fail", "blocked", "needs-human-review", "waived"]) {
      if (!verdictStatus.includes(status)) {
        addIssue(issues, "error", "evidenceSchema.verdict.status", `verdict.status 缺少 ${status}。`);
      }
    }
  }
}

function validateLane(lane, index, packageScripts, issues) {
  const pathPrefix = `lanes[${index}]`;
  if (!isNonEmptyString(lane?.id)) {
    addIssue(issues, "error", `${pathPrefix}.id`, "Lane 必须有 id。");
    return;
  }

  if (!VALID_LANE_IDS.has(lane.id)) {
    addIssue(issues, "warn", `${pathPrefix}.id`, `Lane id ${lane.id} 不在当前标准集合中。`);
  }

  for (const field of ["title", "objective", "gatePolicy"]) {
    if (!isNonEmptyString(lane[field])) {
      addIssue(issues, "error", `${pathPrefix}.${field}`, `Lane 缺少 ${field}。`);
    }
  }

  validateNpmCommands(lane.defaultCommands, packageScripts, pathPrefix, issues);
}

function validateScenario(scenario, index, laneIds, packageScripts, issues) {
  const pathPrefix = `scenarios[${index}]`;
  for (const field of ["id", "title", "risk", "executor", "goal", "verifier"]) {
    if (!isNonEmptyString(scenario?.[field])) {
      addIssue(issues, "error", `${pathPrefix}.${field}`, `Scenario 缺少 ${field}。`);
    }
  }

  if (isNonEmptyString(scenario?.risk) && !VALID_RISKS.has(scenario.risk)) {
    addIssue(issues, "error", `${pathPrefix}.risk`, `未知风险等级 ${scenario.risk}。`);
  }

  if (isNonEmptyString(scenario?.executor) && !VALID_EXECUTORS.has(scenario.executor)) {
    addIssue(issues, "error", `${pathPrefix}.executor`, `未知执行器 ${scenario.executor}。`);
  }

  const lanes = asArray(scenario?.lanes);
  if (lanes.length === 0) {
    addIssue(issues, "error", `${pathPrefix}.lanes`, "Scenario 至少要归属一个 lane。");
  }
  for (const laneId of lanes) {
    if (!laneIds.has(laneId)) {
      addIssue(issues, "error", `${pathPrefix}.lanes`, `引用了不存在的 lane: ${laneId}`);
    }
  }

  if (asArray(scenario?.evidenceRequired).length === 0) {
    addIssue(issues, "error", `${pathPrefix}.evidenceRequired`, "Scenario 必须声明证据要求。");
  }

  if (asArray(scenario?.failureModes).length === 0) {
    addIssue(issues, "error", `${pathPrefix}.failureModes`, "Scenario 必须声明失败模式。");
  }

  const evidenceLayers = asArray(scenario?.evidenceLayers);
  if (scenario?.risk === "P0" && evidenceLayers.length === 0) {
    addIssue(
      issues,
      "error",
      `${pathPrefix}.evidenceLayers`,
      "P0 Scenario 必须声明 evidenceLayers，避免 deterministic smoke 被误读成 deep evidence。",
    );
  }
  for (const [layerIndex, layer] of evidenceLayers.entries()) {
    if (!VALID_EVIDENCE_LAYERS.has(layer)) {
      addIssue(
        issues,
        "error",
        `${pathPrefix}.evidenceLayers[${layerIndex}]`,
        `未知 evidence layer: ${layer}`,
      );
    }
  }

  validateNpmCommands(scenario?.commands, packageScripts, pathPrefix, issues);
}

function validateAgentQcManifest(manifest, { packageScripts = {}, evidenceSchema = null } = {}) {
  const issues = [];
  if (!manifest || typeof manifest !== "object") {
    return {
      valid: false,
      issues: [{ severity: "error", path: "manifest", message: "Manifest 必须是 JSON object。" }],
    };
  }

  for (const field of ["manifestVersion", "title", "evidenceSchema", "lanes", "scenarios"]) {
    if (!Object.hasOwn(manifest, field)) {
      addIssue(issues, "error", field, `Manifest 缺少 ${field}。`);
    }
  }

  if (manifest.manifestVersion !== "v1") {
    addIssue(issues, "error", "manifestVersion", "当前只接受 manifestVersion=v1。");
  }

  validateQCLoopConfig(manifest.qcloop, issues);

  const lanes = asArray(manifest.lanes);
  const scenarios = asArray(manifest.scenarios);
  const laneIds = new Set();
  const scenarioIds = new Set();

  if (lanes.length === 0) {
    addIssue(issues, "error", "lanes", "至少需要一个测试 lane。");
  }

  for (const [index, lane] of lanes.entries()) {
    validateLane(lane, index, packageScripts, issues);
    if (isNonEmptyString(lane?.id)) {
      if (laneIds.has(lane.id)) {
        addIssue(issues, "error", `lanes[${index}].id`, `重复 lane id: ${lane.id}`);
      }
      laneIds.add(lane.id);
    }
  }

  if (scenarios.length === 0) {
    addIssue(issues, "error", "scenarios", "至少需要一个 Agent QC 场景。");
  }

  for (const [index, scenario] of scenarios.entries()) {
    validateScenario(scenario, index, laneIds, packageScripts, issues);
    if (isNonEmptyString(scenario?.id)) {
      if (scenarioIds.has(scenario.id)) {
        addIssue(issues, "error", `scenarios[${index}].id`, `重复 scenario id: ${scenario.id}`);
      }
      scenarioIds.add(scenario.id);
    }
  }

  if (evidenceSchema) {
    validateEvidenceSchema(evidenceSchema, issues);
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  return {
    valid: errors.length === 0,
    issues,
  };
}

function countBy(items, getKey) {
  const counts = new Map();
  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function summarizeAgentQcManifest(manifest, validation) {
  const lanes = asArray(manifest?.lanes);
  const scenarios = asArray(manifest?.scenarios);
  return {
    title: manifest?.title ?? "Lime Agent QC",
    manifestVersion: manifest?.manifestVersion ?? "unknown",
    evidenceSchema: manifest?.evidenceSchema ?? "",
    valid: validation.valid,
    issueCount: validation.issues.length,
    errorCount: validation.issues.filter((issue) => issue.severity === "error").length,
    warnCount: validation.issues.filter((issue) => issue.severity === "warn").length,
    laneCount: lanes.length,
    scenarioCount: scenarios.length,
    p0ScenarioCount: scenarios.filter((scenario) => scenario.risk === "P0").length,
    lanes: lanes.map((lane) => ({
      id: lane.id,
      title: lane.title,
      defaultCommandCount: asArray(lane.defaultCommands).length,
      scenarioCount: scenarios.filter((scenario) => asArray(scenario.lanes).includes(lane.id)).length,
    })),
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      risk: scenario.risk,
      executor: scenario.executor,
      lanes: asArray(scenario.lanes),
    })),
    riskBreakdown: countBy(scenarios, (scenario) => scenario.risk || "unknown"),
    executorBreakdown: countBy(scenarios, (scenario) => scenario.executor || "unknown"),
    issues: validation.issues,
  };
}

function renderIssueList(issues) {
  if (issues.length === 0) {
    return "- 无";
  }

  return issues
    .map((issue) => `- ${issue.severity.toUpperCase()} ${issue.path}: ${issue.message}`)
    .join("\n");
}

function renderNameCountList(items) {
  if (items.length === 0) {
    return "- 无";
  }

  return items.map((item) => `- ${item.name}: ${item.count}`).join("\n");
}

function renderAgentQcMarkdownReport(summary) {
  const laneLines = summary.lanes.length
    ? summary.lanes
        .map(
          (lane) =>
            `- ${lane.id}: ${lane.title}；场景 ${lane.scenarioCount}；默认命令 ${lane.defaultCommandCount}`,
        )
        .join("\n")
    : "- 无";
  const scenarioLines = summary.scenarios.length
    ? summary.scenarios
        .map(
          (scenario) =>
            `- ${scenario.id}: ${scenario.title}；${scenario.risk}；${scenario.executor}`,
        )
        .join("\n")
    : "- 无";

  return `# ${summary.title} 场景报告

## 结论

- Manifest: ${summary.manifestVersion}
- Evidence schema: ${summary.evidenceSchema || "未声明"}
- 状态: ${summary.valid ? "PASS" : "FAIL"}
- Lane 数: ${summary.laneCount}
- Scenario 数: ${summary.scenarioCount}
- P0 Scenario 数: ${summary.p0ScenarioCount}
- Issue: ${summary.issueCount}（error ${summary.errorCount} / warn ${summary.warnCount}）

## Lane 覆盖

${laneLines}

## Scenario 清单

${scenarioLines}

## 风险分布

${renderNameCountList(summary.riskBreakdown)}

## 执行器分布

${renderNameCountList(summary.executorBreakdown)}

## 校验问题

${renderIssueList(summary.issues)}
`;
}

function createAgentQcReport({ manifest, packageJson = {}, evidenceSchema = null }) {
  const validation = validateAgentQcManifest(manifest, {
    packageScripts: packageJson.scripts ?? {},
    evidenceSchema,
  });
  return summarizeAgentQcManifest(manifest, validation);
}

export {
  VALID_EVIDENCE_LAYERS,
  VALID_EXECUTORS,
  VALID_LANE_IDS,
  VALID_RISKS,
  VALID_STATUSES,
  collectNpmScriptName,
  createAgentQcReport,
  readJsonFile,
  renderAgentQcMarkdownReport,
  summarizeAgentQcManifest,
  validateAgentQcManifest,
};
