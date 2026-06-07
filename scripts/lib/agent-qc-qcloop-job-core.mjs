function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeRiskList(risks) {
  return asArray(risks)
    .map((risk) => String(risk).trim().toUpperCase())
    .filter(Boolean);
}

function selectScenarios(
  manifest,
  { risks = ["P0"], scenarioIds = [], includeAll = false } = {},
) {
  const normalizedRisks = new Set(normalizeRiskList(risks));
  const normalizedScenarioIds = new Set(
    asArray(scenarioIds).filter(isNonEmptyString),
  );
  const scenarios = asArray(manifest?.scenarios);

  return scenarios.filter((scenario) => {
    if (includeAll) {
      return true;
    }
    if (normalizedScenarioIds.size > 0) {
      return normalizedScenarioIds.has(scenario.id);
    }
    return normalizedRisks.has(String(scenario.risk || "").toUpperCase());
  });
}

const WORKER_RESULT_MARKER = "QCLOOP_WORKER_RESULT=";
const WORKER_EVIDENCE_SUMMARY_MARKER = "QCLOOP_EVIDENCE_SUMMARY_JSON=";

const WORKER_EVIDENCE_CONTRACT_BLOCK = `

---
Agent QC 结构化证据输出契约：
- 最终 stdout 必须包含单行 \`QCLOOP_WORKER_RESULT=PASS|FAIL|BLOCKED\`。
- 最终 stdout 必须包含单行 \`QCLOOP_EVIDENCE_SUMMARY_JSON=<json>\`；\`<json>\` 必须是单个 JSON object，不要 Markdown / code fence。
- \`QCLOOP_EVIDENCE_SUMMARY_JSON\` 至少包含：scenario_id、result、commands[]、evidence_required[]、evidence_layers_covered[]、failure_modes[]、artifacts[]、blockers[]、gui_session_owner、release_scope。
- evidence_required[] 每项包含 name、status(pass|fail|blocked|missing)、evidence、artifact_path；failure_modes[] 每项包含 name、status(covered|excluded|hit|unknown)、evidence。
- 不得输出密钥、token、用户私密内容或未经脱敏的请求 / 响应正文。`;

const VERIFIER_JSON_CONTRACT_BLOCK = `

---
qcloop verifier 输出格式硬约束：
- 只输出一个合法 JSON object，不要 Markdown、不要代码块、不要前后缀文本。
- JSON 必须至少包含 {"pass": true|false, "feedback": "..."}。
- 可选字段 missingEvidence、nextAction、evidenceStatus、scenarioId 必须仍在同一个 JSON object 内。
- 如果 worker stdout 缺少 QCLOOP_EVIDENCE_SUMMARY_JSON=<json>，或该 JSON 无法逐项证明 evidenceRequired / failureModes，必须输出 {"pass": false, "feedback": "..."}。`;

function ensureWorkerEvidenceContract(template) {
  const normalized = isNonEmptyString(template)
    ? template
    : "在 Lime 仓库中执行 Agent QC 场景 {{item}}，收集证据并给出结论。";
  if (
    normalized.includes(WORKER_RESULT_MARKER) &&
    normalized.includes(WORKER_EVIDENCE_SUMMARY_MARKER)
  ) {
    return normalized;
  }
  return `${normalized}${WORKER_EVIDENCE_CONTRACT_BLOCK}`;
}

const VERIFIER_EVIDENCE_BLOCK = `

---
qcloop worker 执行证据（自动占位符替换）：
- attempt_status: {{attempt_status}}
- attempt_type: {{attempt_type}}
- exit_code: {{exit_code}}

worker stdout:
{{stdout}}

qcloop issue ledger:
{{issue_ledger}}

判定要求：如果 stdout 缺少场景 verifier / evidence_required / failure_modes 所需证据，必须 pass=false；不能因为命令名看似正确就通过。`;

function ensureVerifierMetadataPlaceholders(template) {
  const missingLines = [];
  if (!template.includes("{{attempt_status}}")) {
    missingLines.push("- attempt_status: {{attempt_status}}");
  }
  if (!template.includes("{{attempt_type}}")) {
    missingLines.push("- attempt_type: {{attempt_type}}");
  }
  if (!template.includes("{{exit_code}}")) {
    missingLines.push("- exit_code: {{exit_code}}");
  }
  if (
    !template.includes("{{qc_history}}") &&
    !template.includes("{{issue_ledger}}")
  ) {
    missingLines.push("- issue_ledger: {{issue_ledger}}");
  }
  if (missingLines.length === 0) {
    return template;
  }
  return `${template}

---
qcloop worker 执行元数据（自动占位符替换）：
${missingLines.join("\n")}`;
}

function ensureVerifierEvidencePlaceholders(template) {
  let normalized = isNonEmptyString(template)
    ? template
    : "审查 Agent QC 场景 {{item}} 的输出是否满足证据要求，只输出 JSON verdict。";

  if (
    !normalized.includes("{{stdout}}") &&
    !normalized.includes("{{output}}")
  ) {
    normalized = `${normalized}${VERIFIER_EVIDENCE_BLOCK}`;
  }

  normalized = ensureVerifierMetadataPlaceholders(normalized);

  if (!normalized.includes("QCLOOP_EVIDENCE_SUMMARY_JSON")) {
    normalized = `${normalized}${VERIFIER_JSON_CONTRACT_BLOCK}`;
  } else if (!normalized.includes('{"pass": true|false')) {
    normalized = `${normalized}${VERIFIER_JSON_CONTRACT_BLOCK}`;
  }

  return normalized;
}

function buildQCLoopItemValue(scenario, { cwd = "" } = {}) {
  return JSON.stringify({
    scenario_id: scenario.id,
    title: scenario.title,
    risk: scenario.risk,
    cwd,
    executor: scenario.executor,
    lanes: scenario.lanes,
    commands: scenario.commands || [],
    goal: scenario.goal,
    verifier: scenario.verifier,
    evidence_required: scenario.evidenceRequired || [],
    evidence_layers: scenario.evidenceLayers || [],
    failure_modes: scenario.failureModes || [],
  });
}

function buildQCLoopJobPayload(manifest, options = {}) {
  const selectedScenarios = selectScenarios(manifest, options);
  const qcloop = manifest?.qcloop || {};
  const riskLabel = options.includeAll
    ? "all"
    : asArray(options.scenarioIds).length > 0
      ? "selected"
      : normalizeRiskList(options.risks || ["P0"]).join("+") || "P0";
  const name =
    options.name ||
    `lime-agent-qc-${riskLabel.toLowerCase()}-${new Date(options.generatedAt || Date.now()).toISOString().slice(0, 10)}`;

  const cwdLine = options.cwd
    ? `目标仓库 cwd: ${options.cwd}。执行任何命令前必须先切换到该目录，并在输出中记录 pwd。`
    : "";
  const workerPromptTemplate = ensureWorkerEvidenceContract(
    options.promptTemplate ||
      qcloop.workerPromptTemplate ||
      "在 Lime 仓库中执行 Agent QC 场景 {{item}}，收集证据并给出结论。",
  );

  return {
    name,
    prompt_template: [cwdLine, workerPromptTemplate]
      .filter(Boolean)
      .join("\n\n"),
    verifier_prompt_template: ensureVerifierEvidencePlaceholders(
      options.verifierPromptTemplate || qcloop.verifierPromptTemplate,
    ),
    max_qc_rounds: Number(
      options.maxQcRounds || qcloop.recommendedMaxQcRounds || 3,
    ),
    max_executor_retries: Number(
      options.maxExecutorRetries ?? qcloop.recommendedMaxExecutorRetries ?? 1,
    ),
    token_budget_per_item: Number(options.tokenBudgetPerItem || 0),
    execution_mode: options.executionMode || "standard",
    executor_provider: options.executorProvider || "codex",
    items: selectedScenarios.map((scenario) =>
      buildQCLoopItemValue(scenario, { cwd: options.cwd || "" }),
    ),
  };
}

function validateVerifierPromptTemplate(template, issues) {
  if (!isNonEmptyString(template)) {
    issues.push("缺少 verifier_prompt_template。");
    return;
  }
  if (!template.includes("{{stdout}}") && !template.includes("{{output}}")) {
    issues.push(
      "verifier_prompt_template 必须包含 {{stdout}} 或 {{output}}，否则 verifier 看不到 worker 输出。",
    );
  }
  for (const placeholder of ["{{attempt_status}}", "{{exit_code}}"]) {
    if (!template.includes(placeholder)) {
      issues.push(`verifier_prompt_template 必须包含 ${placeholder}。`);
    }
  }
  if (
    !template.includes("{{qc_history}}") &&
    !template.includes("{{issue_ledger}}")
  ) {
    issues.push(
      "verifier_prompt_template 必须包含 {{qc_history}} 或 {{issue_ledger}}。",
    );
  }
  if (!template.includes(WORKER_EVIDENCE_SUMMARY_MARKER)) {
    issues.push(
      `verifier_prompt_template 必须要求审查 ${WORKER_EVIDENCE_SUMMARY_MARKER}。`,
    );
  }
  if (!template.includes('{"pass": true|false')) {
    issues.push(
      'verifier_prompt_template 必须声明只输出 {"pass": true|false, "feedback": "..."} JSON。',
    );
  }
}

function validateQCLoopJobPayload(payload) {
  const issues = [];
  if (!isNonEmptyString(payload?.name)) {
    issues.push("缺少 name。 ");
  }
  if (!isNonEmptyString(payload?.prompt_template)) {
    issues.push("缺少 prompt_template。 ");
  } else {
    if (!payload.prompt_template.includes("{{item}}")) {
      issues.push("prompt_template 必须包含 {{item}}。 ");
    }
    if (!payload.prompt_template.includes(WORKER_RESULT_MARKER)) {
      issues.push(`prompt_template 必须要求输出 ${WORKER_RESULT_MARKER}。 `);
    }
    if (!payload.prompt_template.includes(WORKER_EVIDENCE_SUMMARY_MARKER)) {
      issues.push(
        `prompt_template 必须要求输出 ${WORKER_EVIDENCE_SUMMARY_MARKER}。 `,
      );
    }
  }
  validateVerifierPromptTemplate(payload?.verifier_prompt_template, issues);
  if (!Number.isInteger(payload?.max_qc_rounds) || payload.max_qc_rounds <= 0) {
    issues.push("max_qc_rounds 必须是正整数。 ");
  }
  if (
    !Number.isInteger(payload?.max_executor_retries) ||
    payload.max_executor_retries < 0 ||
    payload.max_executor_retries > 5
  ) {
    issues.push("max_executor_retries 必须是 0 到 5 的整数。 ");
  }
  if (!Array.isArray(payload?.items) || payload.items.length === 0) {
    issues.push("items 不能为空。 ");
  }
  for (const [index, item] of asArray(payload?.items).entries()) {
    if (!isNonEmptyString(item)) {
      issues.push(`items[${index}] 不能为空。`);
      continue;
    }
    try {
      const parsed = JSON.parse(item);
      if (!isNonEmptyString(parsed.scenario_id)) {
        issues.push(`items[${index}] 缺少 scenario_id。`);
      }
    } catch {
      issues.push(`items[${index}] 必须是 JSON 字符串。`);
    }
  }
  return {
    valid: issues.length === 0,
    issues,
  };
}

function renderQCLoopCurl(payload, { baseUrl = "http://127.0.0.1:8080" } = {}) {
  const body = JSON.stringify(payload, null, 2);
  return `curl -sS -X POST "${baseUrl.replace(/\/$/, "")}/api/jobs" \\
  -H "Content-Type: application/json" \\
  --data-binary @- <<'JSON'\n${body}\nJSON\n`;
}

export {
  buildQCLoopItemValue,
  buildQCLoopJobPayload,
  renderQCLoopCurl,
  selectScenarios,
  validateQCLoopJobPayload,
};
