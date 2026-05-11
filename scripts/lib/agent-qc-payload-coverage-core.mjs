function scenarioIdOf(value) {
  return value?.scenario_id || value?.scenarioId || value?.id || "";
}

function parsePayloadItem(item) {
  if (typeof item !== "string") {
    return item;
  }
  return JSON.parse(item);
}

function p0ScenarioIdsFromManifest(manifest) {
  return (manifest?.scenarios || [])
    .filter((scenario) => scenario?.risk === "P0")
    .map(scenarioIdOf)
    .filter(Boolean);
}

function scenarioIdsFromPayload(payload) {
  return (payload?.items || []).map(parsePayloadItem).map(scenarioIdOf).filter(Boolean);
}

function buildRepairGuard(payload) {
  const maxQcRounds = Number(payload?.max_qc_rounds);
  const maxExecutorRetries = Number(payload?.max_executor_retries ?? 0);
  const promptTemplate = String(payload?.prompt_template || "");
  const readOnlyPrompt =
    promptTemplate.includes("不得修改源码") &&
    promptTemplate.includes("不要顺手修复") &&
    promptTemplate.includes("只允许执行场景命令");
  const maxQcRoundsPassed = maxQcRounds === 1;
  const maxExecutorRetriesPassed = maxExecutorRetries === 0;
  return {
    passed: maxQcRoundsPassed && maxExecutorRetriesPassed && readOnlyPrompt,
    maxQcRounds,
    maxExecutorRetries,
    maxQcRoundsPassed,
    maxExecutorRetriesPassed,
    readOnlyPrompt,
  };
}

function buildAgentQcPayloadCoverageReport({
  manifest,
  payload,
  processOwner,
  generatedAt = new Date().toISOString(),
  manifestPath = "docs/test/agent-qc-scenarios.manifest.json",
  payloadPath = "",
} = {}) {
  const manifestScenarioIds = p0ScenarioIdsFromManifest(manifest);
  const payloadScenarioIds = scenarioIdsFromPayload(payload);
  const missingScenarioIds = manifestScenarioIds.filter((id) => !payloadScenarioIds.includes(id));
  const extraScenarioIds = payloadScenarioIds.filter((id) => !manifestScenarioIds.includes(id));
  const orderMatchesManifest =
    manifestScenarioIds.length === payloadScenarioIds.length &&
    manifestScenarioIds.every((id, index) => id === payloadScenarioIds[index]);
  const payloadValidation = payload?._validation || {};
  const payloadValidationPassed = payloadValidation.valid !== false;
  const repairGuard = buildRepairGuard(payload);
  const coveragePassed =
    manifestScenarioIds.length > 0 &&
    payloadScenarioIds.length === manifestScenarioIds.length &&
    missingScenarioIds.length === 0 &&
    extraScenarioIds.length === 0 &&
    orderMatchesManifest &&
    payloadValidationPassed &&
    repairGuard.passed;
  const ownerStatus = processOwner?.verdict?.status || "unknown";
  const status = coveragePassed ? (ownerStatus === "pass" ? "ready" : "blocked") : "fail";
  return {
    schemaVersion: "v1",
    generatedAt,
    status,
    manifest: manifestPath,
    payload: payloadPath,
    coverage: {
      passed: coveragePassed,
      manifestP0Count: manifestScenarioIds.length,
      payloadItemCount: payloadScenarioIds.length,
      manifestScenarioIds,
      payloadScenarioIds,
      missingScenarioIds,
      extraScenarioIds,
      orderMatchesManifest,
      payloadValidationPassed,
    },
    repairGuard,
    ownerGate: {
      status: ownerStatus,
      summary: processOwner?.verdict?.summary || "",
      ownerIntervention: processOwner?.ownerIntervention || null,
    },
    guardrails: {
      jobStarted: false,
      officialEvidenceOverwritten: false,
      qcloopDbModified: false,
      gitMutation: false,
    },
    startPreconditions: [
      "npm run agent-qc:process-owner-check -- --check",
      "npm run agent-qc:gui-owner-check -- --check",
      "npm run agent-qc:qcloop-preflight -- --require-devbridge --check",
    ],
    nextAction:
      status === "ready"
        ? "可以在 dedicated qcloop server / DB / port 上提交该 payload。"
        : status === "blocked"
          ? "payload 覆盖完整，但 owner gate 未通过；只能等待 owner 释放或按确认协议处理。"
          : "修复 payload 与 manifest 的覆盖差异后再继续。",
  };
}

function renderAgentQcPayloadCoverageMarkdown(report) {
  const lines = [
    "# qcloop P0 Payload Coverage",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Manifest: ${report.manifest}`,
    `- Payload: ${report.payload}`,
    `- Manifest P0 count: ${report.coverage.manifestP0Count}`,
    `- Payload item count: ${report.coverage.payloadItemCount}`,
    `- Missing scenarios: ${report.coverage.missingScenarioIds.join(", ") || "none"}`,
    `- Extra scenarios: ${report.coverage.extraScenarioIds.join(", ") || "none"}`,
    `- Order matches manifest: ${report.coverage.orderMatchesManifest}`,
    `- Payload validation: ${report.coverage.payloadValidationPassed}`,
    "",
    "## Scenario Coverage",
    "",
  ];
  report.coverage.payloadScenarioIds.forEach((id, index) => {
    lines.push(`${index + 1}. \`${id}\``);
  });
  lines.push(
    "",
    "## Repair Guard",
    "",
    `- Status: ${report.repairGuard.passed ? "pass" : "fail"}`,
    `- max_qc_rounds: ${report.repairGuard.maxQcRounds}`,
    `- max_executor_retries: ${report.repairGuard.maxExecutorRetries}`,
    `- Read-only prompt: ${report.repairGuard.readOnlyPrompt}`,
    "",
  );
  lines.push(
    "",
    "## Owner Gate",
    "",
    `- Status: ${report.ownerGate.status}`,
    `- Summary: ${report.ownerGate.summary || "none"}`,
    "",
    "## Start Preconditions",
    "",
  );
  for (const command of report.startPreconditions) {
    lines.push(`- \`${command}\``);
  }
  lines.push("", "## Guardrails", "");
  for (const [key, value] of Object.entries(report.guardrails)) {
    lines.push(`- ${key}: ${String(value)}`);
  }
  lines.push("", "## Next Action", "", report.nextAction, "");
  return `${lines.join("\n")}\n`;
}

export {
  buildRepairGuard,
  buildAgentQcPayloadCoverageReport,
  p0ScenarioIdsFromManifest,
  renderAgentQcPayloadCoverageMarkdown,
  scenarioIdsFromPayload,
};
